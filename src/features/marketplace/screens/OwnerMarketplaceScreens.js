import {CustomerModal as Modal,CustomerPressable} from '../../customer/components/CustomerUI';
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, useWindowDimensions, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {usePreventRemove} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Field, Notice, useInfiniteCursor, formatMoney} from '../components/MarketplaceUI';
import PhotoGallery from '../components/PhotoGallery';
import RequestPhotoUploads from '../components/RequestPhotoUploads';
import LocationPicker from '../../../shared/location/LocationPicker';
import {CustomerConversationPicker} from '../components/ConversationAction';
import PrivatePhoto from '../components/PrivatePhoto';
import AIAssistButton from '../components/AIAssistButton';
import {vehicleErrors, requestErrors, parseMoney} from '../utils/validation';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {GaragePage, GarageAction, GarageGrid, garageStyles} from '../components/GarageUI';
import {QuotationCard} from '../components/QuotationUI';
import {RequestPage,RequestAction,RequestSection,RequestText,RequestStatus,RequestState,RequestGrid,RequestListCard,RequestOptions as SelectionList,RequestDiscard,RequestAudience,requestVehicleLabel,requestResponseLabel,requestDate} from '../../customer/components/CustomerRequestUI';

const hasErrors = errors => Object.values(errors).some(Boolean);
const vehicleName = vehicle => {
  const name=[vehicle?.make,vehicle?.model].filter(Boolean).join(' ');
  return name?`${name}${vehicle.year?` (${vehicle.year})`:''}`:'Vehicle details unavailable';
};

function useMutation() {
  const {offline, user} = useAuth();
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), current = useRef({mounted: true, uid: user?.uid});
  current.current.uid = user?.uid;
  useEffect(() => {current.current.mounted = true; return () => {current.current.mounted = false;};}, []);
  async function run(op, input) {
    if (lock.current || offline) return null;
    const uid = user?.uid;
    lock.current = true; setSaving(true); setError('');
    try {
      const result = await marketApi(op, input);
      return current.current.mounted && current.current.uid === uid ? result : null;
    } catch (e) {
      if (current.current.mounted && current.current.uid === uid) setError(e.message || 'Unable to save. Please retry.');
      throw e;
    } finally {
      lock.current = false;
      if (current.current.mounted && current.current.uid === uid) setSaving(false);
    }
  }
  return {run, saving, error, offline};
}

