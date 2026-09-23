import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import colors from '../../../shared/theme/colors';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Page, Card, Field, Button, Notice, Paging, usePages, formatMoney, QuoteCard} from '../components/MarketplaceUI';
import {parseMoney, quoteErrors} from '../utils/validation';

const offlineMessage = 'Connect to the internet to view requests and manage quotations.';
const errorMessage = error => error?.message || 'Unable to complete this action. Please retry.';
const dateLabel = value => value ? new Date(value).toLocaleDateString() : 'Not specified';
const reload = refresh => () => { void refresh().catch(() => {}); };

function RequestSummary({request, detailed = false}) {
  return <>
    <Text style={styles.heading}>{request.title}</Text>
    <Text>{[request.vehicle?.year, request.vehicle?.make, request.vehicle?.model].filter(Boolean).join(' ')}</Text>
    <Text style={styles.muted}>{request.categoryName} · {request.city}</Text>
    <Text>Status: {request.status} · {request.visibility === 'direct' ? 'Direct request' : 'Open request'}</Text>
    {detailed && <>
      <Text>{request.description}</Text>
      {!!request.vehicle?.colour && <Text>Vehicle colour: {request.vehicle.colour}</Text>}
      <Text>Preferred date: {dateLabel(request.preferredDate)}</Text>
      <Text>Budget: {request.budgetMinCents == null && request.budgetMaxCents == null ? 'Not specified' : `${request.budgetMinCents == null ? 'No minimum' : formatMoney(request.budgetMinCents)} – ${request.budgetMaxCents == null ? 'No maximum' : formatMoney(request.budgetMaxCents)}`}</Text>
    </>}
  </>;
}

function RequestsFeed({navigation, feed}) {
  const {offline} = useAuth();
  const pages = usePages();
  const {data, busy, error, refresh} = useMarketData('requests', {feed, cursor: pages.cursor});
  const disabled = busy || offline;
  return <Page title={feed === 'direct' ? 'Direct requests' : 'Find jobs'} navigation={navigation}>
    <Text style={styles.muted}>{feed === 'direct' ? 'Customers have invited your shop to quote on these requests.' : 'Browse open customer requests and prepare a quotation for work your shop can complete.'}</Text>
    <Notice busy={busy} error={offline ? offlineMessage : error}/>
    {(data?.items || []).map(request => <Card key={request.id}>
      <RequestSummary request={request}/>
      <Button title="View request" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('ShopRequest', {id: request.id}); }}/>
    </Card>)}
    {!busy && data && !data.items.length && <Text>{feed === 'direct' ? 'No direct requests yet.' : 'No open requests are available.'}</Text>}
    <Button title="Refresh requests" disabled={disabled} onPress={reload(refresh)}/>
    <Paging pages={pages} nextCursor={data?.cursor} busy={disabled}/>
  </Page>;
}

export function ShopJobsScreen(props) { return <RequestsFeed {...props} feed="open"/>; }
export function ShopRequestsScreen(props) { return <RequestsFeed {...props} feed="direct"/>; }

export function ShopRequestScreen({navigation, route}) {
  const {offline} = useAuth();
  const {data, busy, error, refresh} = useMarketData('request', {id: route.params?.id});
  const request = data?.request, quotes = data?.quotes || [];
  const canQuote = !offline && !busy && request?.status === 'open' && !quotes.length;
  return <Page title="Service request" navigation={navigation}>
    <Notice busy={busy} error={offline ? offlineMessage : error}/>
    {request && <>
      <Card><RequestSummary request={request} detailed/></Card>
      {quotes.length > 0 ? <>
        <Text style={styles.heading}>Your quotation</Text>
        {quotes.map(quote => <QuoteCard key={quote.id} quote={quote}/>)}
        <Text style={styles.muted}>A shop can submit one quotation per request. Submitted quotations can be withdrawn from My quotations.</Text>
        <Button title="My quotations" onPress={() => navigation.navigate('ShopQuotes')}/>
      </> : <>
        {request.status !== 'open' && <Text>This request is closed and no longer accepts quotations.</Text>}
        <Button title="Prepare quotation" disabled={!canQuote} onPress={() => { if (canQuote) navigation.navigate('QuoteForm', {request}); }}/>
      </>}
    </>}
    <Button title="Refresh request" disabled={busy || offline} onPress={reload(refresh)}/>
  </Page>;
}

