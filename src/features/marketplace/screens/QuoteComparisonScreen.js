import React, {useEffect, useState} from 'react';
import {AppState, useWindowDimensions, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useMarketData} from '../hooks/useMarketData';
import {ConversationAction} from '../components/ConversationAction';
import {Notice, useInfiniteCursor, formatMoney} from '../components/MarketplaceUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {QuotationPage, QuotationSection, QuotationAction, QuotationCard, QuotationSteps, QuotationEmpty, quotationStyles} from '../components/QuotationUI';

const available = (quote, now) => quote?.status === 'submitted' && Number(quote.validUntil) > now;
const matchesRequestVersion = (quote, request) => {
  const quoteVersion = Object.prototype.hasOwnProperty.call(quote || {}, 'termsVersion') ? quote.termsVersion : quote?.requestVersion;
  const currentVersion = Number.isSafeInteger(request?.termsVersion) ? request.termsVersion : Number.isSafeInteger(request?.version) ? request.version : 1;
  return Number.isSafeInteger(quoteVersion) && quoteVersion > 0 && quoteVersion === currentVersion;
};

// Reset both the selection and its cursor history when identity or request changes.
export function QuoteComparisonScreen(props) {
  const {user} = useAuth();
  return <QuoteComparison key={`${user?.uid}:${props.route.params.id}`} {...props}/>;
}