export function GarageScreen(props) {const {user}=useAuth();return <GarageContent key={user?.uid||'signed-out'} {...props}/>;}
function GarageContent({navigation}) {
  const {theme}=useTheme();
  const styles=garageStyles(theme);
  const [archived, setArchived] = useState(false), [cursor, setCursor] = useState(null);
  const [message, setMessage] = useState('');
  const [selected,setSelected]=useState(null);
  const {data, busy, error, refresh} = useMarketData('vehicles', {cursor, archived}, setCursor);
  const feed = useInfiniteCursor(data, busy, setCursor, {pageCursor:cursor});
  const mutation = useMutation(), disabled = busy || mutation.saving || mutation.offline;
  async function archive(vehicle) {
    const result = await mutation.run('vehicleArchive', {id: vehicle.id, version: vehicle.version, archived: !vehicle.archived});
    if (result) {
      setSelected(null);setMessage(vehicle.archived ? `${vehicle.make} ${vehicle.model} restored to your active garage.` : `${vehicle.make} ${vehicle.model} removed from your active garage. Its request and booking history was preserved.`);
      await refresh().catch(() => {});
    }
  }
  function open(route,params){if(!disabled){setSelected(null);if(params)navigation.navigate(route,params);else navigation.navigate(route);}}
  const cover=vehicle=><View style={styles.cover}>
    <View style={styles.coverPlaceholder}><Ionicons name="car-sport-outline" size={44} color={theme.textSecondary}/><Text style={styles.placeholderText}>{vehicle.photoIds?.length?'Private vehicle photo':'No vehicle photo yet'}</Text></View>
    {!!vehicle.photoIds?.length&&<PrivatePhoto target="vehicle" id={vehicle.id} style={styles.coverPhoto} imageStyle={styles.coverImage} accessibilityLabel={`Photo of ${vehicle.make} ${vehicle.model}`}/>}
  </View>;
  const archiveControl=vehicle=><ConfirmationButton palette={theme} title={vehicle.archived ? `Restore ${vehicle.make} ${vehicle.model}` : `Remove ${vehicle.make} ${vehicle.model}`} message={vehicle.archived ? 'Restore this vehicle to your active garage. Its open requests can become visible to shops again.' : 'Remove this vehicle from your active garage. It will not be deleted permanently; past service requests, quotations, and bookings will be preserved.'} disabled={disabled} danger={!vehicle.archived} onConfirm={() => archive(vehicle)}/>;
  return <GaragePage title="My Garage" subtitle="Your vehicles, details and private photos." navigation={navigation} tabs onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}
    refreshControl={<RefreshControl refreshing={busy&&!!feed.items.length} onRefresh={()=>{if(!disabled)void refresh().catch(()=>{});}} tintColor={theme.textPrimary}/>}>
    <View style={styles.toolbar}><View style={styles.intro}><Text weight="semibold" style={styles.sectionTitle}>{archived?'Archived vehicles':'Your vehicles'}</Text><Text style={styles.secondary}>Ready for your next service.</Text></View>
      <GarageAction title="Add vehicle" icon="add-outline" primary disabled={disabled} onPress={()=>open('VehicleForm')}/></View>
    <View style={styles.filters}>{[false,true].map(value=><CustomerPressable key={String(value)} accessibilityRole="button" accessibilityLabel={value?'Archived vehicles':'Active vehicles'} accessibilityState={{selected:archived===value,disabled}} disabled={disabled} onPress={()=>{if(!disabled&&archived!==value){feed.reset();setArchived(value);setCursor(null);setSelected(null);setMessage('');}}} style={[styles.filter,archived===value&&styles.filterSelected]}><Text weight={archived===value?'semibold':'regular'} style={styles.filterText}>{value?'Archived vehicles':'Active vehicles'}</Text></CustomerPressable>)}</View>
    <Notice busy={mutation.saving} error={mutation.offline?'Connect to view or update your garage.':mutation.error || error}/>
    {busy&&!feed.items.length&&<View accessibilityRole="status" style={styles.empty}><ActivityIndicator color={theme.textPrimary}/><Text style={styles.secondary}>Loading your garage...</Text></View>}
    {!!message && <Text accessibilityRole="status">{message}</Text>}
    <GarageGrid>{feed.items.map(vehicle=><View key={vehicle.id} testID={`garage-vehicle-${vehicle.id}`} style={styles.vehicleCard}>
      {cover(vehicle)}
      <View style={styles.cardBody}>
        <CustomerPressable accessibilityRole="button" accessibilityLabel={`View ${vehicle.make} ${vehicle.model}`} disabled={disabled} onPress={()=>{if(!disabled)setSelected(vehicle);}} style={styles.identity}>
          <Text accessibilityRole="header" weight="semibold" style={[styles.vehicleTitle,{flex:1}]}>{vehicle.make} {vehicle.model}</Text><Ionicons name="chevron-forward-outline" size={18} color={theme.textSecondary}/>
        </CustomerPressable>
        <Text style={styles.specLine}>{[vehicle.year,vehicle.colour,vehicle.archived?'Archived':null].filter(Boolean).join(' · ')}</Text>
        {!archived&&<GarageAction title={`Request service for ${vehicle.make} ${vehicle.model}`} icon="construct-outline" primary disabled={disabled} onPress={()=>open('RequestForm',{vehicleId:vehicle.id,vehicle})}/>}
        {!archived&&<GarageAction title={`Explore ${vehicle.make} ${vehicle.model} in PimpPilot Studio`} icon="sparkles-outline" disabled={disabled} onPress={()=>open('PimpPilotStudio',{vehicleId:vehicle.id,vehicle})}/>}
        <View style={styles.cardActions}>
          {!archived&&<View style={styles.actionCell}><GarageAction title={`Edit ${vehicle.make} ${vehicle.model}`} icon="create-outline" disabled={disabled} onPress={()=>open('VehicleForm',{vehicle})}/></View>}
          <View style={styles.actionCell}><GarageAction title={`Photos for ${vehicle.make} ${vehicle.model}`} icon="images-outline" disabled={disabled} onPress={()=>open('VehiclePhotos',{id:vehicle.id,vehicle})}/></View>
        </View>
        <View style={styles.cardFooter}>{archiveControl(vehicle)}</View>
      </View>
    </View>)}</GarageGrid>
    {data&&!busy&&!error&&!mutation.offline&&!feed.items.length&&<View style={styles.empty}><Ionicons name={archived?'archive-outline':'car-sport-outline'} size={56} color={theme.textSecondary}/><Text weight="semibold" style={styles.emptyTitle}>{archived?'No archived vehicles.':'Your garage is empty.'}</Text><Text style={styles.emptyBody}>{archived?'Vehicles you remove from your active garage will stay here with their history.':'Add your first vehicle to keep its details and photos together, ready for your next service request.'}</Text>{!archived&&<GarageAction title="Add your first vehicle" icon="add-outline" primary disabled={disabled} onPress={()=>open('VehicleForm')}/>}</View>}
    <GarageAction title="Refresh vehicles" icon="refresh-outline" disabled={disabled} onPress={()=>{if(!disabled)void refresh().catch(()=>{});}}/>
    {busy&&!!feed.items.length&&<Text style={styles.secondary}>Loading more vehicles...</Text>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>setSelected(null)}>
      {selected&&<View style={styles.backdrop}><View accessibilityViewIsModal style={styles.detailPanel}><View style={styles.detailHeader}><Text accessibilityRole="header" weight="semibold" style={styles.detailHeading}>Vehicle details</Text><GarageAction title="Back to Garage" icon="close-outline" onPress={()=>setSelected(null)}/></View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          {cover(selected)}<Text weight="semibold" style={styles.vehicleTitle}>{selected.make} {selected.model}</Text>
          <Text weight="semibold" style={styles.sectionTitle}>Vehicle specifications</Text><View style={styles.specGrid}>{[['Make',selected.make],['Model',selected.model],['Year',selected.year],['Colour',selected.colour],['Registration',selected.registration],['Garage status',selected.archived?'Archived':'Active']].map(([label,value])=><View key={label} style={styles.spec}><Text style={styles.secondary}>{label}</Text><Text style={styles.specValue}>{String(value??'Not specified')}</Text></View>)}</View>
          <Text style={styles.secondary}>Registration stays private to your account.</Text>
          <GarageAction title="Manage photos" icon="images-outline" disabled={disabled} onPress={()=>open('VehiclePhotos',{id:selected.id,vehicle:selected})}/>
          {!selected.archived&&<><GarageAction title="Edit vehicle" icon="create-outline" disabled={disabled} onPress={()=>open('VehicleForm',{vehicle:selected})}/><GarageAction title="Create service request" icon="construct-outline" primary disabled={disabled} onPress={()=>open('RequestForm',{vehicleId:selected.id,vehicle:selected})}/></>}
        </ScrollView></View></View>}
    </Modal>
  </GaragePage>;
}

