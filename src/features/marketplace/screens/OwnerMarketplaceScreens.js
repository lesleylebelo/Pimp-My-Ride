import {CustomerModal as Modal,CustomerGrid,CustomerState,CustomerPressable} from '../../customer/components/CustomerUI';
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Page, Card, Field, Button, Notice, StatusTag, useInfiniteCursor, formatMoney} from '../components/MarketplaceUI';
import PhotoGallery from '../components/PhotoGallery';
import RequestPhotoUploads from '../components/RequestPhotoUploads';
import LocationPicker from '../../../shared/location/LocationPicker';
import {CustomerConversationPicker} from '../components/ConversationAction';
import PrivatePhoto from '../components/PrivatePhoto';
import AIAssistButton from '../components/AIAssistButton';
import {vehicleErrors, requestErrors, parseMoney} from '../utils/validation';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {GaragePage, GarageAction, garageStyles} from '../components/GarageUI';
import {QuotationPage, QuotationCard, QuotationAction, QuotationSection, quotationStyles} from '../components/QuotationUI';

const hasErrors = errors => Object.values(errors).some(Boolean);
const vehicleName = vehicle => `${vehicle.make} ${vehicle.model} (${vehicle.year})`;
const when = value => value ? new Date(value).toLocaleDateString() : 'Not specified';
const requestStatus = status => status === 'open' ? 'Open for quotations' : status === 'booked' ? 'Quotation accepted' : 'Closed request';

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
  const styles=garageStyles(theme),wide=useWindowDimensions().width>=800;
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
  const cover=vehicle=><View style={[styles.cover,!vehicle.photoIds?.length&&{height:160}]}>
    <View style={styles.coverPlaceholder}><Ionicons name="car-sport-outline" size={64} color={theme.textSecondary}/><Text style={styles.placeholderText}>{vehicle.photoIds?.length?'Private vehicle photo':'Add photos to make it yours'}</Text></View>
    {!!vehicle.photoIds?.length&&<PrivatePhoto target="vehicle" id={vehicle.id} imageStyle={styles.coverImage} accessibilityLabel={`Photo of ${vehicle.make} ${vehicle.model}`}/>}
  </View>;
  const archiveControl=vehicle=><ConfirmationButton palette={theme} title={vehicle.archived ? `Restore ${vehicle.make} ${vehicle.model}` : `Remove ${vehicle.make} ${vehicle.model}`} message={vehicle.archived ? 'Restore this vehicle to your active garage. Its open requests can become visible to shops again.' : 'Remove this vehicle from your active garage. It will not be deleted permanently; past service requests, quotations, and bookings will be preserved.'} disabled={disabled} danger={!vehicle.archived} onConfirm={() => archive(vehicle)}/>;
  return <GaragePage title="My Garage" subtitle="Your vehicles, details and private photos." navigation={navigation} tabs onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}
    refreshControl={<RefreshControl refreshing={busy&&!!feed.items.length} onRefresh={()=>{if(!disabled)void refresh().catch(()=>{});}} tintColor={theme.textPrimary}/>}>
    <View style={styles.toolbar}><View style={styles.intro}><Text style={styles.eyebrow}>YOUR COLLECTION</Text><Text weight="semibold" style={styles.sectionTitle}>{archived?'Archived vehicles':'Your vehicles'}</Text><Text style={styles.secondary}>Choose a vehicle to view its details or request a service.</Text></View>
      <GarageAction title="Add vehicle" icon="add-outline" primary disabled={disabled} onPress={()=>open('VehicleForm')}/></View>
    <View style={styles.filters}>{[false,true].map(value=><CustomerPressable key={String(value)} accessibilityRole="button" accessibilityLabel={value?'Archived vehicles':'Active vehicles'} accessibilityState={{selected:archived===value,disabled}} disabled={disabled} onPress={()=>{if(!disabled&&archived!==value){feed.reset();setArchived(value);setCursor(null);setSelected(null);setMessage('');}}} style={[styles.filter,archived===value&&styles.filterSelected]}><Text weight={archived===value?'semibold':'regular'} style={styles.filterText}>{value?'Archived vehicles':'Active vehicles'}</Text></CustomerPressable>)}</View>
    <Notice busy={mutation.saving} error={mutation.offline?'Connect to view or update your garage.':mutation.error || error}/>
    {busy&&!feed.items.length&&<View accessibilityRole="status" style={styles.empty}><ActivityIndicator color={theme.textPrimary}/><Text style={styles.secondary}>Loading your garage...</Text></View>}
    {!!message && <Text accessibilityRole="status">{message}</Text>}
    <CustomerGrid>{feed.items.map(vehicle=><View key={vehicle.id} testID={`garage-vehicle-${vehicle.id}`} style={[styles.vehicleCard,{width:'100%',borderRadius:12,borderWidth:1,borderColor:theme.border}]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View details for ${vehicle.make} ${vehicle.model}`} disabled={disabled} onPress={()=>{if(!disabled)setSelected(vehicle);}}>{cover(vehicle)}</Pressable>
      <View style={styles.cardBody}><Text style={styles.eyebrow}>{String(vehicle.year)}</Text><Text weight="semibold" style={styles.vehicleTitle}>{vehicle.make} {vehicle.model}</Text><Text style={styles.specLine}>{[vehicle.colour,vehicle.registration].filter(Boolean).join(' · ')}</Text>
        <GarageAction title={`View ${vehicle.make} ${vehicle.model}`} icon="car-outline" disabled={disabled} onPress={()=>{if(!disabled)setSelected(vehicle);}}/>
        <View style={styles.cardActions}><View style={styles.actionCell}><GarageAction title={`Photos for ${vehicle.make} ${vehicle.model}`} icon="images-outline" disabled={disabled} onPress={()=>open('VehiclePhotos',{id:vehicle.id})}/></View>
          {!archived&&<View style={styles.actionCell}><GarageAction title={`Edit ${vehicle.make} ${vehicle.model}`} icon="create-outline" disabled={disabled} onPress={()=>open('VehicleForm',{vehicle})}/></View>}</View>
        {!archived&&<GarageAction title={`Request service for ${vehicle.make} ${vehicle.model}`} icon="construct-outline" primary disabled={disabled} onPress={()=>open('RequestForm',{vehicleId:vehicle.id,vehicle})}/>}
        {archiveControl(vehicle)}
      </View>
    </View>)}</CustomerGrid>
    {data&&!busy&&!error&&!feed.items.length&&<View style={styles.empty}><Ionicons name={archived?'archive-outline':'car-sport-outline'} size={56} color={theme.textSecondary}/><Text weight="semibold" style={styles.emptyTitle}>{archived?'No archived vehicles.':'Your garage is empty.'}</Text><Text style={styles.emptyBody}>{archived?'Vehicles you remove from your active garage will stay here with their history.':'Add your first vehicle to keep its details and photos together, ready for your next service request.'}</Text></View>}
    <GarageAction title="Refresh vehicles" icon="refresh-outline" disabled={disabled} onPress={()=>{if(!disabled)void refresh().catch(()=>{});}}/>
    {busy&&!!feed.items.length&&<Text style={styles.secondary}>Loading more vehicles...</Text>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>setSelected(null)}>
      {selected&&<View style={styles.backdrop}><View accessibilityViewIsModal style={styles.detailPanel}><View style={styles.detailHeader}><Text accessibilityRole="header" weight="semibold" style={styles.detailHeading}>Vehicle details</Text><GarageAction title="Back to Garage" icon="close-outline" onPress={()=>setSelected(null)}/></View>
        <ScrollView contentContainerStyle={styles.detailContent}>
          {cover(selected)}<Text weight="semibold" style={styles.vehicleTitle}>{selected.make} {selected.model}</Text>
          <Text weight="semibold" style={styles.sectionTitle}>Vehicle specifications</Text><View style={styles.specGrid}>{[['Make',selected.make],['Model',selected.model],['Year',selected.year],['Colour',selected.colour],['Registration',selected.registration],['Garage status',selected.archived?'Archived':'Active']].map(([label,value])=><View key={label} style={styles.spec}><Text style={styles.secondary}>{label}</Text><Text style={styles.specValue}>{String(value??'Not specified')}</Text></View>)}</View>
          <Text style={styles.secondary}>Registration stays private to your account.</Text>
          <GarageAction title="Manage photos" icon="images-outline" disabled={disabled} onPress={()=>open('VehiclePhotos',{id:selected.id})}/>
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
  const mutation = useMutation(), errors = vehicleErrors(form), disabled = mutation.saving || mutation.offline;
  function edit(key, value) {if (!disabled) {setForm(previous => ({...previous, [key]: value})); setTouched(previous => ({...previous, [key]: true}));}}
  async function save() {
    setSubmitted(true);
    if (disabled || hasErrors(errors)) return;
    try {
      const result = await mutation.run('vehicleSave', {...form, year: Number(form.year), ...(vehicle ? {id: vehicle.id, version: vehicle.version} : {})});
      if (result) navigation.goBack();
    } catch (_) {}
  }
  return <GaragePage title={vehicle?'Edit vehicle':'Add vehicle'} subtitle={vehicle?'Keep your vehicle details up to date.':'Vehicle details stay with your account.'} navigation={navigation} keyboard>
    <View style={styles.form}><View style={styles.privacy}><Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary}/><Text style={styles.privacyText}>Vehicle registration stays private to your account. Shops receive the make, model, year and colour with a request.</Text></View>
      <Text style={styles.secondary}>All fields marked * are required.</Text>
      {[['Vehicle identity',[['make','Make',80,'e.g. Toyota'],['model','Model',80,'e.g. Corolla'],['year','Year',4,'e.g. 2024']]],['Appearance & registration',[['colour','Colour',80,'e.g. Pearl white'],['registration','Registration number',20,'Your registration']]]].map(([heading,fields])=><View key={heading} style={styles.formSection}>
        <Text accessibilityRole="header" weight="semibold" style={styles.sectionTitle}>{heading}</Text><View style={styles.fields}>{fields.map(([key,label,maxLength,placeholder])=><View key={key} style={[styles.fieldCell,wide&&styles.wideField]}><Field label={`${label} *`} accessibilityLabel={label} value={form[key]} placeholder={placeholder} onChangeText={value=>edit(key,value)} onBlur={()=>setTouched(previous=>({...previous,[key]:true}))} error={(submitted||touched[key])?errors[key]:null} editable={!disabled} maxLength={maxLength} keyboardType={key==='year'?'number-pad':'default'} autoCapitalize={key==='registration'?'characters':'words'}/></View>)}</View>
      </View>)}
      {hasErrors(errors)&&<View style={styles.validation}><Text style={styles.error}>Complete these details before saving:</Text>{Object.entries(errors).map(([key,error])=><Text key={key} style={styles.error}>{error}</Text>)}</View>}
      <Notice busy={mutation.saving} error={mutation.offline?'Connect to save your vehicle.':mutation.error}/>
      <View style={styles.cardActions}><View style={styles.actionCell}><GarageAction title="Cancel" disabled={mutation.saving} onPress={()=>{if(!mutation.saving)navigation.canGoBack?.()===false?navigation.navigate('Garage'):navigation.goBack();}}/></View><View style={styles.actionCell}><GarageAction title="Save vehicle" icon="checkmark-outline" primary disabled={disabled||hasErrors(errors)} onPress={save}/></View></View>
    </View>
  </GaragePage>;
}

export function OwnerRequestsScreen({navigation}) {
  const {theme}=useTheme();
  const styles=makeStyles(theme);
  const {offline} = useAuth(), [cursor, setCursor] = useState(null);
  const {data, busy, error, refresh} = useMarketData('requests', {feed: 'mine', cursor}, setCursor);
  const feed = useInfiniteCursor(data, busy, setCursor, {pageCursor:cursor});
  const disabled = busy || offline;
  return <Page title="Requests" subtitle="Your work, from first idea to accepted quote" navigation={navigation} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
    <Button title="Create service request" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('RequestForm');}}/>
    <Notice busy={busy} error={error}/>
    <CustomerGrid>{feed.items.map(request => <Card key={request.id}>
      <Text weight="semibold" style={styles.heading}>{request.title}</Text>
      <Text>{request.categoryName} · {request.city}</Text>
      <StatusTag>{requestStatus(request.status)}</StatusTag>
      <Text>{request.visibility === 'direct' ? 'Direct request' : 'Open request'}</Text>
      <Text>{formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
      <Button title={`View ${request.title}`} disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('OwnerRequest', {id: request.id});}}/>
    </Card>)}</CustomerGrid>
    {data && !busy && !feed.items.length && <Text style={styles.muted}>No requests yet. Add a vehicle, then tell workshops what you need.</Text>}
    <Button title="Refresh requests" outline disabled={disabled} onPress={() => {if (!disabled) void refresh().catch(() => {});}}/>
    {busy && !!feed.items.length && <Text style={styles.muted}>Loading more requests...</Text>}
  </Page>;
}

function SelectionList({title, state, feed, selected, onSelect, label, disabled, onLayout}) {
  const {theme}=useTheme();
  const styles=makeStyles(theme);
  return <Card onLayout={onLayout} style={styles.selectionCard}>
    <Text weight="medium" style={styles.sectionEyebrow}>{title}</Text>
    <Notice busy={state.busy} error={state.error}/>
    <View style={styles.selectionChips}>{feed.items.map(item => {
      const active = selected === item.id;
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${active ? 'Selected: ' : ''}${label(item)}`} accessibilityState={{selected: active, disabled: disabled || state.busy}} disabled={disabled || state.busy} onPress={() => {if (!disabled && !state.busy) onSelect(item);}} style={[styles.selectionChip, active && styles.selectedChip]}>
        <Text style={[styles.selectionText, active && styles.selectedText]}>{label(item)}</Text>
        {active && <Ionicons name="checkmark" size={16} color={theme.primaryText}/>}
      </Pressable>;
    })}</View>
    {state.data && !state.busy && !feed.items.length && <Text style={styles.muted}>{title.includes('MODIFICATION TYPE') ? 'No active service categories are configured.' : 'No available options.'}</Text>}
    <Button title={`Refresh ${title.toLowerCase()}`} outline disabled={disabled || state.busy} onPress={() => {if (!disabled && !state.busy) void state.refresh().catch(() => {});}}/>
    {state.busy && !!feed.items.length && <Text style={styles.muted}>Loading more options...</Text>}
  </Card>;
}

