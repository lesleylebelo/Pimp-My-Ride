import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Page, Card, Field, Button, Notice, Paging, usePages, formatMoney, QuoteCard} from '../components/MarketplaceUI';
import {vehicleErrors, requestErrors, parseMoney} from '../utils/validation';

const hasErrors = errors => Object.values(errors).some(Boolean);
const vehicleName = vehicle => `${vehicle.make} ${vehicle.model} (${vehicle.year})`;
const when = value => value ? new Date(value).toLocaleDateString() : 'Not specified';

// No form drafts or marketplace records are persisted on this device.
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

export function GarageScreen({navigation}) {
  const [archived, setArchived] = useState(false), pages = usePages();
  const {data, busy, error, refresh} = useMarketData('vehicles', {cursor: pages.cursor, archived});
  const mutation = useMutation(), disabled = busy || mutation.saving || mutation.offline;
  async function archive(vehicle) {
    const result = await mutation.run('vehicleArchive', {id: vehicle.id, version: vehicle.version, archived: !vehicle.archived});
    if (result) await refresh().catch(() => {});
  }
  return <Page title="My garage" navigation={navigation}>
    <Text>Add your vehicles, then choose one when requesting a service.</Text>
    <Button title="Add vehicle" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('VehicleForm');}}/>
    <View style={styles.row}>{[false, true].map(value => <Button key={String(value)} title={value ? 'Archived vehicles' : 'Active vehicles'} outline={archived !== value} disabled={disabled} onPress={() => {if (!disabled) {setArchived(value); pages.first();}}}/>)}</View>
    <Notice busy={busy || mutation.saving} error={mutation.error || error}/>
    {(data?.items || []).map(vehicle => <Card key={vehicle.id}>
      <Text weight="semibold" style={styles.heading}>{vehicleName(vehicle)}</Text>
      <Text>{vehicle.colour} · {vehicle.registration}</Text>
      {!archived && <><Button title={`Edit ${vehicle.make} ${vehicle.model}`} outline disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('VehicleForm', {vehicle});}}/>
        <Button title={`Request service for ${vehicle.make} ${vehicle.model}`} disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('RequestForm', {vehicleId: vehicle.id, vehicle});}}/></>}
      <ConfirmationButton title={archived ? `Restore ${vehicle.make} ${vehicle.model}` : `Archive ${vehicle.make} ${vehicle.model}`} message={archived ? 'Restore this vehicle to your active garage. Its open requests can become visible to shops again.' : 'Hide this vehicle from your active garage and stop new quotations on its requests until restored. Existing requests and quotations remain in your history.'} disabled={disabled} onConfirm={() => archive(vehicle)}/>
    </Card>)}
    {data && !busy && !data.items.length && <Text>{archived ? 'No archived vehicles.' : 'Your garage is empty. Add your first vehicle to get started.'}</Text>}
    <Button title="Refresh vehicles" outline disabled={disabled} onPress={() => {if (!disabled) void refresh().catch(() => {});}}/>
    <Paging pages={pages} nextCursor={data?.cursor} busy={disabled}/>
  </Page>;
}

export function VehicleFormScreen(props){const {user}=useAuth();return <VehicleDraft key={`${user?.uid}:${props.route.params?.vehicle?.id||'new'}`} {...props}/>;}
function VehicleDraft({route, navigation}) {
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
    } catch (_) { /* Keep the draft and display the mutation error. */ }
  }
  return <Page title={vehicle ? 'Edit vehicle' : 'Add vehicle'} navigation={navigation}>
    <Text>Vehicle registration stays private to your account. Shops receive the make, model, year and colour with a request.</Text>
    <Card>{[['make', 'Make', 80], ['model', 'Model', 80], ['year', 'Year', 4], ['colour', 'Colour', 80], ['registration', 'Registration number', 20]].map(([key, label, maxLength]) => <Field key={key} label={label} value={form[key]} onChangeText={value => edit(key, value)} onBlur={() => setTouched(previous => ({...previous, [key]: true}))} error={(submitted || touched[key]) ? errors[key] : null} editable={!disabled} maxLength={maxLength} keyboardType={key === 'year' ? 'number-pad' : 'default'} autoCapitalize={key === 'registration' ? 'characters' : 'words'}/>)}</Card>
    <Notice busy={mutation.saving} error={mutation.error}/>
    <Button title="Save vehicle" disabled={disabled || hasErrors(errors)} onPress={save}/>
  </Page>;
}

