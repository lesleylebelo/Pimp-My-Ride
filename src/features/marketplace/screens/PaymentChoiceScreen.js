import React, {useEffect,useRef,useState} from 'react';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {marketApi} from '../services/marketApi';
import {Notice, formatMoney} from '../components/MarketplaceUI';
import {BookingPage as Page, BookingSection as Card, BookingAction as Button, BookingProgress, BookingHandoffContext, bookingStyles} from '../components/BookingUI';

import {useMockPayments} from '../hooks/useMockPayments';
import MockPaymentNotice from '../components/MockPaymentNotice';

const outcomes=[
  {id:'successful',label:'Simulate successful payment'},
  {id:'failed',label:'Simulate failed payment'},
  {id:'cancelled',label:'Simulate cancelled payment'},
  {id:'pending',label:'Leave payment pending'},
];

export default function PaymentChoiceScreen(props){
 const {user}=useAuth();
 return <PaymentChoice key={user?.uid||'signed-out'} {...props}/>;
}
function PaymentChoice({route,navigation}) {
  const {offline}=useAuth(),capability=useMockPayments(),lock=useRef(false),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const {theme}=useTheme(),styles=bookingStyles(theme);
  const quote=route.params.quote;
  const [method,setMethod]=useState(null),[outcome,setOutcome]=useState(null);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [recoveryId,setRecoveryId]=useState(null);
  const hasDeposit=(quote.depositType==='percentage'||quote.depositType==='fixed')&&Number.isSafeInteger(quote.depositAmountCents)&&quote.depositAmountCents>0&&quote.depositAmountCents<quote.totalCents;
  const amountNow=method==='pay_in_store'?0:method==='pay_deposit'?quote.depositAmountCents:method==='pay_now'?quote.totalCents:0;
  const remaining=quote.totalCents-amountNow;

  async function confirm(){
    if(lock.current||busy||offline||!capability.enabled||!method||method!=='pay_in_store'&&!outcome)return;
    if(recoveryId){navigation.replace('BookingDetail',{id:recoveryId});return;}
    lock.current=true;setBusy(true);setSaving(true);setError('');
    try{
      const booking=await marketApi('quoteAccept',{id:quote.id,paymentMethod:method});
      if(!active.current)return;
      setRecoveryId(booking.id);
      // Replays, including a lost acceptance acknowledgement, resume through
      // booking details. Never resolve an existing booking's current attempt.
      if(booking.existingBooking!==false){navigation.replace('BookingDetail',{id:booking.id});return;}
      if(method!=='pay_in_store'){
        if(booking.amountCents!==amountNow||booking.currency!==quote.currency)throw new Error('Payment details changed. Open the existing booking, review its amount and confirm again.');
        await marketApi('paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,expectedBookingId:booking.id,expectedAmountCents:amountNow,expectedCurrency:quote.currency,outcome});
      }
      if(active.current)navigation.replace('BookingDetail',{id:booking.id});
    }catch(e){if(active.current)setError(e.message||'Unable to create this test booking. Please retry.');}
    finally{lock.current=false;if(active.current){setBusy(false);setSaving(false);}}
  }

  async function recover(){
    if(busy||offline)return;
    if(recoveryId){navigation.replace('BookingDetail',{id:recoveryId});return;}
    if(!quote.serviceRequestId){navigation.navigate('Bookings');return;}
    setBusy(true);setError('');
    try{
      const data=await marketApi('request',{id:quote.serviceRequestId});
      if(data.request?.bookingId)navigation.replace('BookingDetail',{id:data.request.bookingId});
      else setError('No booking was found for this request. Refresh quotations before trying checkout again.');
    }catch(e){setError(e.message||'Unable to check the booking. Open My bookings or try again.');}
    finally{setBusy(false);}
  }

  return <Page title="Payment choice" subtitle="Review the amount, then confirm your booking" navigation={navigation} maxWidth={820}>
    <MockPaymentNotice capability={capability}/>
    <BookingProgress choice reviewing={!!method}/>
    <Notice busy={saving} error={error|| (offline?'Connect to choose a payment method.':'')}/>
    {(error||recoveryId)&&<Button title={recoveryId?'View existing booking':'Check existing booking'} disabled={busy||offline} onPress={()=>void recover()}/>}
    <Card>
      <BookingHandoffContext quote={quote}/>
      <Text style={styles.heading}>{quote.shopName||'Selected quotation'}</Text>
      <Text>{quote.scope}</Text>
      <Text style={styles.total}>Quotation total: {formatMoney(quote.totalCents)}</Text>
      {hasDeposit&&<Text>Shop-required deposit{quote.depositType==='percentage'?` (${quote.depositValue}%)`:''}: {formatMoney(quote.depositAmountCents)}</Text>}
      <Text>Amount payable now: {formatMoney(amountNow)}</Text>
      <Text>Remaining balance: {formatMoney(remaining)}</Text>
      <Text style={styles.muted}>Preview assumes a successful simulation. A failed or pending result leaves the full amount due.</Text>
      <Text style={styles.notice}>SIMULATION ONLY — no real money, card or banking details are used. This project does not process charges or payouts.</Text>
    </Card>
    <Card>
      <Text weight="semibold" style={styles.heading}>Choose a payment option</Text>
      <Button title={`Pay in full · ${formatMoney(quote.totalCents)}`} outline={method!=='pay_now'} disabled={busy||offline||!capability.enabled} onPress={()=>setMethod('pay_now')}/>
      {hasDeposit&&<Button title={`Pay deposit · ${formatMoney(quote.depositAmountCents)}`} outline={method!=='pay_deposit'} disabled={busy||offline||!capability.enabled} onPress={()=>setMethod('pay_deposit')}/>}
      <Button title={`Pay in-store · ${formatMoney(quote.totalCents)} due`} outline={method!=='pay_in_store'} disabled={busy||offline||!capability.enabled} onPress={()=>setMethod('pay_in_store')}/>
    </Card>
    {(method==='pay_now'||method==='pay_deposit')&&<Card>
      <Text style={styles.heading}>Choose a simulated test result</Text>
      {outcomes.map(item=><Button key={item.id} title={`${outcome===item.id?'Selected: ':''}${item.label}`} outline={outcome!==item.id} disabled={busy||offline||!capability.enabled} onPress={()=>setOutcome(item.id)}/>)}
      <Text style={styles.notice}>Every result is a simulated test transaction and is labelled as such in booking history and test receipts.</Text>
    </Card>}
    {method==='pay_in_store'&&<Card>
      <Text>Payment remains due at the shop. The shop can record only a simulated in-store payment; the booking is not marked paid until that action.</Text>
    </Card>}
    {method&&!recoveryId&&<ConfirmationButton
      palette={theme}
      title={method==='pay_in_store'?'Confirm Pay in-store and create booking':method==='pay_deposit'?'Confirm deposit and run simulation':'Confirm full payment and run simulation'}
      message={method==='pay_in_store'
        ? `Confirm that you intend to pay ${formatMoney(quote.totalCents)} at the shop? This creates an unpaid booking.`
        : `Create a test booking and simulate ${formatMoney(amountNow)} payable now, with ${formatMoney(remaining)} remaining if successful? Selected test outcome: ${outcome||'choose a result'}. No payment will be processed.`}
      disabled={busy||offline||!capability.enabled||method!=='pay_in_store'&&!outcome}
      onConfirm={confirm}/>}
  </Page>;
}