export function VehicleFormScreen(props){const {user}=useAuth();return <VehicleDraft key={`${user?.uid}:${props.route.params?.vehicle?.id||'new'}`} {...props}/>;}
function VehicleDraft({route, navigation}) {
  const {theme}=useTheme();
  const styles=garageStyles(theme),wide=useWindowDimensions().width>=800;
  const vehicle = route.params?.vehicle;
  const [form, setForm] = useState(() => ({make: vehicle?.make || '', model: vehicle?.model || '', year: vehicle?.year ? String(vehicle.year) : '', colour: vehicle?.colour || '', registration: vehicle?.registration || ''}));
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const initial=useRef(form),[saved,setSaved]=useState(false),[leaveAction,setLeaveAction]=useState(null);
  const mutation = useMutation(), errors = vehicleErrors(form), disabled = mutation.saving || mutation.offline;
  const dirty=Object.keys(form).some(key=>form[key]!==initial.current[key]);
  usePreventRemove(!saved&&(dirty||mutation.saving),({data})=>{if(!mutation.saving)setLeaveAction(data.action);});
  useEffect(()=>{if(saved){if(navigation.canGoBack?.()===false)navigation.navigate('Garage');else navigation.goBack();}},[saved,navigation]);
  function edit(key, value) {if (!disabled) {setForm(previous => ({...previous, [key]: value})); setTouched(previous => ({...previous, [key]: true}));}}
  async function save() {
    setSubmitted(true);
    if (disabled || hasErrors(errors)) return;
    try {
      const result = await mutation.run('vehicleSave', {...form, year: Number(form.year), ...(vehicle ? {id: vehicle.id, version: vehicle.version} : {})});
      if (result) setSaved(true);
    } catch (_) {}
  }
  return <GaragePage title={vehicle?'Edit vehicle':'Add vehicle'} subtitle={vehicle?'Keep your vehicle details up to date.':'Vehicle details stay with your account.'} navigation={navigation} keyboard>
    <View style={styles.form}><View style={styles.privacy}><Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary}/><Text style={styles.privacyText}>Vehicle registration stays private to your account. Shops receive the make, model, year and colour with a request.</Text></View>
      <Text style={styles.secondary}>All fields marked * are required.</Text>
      {[['Vehicle identity',[['make','Make',80,'e.g. Toyota'],['model','Model',80,'e.g. Corolla'],['year','Year',4,'e.g. 2024']]],['Appearance & registration',[['colour','Colour',80,'e.g. Pearl white'],['registration','Registration number',20,'Your registration']]]].map(([heading,fields])=><View key={heading} style={styles.formSection}>
        <Text accessibilityRole="header" weight="semibold" style={styles.sectionTitle}>{heading}</Text><View style={styles.fields}>{fields.map(([key,label,maxLength,placeholder])=><View key={key} style={[styles.fieldCell,wide&&styles.wideField]}><Field label={`${label} *`} accessibilityLabel={label} value={form[key]} placeholder={placeholder} onChangeText={value=>edit(key,value)} onBlur={()=>setTouched(previous=>({...previous,[key]:true}))} error={(submitted||touched[key])?errors[key]:null} editable={!disabled} maxLength={maxLength} keyboardType={key==='year'?'number-pad':'default'} autoCapitalize={key==='registration'?'characters':'words'}/></View>)}</View>
      </View>)}
      {submitted&&hasErrors(errors)&&<View style={styles.validation}><Text style={styles.error}>Complete these details before saving:</Text>{Object.entries(errors).map(([key,error])=><Text key={key} style={styles.error}>{error}</Text>)}</View>}
      <Notice busy={mutation.saving} error={mutation.offline?'Connect to save your vehicle.':mutation.error}/>
      <View style={styles.cardActions}><View style={styles.actionCell}><GarageAction title="Cancel" disabled={mutation.saving} onPress={()=>{if(!mutation.saving)navigation.canGoBack?.()===false?navigation.navigate('Garage'):navigation.goBack();}}/></View><View style={styles.actionCell}><GarageAction title="Save vehicle" loading={mutation.saving} icon="checkmark-outline" primary disabled={disabled||hasErrors(errors)} onPress={save}/></View></View>
      <Modal visible={!!leaveAction} transparent animationType="fade" onRequestClose={()=>setLeaveAction(null)}>
        <View style={styles.backdrop}><View style={[styles.formSection,{width:'100%',maxWidth:440}]} accessibilityViewIsModal>
          <Text accessibilityRole="header" weight="semibold" style={styles.sectionTitle}>Discard vehicle changes?</Text><Text style={styles.secondary}>Your changes have not been saved.</Text>
          <GarageAction title="Keep editing" onPress={()=>setLeaveAction(null)}/><GarageAction title="Discard changes" danger onPress={()=>{const action=leaveAction;setLeaveAction(null);navigation.dispatch(action);}}/>
        </View></View>
      </Modal>
    </View>
  </GaragePage>;
}

