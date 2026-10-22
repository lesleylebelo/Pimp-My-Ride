import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import colors from '../../../shared/theme/colors';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';
import {useMarketData} from '../hooks/useMarketData';
import {Page, Card, Field, Button, Notice, StatusTag, useInfiniteCursor, formatMoney} from '../components/MarketplaceUI';
import {appointmentErrors, cancellationError} from '../utils/bookingValidation';
import PhotoGallery from '../components/PhotoGallery';
import {ConversationAction} from '../components/ConversationAction';

const offlineMessage = 'Connect to the internet to view and manage bookings.';
const statusLabels = {pending_payment: 'Payment pending', pending_confirmation: 'Awaiting shop confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled'};
const notificationLabel = value => typeof value==='string'?value.replace(/_/g,' '):'Update received';
const failureMessage = error => error?.message || 'Unable to update this booking. Please retry.';
const vehicleLabel = vehicle => [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ');
const paidAmount=booking=>Number.isSafeInteger(booking.paidCents)?booking.paidCents:booking.paymentStatus==='paid'?booking.totalCents:0;
const balanceAmount=booking=>Number.isSafeInteger(booking.balanceDueCents)?booking.balanceDueCents:Math.max(0,booking.totalCents-paidAmount(booking));
const paymentLabel=value=>({due:'Unpaid',pending:'Payment pending',failed:'Payment failed',cancelled:'Payment cancelled',partially_paid:'Partially paid',paid:'Paid'}[value]||value||'Not recorded');

function BookingSummary({booking}) {
  return <>
    <Text weight="semibold" style={styles.heading}>{booking.requestTitle || 'Service booking'}</Text>
    <Text>{vehicleLabel(booking.vehicle)}</Text>
    <Text>{booking.shopName}</Text>
    <Text style={styles.muted}>{booking.categoryName}{booking.city ? ` · ${booking.city}` : ''}</Text>
    <StatusTag>{statusLabels[booking.status] || booking.status}</StatusTag>
    <Text>Payment: {paymentLabel(booking.paymentStatus)} · Initial choice: {booking.paymentMethod==='pay_in_store'?'Pay at shop':booking.paymentMethod==='pay_deposit'?'Deposit online':booking.paymentMethod==='pay_now'?'Full payment online':'Not recorded'}</Text>
    <Text>Service: {booking.serviceStatus||'not_started'}</Text>
    <Text style={styles.muted}>SIMULATED TEST RECORD — no real money or banking details.</Text>
    {booking.appointmentDate && booking.appointmentTime && <Text>Appointment: {booking.appointmentDate} at {booking.appointmentTime} SAST (UTC+02:00)</Text>}
  </>;
}

export function BookingsScreen(props) {
  const {user} = useAuth();
  return <BookingsList key={user?.uid || 'signed-out'} {...props}/>;
}

function BookingsList({navigation}) {
  const {offline, profile} = useAuth(), [cursor,setCursor]=useState(null);
  const {data, busy, error, refresh} = useMarketData('bookings', {cursor});

  const feed=useInfiniteCursor(data,busy,setCursor);
  const disabled = busy || offline;
  return <Page title="Bookings" navigation={navigation} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
    <Text style={styles.muted}>{profile?.role === 'shop' ? 'Confirm appointments for accepted quotations and view your booking history.' : 'View your accepted quotations, shop appointments and booking history.'}</Text>
    <Notice busy={busy} error={offline ? offlineMessage : error}/>
    <Button title="Notification history" onPress={()=>navigation.navigate('Notifications')}/>
    {!offline && feed.items.map(booking => <Card key={booking.id}>
      <BookingSummary booking={booking}/>
      <Text weight="semibold">Accepted total: {formatMoney(booking.totalCents)}</Text>
      <Button title="View booking" disabled={disabled} onPress={() => { if (!disabled) navigation.navigate('BookingDetail', {id: booking.id}); }}/>
    </Card>)}
    {!offline && !busy && data && !feed.items.length && <Text>No bookings yet. A booking is created when a customer accepts a quotation.</Text>}
    <Button title="Refresh bookings" disabled={disabled} onPress={() => { if (!disabled) void refresh().catch(() => {}); }}/>
    {busy && !!feed.items.length && <Text style={styles.muted}>Loading more bookings...</Text>}
  </Page>;
}

export function BookingDetailScreen(props) {
  const {user} = useAuth(), id = props.route?.params?.id;
  return <BookingDetail key={`${user?.uid || 'signed-out'}:${id}`} {...props} id={id}/>;
}

function BookingDetail({navigation, id}) {
  const {offline, profile} = useAuth();
  const [paymentCursor,setPaymentCursor]=useState(null);
  const {data, busy, error, refresh} = useMarketData('booking', {id,...(paymentCursor?{paymentCursor}:{})});
  const history=useInfiniteCursor(data,busy,setPaymentCursor,{itemsKey:'paymentAttempts',cursorKey:'paymentCursor',autoLoad:false});
  const [form, setForm] = useState({appointmentDate: '', appointmentTime: ''});
  const [touched, setTouched] = useState({}), [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState(''), [reasonTouched, setReasonTouched] = useState(false);
  const [saving, setSaving] = useState(false), [failure, setFailure] = useState(''), [message, setMessage] = useState('');
  // Retain a server-acknowledged change if the following refresh cannot load the detail.
  const [committed, setCommitted] = useState(null);
  const active = useRef(true), lock = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (committed && data?.booking && (data.booking.status === committed.status || data.booking.status === 'cancelled')) setCommitted(null);
  }, [data, committed]);
  const booking = offline ? null : committed || data?.booking;
  const currentAttempt=data?.currentPaymentAttempt||(data?.paymentAttempts||[]).find(attempt=>attempt.id===booking?.currentPaymentAttemptId);
  const attempts=history.items.map(attempt=>attempt.id===currentAttempt?.id?currentAttempt:attempt);
  if(currentAttempt&&!attempts.some(attempt=>attempt.id===currentAttempt.id))attempts.push(currentAttempt);
  const errors = appointmentErrors(form), reasonError = cancellationError(reason);
  const disabled = busy || saving || offline || !booking;
  const canConfirm = profile?.role === 'shop' && booking?.status === 'pending_confirmation';
  const canCancel = ['owner', 'shop'].includes(profile?.role) && ['pending_payment','pending_confirmation', 'confirmed'].includes(booking?.status);
  const touch = key => setTouched(value => ({...value, [key]: true}));
  const change = (key, value) => { touch(key); setForm(current => ({...current, [key]: value})); };
  const fieldError = key => submitted || touched[key] ? errors[key] : undefined;

  async function paymentAction(op, input) {
    if (lock.current || disabled) return;
    lock.current = true; setSaving(true); setFailure(''); setMessage('');
    try {
      await marketApi(op, input);
      if (active.current) { setMessage('Simulated test transaction updated. No real payment was processed.'); await refresh(); }
    } catch (e) {
      if (active.current) setFailure(failureMessage(e));
    } finally {
      lock.current = false;
      if (active.current) setSaving(false);
    }
  }

  async function simulateOnlineOutcome(outcome) {
    if (lock.current || disabled) return;
    lock.current = true; setSaving(true); setFailure(''); setMessage('');
    try {
      if(currentAttempt?.status!=='pending'||currentAttempt.id!==booking.currentPaymentAttemptId)throw new Error('Payment details changed. Refresh the booking and confirm the current amount.');
      await marketApi('paymentMockResult', {id,paymentAttemptId:currentAttempt.id,expectedBookingId:booking.id,expectedAmountCents:currentAttempt.amountCents,expectedCurrency:currentAttempt.currency,outcome});
      if (active.current) { setMessage('Simulated test transaction updated. No real payment was processed.'); await refresh(); }
    } catch (e) {
      if (active.current) setFailure(failureMessage(e));
    } finally {
      lock.current = false;
      if (active.current) setSaving(false);
    }
  }

  async function startOnlinePayment(){
    if(lock.current||disabled)return;
    lock.current=true;setSaving(true);setFailure('');setMessage('');
    try{
      await marketApi(currentAttempt?.status==='failed'||currentAttempt?.status==='cancelled'?'paymentRetry':'paymentStart',{id});
      if(active.current){setMessage('Test payment attempt opened. Review its amount and choose a simulated result.');await refresh();}
    }catch(e){if(active.current)setFailure(failureMessage(e));}
    finally{lock.current=false;if(active.current)setSaving(false);}
  }

  async function update(op, input, outcome, successText) {
    lock.current = true; setSaving(true); setFailure(''); setMessage('');
    try {
      await marketApi(op, input);
      if (!active.current) return;
      setCommitted(outcome); setMessage(successText);
      try {
        const result = await refresh();
        if (active.current && result?.booking) setCommitted(null);
      } catch (_) {
        if (active.current) setMessage(`${successText} Refresh to load the latest details.`);
      }
    } catch (e) {
      if (active.current) { setFailure(failureMessage(e)); throw e; }
    } finally {
      lock.current = false;
      if (active.current) setSaving(false);
    }
  }

  async function confirmAppointment() {
    if (lock.current || disabled || !canConfirm) return;
    setSubmitted(true);
    if (Object.keys(appointmentErrors(form)).length) return;
    const appointmentDate = form.appointmentDate.trim(), appointmentTime = form.appointmentTime.trim();
    try {
      await update('bookingConfirm', {id, appointmentDate, appointmentTime}, {...booking, status: 'confirmed', appointmentDate, appointmentTime}, 'Booking confirmed.');
    } catch (_) { /* The form retains its values and the inline server error. */ }
  }

  async function cancelBooking() {
    if (lock.current || disabled || !canCancel) return;
    setReasonTouched(true);
    const validation = cancellationError(reason);
    if (validation) throw new Error(validation);
    await update('bookingCancel', {id, reason: reason.trim()}, {...booking, status: 'cancelled', cancellationReason: reason.trim(), cancelledByRole: profile.role}, 'Booking cancelled.');
  }

  return <Page title="Booking details" navigation={navigation}>
    <Notice busy={busy || saving} error={offline ? offlineMessage : failure || error}/>
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
    {booking && <>
      <Card>
        <BookingSummary booking={booking}/>
        {booking.status!=='cancelled' && <ConversationAction serviceRequestId={booking.serviceRequestId} shopId={booking.shopId} navigation={navigation} disabled={disabled}/>}
        <Text weight="semibold">Quotation total: {formatMoney(booking.totalCents)}</Text>
        {(booking.depositType==='percentage'||booking.depositType==='fixed')&&Number.isSafeInteger(booking.depositAmountCents)&&<Text>Accepted required deposit{booking.depositType==='percentage'?` (${booking.depositValue}%)`:''}: {formatMoney(booking.depositAmountCents)}</Text>}
        <Text>Simulated amount paid: {formatMoney(paidAmount(booking))}</Text>
        <Text>Outstanding balance: {formatMoney(balanceAmount(booking))}</Text>
        <Text>Payment status: {paymentLabel(booking.paymentStatus)}</Text>
        {!!booking.vehicle?.colour && <Text>Vehicle colour: {booking.vehicle.colour}</Text>}
        <Text style={styles.muted}>Booking reference: {booking.id}</Text>
        {booking.status === 'pending_confirmation' && <Text>{profile?.role === 'shop' ? 'The customer accepted your quotation. Set the appointment below to confirm this booking.' : 'Your quotation was accepted. The shop will set an appointment and confirm this booking.'}</Text>}
        {booking.status === 'cancelled' && <>
          <Text>Cancelled by: {booking.cancelledByRole === 'owner' ? 'Customer' : booking.cancelledByRole === 'shop' ? 'Shop' : 'Not available'}</Text>
          {!!(booking.cancellationReason || booking.reason) && <Text>Reason: {booking.cancellationReason || booking.reason}</Text>}
          <Text style={styles.muted}>This booking remains in your history. To arrange new work, the customer must create a new service request.</Text>
          {booking.paymentReconciliationStatus==='refund_review_required'&&<Text style={styles.muted}>A simulated amount was recorded. It remains unchanged and is flagged for reconciliation review; no refund is processed by this test system.</Text>}
        </>}
      </Card>
      {attempts.map(attempt=><Card key={attempt.id}>
        <Text weight="semibold">Simulated test transaction · {attempt.status}</Text>
        <Text>{formatMoney(attempt.amountCents)} · {attempt.currency}</Text>
        <Text>Attempt reference: {attempt.id}</Text>
        {!!attempt.kind&&<Text>Purpose: {attempt.kind.replace('_',' ')}</Text>}
        {!!attempt.method&&<Text>Method: {attempt.method.replace('simulated_','')}</Text>}
        {!!attempt.receiptIssued&&<><Text>Simulated test receipt: TEST-{attempt.id}</Text><Button title="View simulated receipt" disabled={disabled} onPress={()=>navigation.navigate('ReceiptDetail',{id:attempt.id})}/></>}
      </Card>)}
      {!!data?.paymentCursor&&<Button title="Load more payment history" disabled={disabled} onPress={()=>{if(!disabled)history.loadNext();}}/>}
      {(data?.testEmailEvents||[]).map(item=><Text key={item.id}>Test email sink: {item.subject||notificationLabel(item.event)} recorded in test outbox; no email sent. {item.body||''}</Text>)}
      {profile?.role==='owner'&&booking.status!=='cancelled'&&balanceAmount(booking)>0&&<>
        <Card>
          <Text weight="semibold">Settle the outstanding balance</Text>
          <Text>{formatMoney(balanceAmount(booking))} remains due. This test flow never contacts a payment provider or charges an account.</Text>
          {currentAttempt?.status==='pending'&&<Text>Confirm this attempt: {formatMoney(currentAttempt.amountCents)} {currentAttempt.currency}. Booking reference: {booking.id}</Text>}
          {['pending','pending_payment','pending_confirmation','confirmed'].includes(booking.status)&&currentAttempt?.status==='pending'
            ? ['successful','failed','cancelled','pending'].map(outcome=><Button key={outcome} title={`Simulate ${outcome} payment`} disabled={disabled} onPress={()=>void simulateOnlineOutcome(outcome)}/>)
            : <Button title={currentAttempt?.status==='failed'||currentAttempt?.status==='cancelled'?'Retry simulated payment':'Start simulated balance payment'} disabled={disabled} onPress={()=>void startOnlinePayment()}/>}
        </Card>
      </>}
      {profile?.role==='shop'&&booking.status!=='cancelled'&&balanceAmount(booking)>0&&<Card>
        <Text weight="semibold">Record a simulated in-store payment</Text>
        <Text style={styles.muted}>Record only the remaining {formatMoney(balanceAmount(booking))} as a test payment. Do not enter actual card or banking information.</Text>
        {currentAttempt?.status==='pending'&&<Text>An online test payment is pending. The customer must resolve that attempt before you can record an in-store payment.</Text>}
        {currentAttempt?.status!=='pending'&&['simulated_cash','simulated_card','simulated_eft'].map(method=><Button key={method} title={`Record test ${method.replace('simulated_','')}`} disabled={disabled} onPress={()=>void paymentAction('paymentRecordInStore',{id,method})}/>)}
      </Card>}
      <Card>
        <Text weight="semibold" style={styles.heading}>Accepted quotation</Text>
        <Text style={styles.muted}>These are the terms accepted for this booking.</Text>
        <Text>{booking.scope}</Text>
        {(booking.items || []).map((item, index) => <View key={index} style={styles.lineItem}>
          <Text style={styles.itemDescription}>{item.description}</Text><Text>{formatMoney(item.amountCents)}</Text>
        </View>)}
        <Text weight="semibold" style={styles.heading}>Total: {formatMoney(booking.totalCents)}</Text>
        <Text>Estimated completion: {booking.completionDays} working days</Text>
        <Text>Warranty / guarantee: {booking.warranty || 'No warranty terms supplied.'}</Text>
      </Card>
      {canConfirm && <Card>
        <Text weight="semibold" style={styles.heading}>Confirm appointment</Text>
        <Text style={styles.muted}>All appointments use South African Standard Time (SAST, UTC+02:00). Choose a future date and time.</Text>
        <Field label="Appointment date (YYYY-MM-DD)" value={form.appointmentDate} onChangeText={value => change('appointmentDate', value)} onBlur={() => touch('appointmentDate')} error={fieldError('appointmentDate')} placeholder="YYYY-MM-DD" autoCapitalize="none" maxLength={10} editable={!disabled}/>
        <Field label="Appointment time (HH:mm, SAST)" value={form.appointmentTime} onChangeText={value => change('appointmentTime', value)} onBlur={() => touch('appointmentTime')} error={fieldError('appointmentTime')} placeholder="14:30" autoCapitalize="none" maxLength={5} editable={!disabled}/>
        <Button title="Confirm booking" disabled={disabled} onPress={confirmAppointment}/>
      </Card>}
      {profile?.role==='shop'&&booking.status==='confirmed'&&booking.serviceStatus!=='completed'&&<Card>
        <Text weight="semibold" style={styles.heading}>Service completion</Text>
        <Text>Mark the service complete separately from the booking and payment status.</Text>
        <Button title="Mark service completed" disabled={disabled} onPress={()=>void paymentAction('bookingComplete',{id})}/>
      </Card>}
      {!!booking.photoIds?.length && <PhotoGallery target="request" id={booking.serviceRequestId}/>}
      {canCancel && <Card>
        <Text weight="semibold" style={styles.heading}>Cancel booking</Text>
        <Text style={styles.muted}>Cancellation ends this booking for both parties and retains the accepted quotation in its history.</Text>
        <Field label="Cancellation reason" value={reason} onChangeText={value => {setReasonTouched(true); setReason(value);}} onBlur={() => setReasonTouched(true)} error={reasonTouched ? reasonError : undefined} helperText="Required. Up to 500 characters." multiline maxLength={500} editable={!disabled}/>
        <ConfirmationButton title="Cancel booking" message="Cancel this booking for both parties? The reason and accepted quotation will remain in the booking history." disabled={disabled} danger onConfirm={cancelBooking}/>
      </Card>}
    </>}
    <Button title="Refresh booking" disabled={busy || saving || offline} onPress={() => { if (!busy && !saving && !offline) {history.reset();if(paymentCursor)setPaymentCursor(null);else void refresh().catch(() => {});} }}/>
  </Page>;
}

const styles = StyleSheet.create({
  heading: {fontSize: 22, lineHeight: 28, color: colors.primary},
  muted: {color: colors.textSecondary, lineHeight: 21},
  lineItem: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border},
  itemDescription: {flex: 1},
});