function QuoteComparison({route, navigation}) {
  const {theme}=useTheme(),styles=quotationStyles(theme),Card=QuotationSection,Button=QuotationAction,wide=useWindowDimensions().width>=850;
  const {offline} = useAuth(), id = route.params.id, [cursor,setCursor]=useState(null);
  const {data, busy, error, refresh} = useMarketData('request', {id, quotesCursor: cursor, comparison:true});
  const quoteFeed=useInfiniteCursor(data,busy,setCursor,{itemsKey:'quotes',cursorKey:'quotesCursor',pageCursor:cursor});
  const [selection, setSelection] = useState(null);
  const [now, setNow] = useState(Date.now);
  const focused = useIsFocused();
  // Keep the selected offer while its accumulated feed pages continue loading.
  const request = data?.request;
  const recommendations = !busy && !offline && !error && request?.status === 'open' &&
    (!data?.recommendations?.nextExpiry || data.recommendations.nextExpiry > Math.max(now, Date.now())) ? data?.recommendations : null;
  const recommended = recommendations?.entries?.find(entry => entry.id === recommendations.recommendedId);
  const ranking = new Map((recommendations?.entries || []).map(entry => [entry.id, entry]));
  const quotes=quoteFeed.items.filter(quote=>quote.serviceRequestId===id&&(!data?.recommendations?.entries||data.recommendations.entries.some(entry=>entry.id===quote.id&&entry.comparable!==false)));
  const displayQuotes=[...quotes].sort((a,b)=>((ranking.get(a.id)?.rank||Infinity)-(ranking.get(b.id)?.rank||Infinity))||(a.id<b.id?-1:a.id>b.id?1:0));
  const selected = !busy && !offline && !error ? quotes.find(quote => quote.id === selection?.id) : null;
  const disabled = busy || offline || !!error;
  const analysisUnavailable=['unavailable','limited'].includes(data?.recommendations?.status);
  const canAccept = !disabled && !analysisUnavailable && request?.id===id && request?.status === 'open' && available(selected, Math.max(now, Date.now())) && matchesRequestVersion(selected,request);
  useEffect(() => {
    const currentSelection = selection && quotes.find(quote => quote.id === selection.id);
    if (offline || error || !busy && selection && currentSelection !== selection.quote) setSelection(null);
  }, [busy, offline, error, data, selection, quotes]);
  useEffect(() => {
    const nextExpiry = Math.min(data?.recommendations?.nextExpiry > Date.now() ? data.recommendations.nextExpiry : Infinity, ...quotes.filter(quote => available(quote, Date.now())).map(quote => Number(quote.validUntil)));
    if (!Number.isFinite(nextExpiry)) return undefined;
    const timer = setTimeout(() => {
      setNow(Date.now());
      if (focused && !offline && AppState.currentState === 'active') {
        setSelection(null); quoteFeed.reset();
        if (cursor) setCursor(null); else void refresh().catch(() => {});
      }
    }, Math.min(2147483647, Math.max(1, nextExpiry - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [data, now, focused, offline, cursor, refresh]);
  // Refresh authoritative data while comparing; no scores are written or accepted from the client.
  useEffect(() => {
    if (!focused || offline) return undefined;
    const reload = () => {
      if (AppState.currentState !== 'active') return;
      setSelection(null); quoteFeed.reset();
      if (cursor) setCursor(null);
      else void refresh().catch(() => {});
    };
    const timer = setInterval(reload, 30000);
    const subscription = AppState.addEventListener('change', state => {if (state === 'active') reload();});
    return () => {clearInterval(timer); subscription.remove();};
  }, [focused, offline, cursor, refresh]);

  return <QuotationPage title="Compare quotes" subtitle="Smart quotation comparison · review the work, terms and total" navigation={navigation} onScroll={quoteFeed.onScroll} onLayout={quoteFeed.onLayout} onContentSizeChange={quoteFeed.onContentSizeChange}>
    <QuotationSteps customer step={selection?1:0}/>
    <Notice busy={busy} error={error || (offline ? 'Connect to compare and accept quotations.' : '')}/>
    {request && <>
      <Card>
        <Text weight="semibold" style={styles.heading}>{request.title}</Text>
        <Text>{request.description}</Text>
        {(request.mandatoryServices || []).map(service => <Text key={service}>Required: {service}</Text>)}
        <Text>Compare the full scope, total price, completion time and warranty before choosing one offer.</Text>
        <Text>Budget: {formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
        {request.status === 'open' && <Text>Choose a quotation to review payment options. A booking is created only after you confirm a payment method. Cancelling a booking will not reopen this request.</Text>}
        {request.status === 'closed' && <Text>This request is closed. Its quotations are available to view only.</Text>}
        {request.status === 'booked' && <Text>A quotation has already been accepted for this request.</Text>}
        {request.bookingId && <Button title="View booking" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('BookingDetail', {id: request.bookingId});}}/>}
      </Card>
      {recommended && <Card>
        <Text weight="semibold" style={styles.heading}>Recommended quotation: {recommended.shopName}</Text>
        <Text>Rank 1 of {recommendations.eligibleCount} eligible quotations · {formatMoney(recommended.totalCents)}</Text>
        <Text>{(recommended.explanations||[]).join('. ')}.</Text>
        <Text>{recommended.distanceKm == null ? 'Distance unavailable' : `${recommended.distanceKm.toFixed(1)} km (straight-line)`}</Text>
        <Text>{recommendations.distanceNote}</Text>
        <Text>Advisory only. Coverage is confirmed by the shop; review the scope and choose any available quotation. Rankings include all current quotations and refresh every 30 seconds.</Text>
      </Card>}
      {!busy&&!offline&&!error&&!recommended&&request.status==='open'&&<Card>
        <Text weight="semibold" style={styles.heading}>Smart comparison</Text>
        <Text>{recommendations?.limitation||(quotes.length===0?'No current eligible quotations are available for comparison.':quotes.length===1?'Only one current quotation is available. Review its terms; no overall winner can be recommended.':'Insufficient confirmed information to recommend an overall winner. Compare the stated terms below.')}</Text>
      </Card>}
      {!!recommendations?.scoringNote&&<Text style={styles.muted}>{recommendations.scoringNote}</Text>}
      <Text style={styles.muted}>Inclusions, exclusions and additional terms are those stated in each offer's scope. No workshop quality, performance or warranty rating is inferred.</Text>
      <View style={styles.grid}>{displayQuotes.map(quote => {
        const assessment = ranking.get(quote.id);
        const currentTerms = matchesRequestVersion(quote,request);
        const eligible = !analysisUnavailable&&request.id===id&&request.status === 'open' && available(quote, Math.max(now, Date.now())) && currentTerms&&assessment?.comparable!==false;
        return <View key={quote.id} style={[styles.gridCell,wide&&styles.wideCell]}><QuotationCard quote={quote} request={request}>
          {request.status==='open' && !!quote.shopId && <ConversationAction serviceRequestId={id} shopId={quote.shopId} navigation={navigation} disabled={disabled}/>}
          {!!assessment?.rank && <Text weight="semibold">Rank {assessment.rank} of {recommendations.eligibleCount}{recommendations.status==='tie'&&assessment.rank===1?' · Tied':recommended?.id === quote.id ? ' · Recommended' : ''}</Text>}
          <Text>Remaining after stated deposit: {formatMoney(assessment?.remainingAfterDepositCents??((quote.depositType==='fixed'||quote.depositType==='percentage')&&Number.isSafeInteger(quote.depositAmountCents)?quote.totalCents-quote.depositAmountCents:quote.depositType==='none'?quote.totalCents:null))}</Text>
          {!quote.scope&&<Text>Service scope: Not specified</Text>}
          {(assessment?.highlights||[]).map(note=><Text key={note}>{note}</Text>)}
          {(assessment?.tradeoffs||[]).map(note=><Text key={note} style={styles.muted}>{note}</Text>)}
          <Text>{assessment?.distanceKm == null ? 'Distance unavailable' : `${assessment.distanceKm.toFixed(1)} km (straight-line)`}</Text>
          <Text>Service coverage: {quote.scopeConfirmed === true ? 'Full scope confirmed by shop' : 'Full scope not confirmed'}{assessment?.coverage.required ? `; ${assessment.coverage.matched}/${assessment.coverage.required} mandatory services` : ''}</Text>
          {!!assessment?.reason && <Text>Not ranked: {assessment.reason}</Text>}
          {quote.status==='submitted'&&Number(quote.validUntil)<=Math.max(now,Date.now())&&<Text>This quotation has expired. Ask the shop to submit a renewal, then refresh quotations.</Text>}
          {!quote.warranty && <Text>Warranty: not specified</Text>}
          {!currentTerms&&<Text>This quotation has no verifiable revision for the current request terms. Ask the shop to submit an updated quotation.</Text>}
          {request.status === 'open' && <Button title={`${selected?.id === quote.id ? 'Selected' : 'Select'}: ${quote.shopName || 'Shop quotation'}`} outline={selected?.id !== quote.id} disabled={disabled || !eligible}
            onPress={() => {if (!disabled && eligible && available(quote, Date.now())) setSelection({id: quote.id, quote});}}/>}
        </QuotationCard></View>;
      })}</View>
      {!busy && !error && !quotes.length && <QuotationEmpty>No quotations yet.</QuotationEmpty>}
      {busy && !!quotes.length && <Text style={styles.muted}>Loading more quotations...</Text>}
      {!!data?.quotesCursor&&<Button title="Load more quotations" outline disabled={disabled} onPress={()=>{if(!disabled)quoteFeed.loadNext();}}/>}
      {request.status === 'open' && <Card>
        <Text weight="semibold">{selected ? `Selected: ${selected.shopName || 'Shop quotation'} · ${formatMoney(selected.totalCents)}` : 'Select an available quotation from the list.'}</Text>
        {selected && !available(selected, Math.max(now, Date.now())) && <Text>This quotation has expired. Choose another offer or refresh the list.</Text>}
        {selected&&!matchesRequestVersion(selected,request)&&<Text>This quotation cannot be accepted against the current request terms. Ask the shop to submit an updated quotation.</Text>}
        <Button title="Continue to payment choice" disabled={!canAccept}
          onPress={()=>{if(canAccept&&available(selected,Date.now())&&matchesRequestVersion(selected,request))navigation.navigate('PaymentChoice',{quote:selected});}}/>
      </Card>}
    </>}
    <Button title="Refresh quotations" outline disabled={busy || offline} onPress={() => {if (!busy && !offline) {setSelection(null);quoteFeed.reset();if(cursor)setCursor(null);else void refresh().catch(() => {});}}}/>
  </QuotationPage>;
}

export default QuoteComparisonScreen;