export function OwnerRequestsScreen(props){const {user}=useAuth();return <OwnerRequests key={user?.uid||'signed-out'} {...props}/>;}
function OwnerRequests({navigation}) {
  const {theme}=useTheme(),{offline}=useAuth();
  const [cursor,setCursor]=useState(null);
  const {data,busy,error,refresh}=useMarketData('requests',{feed:'mine',cursor},setCursor);
  const feed=useInfiniteCursor(data,busy,setCursor,{pageCursor:cursor}),disabled=busy||offline;
  const reload=()=>{if(!disabled)void refresh().catch(()=>{});};
  return <RequestPage title="My Requests" subtitle="Your service requests and workshop responses." navigation={navigation}
    onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}
    refreshControl={<RefreshControl refreshing={busy&&!!feed.items.length} onRefresh={reload} tintColor={theme.textPrimary}/>}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:14,alignItems:'center',justifyContent:'space-between'}}>
      <RequestText muted style={{flex:1,minWidth:160}}>Manage your vehicle's next service.</RequestText>
      <RequestAction title="Create service request" displayTitle="New request" icon="add-outline" primary disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('RequestForm');}}/>
    </View>
    <Notice error={error}/>
    {busy&&!feed.items.length&&<RequestState title="Loading your requests..." busy/>}
    <RequestGrid>{feed.items.map(request=><RequestListCard key={request.id} request={request} navigation={navigation} disabled={disabled}/>)}</RequestGrid>
    {data&&!busy&&!error&&!offline&&!feed.items.length&&<RequestState title="No requests yet" description="Choose a vehicle and tell workshops what you need." icon="document-text-outline"
      action={<RequestAction title="New request" icon="add-outline" primary onPress={()=>navigation.navigate('RequestForm')}/>}/>}
    <RequestAction title="Refresh requests" icon="refresh-outline" disabled={disabled} onPress={reload}/>
    {busy&&!!feed.items.length&&<RequestText muted accessibilityRole="status">Loading more requests...</RequestText>}
  </RequestPage>;
}