export function RequestFormScreen(props){const {user} = useAuth();const request=props.route.params?.request;return <RequestDraft key={`${user?.uid}:${request?.id||props.route.params?.vehicleId||'choose'}`} {...props}/>;}
function RequestDraft({route, navigation}) {
  const {theme}=useTheme();
  const styles=makeStyles(theme);
  const request = route.params?.request, editing = !!request;
  const [vehicleCursor,setVehicleCursor]=useState(null),[categoryCursor,setCategoryCursor]=useState(null),[shopCursor,setShopCursor]=useState(null);
  const vehicles = useMarketData('vehicles', {cursor: vehicleCursor, archived: false});
  const categories = useMarketData('categories', {cursor: categoryCursor});
  const shops = useMarketData('shops', {cursor: shopCursor});
  const vehicleFeed=useInfiniteCursor(vehicles.data,vehicles.busy,setVehicleCursor,{autoLoad:false}),categoryFeed=useInfiniteCursor(categories.data,categories.busy,setCategoryCursor,{autoLoad:false}),shopFeed=useInfiniteCursor(shops.data,shops.busy,setShopCursor,{autoLoad:false});
  const [form, setForm] = useState(() => ({vehicleId: request?.vehicleId || route.params?.vehicleId || '', title: request?.title || '', description: request?.description || '', categoryId: request?.categoryId || '', city: request?.city || '', budgetMin: request?.budgetMinCents === undefined ? '' : String(request.budgetMinCents / 100), budgetMax: request?.budgetMaxCents === undefined ? '' : String(request.budgetMaxCents / 100), preferredDate: request?.preferredDate || '', visibility: request?.visibility || (route.params?.shop?.id?'direct':'open'), shopId: request?.shopId || route.params?.shop?.id || '', photoIds: request?.photoIds || []}));
  const [selected, setSelected] = useState(() => ({vehicle: route.params?.vehicle || null, category: null, shop: route.params?.shop || null}));
  const [mandatoryServicesText, setMandatoryServicesText] = useState((request?.mandatoryServices || []).join('\n'));
  const [serviceLocation, setServiceLocation] = useState(request?.serviceLocation || null), [locating, setLocating] = useState(false);
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [uploadingAttachment,setUploadingAttachment]=useState(false);
  const mutation = useMutation(), errors = requestErrors(form), disabled = mutation.saving || mutation.offline || uploadingAttachment || locating;
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
  function choose(kind, item) {if (disabled) return; edit(`${kind}Id`, item.id); if (kind === 'vehicle') setForm(previous => ({...previous, photoIds: []})); setSelected(previous => ({...previous, [kind]: item}));}
  async function submit() {
    setSubmitted(true);
    if (disabled || hasErrors(errors)) return;
    const {budgetMin, budgetMax, shopId, photoIds, ...input} = form;
    try {
      const result = await mutation.run(editing ? 'requestUpdate' : 'requestCreate', {...input, ...(serviceLocation || request?.serviceLocation ? {serviceLocation} : {}), ...(mandatoryServices.length || request?.mandatoryServices ? {mandatoryServices} : {}), budgetMinCents: parseMoney(budgetMin), budgetMaxCents: parseMoney(budgetMax), ...(form.visibility === 'direct' ? {shopId} : {}), ...(editing ? {photoIds, id: request.id, version: request.version || 1} : (photoIds.length ? {photoIds} : {}))});
      if (result) navigation.replace('OwnerRequest', {id: result.id});
    } catch (_) {}
  }
  return <Page title={editing ? 'Edit service request' : 'Request a service'} subtitle="Tell us what you need" navigation={navigation} onScroll={loadMore} onLayout={layoutPage}>
    <Text style={styles.formIntro}>Tell us what you have in mind. Shops will use these details to prepare a quote.</Text>
    <SelectionList title="01  /  YOUR VEHICLE" state={vehicles} feed={vehicleFeed} selected={form.vehicleId} onSelect={item => choose('vehicle', item)} label={vehicleName} disabled={disabled} onLayout={layoutSelector('vehicle')}/>
    {!!form.vehicleId && <View style={styles.selectedVehicle}><View style={styles.selectedVehicleCopy}>
      <Text style={styles.selectedVehicleLabel}>SELECTED VEHICLE</Text>
      <Text style={styles.selectedVehicleName}>{selected.vehicle ? vehicleName(selected.vehicle) : 'Vehicle from your garage'}</Text>
    </View><Ionicons name="checkmark-circle" size={21} color={theme.accent}/></View>}
    <Notice error={fieldError('vehicleId')}/>
    {!form.vehicleId && <Button title="Add a vehicle" outline disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('VehicleForm');}}/>}
    {!!form.vehicleId && <Card>
      <Text weight="semibold">Attach vehicle photos (optional)</Text>
      <Text>Choose up to five photos. Published requests keep these attachments even if you later change your garage photos.</Text>
      <Button title="Manage vehicle photos" outline disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('VehiclePhotos', {id: form.vehicleId});}}/>
      <PhotoGallery target="vehicle" id={form.vehicleId} selectedIds={form.photoIds} onSelectionChange={ids => edit('photoIds', ids)} disabled={disabled}/>
      <RequestPhotoUploads key={form.vehicleId} vehicleId={form.vehicleId} selectedIds={form.photoIds} onSelectionChange={ids=>setForm(previous=>({...previous,photoIds:ids}))} disabled={mutation.saving||mutation.offline} onBusyChange={setUploadingAttachment}/>
      <Text>{form.photoIds.length} photos selected</Text>
      {!!form.photoIds.length && <Button title="Clear photo selection" outline disabled={disabled} onPress={() => edit('photoIds', [])}/>}
    </Card>}
    <SelectionList title="02  /  MODIFICATION TYPE" state={categories} feed={categoryFeed} selected={form.categoryId} onSelect={item => choose('category', item)} label={item => item.name} disabled={disabled} onLayout={layoutSelector('category')}/>
    {selected.category && <Text style={styles.selectionSummary}>Selected: {selected.category.name}</Text>}
    <Notice error={fieldError('categoryId')}/>
    <View style={styles.formSection}>
      <Text style={styles.sectionEyebrow}>03  /  THE DETAILS</Text>
      <Field label="Request title" placeholder="e.g. satin black vinyl wrap" value={form.title} onChangeText={value => edit('title', value)} onBlur={() => setTouched(previous => ({...previous, title: true}))} maxLength={100} editable={!disabled} error={fieldError('title')}/>
      <Field label="Description" placeholder="Tell the shop what you're looking for…" value={form.description} onChangeText={value => edit('description', value)} onBlur={() => setTouched(previous => ({...previous, description: true}))} maxLength={300} multiline editable={!disabled} error={fieldError('description')} helperText={`${form.description.length}/300 characters`}/>
      <AIAssistButton kind="request" title={form.title} description={form.description} categoryId={form.categoryId} disabled={disabled} onApply={suggestion=>{
        setForm(previous=>({...previous,title:suggestion.title,description:suggestion.description,...(suggestion.category?{categoryId:suggestion.category.id}:{})}));
        if(suggestion.category)setSelected(previous=>({...previous,category:suggestion.category}));
      }}/>
      <Field label="City" value={form.city} onChangeText={value => edit('city', value)} onBlur={() => setTouched(previous => ({...previous, city: true}))} maxLength={100} editable={!disabled} error={fieldError('city')}/>
      <Field label="Mandatory services (optional, one per line)" value={mandatoryServicesText} onChangeText={setMandatoryServicesText} multiline maxLength={4020} editable={!disabled} error={errors.mandatoryServices} helperText="Up to 20 unique requirements, each at most 200 characters. Shops confirm each requirement for recommendations."/>
      <LocationPicker label="Service location" value={serviceLocation} onChange={setServiceLocation} disabled={mutation.saving || mutation.offline || uploadingAttachment} onBusyChange={setLocating}/>
      <Text style={styles.budgetLabel}>BUDGET RANGE  ·  ZAR</Text>
      <View style={styles.budgetRow}>
        <Field style={styles.budgetField} label="Minimum budget (ZAR)" placeholder="R 0" value={form.budgetMin} onChangeText={value => edit('budgetMin', value)} onBlur={() => setTouched(previous => ({...previous, budgetMin: true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMin')} inputStyle={styles.budgetInput}/>
        <Field style={styles.budgetField} label="Maximum budget (ZAR)" placeholder="R 0" value={form.budgetMax} onChangeText={value => edit('budgetMax', value)} onBlur={() => setTouched(previous => ({...previous, budgetMax: true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMax')} inputStyle={styles.budgetInput}/>
      </View>
      <Field label="Preferred date (optional, YYYY-MM-DD)" value={form.preferredDate} onChangeText={value => edit('preferredDate', value)} onBlur={() => setTouched(previous => ({...previous, preferredDate: true}))} autoCapitalize="none" maxLength={10} editable={!disabled} error={fieldError('preferredDate')}/>
    </View>
    <Card><Text weight="medium" style={styles.sectionEyebrow}>04  /  WHO CAN QUOTE?</Text>
      <Button title="Any approved shop" outline={form.visibility !== 'open'} disabled={disabled} onPress={() => edit('visibility', 'open')}/>
      <Button title="One approved shop" outline={form.visibility !== 'direct'} disabled={disabled} onPress={() => edit('visibility', 'direct')}/>
      <Text>{form.visibility === 'direct' ? 'Only your selected shop can view this request and submit a quotation.' : 'Approved shops can view this request and submit private quotations.'}</Text>
    </Card>
    {form.visibility === 'direct' && <><SelectionList title="Approved shops" state={shops} feed={shopFeed} selected={form.shopId} onSelect={item => choose('shop', item)} label={item => `${item.shopName} · ${item.city}`} disabled={disabled} onLayout={layoutSelector('shop')}/>
      {selected.shop && <Text>Selected shop: {selected.shop.shopName}</Text>}<Notice error={fieldError('shopId')}/></>}
    <Notice busy={mutation.saving} error={mutation.error}/>
    {!!invalidFields.length && !mutation.saving && <Card accessibilityRole="alert">
      <Text weight="semibold">Complete these fields before submitting:</Text>
      {invalidFields.map(key => <Text key={key}>{errors[key]}</Text>)}
      <Button title="Show required fields" outline disabled={mutation.offline} onPress={showValidation}/>
    </Card>}
    <Button title={editing ? 'Save request' : 'Submit request'} disabled={disabled || hasErrors(errors)} onPress={submit}/>
  </Page>;
}

export function OwnerRequestScreen(props) {const {user}=useAuth();return <OwnerRequest key={`${user?.uid}:${props.route.params.id}`} {...props}/>;}
function OwnerRequest({route, navigation}) {
  const {theme}=useTheme();
  const styles=quotationStyles(theme),Button=QuotationAction,Card=QuotationSection;
  const [quotesCursor,setQuotesCursor]=useState(null),id = route.params.id;
  const {data, busy, error, refresh} = useMarketData('request', {id, quotesCursor});
  const quotesFeed=useInfiniteCursor(data,busy,setQuotesCursor,{itemsKey:'quotes',cursorKey:'quotesCursor'});
  const mutation = useMutation(), request = data?.request, disabled = busy || mutation.saving || mutation.offline;
  async function close() {
    const result = await mutation.run('requestClose', {id});
    if (result) {quotesFeed.reset();setQuotesCursor(null); await refresh().catch(() => {});}
  }
  return <QuotationPage title={request?.title || 'Service request'} subtitle="Request details and quotes" navigation={navigation} onScroll={quotesFeed.onScroll} onLayout={quotesFeed.onLayout} onContentSizeChange={quotesFeed.onContentSizeChange}>
    <Notice busy={busy || mutation.saving} error={mutation.error || error}/>
    {request && <><Card>
      <StatusTag>{requestStatus(request.status)}</StatusTag>
      <Text>{request.categoryName} · {request.city}</Text>
      {request.vehicle && <Text>{vehicleName(request.vehicle)} · {request.vehicle.colour}</Text>}
      <Text>{request.description}</Text>
      <Text>Budget: {formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
      <Text>Preferred date: {request.preferredDate || 'Flexible'}</Text>
      <Text>{request.visibility === 'direct' ? 'Direct request to one approved shop' : 'Open request to approved shops'}</Text>
      <Text>Created: {when(request.createdAt)}</Text>
      {request.bookingId && <Button title="View booking" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('BookingDetail', {id: request.bookingId});}}/>}
      {request.status === 'open' && <Button title="Edit request" outline disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('RequestForm', {request});}}/>}
      {request.status === 'open' && <ConfirmationButton title="Close request" message="Stop new or updated quotations for this request. Existing quotations remain available to view. Closing does not create a booking." disabled={disabled} danger onConfirm={close}/>}
    </Card>
      {!!request.photoIds?.length && <PhotoGallery target="request" id={id}/>}
      <CustomerConversationPicker key={`${id}:${request.termsVersion}`} request={request} navigation={navigation} disabled={disabled}/>
      <Text weight="semibold" style={styles.heading}>Private quotations</Text>
      <Text>Compare quoted work, prices and validity. An accepted offer creates a booking awaiting the shop's confirmation.</Text>
      {request.status === 'open' && <Button title="Compare quotes" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('QuoteComparison', {id});}}/>}
      {quotesFeed.items.map(quote => <QuotationCard key={quote.id} quote={quote} request={request} compact/>)}
      {!busy && !quotesFeed.items.length && <Text style={styles.muted}>No quotations yet.</Text>}
      {busy && !!quotesFeed.items.length && <Text style={styles.muted}>Loading more quotations...</Text>}
    </>}
    <Button title="Refresh request" outline disabled={disabled} onPress={() => {if (!disabled) void refresh().catch(() => {});}}/>
  </QuotationPage>;
}

const makeStyles = (colors) => StyleSheet.create({
  heading: {fontSize: 18, lineHeight: 26, color: colors.textPrimary, fontWeight: '600'},
  muted: {color: colors.textSecondary, fontSize: 14},
  row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  formIntro: {color: colors.textSecondary, lineHeight: 22},
  sectionEyebrow: {fontSize: 11, lineHeight: 16, letterSpacing: 1.1, color: colors.textMuted, fontWeight: '600'},
  selectionCard: {padding: 20, gap: 14},
  selectionChips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  selectionChip: {minHeight: 40, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor:colors.border},
  selectedChip: {backgroundColor: colors.primary},
  selectionText: {fontSize: 13, color: colors.textSecondary, fontWeight: '500'},
  selectedText: {color: colors.primaryText, fontWeight: '700'},
  selectedVehicle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border},
  selectedVehicleCopy: {flex: 1, gap: 4},
  selectedVehicleLabel: {fontSize: 10, letterSpacing: 1, color: colors.textMuted, fontWeight: '600'},
  selectedVehicleName: {fontSize: 15, lineHeight: 21, color: colors.textPrimary, fontWeight: '500'},
  selectionSummary: {fontSize: 13, color: colors.textSecondary},
  formSection: {padding: 20, borderRadius: 12, backgroundColor: colors.surfaceCard, gap: 12, borderWidth: 1, borderColor: colors.border},
  budgetLabel: {fontSize: 11, letterSpacing: 1, color: colors.textMuted, fontWeight: '600', paddingTop: 2},
  budgetRow: {flexDirection: 'row', gap: 12},
  budgetField: {flex: 1, minWidth: 0},
  budgetInput: {fontFamily: 'monospace', fontVariant: ['tabular-nums']},
});