export function OwnerRequestsScreen({navigation}) {
  const pages = usePages(), {offline} = useAuth();
  const {data, busy, error, refresh} = useMarketData('requests', {feed: 'mine', cursor: pages.cursor});
  const disabled = busy || offline;
  return <Page title="My requests" navigation={navigation}>
    <Button title="Create service request" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('RequestForm');}}/>
    <Notice busy={busy} error={error}/>
    {(data?.items || []).map(request => <Card key={request.id}>
      <Text weight="semibold" style={styles.heading}>{request.title}</Text>
      <Text>{request.categoryName} · {request.city}</Text>
      <Text>{request.status === 'open' ? 'Open for quotations' : 'Closed'} · {request.visibility === 'direct' ? 'Direct request' : 'Open request'}</Text>
      <Text>{formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
      <Button title={`View ${request.title}`} disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('OwnerRequest', {id: request.id});}}/>
    </Card>)}
    {data && !busy && !data.items.length && <Text>No service requests yet. Choose a vehicle and describe what you need.</Text>}
    <Button title="Refresh requests" outline disabled={disabled} onPress={() => {if (!disabled) void refresh().catch(() => {});}}/>
    <Paging pages={pages} nextCursor={data?.cursor} busy={disabled}/>
  </Page>;
}

function SelectionList({title, state, pages, selected, onSelect, label, disabled}) {
  return <Card><Text weight="semibold" style={styles.heading}>{title}</Text>
    <Notice busy={state.busy} error={state.error}/>
    {(state.data?.items || []).map(item => <Button key={item.id} title={`${selected === item.id ? 'Selected: ' : ''}${label(item)}`} outline={selected !== item.id} disabled={disabled || state.busy} onPress={() => {if (!disabled && !state.busy) onSelect(item);}}/>) }
    {state.data && !state.busy && !state.data.items.length && <Text>No available options on this page.</Text>}
    <Button title={`Refresh ${title.toLowerCase()}`} outline disabled={disabled || state.busy} onPress={() => {if (!disabled && !state.busy) void state.refresh().catch(() => {});}}/>
    <Paging pages={pages} nextCursor={state.data?.cursor} busy={disabled || state.busy}/>
  </Card>;
}

