import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {useMarketData} from '../hooks/useMarketData';
import {marketApi} from '../services/marketApi';
import {Page, Card, Button, Notice, Paging, usePages, formatMoney, QuoteCard} from '../components/MarketplaceUI';

const available = (quote, now) => quote?.status === 'submitted' && Number(quote.validUntil) > now;

// Reset both the selection and its cursor history when identity or request changes.
export function QuoteComparisonScreen(props) {
  const {user} = useAuth();
  return <QuoteComparison key={`${user?.uid}:${props.route.params.id}`} {...props}/>;
}

function QuoteComparison({route, navigation}) {
  const {user, offline} = useAuth(), id = route.params.id, pages = usePages();
  const {data, busy, error, refresh} = useMarketData('request', {id, quotesCursor: pages.cursor});
  const [selection, setSelection] = useState(null), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false), current = useRef({mounted: true, uid: user?.uid});
  current.current.uid = user?.uid;
  useEffect(() => {current.current.mounted = true; return () => {current.current.mounted = false;};}, []);

  // A selection belongs only to the loaded page. A refresh must not silently
  // carry an old offer into a new set of prices or availability states.
  const request = data?.request, quotes = data?.quotes || [];
  const selected = !busy && !offline && !error && selection?.data === data && selection?.cursor === pages.cursor
    ? quotes.find(quote => quote.id === selection.id) : null;
  const disabled = busy || saving || offline || !!error;
  const canAccept = !disabled && request?.status === 'open' && available(selected, Math.max(now, Date.now()));
  useEffect(() => {
    if (busy || offline || error || selection && (selection.data !== data || selection.cursor !== pages.cursor)) setSelection(null);
  }, [busy, offline, error, data, pages.cursor, selection]);
  useEffect(() => {
    const nextExpiry = Math.min(...quotes.filter(quote => available(quote, Date.now())).map(quote => Number(quote.validUntil)));
    if (!Number.isFinite(nextExpiry)) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(1, nextExpiry - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [data, now]);

  async function accept() {
    if (lock.current || !canAccept || !available(selected, Date.now())) return;
    const uid = user?.uid;
    lock.current = true; setSaving(true); setSaveError('');
    try {
      const booking = await marketApi('quoteAccept', {id: selected.id});
      if (current.current.mounted && current.current.uid === uid) navigation.replace('BookingDetail', {id: booking.id});
    } catch (e) {
      if (current.current.mounted && current.current.uid === uid) {
        setSaveError(e.message || 'Unable to accept this quotation. Please retry.');
        throw e;
      }
    } finally {
      lock.current = false;
      if (current.current.mounted && current.current.uid === uid) setSaving(false);
    }
  }

  return <Page title="Compare & select" navigation={navigation}>
    <Notice busy={busy || saving} error={saveError || error || (offline ? 'Connect to compare and accept quotations.' : '')}/>
    {request && <>
      <Card>
        <Text weight="semibold" style={styles.heading}>{request.title}</Text>
        <Text>Compare the full scope, total price, completion time and warranty before choosing one offer.</Text>
        <Text>Budget: {formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</Text>
        {request.status === 'open' && <Text>Accepting one quotation creates a booking awaiting the shop’s confirmation and appointment. Cancelling that booking will not reopen this request.</Text>}
        {request.status === 'closed' && <Text>This request is closed. Its quotations are available to view only.</Text>}
        {request.status === 'booked' && <Text>A quotation has already been accepted for this request.</Text>}
        {request.bookingId && <Button title="View booking" disabled={disabled} onPress={() => {if (!disabled) navigation.navigate('BookingDetail', {id: request.bookingId});}}/>}
      </Card>
      {quotes.map(quote => {
        const eligible = request.status === 'open' && available(quote, Math.max(now, Date.now()));
        return <QuoteCard key={quote.id} quote={quote}>
          {!quote.warranty && <Text>Warranty: not specified</Text>}
          {request.status === 'open' && <Button title={`${selected?.id === quote.id ? 'Selected' : 'Select'}: ${quote.shopName || 'Shop quotation'}`} outline={selected?.id !== quote.id} disabled={disabled || !eligible}
            onPress={() => {if (!disabled && eligible && available(quote, Date.now())) {setSelection({id: quote.id, cursor: pages.cursor, data}); setSaveError('');}}}/>}
        </QuoteCard>;
      })}
      {!busy && !quotes.length && <Text>No quotations on this page.</Text>}
      <Paging pages={pages} nextCursor={data.quotesCursor} busy={disabled}/>
      {request.status === 'open' && <Card>
        <Text weight="semibold">{selected ? `Selected: ${selected.shopName || 'Shop quotation'} · ${formatMoney(selected.totalCents)}` : 'Select an available quotation on this page.'}</Text>
        {selected && !available(selected, Math.max(now, Date.now())) && <Text>This quotation has expired. Choose another offer or refresh the list.</Text>}
        <ConfirmationButton key={selected?.id || 'none'} title="Continue to book" disabled={!canAccept}
          message={selected ? `Accept ${selected.shopName || 'this shop'}’s quotation for ${formatMoney(selected.totalCents)}? This selects one offer and creates a booking awaiting shop confirmation. The shop will set a future appointment. Cancelling the booking does not reopen the request.` : 'Select an available quotation first.'}
          onConfirm={accept}/>
      </Card>}
    </>}
    <Button title="Refresh quotations" outline disabled={busy || saving || offline} onPress={() => {if (!busy && !saving && !offline) {setSelection(null); setSaveError(''); void refresh().catch(() => {});}}}/>
  </Page>;
}

const styles = StyleSheet.create({heading: {fontSize: 18, lineHeight: 26}});
export default QuoteComparisonScreen;