export function QuoteFormScreen(props) {
  const {user} = useAuth();
  const id = props.route.params?.request?.id || props.route.params?.id;
  return <QuoteDraft key={`${user?.uid || 'signed-out'}:${id}`} {...props} requestId={id}/>;
}

function QuoteDraft({navigation, requestId}) {
  const {offline} = useAuth();
  // Reload the request: navigation parameters never decide whether quoting is allowed.
  const {data, busy, error, refresh} = useMarketData('request', {id: requestId});
  const [form, setForm] = useState({scope: '', items: [{description: '', amount: ''}], completionDays: '7', warranty: '', validForDays: '14'});
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false), [failure, setFailure] = useState(''), [sent, setSent] = useState(false);
  const lock = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const request = data?.request, existingQuote = data?.quotes?.length > 0;
  const errors = quoteErrors(form);
  const disabled = busy || saving || offline || !request || request.status !== 'open' || existingQuote;
  const fieldError = key => (submitted || touched[key]) ? errors[key] : undefined;
  const touch = key => setTouched(value => ({...value, [key]: true}));
  const change = (key, value) => { touch(key); setForm(current => ({...current, [key]: value})); };
  const changeItem = (index, key, value) => {
    touch(`items.${index}.${key}`);
    setForm(current => ({...current, items: current.items.map((item, position) => position === index ? {...item, [key]: value} : item)}));
  };
  const total = form.items.reduce((sum, item) => sum + (parseMoney(item.amount) || 0), 0);
  async function send() {
    if (lock.current || disabled || sent) return;
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    lock.current = true; setSaving(true); setFailure('');
    try {
      await marketApi('quoteSubmit', {
        serviceRequestId: requestId,
        scope: form.scope.trim(),
        items: form.items.map(item => ({description: item.description.trim(), amountCents: parseMoney(item.amount)})),
        completionDays: Number(form.completionDays), warranty: form.warranty.trim(), validForDays: Number(form.validForDays),
      });
      if (active.current) {
        setSent(true);
        setForm({scope: '', items: [{description: '', amount: ''}], completionDays: '7', warranty: '', validForDays: '14'});
      }
    } catch (e) { if (active.current) setFailure(errorMessage(e)); }
    finally { lock.current = false; if (active.current) setSaving(false); }
  }
  return <Page title="Prepare quotation" navigation={navigation}>
    <Notice busy={busy || saving} error={offline ? offlineMessage : failure || error}/>
    {sent ? <Card>
      <Text style={styles.heading}>Quotation submitted</Text>
      <Text>The customer can now review your quotation. This does not create a booking.</Text>
      <Button title="My quotations" onPress={() => navigation.navigate('ShopQuotes')}/>
    </Card> : <>
      {request && <Card><RequestSummary request={request}/></Card>}
      {existingQuote && <Text>A quotation has already been submitted by your shop for this request. View it in My quotations.</Text>}
      {request && request.status !== 'open' && <Text>This request is closed and no longer accepts quotations.</Text>}
      <Card>
        <Text style={styles.heading}>Scope of work</Text>
        <Field label="Work included" value={form.scope} onChangeText={value => change('scope', value)} onBlur={() => touch('scope')} error={fieldError('scope')} multiline maxLength={2000} editable={!disabled}/>
        <Text style={styles.heading}>Price breakdown</Text>
        <Text style={styles.muted}>Enter the full amount for each line, including any applicable charges. All prices are in South African rand.</Text>
        {form.items.map((item, index) => <View key={index} style={styles.lineItem}>
          <Field label={`Item ${index + 1} description`} value={item.description} onChangeText={value => changeItem(index, 'description', value)} onBlur={() => touch(`items.${index}.description`)} error={fieldError(`items.${index}.description`)} maxLength={200} editable={!disabled}/>
          <Field label={`Item ${index + 1} amount (R)`} value={item.amount} onChangeText={value => changeItem(index, 'amount', value)} onBlur={() => touch(`items.${index}.amount`)} error={fieldError(`items.${index}.amount`)} keyboardType="decimal-pad" maxLength={12} editable={!disabled}/>
          {form.items.length > 1 && <Button title={`Remove item ${index + 1}`} disabled={disabled} onPress={() => { if (!disabled) { setForm(current => ({...current, items: current.items.filter((_, position) => position !== index)})); setTouched({}); } }}/>}
        </View>)}
        <Notice error={fieldError('items')}/>
        <Button title="Add line item" disabled={disabled || form.items.length >= 10} onPress={() => { if (!disabled) setForm(current => current.items.length < 10 ? {...current, items: [...current.items, {description: '', amount: ''}]} : current); }}/>
        <Text style={styles.heading}>Total: {formatMoney(total)}</Text>
      </Card>
      <Card>
        <Field label="Estimated completion (days)" value={form.completionDays} onChangeText={value => change('completionDays', value)} onBlur={() => touch('completionDays')} error={fieldError('completionDays')} keyboardType="number-pad" maxLength={3} editable={!disabled}/>
        <Field label="Warranty / guarantee terms" value={form.warranty} onChangeText={value => change('warranty', value)} onBlur={() => touch('warranty')} error={fieldError('warranty')} multiline maxLength={500} editable={!disabled}/>
        <Field label="Quotation valid for (days)" value={form.validForDays} onChangeText={value => change('validForDays', value)} onBlur={() => touch('validForDays')} error={fieldError('validForDays')} keyboardType="number-pad" maxLength={2} editable={!disabled}/>
        <Text style={styles.muted}>Only the customer and your shop can view this quotation. Check the details before sending; submitted quotations cannot be edited or replaced.</Text>
        <Button title="Send quotation" disabled={disabled} onPress={send}/>
      </Card>
      <Button title="Refresh request" disabled={saving || busy || offline} onPress={reload(refresh)}/>
    </>}
  </Page>;
}

