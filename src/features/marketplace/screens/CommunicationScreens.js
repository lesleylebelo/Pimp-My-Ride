import React from 'react';
import {useCustomerExperience} from '../../customer/components/CustomerUI';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useMarketData} from '../hooks/useMarketData';
import NotificationHistory from '../components/NotificationHistory';
import {Page, Card, Button, Notice, formatMoney} from '../components/MarketplaceUI';

const dateLabel=value=>typeof value==='number'&&Number.isFinite(value)?new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})+' SAST':'Not recorded';
export {notificationDestination} from '../utils/notificationPresentation';
export function ReceiptDetailScreen(props){
 const {user}=useAuth();return <ReceiptDetail key={`${user?.uid}:${props.route?.params?.id}`} {...props}/>;
}
function ReceiptDetail({navigation,route}){
 const {offline}=useAuth(),{data,busy,error,refresh}=useMarketData('receipt',{id:route?.params?.id});
 const receipt=data?.receipt,customer=useCustomerExperience();
 return <Page title="Simulated payment receipt" navigation={navigation}>
  <Text weight="semibold">SIMULATED / TEST — NOT REAL PAYMENT</Text>
  <Notice busy={busy} error={offline?'Connect to view your simulated receipt.':error}/>
  {!offline&&receipt&&<Card>
   <Text weight="semibold">{receipt.receiptReference}</Text>
   <Text>Booking reference: {receipt.bookingId}</Text><Text>{customer?'Transaction reference':'Payment attempt'}: {receipt.paymentAttemptId}</Text>
   {!!receipt.quoteId&&<Text>Quotation reference: {receipt.quoteId}</Text>}
   <Text>Customer: {receipt.customer?.name} ({receipt.customer?.id})</Text><Text>Shop: {receipt.shop?.name} ({receipt.shop?.id})</Text>
   <Text>{receipt.serviceTitle}</Text><Text>{receipt.scope}</Text>
   {(receipt.items||[]).map((item,index)=><Text key={index}>{item.description}: {formatMoney(item.amountCents)}</Text>)}
   <Text>Issued: {dateLabel(receipt.issuedAt)}</Text><Text>Method: {receipt.method?.replace(/_/g,' ')||'Not recorded'}</Text>
   <Text weight="semibold">This simulated payment: {formatMoney(receipt.amountCents)} ZAR</Text>
   {receipt.historicalSnapshotUnavailable?<Text>{receipt.compatibilityNotice}</Text>:<>
    <Text>Quotation total: {formatMoney(receipt.totalCents)}</Text>
    <Text>{customer?'Paid after this payment':'Cumulative paid immediately after this payment'}: {formatMoney(receipt.paidCentsAfter)}</Text>
    <Text>{customer?'Balance after this payment':'Outstanding immediately after this payment'}: {formatMoney(receipt.balanceDueCentsAfter)}</Text>
   </>}
   <Text>Historical receipt — later payments do not change these values. No real money was transferred.</Text>
   <Button title="View related booking" onPress={()=>navigation.navigate('BookingDetail',{id:receipt.bookingId})}/>
  </Card>}
  <Button title="Refresh receipt" disabled={busy||offline} onPress={()=>void refresh().catch(()=>{})}/>
 </Page>;
}
export function NotificationsScreen(props){const {user}=useAuth();return <NotificationHistory key={user?.uid||'signed-out'} {...props}/>;}