export function RequestFormScreen(props){const {user} = useAuth();const request=props.route.params?.request;return <RequestDraft key={`${user?.uid}:${request?.id||props.route.params?.vehicleId||'choose'}`} {...props}/>;}
function RequestDraft({route, navigation}) {
  const {fontScale}=useWindowDimensions();
  const {user:studioUser}=useAuth();
  const studioDraft=studioUser?.uid&&route.params?.studioDraft?.uid===studioUser.uid?route.params.studioDraft:null;
  const request = route.params?.request, editing = !!request;
  const [vehicleCursor,setVehicleCursor]=useState(null),[categoryCursor,setCategoryCursor]=useState(null),[shopCursor,setShopCursor]=useState(null);
  const vehicles = useMarketData('vehicles', {cursor: vehicleCursor, archived: false});
  const categories = useMarketData('categories', {cursor: categoryCursor});
  const shops = useMarketData('shops', {cursor: shopCursor});
  const vehicleFeed=useInfiniteCursor(vehicles.data,vehicles.busy,setVehicleCursor,{autoLoad:false}),categoryFeed=useInfiniteCursor(categories.data,categories.busy,setCategoryCursor,{autoLoad:false}),shopFeed=useInfiniteCursor(shops.data,shops.busy,setShopCursor,{autoLoad:false});
  const [form, setForm] = useState(() => ({vehicleId: request?.vehicleId || (route.params?.vehicle?.archived ? '' : route.params?.vehicleId) || '', title: request?.title || (!editing&&typeof studioDraft?.title==='string'?studioDraft.title.slice(0,100):''), description: request?.description || (!editing&&typeof studioDraft?.description==='string'?studioDraft.description.slice(0,300):''), categoryId: request?.categoryId || '', city: request?.city || '', budgetMin: request?.budgetMinCents === undefined ? '' : String(request.budgetMinCents / 100), budgetMax: request?.budgetMaxCents === undefined ? '' : String(request.budgetMaxCents / 100), preferredDate: request?.preferredDate || '', visibility: request?.visibility || (route.params?.shop?.id?'direct':'open'), shopId: request?.shopId || route.params?.shop?.id || '', photoIds: request?.photoIds || []}));
  const [selected, setSelected] = useState(() => ({vehicle: request?.vehicle || route.params?.vehicle || null, category: null, shop: route.params?.shop || null}));
  const [mandatoryServicesText, setMandatoryServicesText] = useState((request?.mandatoryServices || []).join('\n'));
  const [serviceLocation, setServiceLocation] = useState(request?.serviceLocation || null), [locating, setLocating] = useState(false);
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [uploadingAttachment,setUploadingAttachment]=useState(false),[attachmentDraft,setAttachmentDraft]=useState(false);
  const mutation = useMutation(), errors = requestErrors(form), disabled = mutation.saving || mutation.offline || uploadingAttachment || locating;
  const initial=useRef(JSON.stringify([form,mandatoryServicesText,serviceLocation])),[savedResult,setSavedResult]=useState(null),[leaveAction,setLeaveAction]=useState(null);
  const dirty=JSON.stringify([form,mandatoryServicesText,serviceLocation])!==initial.current;
  const pending=mutation.saving||uploadingAttachment||locating;
  usePreventRemove(!savedResult&&(dirty||attachmentDraft||pending),({data})=>{if(!pending)setLeaveAction(data.action);});
  useEffect(()=>{if(savedResult)navigation.replace('OwnerRequest',{id:savedResult.id});},[savedResult,navigation]);
  const selectedVehicle=vehicleFeed.items.find(item=>item.id===form.vehicleId)||selected.vehicle;
  const mandatoryServices = mandatoryServicesText.split('\n').map(value => value.trim()).filter(Boolean);
  if (mandatoryServices.length > 20 || mandatoryServices.some(value => value.length > 200) || new Set(mandatoryServices.map(value => value.toLowerCase())).size !== mandatoryServices.length) errors.mandatoryServices = 'Use up to 20 unique service requirements, each at most 200 characters.';
  const selectorLayouts=useRef({}),scrollPosition=useRef(0),viewportHeight=useRef(0);
  const loadNearbySelectors=()=>{const top=scrollPosition.current, bottom=top+viewportHeight.current;for(const [kind,feed] of [['vehicle',vehicleFeed],['category',categoryFeed],['shop',shopFeed]]){const section=selectorLayouts.current[kind];if(section&&section.bottom>=top-260&&section.top<=bottom+260&&(kind!=='shop'||form.visibility==='direct'))feed.loadNext();}};
  const loadMore=event=>{scrollPosition.current=event.nativeEvent.contentOffset.y;viewportHeight.current=event.nativeEvent.layoutMeasurement.height;loadNearbySelectors();};
  const layoutPage=event=>{viewportHeight.current=event.nativeEvent.layout.height;loadNearbySelectors();};
  const layoutSelector=kind=>event=>{const {y,height}=event.nativeEvent.layout;selectorLayouts.current[kind]={top:y,bottom:y+height};loadNearbySelectors();};
  const invalidFields = Object.keys(errors);
  function edit(key, value) {if (!disabled) {setForm(previous => ({...previous, [key]: value})); setTouched(previous => ({...previous, [key]: true}));}}
  const fieldError = key => (submitted || touched[key]) ? errors[key] : null;
  function showValidation() {setSubmitted(true);setTouched(Object.fromEntries(Object.keys(form).map(key => [key, true])));}
  function choose(kind, item) {if (disabled || (kind==='vehicle'&&item.archived)) return; edit(`${kind}Id`, item.id); if (kind === 'vehicle') setForm(previous => ({...previous, photoIds: []})); setSelected(previous => ({...previous, [kind]: item}));}
  async function submit() {
    setSubmitted(true);
    if (disabled || attachmentDraft || hasErrors(errors)) return;
    const {budgetMin, budgetMax, shopId, photoIds, ...input} = form;
    try {
      const result = await mutation.run(editing ? 'requestUpdate' : 'requestCreate', {...input, ...(serviceLocation || request?.serviceLocation ? {serviceLocation} : {}), ...(mandatoryServices.length || request?.mandatoryServices ? {mandatoryServices} : {}), budgetMinCents: parseMoney(budgetMin), budgetMaxCents: parseMoney(budgetMax), ...(form.visibility === 'direct' ? {shopId} : {}), ...(editing ? {photoIds, id: request.id, version: request.version || 1} : (photoIds.length ? {photoIds} : {}))});
      if (result) setSavedResult(result);
    } catch (_) {}
  }
  if(editing&&request.status!=='open')return <RequestPage title="Service request" navigation={navigation} back>
    <RequestState title="This request can no longer be edited" description="Only open service requests can be changed." action={<RequestAction title="View request" onPress={()=>navigation.navigate('OwnerRequest',{id:request.id})}/>}/>
  </RequestPage>;
  return <RequestPage title={editing?'Edit service request':'New service request'} subtitle="Tell workshops what your vehicle needs." navigation={navigation} back form onScroll={loadMore} onLayout={layoutPage}>
    <RequestText muted>Choose a vehicle and category, then complete the fields labelled Required. Nothing is published until you submit.</RequestText>
    <SelectionList title="Vehicle" state={vehicles} feed={vehicleFeed} selected={form.vehicleId} onSelect={item=>choose('vehicle',item)} label={vehicleName} disabled={disabled} onLayout={layoutSelector('vehicle')}/>
    {!!form.vehicleId&&<RequestText accessibilityRole="status">Selected vehicle: {selectedVehicle?vehicleName(selectedVehicle):'Vehicle from your Garage. Choose an active vehicle below if it is no longer available.'}</RequestText>}
    <Notice error={fieldError('vehicleId')}/>
    {!form.vehicleId&&<RequestAction title="Add a vehicle" icon="add-outline" disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('VehicleForm');}}/>}
    <SelectionList title="Service category" state={categories} feed={categoryFeed} selected={form.categoryId} onSelect={item=>choose('category',item)} label={item=>item.name} disabled={disabled} onLayout={layoutSelector('category')}/>
    {selected.category&&<RequestText muted>Selected: {selected.category.name}</RequestText>}
    <Notice error={fieldError('categoryId')}/>
    <RequestSection title="Request details">
      <Field label="Request title" accessibilityLabel="Request title" helperText="Required · up to 100 characters" placeholder="e.g. Repair and repaint the front bumper" value={form.title} onChangeText={value=>edit('title',value)} onBlur={()=>setTouched(previous=>({...previous,title:true}))} maxLength={100} editable={!disabled} error={fieldError('title')}/>
      <Field label="Description" helperText={`Required · ${form.description.length}/300 characters`} placeholder="Describe the work and the finish you want." value={form.description} onChangeText={value=>edit('description',value)} onBlur={()=>setTouched(previous=>({...previous,description:true}))} maxLength={300} multiline editable={!disabled} error={fieldError('description')}/>
      <AIAssistButton kind="request" title={form.title} description={form.description} categoryId={form.categoryId} disabled={disabled} onApply={suggestion=>{
        setForm(previous=>({...previous,title:suggestion.title,description:suggestion.description,...(suggestion.category?{categoryId:suggestion.category.id}:{})}));
        if(suggestion.category)setSelected(previous=>({...previous,category:suggestion.category}));
      }}/>
    </RequestSection>
    <RequestSection title="Location & requirements">
      <Field label="City" helperText="Required" placeholder="e.g. Johannesburg" value={form.city} onChangeText={value=>edit('city',value)} onBlur={()=>setTouched(previous=>({...previous,city:true}))} maxLength={100} editable={!disabled} error={fieldError('city')}/>
      <Field label="Mandatory services (optional, one per line)" value={mandatoryServicesText} onChangeText={value=>{if(!disabled){setMandatoryServicesText(value);setTouched(previous=>({...previous,mandatoryServices:true}));}}} onBlur={()=>setTouched(previous=>({...previous,mandatoryServices:true}))} multiline maxLength={4020} editable={!disabled} error={fieldError('mandatoryServices')} helperText="Up to 20 unique requirements, 200 characters each. Workshops confirm coverage in their quotations."/>
      <LocationPicker label="Service location" value={serviceLocation} onChange={setServiceLocation} disabled={mutation.saving||mutation.offline||uploadingAttachment} onBusyChange={setLocating}/>
    </RequestSection>
    <RequestSection title="Budget & timing">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:14}}>
        <Field style={{flexGrow:1,flexBasis:fontScale>=1.4?'100%':240,minWidth:0}} label="Minimum budget (ZAR)" helperText="Required" placeholder="0.00" value={form.budgetMin} onChangeText={value=>edit('budgetMin',value)} onBlur={()=>setTouched(previous=>({...previous,budgetMin:true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMin')}/>
        <Field style={{flexGrow:1,flexBasis:fontScale>=1.4?'100%':240,minWidth:0}} label="Maximum budget (ZAR)" helperText="Required" placeholder="0.00" value={form.budgetMax} onChangeText={value=>edit('budgetMax',value)} onBlur={()=>setTouched(previous=>({...previous,budgetMax:true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMax')}/>
      </View>
      <Field label="Preferred date (optional, YYYY-MM-DD)" placeholder="YYYY-MM-DD" value={form.preferredDate} onChangeText={value=>edit('preferredDate',value)} onBlur={()=>setTouched(previous=>({...previous,preferredDate:true}))} autoCapitalize="none" maxLength={10} editable={!disabled} error={fieldError('preferredDate')}/>
    </RequestSection>
    <RequestSection title="Who can respond?" description="Choose the audience for this request.">
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[['open','Any approved shop'],['direct','One approved shop']].map(([value,label])=><RequestAudience key={value} title={label} selected={form.visibility===value} disabled={disabled} onPress={()=>edit('visibility',value)}/>)}</View>
      <RequestText muted>{form.visibility==='direct'?'Only your selected shop can view this request and submit a quotation.':'Approved shops can view this request and submit private quotations.'}</RequestText>
    </RequestSection>
    {form.visibility==='direct'&&<><SelectionList title="Approved shops" state={shops} feed={shopFeed} selected={form.shopId} onSelect={item=>choose('shop',item)} label={item=>`${item.shopName} · ${item.city}`} disabled={disabled} onLayout={layoutSelector('shop')}/>
      {selected.shop&&<RequestText muted>Selected shop: {selected.shop.shopName}</RequestText>}<Notice error={fieldError('shopId')}/></>}
    {!!form.vehicleId&&<RequestSection title="Photos (optional)" description="Attach up to five private photos. Published requests keep their attached copy when your Garage photos change.">
      <RequestAction title="Manage vehicle photos" icon="images-outline" disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('VehiclePhotos',{id:form.vehicleId});}}/>
      <PhotoGallery target="vehicle" id={form.vehicleId} selectedIds={form.photoIds} onSelectionChange={ids=>edit('photoIds',ids)} disabled={disabled}/>
      <RequestPhotoUploads key={form.vehicleId} vehicleId={form.vehicleId} selectedIds={form.photoIds} onSelectionChange={ids=>setForm(previous=>({...previous,photoIds:ids}))} disabled={mutation.saving||mutation.offline} onBusyChange={setUploadingAttachment} onDraftChange={setAttachmentDraft}/>
      <RequestText muted>{form.photoIds.length} {form.photoIds.length===1?'photo':'photos'} selected</RequestText>
      {!!form.photoIds.length&&<RequestAction title="Clear photo selection" disabled={disabled} onPress={()=>edit('photoIds',[])}/>}
    </RequestSection>}
    {attachmentDraft&&<RequestText muted accessibilityRole="status">Upload or cancel your selected photo before submitting.</RequestText>}
    <Notice busy={mutation.saving} error={mutation.offline?'Connect to save your request.':mutation.error}/>
    {!!invalidFields.length&&!mutation.saving&&<RequestSection title={submitted?'Complete these fields before submitting:':'Before you submit'}>
      {submitted&&invalidFields.map(key=><RequestText key={key}>{errors[key]}</RequestText>)}
      {!submitted&&<RequestText muted>Choose your vehicle and service category, then complete the required details and budget.</RequestText>}
      <RequestAction title="Show required fields" disabled={mutation.offline} onPress={showValidation}/>
    </RequestSection>}
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
      <RequestAction title="Cancel request changes" displayTitle="Cancel" disabled={mutation.saving||uploadingAttachment||locating} style={{flexGrow:1,flexBasis:180}} onPress={()=>{if(!mutation.saving&&!uploadingAttachment&&!locating)navigation.canGoBack?.()===false?navigation.navigate('OwnerRequests'):navigation.goBack();}}/>
      <RequestAction title={editing?'Save request':'Submit request'} primary loading={mutation.saving} disabled={disabled||attachmentDraft||hasErrors(errors)} style={{flexGrow:1,flexBasis:180}} onPress={submit}/>
    </View>
    <RequestDiscard action={leaveAction} onKeep={()=>setLeaveAction(null)} onDiscard={()=>{const action=leaveAction;setLeaveAction(null);navigation.dispatch(action);}}/>
  </RequestPage>;
}

export function OwnerRequestScreen(props){const {user}=useAuth();return <OwnerRequest key={`${user?.uid}:${props.route.params.id}`} {...props}/>;}
function OwnerRequest({route,navigation}) {
  const [quotesCursor,setQuotesCursor]=useState(null),[message,setMessage]=useState(''),id=route.params.id;
  const {data,busy,error,refresh}=useMarketData('request',{id,quotesCursor});
  const quotesFeed=useInfiniteCursor(data,busy,setQuotesCursor,{itemsKey:'quotes',cursorKey:'quotesCursor'});
  const mutation=useMutation(),last=useRef(null),disabled=busy||mutation.saving||mutation.offline;
  if(data?.request)last.current=data.request;
  const request=data?.request||((busy||mutation.offline)?last.current:null);
  async function close(){
    const result=await mutation.run('requestClose',{id});
    if(result){setMessage('Request closed. Existing quotations remain available to view.');quotesFeed.reset();setQuotesCursor(null);await refresh().catch(()=>{});}
  }
  return <RequestPage title={request?.title||'Service request'} subtitle="Request details and workshop responses." navigation={navigation} back onScroll={quotesFeed.onScroll} onLayout={quotesFeed.onLayout} onContentSizeChange={quotesFeed.onContentSizeChange}>
    <Notice busy={busy||mutation.saving} error={mutation.error||error}/>
    {!!message&&<RequestText accessibilityRole="status">{message}</RequestText>}
    {request&&<>
      <RequestSection title="Request information">
        <RequestStatus status={request.status}/>
        <RequestText>{[request.categoryName,request.city].filter(Boolean).join(' · ')||'Service details unavailable'}</RequestText>
        <RequestText muted>{request.visibility==='direct'?'Audience: one selected workshop':request.visibility==='open'?'Audience: approved workshops':'Audience unavailable'}</RequestText>
        {requestDate(request.createdAt)&&<RequestText muted>Created: {requestDate(request.createdAt)}</RequestText>}
        {requestDate(request.updatedAt)&&<RequestText muted>Updated: {requestDate(request.updatedAt)}</RequestText>}
        {requestDate(request.closedAt)&&<RequestText muted>Closed: {requestDate(request.closedAt)}</RequestText>}
      </RequestSection>
      <RequestSection title="Vehicle"><RequestText>{requestVehicleLabel(request.vehicle)}</RequestText>{!!request.vehicle?.colour&&<RequestText muted>{request.vehicle.colour}</RequestText>}</RequestSection>
      <RequestSection title="Requested work">
        <RequestText>{request.description||'No description supplied.'}</RequestText>
        {!!request.mandatoryServices?.length&&<><RequestText heading>Service requirements</RequestText>{request.mandatoryServices.map((service,index)=><RequestText key={index}>• {service}</RequestText>)}</>}
        <RequestText muted>Budget: {formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</RequestText>
        <RequestText muted>Preferred date: {request.preferredDate||'Flexible'}</RequestText>
        <RequestText muted>{request.serviceLocation?'A service location is supplied for quotation distance estimates.':'No service location supplied.'}</RequestText>
      </RequestSection>
      <RequestSection title="Private photos" description="Only authorised participants can access these attachments.">
        {request.photoIds?.length?<PhotoGallery target="request" id={id}/>:<RequestText muted>No photos attached.</RequestText>}
      </RequestSection>
      <RequestSection title="Manage request">
        {request.status==='open'?<>
          <RequestAction title="Edit request" icon="create-outline" disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('RequestForm',{request});}}/>
          <ConfirmationButton title="Close request" message="Stop new or updated quotations for this request. Existing quotations remain available to view. Closing does not create a booking." disabled={disabled} danger onConfirm={close}/>
        </>:<RequestText muted>{request.status==='booked'?'A quotation has been accepted. This request can no longer be edited or closed.':request.status==='closed'?'This request is closed. Existing quotations remain available to view.':'Management actions are unavailable for this status.'}</RequestText>}
        {!!request.bookingId&&<RequestAction title="View booking" icon="calendar-outline" disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('BookingDetail',{id:request.bookingId});}}/>}
      </RequestSection>
      <CustomerConversationPicker key={`${id}:${request.termsVersion}`} request={request} navigation={navigation} disabled={disabled}/>
      <RequestSection title="Workshop responses">
        {requestResponseLabel(request.quotationCount)&&<RequestText>{requestResponseLabel(request.quotationCount)}</RequestText>}
        <RequestText muted>Quotations are private. Review their scope and validity before continuing.</RequestText>
        {request.status==='open'&&<RequestAction title="Compare quotes" icon="reader-outline" disabled={disabled} onPress={()=>{if(!disabled)navigation.navigate('QuoteComparison',{id});}}/>}
        {!busy&&!error&&!quotesFeed.items.length&&<RequestText muted>{mutation.offline?'Connect to refresh workshop responses.':'No quotations yet.'}</RequestText>}
      </RequestSection>
      {quotesFeed.items.map(quote=><QuotationCard key={quote.id} quote={quote} request={request} compact/>)}
      {busy&&!!quotesFeed.items.length&&<RequestText muted>Loading more quotations...</RequestText>}
    </>}
    <RequestAction title="Refresh request" icon="refresh-outline" disabled={disabled} onPress={()=>{if(!disabled)void refresh().catch(()=>{});}}/>
  </RequestPage>;
}