export function ShopQuotesScreen(props) {
  const {user} = useAuth();
  return <QuotesList key={user?.uid || 'signed-out'} {...props}/>;
}

function QuotesList({navigation}) {
  const {offline} = useAuth(), pages = usePages();
  const {data, busy, error, refresh} = useMarketData('quotes', {cursor: pages.cursor});
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [withdrawn, setWithdrawn] = useState({});
  const lock = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const disabled = busy || saving || offline;
  async function withdraw(id) {
    if (lock.current || disabled || withdrawn[id]) return;
    lock.current = true; setSaving(true); setMessage('');
    try {
      await marketApi('quoteWithdraw', {id});
      if (!active.current) return;
      setWithdrawn(current => ({...current, [id]: true}));
      setMessage('Quotation withdrawn.');
      try { await refresh(); }
      catch (_) { if (active.current) setMessage('Quotation withdrawn. Refresh to load the latest list.'); }
    } catch (e) { if (active.current) setMessage(errorMessage(e)); throw e; }
    finally { lock.current = false; if (active.current) setSaving(false); }
  }
  return <Page title="My quotations" navigation={navigation}>
    <Text style={styles.muted}>Your submitted, accepted and withdrawn quotations. Accepted offers link to their booking. Withdrawing an unaccepted offer keeps its history.</Text>
    <Notice busy={busy || saving} error={offline ? offlineMessage : error}/>
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
    {(data?.items || []).map(original => {
      const quote = withdrawn[original.id] ? {...original, status: 'withdrawn'} : original;
      return <View key={quote.id} style={styles.quote}>
        <Text style={styles.heading}>{quote.requestTitle || 'Service request'}</Text>
        {!!quote.vehicle && <Text>{[quote.vehicle.year, quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(' ')}</Text>}
        <QuoteCard quote={quote}/>
        {!!quote.bookingId && <Button title="View booking" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('BookingDetail', {id: quote.bookingId}); }}/>}
        <Button title="View request" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('ShopRequest', {id: quote.serviceRequestId}); }}/>
        {quote.status === 'submitted' && <ConfirmationButton title="Withdraw quotation" message="This withdraws your offer and keeps its history. A replacement quotation cannot be submitted for this request." disabled={disabled} danger onConfirm={() => withdraw(quote.id)}/>}
      </View>;
    })}
    {!busy && data && !data.items.length && <Text>You have not submitted a quotation yet.</Text>}
    <Button title="Refresh quotations" disabled={disabled} onPress={reload(refresh)}/>
    <Paging pages={pages} nextCursor={data?.cursor} busy={disabled}/>
  </Page>;
}

const styles = StyleSheet.create({
  heading: {fontSize: 18, fontWeight: '700', color: colors.primary},
  muted: {color: colors.textSecondary, lineHeight: 21},
  lineItem: {borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8},
  quote: {gap: 10},
});