export function RequestFormScreen(props){const {user}=useAuth();return <RequestDraft key={`${user?.uid}:${props.route.params?.vehicleId||'choose'}`} {...props}/>;}
function RequestDraft({route, navigation}) {
  const vehiclePages = usePages(), categoryPages = usePages(), shopPages = usePages();
  const vehicles = useMarketData('vehicles', {cursor: vehiclePages.cursor, archived: false});
  const categories = useMarketData('categories', {cursor: categoryPages.cursor});
  const shops = useMarketData('shops', {cursor: shopPages.cursor});
  const [form, setForm] = useState(() => ({vehicleId: route.params?.vehicleId || '', title: '', description: '', categoryId: '', city: '', budgetMin: '', budgetMax: '', preferredDate: '', visibility: 'open', shopId: ''}));
  const [selected, setSelected] = useState(() => ({vehicle: route.params?.vehicle || null, category: null, shop: null}));
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const mutation = useMutation(), errors = requestErrors(form), disabled = mutation.saving || mutation.offline;
  function edit(key, value) {if (!disabled) {setForm(previous => ({...previous, [key]: value})); setTouched(previous => ({...previous, [key]: true}));}}
  const fieldError = key => (submitted || touched[key]) ? errors[key] : null;
  function choose(kind, item) {edit(`${kind}Id`, item.id); setSelected(previous => ({...previous, [kind]: item}));}
  async function submit() {
    setSubmitted(true);
    if (disabled || hasErrors(errors)) return;
    const {budgetMin, budgetMax, shopId, ...input} = form;
    try {
      const result = await mutation.run('requestCreate', {...input, budgetMinCents: parseMoney(budgetMin), budgetMaxCents: parseMoney(budgetMax), ...(form.visibility === 'direct' ? {shopId} : {})});
      if (result) navigation.replace('OwnerRequest', {id: result.id});
    } catch (_) { /* Preserve all selections and text for retry. */ }
  }
  return <Page title="Request a service" navigation={navigation}>
    <Text>Describe the work and set a budget in South African rand. Requests and quotations require a connection.</Text>
    <SelectionList title="Vehicles" state={vehicles} pages={vehiclePages} selected={form.vehicleId} onSelect={item => choose('vehicle', item)} label={vehicleName} disabled={disabled}/>
    {form.vehicleId && <Text>Selected vehicle: {selected.vehicle ? vehicleName(selected.vehicle) : 'Vehicle from your garage'}</Text>}
    <Notice error={fieldError('vehicleId')}/>
    <Button title="Add a vehicle" outline disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('VehicleForm');}}/>
    <SelectionList title="Categories" state={categories} pages={categoryPages} selected={form.categoryId} onSelect={item => choose('category', item)} label={item => item.name} disabled={disabled}/>
    {selected.category && <Text>Selected category: {selected.category.name}</Text>}
    <Notice error={fieldError('categoryId')}/>
    <Card>
      <Field label="Request title" value={form.title} onChangeText={value => edit('title', value)} onBlur={() => setTouched(previous => ({...previous, title: true}))} maxLength={100} editable={!disabled} error={fieldError('title')}/>
      <Field label="Description" value={form.description} onChangeText={value => edit('description', value)} onBlur={() => setTouched(previous => ({...previous, description: true}))} maxLength={300} multiline editable={!disabled} error={fieldError('description')} helperText={`${form.description.length}/300 characters`}/>
      <Field label="City" value={form.city} onChangeText={value => edit('city', value)} onBlur={() => setTouched(previous => ({...previous, city: true}))} maxLength={100} editable={!disabled} error={fieldError('city')}/>
      <Field label="Minimum budget (ZAR)" value={form.budgetMin} onChangeText={value => edit('budgetMin', value)} onBlur={() => setTouched(previous => ({...previous, budgetMin: true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMin')}/>
      <Field label="Maximum budget (ZAR)" value={form.budgetMax} onChangeText={value => edit('budgetMax', value)} onBlur={() => setTouched(previous => ({...previous, budgetMax: true}))} keyboardType="decimal-pad" maxLength={12} editable={!disabled} error={fieldError('budgetMax')}/>
      <Field label="Preferred date (optional, YYYY-MM-DD)" value={form.preferredDate} onChangeText={value => edit('preferredDate', value)} onBlur={() => setTouched(previous => ({...previous, preferredDate: true}))} autoCapitalize="none" maxLength={10} editable={!disabled} error={fieldError('preferredDate')}/>
    </Card>
    <Card><Text weight="semibold">Who can quote?</Text>
      <Button title="Any approved shop" outline={form.visibility !== 'open'} disabled={disabled} onPress={() => edit('visibility', 'open')}/>
      <Button title="One approved shop" outline={form.visibility !== 'direct'} disabled={disabled} onPress={() => edit('visibility', 'direct')}/>
      <Text>{form.visibility === 'direct' ? 'Only your selected shop can view this request and submit a quotation.' : 'Approved shops can view this request and submit private quotations.'}</Text>
    </Card>
    {form.visibility === 'direct' && <><SelectionList title="Approved shops" state={shops} pages={shopPages} selected={form.shopId} onSelect={item => choose('shop', item)} label={item => `${item.shopName} · ${item.city}`} disabled={disabled}/>
      {selected.shop && <Text>Selected shop: {selected.shop.shopName}</Text>}<Notice error={fieldError('shopId')}/></>}
    <Notice busy={mutation.saving} error={mutation.error}/>
    <Button title="Submit request" disabled={disabled || hasErrors(errors)} onPress={submit}/>
  </Page>;
}

export function OwnerRequestScreen({route, navigation}) {
  const pages = usePages(), id = route.params.id;
  const {data, busy, error, refresh} = useMarketData('request', {id, quotesCursor: pages.cursor});
  const mutation = useMutation(), request = data?.request, disabled = busy || mutation.saving || mutation.offline;
  async function close() {
    const result = await mutation.run('requestClose', {id});
    if (result) {pages.first(); await refresh().catch(() => {});}
  }
  return <Page title={request?.title || 'Service request'} navigation={navigation}>
    <Notice busy={busy || mutation.saving} error={mutation.error || error}/>
    {request && <><Card>
      <Text weight="semibold" style={styles.heading}>{request.status === 'open' ? 'Open for quotations' : 'Closed request'}</Text>
      <Text>{request.categoryName} · {request.city}</Text>
      {request.vehicle && <Text>{vehicleName(request.vehicle)} · {request.vehicle.colour}</Text>}
      <Text>{request.description}</Text>
      <Text>Budget: {formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
      <Text>Preferred date: {request.preferredDate || 'Flexible'}</Text>
      <Text>{request.visibility === 'direct' ? 'Direct request to one approved shop' : 'Open request to approved shops'}</Text>
      <Text>Created: {when(request.createdAt)}</Text>
      {request.status === 'open' && <ConfirmationButton title="Close request" message="Stop new or updated quotations for this request. Existing quotations remain available to view. Closing does not create a booking." disabled={disabled} onConfirm={close}/>}
    </Card><Text weight="semibold" style={styles.heading}>Private quotations</Text>
      <Text>Compare quoted work, prices and validity here. Accepting quotations and bookings will be added in the next milestone.</Text>
      {(data.quotes || []).map(quote => <QuoteCard key={quote.id} quote={quote}/>)}
      {!busy && !data.quotes?.length && <Text>No quotations on this page.</Text>}
      <Paging pages={pages} nextCursor={data.quotesCursor} busy={disabled}/>
    </>}
    <Button title="Refresh request" outline disabled={disabled} onPress={() => {if (!disabled) void refresh().catch(() => {});}}/>
  </Page>;
}

const styles = StyleSheet.create({heading: {fontSize: 18, lineHeight: 26}, row: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}});
