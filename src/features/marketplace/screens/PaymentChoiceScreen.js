import React, {useState} from 'react';
import {StyleSheet} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';
import {Page, Card, Button, Notice, formatMoney} from '../components/MarketplaceUI';

const outcomes=[
  {id:'successful',label:'Simulate successful payment'},
  {id:'failed',label:'Simulate failed payment'},
  {id:'cancelled',label:'Simulate cancelled payment'},
  {id:'pending',label:'Leave payment pending'},
];

export default function PaymentChoiceScreen({route,navigation}) {
  const {offline}=useAuth();
  const quote=route.params.quote;
  const [method,setMethod]=useState(null),[outcome,setOutcome]=useState('successful');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [recoveryId,setRecoveryId]=useState(null);
  const hasDeposit=(quote.depositType==='percentage'||quote.depositType==='fixed')&&Number.isSafeInteger(quote.depositAmountCents)&&quote.depositAmountCents>0&&quote.depositAmountCents<quote.totalCents;
  const amountNow=method==='pay_in_store'?0:method==='pay_deposit'?quote.depositAmountCents:method==='pay_now'?quote.totalCents:0;
  const remaining=quote.totalCents-amountNow;

  async function confirm(){
    if(busy||offline||!method)return;
    if(recoveryId){navigation.replace('BookingDetail',{id:recoveryId});return;}
    setBusy(true);setSaving(true);setError('');
    try{
      const booking=await marketApi('quoteAccept',{id:quote.id,paymentMethod:method});
      setRecoveryId(booking.id);
      // Replays, including a lost acceptance acknowledgement, resume through
      // booking details. Never resolve an existing booking's current attempt.
      if(booking.existingBooking!==false){navigation.replace('BookingDetail',{id:booking.id});return;}
      if(method!=='pay_in_store'){
        if(booking.amountCents!==amountNow||booking.currency!==quote.currency)throw new Error('Payment details changed. Open the existing booking, review its amount and confirm again.');
        await marketApi('paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,expectedBookingId:booking.id,expectedAmountCents:amountNow,expectedCurrency:quote.currency,outcome});
      }
      navigation.replace('BookingDetail',{id:booking.id});
    }catch(e){setError(e.message||'Unable to create this test booking. Please retry.');}
    finally{setBusy(false);setSaving(false);}
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

  return <Page title="Payment choice" navigation={navigation}>
    <Notice busy={saving} error={error|| (offline?'Connect to choose a payment method.':'')}/>
    {(error||recoveryId)&&<Button title={recoveryId?'View existing booking':'Check existing booking'} disabled={busy||offline} onPress={()=>void recover()}/>}
    <Card>
      <Text style={styles.heading}>{quote.shopName||'Selected quotation'}</Text>
      <Text>{quote.scope}</Text>
      <Text style={styles.total}>Quotation total: {formatMoney(quote.totalCents)}</Text>
      {hasDeposit&&<Text>Shop-required deposit{quote.depositType==='percentage'?` (${quote.depositValue}%)`:''}: {formatMoney(quote.depositAmountCents)}</Text>}
      <Text>Amount payable now: {formatMoney(amountNow)}</Text>
      <Text>Remaining balance: {formatMoney(remaining)}</Text>
      <Text style={styles.notice}>SIMULATION ONLY — no real money, card or banking details are used. This project does not process charges or payouts.</Text>
    </Card>
    <Card>
      <Button title={`Pay in Full · ${formatMoney(quote.totalCents)}`} outline={method!=='pay_now'} disabled={busy||offline} onPress={()=>setMethod('pay_now')}/>
      {hasDeposit&&<Button title={`Pay Deposit · ${formatMoney(quote.depositAmountCents)}`} outline={method!=='pay_deposit'} disabled={busy||offline} onPress={()=>setMethod('pay_deposit')}/>}
      <Button title={`Pay In-Store · ${formatMoney(quote.totalCents)} due`} outline={method!=='pay_in_store'} disabled={busy||offline} onPress={()=>setMethod('pay_in_store')}/>
    </Card>
    {(method==='pay_now'||method==='pay_deposit')&&<Card>
      <Text style={styles.heading}>Choose a simulated test result</Text>
      {outcomes.map(item=><Button key={item.id} title={`${outcome===item.id?'Selected: ':''}${item.label}`} outline={outcome!==item.id} disabled={busy||offline} onPress={()=>setOutcome(item.id)}/>)}
      <Text style={styles.notice}>Every result is a simulated test transaction and is labelled as such in booking history and test receipts.</Text>
    </Card>}
    {method==='pay_in_store'&&<Card>
      <Text>Payment remains due at the shop. The shop can record only a simulated in-store payment; the booking is not marked paid until that action.</Text>
    </Card>}
    {method&&!recoveryId&&<ConfirmationButton
      title={method==='pay_in_store'?'Confirm Pay In-Store and create booking':method==='pay_deposit'?'Confirm deposit and run simulation':'Confirm full payment and run simulation'}
      message={method==='pay_in_store'
        ? `Confirm that you intend to pay ${formatMoney(quote.totalCents)} at the shop? This creates an unpaid booking.`
        : `Create a test booking and simulate ${formatMoney(amountNow)} payable now, with ${formatMoney(remaining)} remaining? No payment will be processed.`}
      disabled={busy||offline}
      onConfirm={confirm}/>}
  </Page>;
}

const styles=StyleSheet.create({
  heading:{fontSize:20,lineHeight:26,fontWeight:'600'},
  total:{fontSize:18,fontWeight:'600',marginTop:12},
  notice:{marginTop:12,fontWeight:'600'},
});
