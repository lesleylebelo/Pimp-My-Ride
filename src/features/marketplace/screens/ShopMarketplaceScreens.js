import React, {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {FeedSearchInput, FeedServicePill, FeedSourceSelector} from '../../../shared/components/landing/FeedControls';
import {useAuth} from '../../auth/context/AuthContext';
import {ConversationAction} from '../components/ConversationAction';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import colors from '../../../shared/theme/colors';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Page, Card, Field, Button, Notice, useInfiniteCursor, formatMoney, QuoteCard} from '../components/MarketplaceUI';
import {parseMoney, quoteErrors} from '../utils/validation';
import PhotoGallery from '../components/PhotoGallery';
import RequestPhotos from '../components/RequestPhotos';
import {usePostsFeed} from '../hooks/usePostsFeed';
import {PostCard,postTime} from '../components/PostCard';

const offlineMessage = 'Connect to the internet to view requests and manage quotations.';
const errorMessage = error => error?.message || 'Unable to complete this action. Please retry.';
const dateLabel = value => value ? new Date(value).toLocaleDateString() : 'Not specified';
const reload = refresh => () => { void refresh().catch(() => {}); };
const requestTermsVersion = request => Number.isSafeInteger(request?.termsVersion) ? request.termsVersion : Number.isSafeInteger(request?.version) ? request.version : 1;
const quoteMatchesRequest = (quote, request) => {
  const quoteVersion = Object.prototype.hasOwnProperty.call(quote || {}, 'termsVersion') ? quote.termsVersion : quote?.requestVersion;
  const currentVersion = requestTermsVersion(request);
  return Number.isSafeInteger(quoteVersion) && quoteVersion > 0 && quoteVersion === currentVersion;
};

const quoteExpired=(quote,now)=>typeof quote.validUntil==='number'&&Number.isFinite(quote.validUntil)&&quote.validUntil<=now;
function useQuoteExpiry(quotes){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{const expiry=Math.min(...quotes.filter(q=>q.status==='submitted'&&Number(q.validUntil)>Date.now()).map(q=>Number(q.validUntil)));if(!Number.isFinite(expiry))return;const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,expiry-Date.now()+1)));return()=>clearTimeout(timer);},[quotes,now]);
 return Math.max(now,Date.now());
}

export function filterJobRequests(requests, {query = '', category = 'All', location = '', minimumCents = null, maximumCents = null, notQuoted = false} = {}) {
  return requests.filter(request => {
    const vehicle = request.vehicle || {};
    const fields = [
      request.title, request.description, vehicle.make, vehicle.model, request.categoryName,
      request.city, request.customerName,
    ];
    const categoryName = String(request.categoryName || '').toLowerCase();
    const categoryMatches = category === 'All' || categoryName.includes(category.toLowerCase()) ||
      category === 'Wrap & Paint' && /wrap|paint/i.test(categoryName);
    return (!query || fields.some(value => String(value || '').toLowerCase().includes(query))) &&
      categoryMatches &&
      (!location || String(request.city || '').toLowerCase() === location.toLowerCase()) &&
      (minimumCents === null || (Number.isSafeInteger(request.budgetMaxCents) && request.budgetMaxCents >= minimumCents)) &&
      (maximumCents === null || (Number.isSafeInteger(request.budgetMinCents) && request.budgetMinCents <= maximumCents)) &&
      (!notQuoted || !request.quotedByMe);
  });
}

function RequestSummary({request, detailed = false}) {
  return <>
    <Text style={styles.heading}>{request.title}</Text>
    <Text>{[request.vehicle?.year, request.vehicle?.make, request.vehicle?.model].filter(Boolean).join(' ')}</Text>
    <Text style={styles.muted}>{request.categoryName} · {request.city}</Text>
    <Text>Status: {request.status} · {request.visibility === 'direct' ? 'Direct request' : 'Open request'}</Text>
    {detailed && <>
      <Text>{request.description}</Text>
      {(request.mandatoryServices || []).map(service => <Text key={service}>Required: {service}</Text>)}
      {!!request.vehicle?.colour && <Text>Vehicle colour: {request.vehicle.colour}</Text>}
      <Text>Preferred date: {dateLabel(request.preferredDate)}</Text>
      <Text>Budget: {request.budgetMinCents == null && request.budgetMaxCents == null ? 'Not specified' : `${request.budgetMinCents == null ? 'No minimum' : formatMoney(request.budgetMinCents)} – ${request.budgetMaxCents == null ? 'No maximum' : formatMoney(request.budgetMaxCents)}`}</Text>
    </>}
  </>;
}

function RequestsFeed({navigation, feed}) {
  const {offline} = useAuth();
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [minimumBudget, setMinimumBudget] = useState('');
  const [maximumBudget, setMaximumBudget] = useState('');
  const [notQuoted, setNotQuoted] = useState(false);
  const [source,setSource]=useState('all');
  const isJobsFeed = feed === 'open';
  const {data, busy, error, refresh} = useMarketData('requests', {feed, cursor}, setCursor);
  const requestFeed=useInfiniteCursor(data,busy,setCursor,{pageCursor:cursor});
  const feedRequests=requestFeed.items;
  const posts=usePostsFeed({view:'feed',source:'shops'});
  const {user,profile}=useAuth();
  const categories = [
  { label: 'Tuning', icon: 'speedometer-outline' },
  { label: 'Performance', icon: 'flash-outline' },
  { label: 'Other', icon: 'ellipsis-horizontal' },
  { label: 'Exhaust', icon: 'cloud-outline' },
  { label: 'Lighting', icon: 'bulb-outline' },
  { label: 'Body Kit', icon: 'construct-outline' },
  { label: 'Wheels', icon: 'ellipse-outline' },
  { label: 'Interior', icon: 'home-outline' },
  { label: 'Wrap & Paint', icon: 'color-palette-outline' },
];
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 180);
    return () => clearTimeout(timer);
  }, [search]);
  const minimumCents = minimumBudget.trim() ? parseMoney(minimumBudget) : null;
  const maximumCents = maximumBudget.trim() ? parseMoney(maximumBudget) : null;
  const matchingRequests = filterJobRequests(feedRequests, {query: debouncedSearch, category, location, minimumCents, maximumCents, notQuoted});
  const matchingPosts=posts.items.filter(post=>{
   const haystack=[post.title,post.description,post.vehicle,post.category,post.city,post.province,post.authorName].join(' ').toLowerCase();
   return post.authorId!==user?.uid&&(source==='all'||source==='shops')&&(!debouncedSearch||haystack.includes(debouncedSearch))&&
    (category==='All'||post.category?.toLowerCase()===category.toLowerCase())&&(!location||post.city?.toLowerCase()===location.toLowerCase());
  });
  const feedItems=[
   ...(source==='all'||source==='customers'?matchingRequests.map(request=>({kind:'request',id:`request:${request.id}`,createdAt:request.createdAt,value:request})):[]),
   ...matchingPosts.map(post=>({kind:'post',id:`post:${post.id}`,createdAt:post.createdAt,value:post})),
  ].sort((left,right)=>timestamp(right.createdAt)-timestamp(left.createdAt));
  const locations = [...new Set(feedRequests.map(request => request.city).filter(Boolean))].sort();
  const hasFilters = !!search || category !== 'All' || !!location || !!minimumBudget || !!maximumBudget || notQuoted;
  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setCategory('All');
    setLocation('');
    setMinimumBudget('');
    setMaximumBudget('');
    setNotQuoted(false);
    setSource('all');
    setFiltersOpen(false);
  };
  const disabled = busy || offline;
  const retry = () => {
    if(error)void refresh().catch(() => {});
    if(posts.error)void posts.refresh();
  };
  const onScroll=event=>{requestFeed.onScroll(event);const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<260)posts.loadNext();};
  const onContentSizeChange=(width,height)=>{requestFeed.onContentSizeChange(width,height);if(height<650)posts.loadNext();};

  if (!isJobsFeed) return <Page title="Direct requests" navigation={navigation} onScroll={requestFeed.onScroll} onLayout={requestFeed.onLayout} onContentSizeChange={requestFeed.onContentSizeChange}>
    <Text style={styles.muted}>Customers have invited your shop to quote on these requests.</Text>
    <Notice busy={busy} error={offline ? offlineMessage : error}/>
    {feedRequests.map(request => <Card key={request.id}>
      <RequestSummary request={request}/>
      <RequestPhotos request={request}/>
      <Button title="View request" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('ShopRequest', {id: request.id}); }}/>
    </Card>)}
    {!busy && data && !data.items.length && <Text>No direct requests yet.</Text>}
    <Button title="Refresh requests" disabled={disabled} onPress={reload(refresh)}/>
    {busy && !!feedRequests.length && <Text style={styles.loadMore}>Loading more requests...</Text>}
  </Page>;

  return <Page title="Find Jobs" navigation={navigation} onScroll={onScroll} onLayout={requestFeed.onLayout} onContentSizeChange={onContentSizeChange}
   floatingAction={<Pressable accessibilityRole="button" accessibilityLabel="New showcase" onPress={()=>navigation.navigate('PostForm',{type:'showcase'})} style={styles.floating}><Ionicons name="add" size={28} color={colors.white}/></Pressable>}>
    <FeedSearchInput accessibilityLabel="Search requests, vehicles or services" placeholder="Search requests, vehicles or services" value={search} onChangeText={setSearch}/>
    <FeedSourceSelector options={[{label:'All',value:'all'},{label:'Customers',value:'customers'},{label:'Shops',value:'shops'}]} storageKey="feed-source:shop" value={source} onChange={setSource}/>
    <Text style={styles.feedIntro}>Browse open customer requests for work your shop can complete.</Text>
    <Text style={styles.filterHeading}>Browse by service</Text>
    <View style={styles.categories}>
      <FeedServicePill title="All" icon="apps-outline" selected={category === 'All'} onPress={() => setCategory('All')}/>
{categories.map(item => <FeedServicePill key={item.label} title={item.label} icon={item.icon} selected={category === item.label} onPress={() => setCategory(item.label)}/>)}
<FeedServicePill title="More filters" icon="options-outline" selected={false} onPress={() => setFiltersOpen(true)}/>
    </View>
    <Notice busy={(busy&&!feedRequests.length||posts.busy&&!posts.items.length)} error={offline ? offlineMessage : error||posts.error}/>
    {!!(error||posts.error) && <Button title={error?'Retry loading requests':'Retry loading posts'} outline disabled={!!(error&&busy)||!!(posts.error&&posts.busy)} onPress={retry}/>}
    {!busy && !posts.busy && !error && !posts.error && !feedItems.length && <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{hasFilters ? 'No requests match your search' : 'No open requests are available'}</Text>
      {hasFilters && <Button title="Clear filters" outline onPress={clearFilters}/>}
    </View>}
    <View style={styles.requestCards}>
    {feedItems.map(item=>item.kind==='post'?<View key={item.id} style={styles.feedCard}>
      <Text style={styles.feedLabel}>Showcase</Text>
      <PostCard post={item.value} onOpen={()=>navigation.navigate('PostDetail',{id:item.value.id})}/>
    </View>:<View key={item.id} style={styles.feedCard}>
    <Text style={styles.feedLabel}>Service request</Text>
    <Card style={styles.jobCard}>
      {(()=>{const request=item.value;return <>
      <View style={styles.jobAuthor}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(request.customerName)}</Text></View>
        <View style={styles.jobAuthorCopy}>
          <Text style={styles.jobCustomer}>{request.customerName || 'Customer'}</Text>
          <Text style={styles.muted}>{[request.city || 'Location not provided', request.createdAt ? postedLabel(request.createdAt) : null].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={styles.badges}>
          <Text style={styles.openStatus}>Open</Text>
          {request.quotedByMe && <Text style={styles.quotedStatus}>Quoted</Text>}
        </View>
      </View>
      <Text style={styles.jobCategory}>{request.categoryName || 'Service request'}</Text>
      <Text style={styles.jobTitle}>{request.title}</Text>
      <Text style={styles.jobVehicle}>{[request.vehicle?.year, request.vehicle?.make, request.vehicle?.model].filter(Boolean).join(' ')}</Text>
      {!!request.description && <Text style={styles.jobDescription}>{request.description}</Text>}
      <RequestPhotos request={request}/>
      <Text style={styles.jobBudget}>{request.budgetMinCents == null && request.budgetMaxCents == null ? 'Budget not specified' : `${request.budgetMinCents == null ? 'No minimum' : formatMoney(request.budgetMinCents)} – ${request.budgetMaxCents == null ? 'No maximum' : formatMoney(request.budgetMaxCents)}`}</Text>
      <View style={styles.jobFooter}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${request.quotedByMe ? 'View your quote' : 'View request'}: ${request.title}`} disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('ShopRequest', {id: request.id});}} style={styles.viewJob}>
          <Text style={styles.viewJobText}>{request.quotedByMe ? 'View your quote' : 'View request'} →</Text>
        </Pressable>
        <Text style={styles.quoteCount}>{request.quotationCount ? `${request.quotationCount} ${request.quotationCount === 1 ? 'quote' : 'quotes'}` : 'No quotes yet'}</Text>
      </View>
      </>;})()}
    </Card>
    </View>)}
    </View>
    {(busy||posts.busy)&&!!(feedRequests.length||posts.items.length)&&<Text accessibilityRole="status" style={styles.loadMore}>Loading more posts...</Text>}
    <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
      <View style={styles.modalBackdrop}>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalCard} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.modalTitle}>More filters</Text>
          <Text style={styles.filterLabel}>Location</Text>
          <View style={styles.categories}>
            <FeedServicePill title="All locations" selected={!location} onPress={() => setLocation('')}/>
            {locations.map(city => <FeedServicePill key={city} title={city} selected={location === city} onPress={() => setLocation(city)}/>)}
          </View>
          <Text style={styles.filterLabel}>Budget range</Text>
          <Field accessibilityLabel="Minimum budget" label="Minimum budget (R)" value={minimumBudget} onChangeText={setMinimumBudget} keyboardType="decimal-pad"/>
          {!!minimumBudget && minimumCents === null && <Text style={styles.filterError}>Enter a valid amount, such as 10000.00.</Text>}
          <Field accessibilityLabel="Maximum budget" label="Maximum budget (R)" value={maximumBudget} onChangeText={setMaximumBudget} keyboardType="decimal-pad"/>
          {!!maximumBudget && maximumCents === null && <Text style={styles.filterError}>Enter a valid amount, such as 20000.00.</Text>}
          <FeedServicePill title={notQuoted ? 'Not yet quoted by me · On' : 'Not yet quoted by me'} selected={notQuoted} onPress={() => setNotQuoted(value => !value)}/>
          <Button title="Close" outline onPress={() => setFiltersOpen(false)}/>
        </View>
        </ScrollView>
      </View>
    </Modal>
  </Page>;
}

export function ShopJobsScreen(props) { return <RequestsFeed {...props} feed="open"/>; }
export function ShopRequestsScreen(props) { return <RequestsFeed {...props} feed="direct"/>; }

function timestamp(value) {
  if (value == null) return 0;
  const milliseconds = typeof value?.toMillis === 'function' ? value.toMillis()
    : typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function postedLabel(value) {
  const timestamp = typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3600000));
  return hours < 1 ? 'just now' : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function initials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'C';
}

export function ShopRequestScreen({navigation, route}) {
  const {offline} = useAuth();
  const {data, busy, error, refresh} = useMarketData('request', {id: route.params?.id});
  const request = data?.request, quotes = data?.quotes || [];
  const now=useQuoteExpiry(quotes);
  const hasExpiredQuote=quotes.some(quote=>quote.status==='submitted'&&quoteExpired(quote,now));
  const hasCurrentQuote = quotes.some(quote => quote.status === 'submitted' && quoteMatchesRequest(quote, request) && !quoteExpired(quote,now));
  const hasAcceptedQuote = quotes.some(quote => quote.status === 'accepted');
  const hasWithdrawnQuote = quotes.some(quote => quote.status === 'withdrawn');
  const hasOutdatedQuote = quotes.some(quote => quote.status === 'submitted' && !quoteMatchesRequest(quote, request));
  const canQuote = !offline && !busy && request?.status === 'open' && !hasCurrentQuote && !hasAcceptedQuote && !hasWithdrawnQuote;
  return <Page title="Service request" navigation={navigation}>
    <Notice busy={busy} error={offline ? offlineMessage : error}/>
    {request && <>
      <Card><RequestSummary request={request} detailed/></Card>
      {request.status==='open' && <Card><ConversationAction serviceRequestId={request.id} navigation={navigation} disabled={busy || offline || !!error} askApproval={request.visibility==='open' && !hasCurrentQuote}/></Card>}
      {!!request.photoIds?.length && (request.status === 'open' || quotes.some(quote => quote.status === 'accepted')) && <PhotoGallery target="request" id={request.id}/>}
      {quotes.length > 0 ? <>
        <Text style={styles.heading}>Your quotation</Text>
        {quotes.map(quote => <React.Fragment key={quote.id}>
          <QuoteCard quote={quote}/>
          {quote.status === 'submitted' && !quoteMatchesRequest(quote, request) && <Text>This quotation is outdated or has no revision record, so the customer cannot accept it.</Text>}
        </React.Fragment>)}
        {hasWithdrawnQuote && <Text style={styles.muted}>Withdrawal is final for this request. Your withdrawn quotation remains in history and cannot be resubmitted or replaced.</Text>}
        {hasExpiredQuote&&!hasWithdrawnQuote&&<Text>This quotation has expired. Renew it with current pricing and deposit terms; its history will be preserved.</Text>}
        {hasOutdatedQuote && !hasWithdrawnQuote && <Text style={styles.muted}>Review the current request details and submit a replacement quotation. The previous offer will remain in quotation history.</Text>}
        {canQuote && <Button title={hasExpiredQuote?'Renew expired quotation':hasOutdatedQuote ? 'Update outdated quotation' : 'Prepare another quotation'} disabled={!canQuote} onPress={() => navigation.navigate('QuoteForm', {request})}/>}
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
  const [form, setForm] = useState({scope: '', items: [{description: '', amount: ''}], completionDays: '7', warranty: '', validForDays: '14', depositType:'none',depositValue:'',scopeConfirmed:false,allChargesIncluded:false,coveredServices:[]});
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false), [failure, setFailure] = useState(''), [sent, setSent] = useState(false);
  const lock = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const request = data?.request, quotes = data?.quotes || [];
  const coverageRevision = request ? requestTermsVersion(request) : null;
  useEffect(() => {
    if (coverageRevision !== null) setForm(current => ({...current,scopeConfirmed:false,allChargesIncluded:false,coveredServices:[]}));
  }, [coverageRevision, request?.id]);
  const now=useQuoteExpiry(quotes);
  const hasExpiredQuote=quotes.some(quote=>quote.status==='submitted'&&quoteExpired(quote,now));
  const hasCurrentQuote = quotes.some(quote => quote.status === 'submitted' && quoteMatchesRequest(quote, request) && !quoteExpired(quote,now));
  const hasAcceptedQuote = quotes.some(quote => quote.status === 'accepted');
  const hasWithdrawnQuote = quotes.some(quote => quote.status === 'withdrawn');
  const hasOutdatedQuote = quotes.some(quote => quote.status === 'submitted' && !quoteMatchesRequest(quote, request));
  const errors = quoteErrors(form);
  const disabled = busy || saving || offline || !request || request.status !== 'open' || hasCurrentQuote || hasAcceptedQuote || hasWithdrawnQuote;
  const fieldError = key => (submitted || touched[key]) ? errors[key] : undefined;
  const touch = key => setTouched(value => ({...value, [key]: true}));
  const change = (key, value) => { touch(key); setForm(current => ({...current, [key]: value})); };
  const changeItem = (index, key, value) => {
    touch(`items.${index}.${key}`);
    setForm(current => ({...current, items: current.items.map((item, position) => position === index ? {...item, [key]: value} : item)}));
  };
  const total = form.items.reduce((sum, item) => sum + (parseMoney(item.amount) || 0), 0);
  const depositAmount=form.depositType==='percentage'&&/^\d+$/.test(form.depositValue)?Math.floor((total*Number(form.depositValue)+50)/100):form.depositType==='fixed'?parseMoney(form.depositValue):null;
  async function send() {
    if (lock.current || disabled || sent) return;
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    lock.current = true; setSaving(true); setFailure('');
    try {
      await marketApi('quoteSubmit', {
        serviceRequestId: requestId,
        termsVersion: requestTermsVersion(request),
        scope: form.scope.trim(),
        scopeConfirmed: form.scopeConfirmed, allChargesIncluded: form.allChargesIncluded, coveredServices: form.coveredServices,
        items: form.items.map(item => ({description: item.description.trim(), amountCents: parseMoney(item.amount)})),
        completionDays: Number(form.completionDays), warranty: form.warranty.trim(), validForDays: Number(form.validForDays),
        depositType:form.depositType,depositValue:form.depositType==='percentage'?Number(form.depositValue):form.depositType==='fixed'?parseMoney(form.depositValue):null,
      });
      if (active.current) {
        setSent(true);
        setForm({scope: '', items: [{description: '', amount: ''}], completionDays: '7', warranty: '', validForDays: '14', depositType:'none',depositValue:'',scopeConfirmed:false,allChargesIncluded:false,coveredServices:[]});
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
      {request && <Card><RequestSummary request={request} detailed/></Card>}
      {hasExpiredQuote&&!hasWithdrawnQuote&&<Text>Your previous quotation expired. Review the request and submit a renewal with independently checked price and deposit terms.</Text>}
      {hasCurrentQuote && <Text>Your shop has a quotation for the current request terms. View it in My quotations.</Text>}
      {hasOutdatedQuote && !hasWithdrawnQuote && <Text>Your previous quotation is outdated. Submitting this replacement keeps the previous version in quotation history.</Text>}
      {hasAcceptedQuote && <Text>An accepted quotation cannot be replaced.</Text>}
      {hasWithdrawnQuote && <Text>Withdrawal is final for this request. The quotation remains in history and cannot be resubmitted or replaced.</Text>}
      {request && request.status !== 'open' && <Text>This request is closed and no longer accepts quotations.</Text>}
      <Card>
        <Text style={styles.heading}>Scope of work</Text>
        <Field label="Work included" value={form.scope} onChangeText={value => change('scope', value)} onBlur={() => touch('scope')} error={fieldError('scope')} multiline maxLength={2000} editable={!disabled}/>
        <Text>For recommendations, confirm the full request description, vehicle and any photo requirements are covered. Leave unconfirmed for partial work.</Text>
        <Button title={`${form.scopeConfirmed ? 'Confirmed' : 'Confirm'}: full requested scope included`} outline={!form.scopeConfirmed} disabled={disabled} onPress={() => {if (!disabled) change('scopeConfirmed', !form.scopeConfirmed);}}/>
        {(request?.mandatoryServices || []).map(service => <Button key={service} title={`${form.coveredServices.includes(service) ? 'Included' : 'Include'}: ${service}`} outline={!form.coveredServices.includes(service)} disabled={disabled} onPress={() => {if (!disabled) change('coveredServices', form.coveredServices.includes(service) ? form.coveredServices.filter(value => value !== service) : [...form.coveredServices, service]);}}/>)}
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
        <Button title={`${form.allChargesIncluded ? 'Confirmed' : 'Confirm'}: total includes all required fees and taxes`} outline={!form.allChargesIncluded} disabled={disabled} onPress={() => {if (!disabled) change('allChargesIncluded', !form.allChargesIncluded);}}/>
      </Card>
      <Card>
        <Field label="Estimated completion (days)" value={form.completionDays} onChangeText={value => change('completionDays', value)} onBlur={() => touch('completionDays')} error={fieldError('completionDays')} keyboardType="number-pad" maxLength={3} editable={!disabled}/>
        <Field label="Warranty / guarantee terms" value={form.warranty} onChangeText={value => change('warranty', value)} onBlur={() => touch('warranty')} error={fieldError('warranty')} multiline maxLength={500} editable={!disabled}/>
        <Field label="Quotation valid for (days)" value={form.validForDays} onChangeText={value => change('validForDays', value)} onBlur={() => touch('validForDays')} error={fieldError('validForDays')} keyboardType="number-pad" maxLength={2} editable={!disabled}/>
        <Text style={styles.heading}>Optional deposit</Text>
        <Text style={styles.muted}>Set a required deposit for this quotation. Customers cannot change the amount; percentages are rounded to the nearest cent.</Text>
        <Button title={`${form.depositType==='none'?'Selected: ':''}No deposit`} outline={form.depositType!=='none'} disabled={disabled} onPress={()=>{if(!disabled)setForm(current=>({...current,depositType:'none',depositValue:''}));}}/>
        <Button title={`${form.depositType==='percentage'?'Selected: ':''}Percentage deposit`} outline={form.depositType!=='percentage'} disabled={disabled} onPress={()=>{if(!disabled)setForm(current=>({...current,depositType:'percentage',depositValue:''}));}}/>
        <Button title={`${form.depositType==='fixed'?'Selected: ':''}Fixed deposit`} outline={form.depositType!=='fixed'} disabled={disabled} onPress={()=>{if(!disabled)setForm(current=>({...current,depositType:'fixed',depositValue:''}));}}/>
        {form.depositType!=='none'&&<Field label={form.depositType==='percentage'?'Deposit percentage (whole %, 1–99)':'Fixed deposit amount (R)'} value={form.depositValue} onChangeText={value=>change('depositValue',value)} onBlur={()=>touch('depositValue')} error={fieldError('depositValue')} keyboardType={form.depositType==='percentage'?'number-pad':'decimal-pad'} maxLength={form.depositType==='percentage'?2:12} editable={!disabled}/>}
        {form.depositType!=='none'&&<Text>Required deposit: {depositAmount>0?formatMoney(depositAmount):'Enter valid deposit terms'}</Text>}
        <Text style={styles.muted}>Only the customer and your shop can view this quotation. Check the details before sending. A replacement is a separate historical quotation.</Text>
        <Button title={hasExpiredQuote?'Submit renewal quotation':hasOutdatedQuote ? 'Submit replacement quotation' : 'Send quotation'} disabled={disabled} onPress={send}/>
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
  const {offline} = useAuth(), [cursor,setCursor]=useState(null);
  const {data, busy, error, refresh} = useMarketData('quotes', {cursor});
  const feed=useInfiniteCursor(data,busy,setCursor,{pageCursor:cursor});
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
  return <Page title="My quotations" navigation={navigation} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
    <Text style={styles.muted}>Your submitted, accepted and withdrawn quotations. Accepted offers link to their booking. Withdrawing an unaccepted offer keeps its history.</Text>
    <Notice busy={busy || saving} error={offline ? offlineMessage : error}/>
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
    {feed.items.map(original => {
      const quote = withdrawn[original.id] ? {...original, status: 'withdrawn'} : original;
      return <View key={quote.id} style={styles.quote}>
        <Text style={styles.heading}>{quote.requestTitle || 'Service request'}</Text>
        {!!quote.vehicle && <Text>{[quote.vehicle.year, quote.vehicle.make, quote.vehicle.model].filter(Boolean).join(' ')}</Text>}
        <QuoteCard quote={quote}/>
        {!!quote.bookingId && <Button title="View booking" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('BookingDetail', {id: quote.bookingId}); }}/>}
        <Button title="View request" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('ShopRequest', {id: quote.serviceRequestId}); }}/>
        {quote.status === 'submitted' && <ConfirmationButton title="Withdraw quotation" message="Withdrawal is final for this request. The quotation remains in history and cannot be resubmitted or replaced." disabled={disabled} danger onConfirm={() => withdraw(quote.id)}/>}
      </View>;
    })}
    {!busy && data && !feed.items.length && <Text>You have not submitted a quotation yet.</Text>}
    <Button title="Refresh quotations" disabled={disabled} onPress={reload(refresh)}/>
    {busy && !!feed.items.length && <Text style={styles.muted}>Loading more quotations...</Text>}
  </Page>;
}

const styles = StyleSheet.create({
  heading: {fontSize: 18, fontWeight: '500', color: colors.primary},
  muted: {color: colors.textSecondary, lineHeight: 21},
  feedIntro: {color: colors.textSecondary, lineHeight: 21},
  filterHeading: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
  categories: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  requestCards: {gap: 12},
  emptyState: {alignItems: 'center', gap: 12, paddingVertical: 20},
  emptyTitle: {color: colors.textSecondary, textAlign: 'center'},
  jobCard: {padding: 16, gap: 12},
  jobAuthor: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandGreenLight, alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 14, fontWeight: '500', color: colors.primary},
  jobAuthorCopy: {flex: 1, gap: 2},
  jobCustomer: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
  jobCategory: {alignSelf: 'flex-start', fontSize: 12, color: colors.textSecondary, backgroundColor: colors.background, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999},
  badges: {flexDirection: 'row', alignItems: 'center', gap: 5},
  openStatus: {fontSize: 12, color: colors.accent, backgroundColor: colors.accentSurface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: '600'},
  quotedStatus: {fontSize: 12, color: colors.primaryText, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: '600'},
  
  jobTitle: {fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.textPrimary},
  jobVehicle: {fontSize: 13, color: colors.textSecondary},
  jobDescription: {fontSize: 14, lineHeight: 21, color: colors.textPrimary},
  jobBudget: {fontSize: 13, fontWeight: '500', color: colors.textPrimary},
  jobFooter: {minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4},
  viewJob: {minHeight: 40, flexDirection: 'row', alignItems: 'center'},
  viewJobText: {fontSize: 14, fontWeight: '500', color: colors.primary},
  quoteCount: {fontSize: 12, color: colors.textSecondary},
  loadMore: {alignSelf: 'center', paddingVertical: 8, color: colors.textSecondary},
  modalBackdrop: {flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)'},
  modalScroll: {width: '100%', maxHeight: '90%'},
  modalScrollContent: {flexGrow: 1, justifyContent: 'center'},
  modalCard: {width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 12, borderRadius: 20, backgroundColor: colors.white},
  modalTitle: {fontSize: 20, lineHeight: 28, fontWeight: '500'},
  filterLabel: {fontSize: 14, fontWeight: '500', color: colors.textPrimary},
  filterError: {color: colors.error, fontSize: 12},
  lineItem: {borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 8},
  quote: {gap: 10},
});
