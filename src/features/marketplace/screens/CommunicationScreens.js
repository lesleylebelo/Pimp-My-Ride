import React, {useEffect, useRef, useState} from 'react';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useMarketData} from '../hooks/useMarketData';
import {useNotificationHistory} from '../hooks/useNotificationHistory';
import {marketApi} from '../services/marketApi';
import {Page, Card, Button, Notice, formatMoney} from '../components/MarketplaceUI';

const dateLabel=value=>typeof value==='number'&&Number.isFinite(value)?new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})+' SAST':'Not recorded';
export function notificationDestination(item,role){
 const target=item.target||(item.bookingId?{type:'booking',id:item.bookingId}:null);
 if(!target||typeof target.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(target.id))return null;
 if(target.type==='receipt')return ['ReceiptDetail',{id:target.id}];
 if(target.type==='conversation')return ['Chat',{id:target.id}];
 if(target.type==='booking')return ['BookingDetail',{id:target.id}];
 if(target.type==='request'||target.type==='quotation')return [role==='shop'?'ShopRequest':target.type==='quotation'?'QuoteComparison':'OwnerRequest',{id:target.id}];
 return null;
}
export function ReceiptDetailScreen(props){
 const {user}=useAuth();return <ReceiptDetail key={`${user?.uid}:${props.route?.params?.id}`} {...props}/>;
}
function ReceiptDetail({navigation,route}){
 const {offline}=useAuth(),{data,busy,error,refresh}=useMarketData('receipt',{id:route?.params?.id});
 const receipt=data?.receipt;
 return <Page title="Simulated payment receipt" navigation={navigation}>
  <Text weight="semibold">SIMULATED / TEST — NOT REAL PAYMENT</Text>
  <Notice busy={busy} error={offline?'Connect to view your simulated receipt.':error}/>
  {!offline&&receipt&&<Card>
   <Text weight="semibold">{receipt.receiptReference}</Text>
   <Text>Booking reference: {receipt.bookingId}</Text><Text>Payment attempt: {receipt.paymentAttemptId}</Text>
   {!!receipt.quoteId&&<Text>Quotation reference: {receipt.quoteId}</Text>}
   <Text>Customer: {receipt.customer?.name} ({receipt.customer?.id})</Text><Text>Shop: {receipt.shop?.name} ({receipt.shop?.id})</Text>
   <Text>{receipt.serviceTitle}</Text><Text>{receipt.scope}</Text>
   {(receipt.items||[]).map((item,index)=><Text key={index}>{item.description}: {formatMoney(item.amountCents)}</Text>)}
   <Text>Issued: {dateLabel(receipt.issuedAt)}</Text><Text>Method: {receipt.method?.replace(/_/g,' ')||'Not recorded'}</Text>
   <Text weight="semibold">This simulated payment: {formatMoney(receipt.amountCents)} ZAR</Text>
   {receipt.historicalSnapshotUnavailable?<Text>{receipt.compatibilityNotice}</Text>:<>
    <Text>Quotation total: {formatMoney(receipt.totalCents)}</Text>
    <Text>Cumulative paid immediately after this payment: {formatMoney(receipt.paidCentsAfter)}</Text>
    <Text>Outstanding immediately after this payment: {formatMoney(receipt.balanceDueCentsAfter)}</Text>
   </>}
   <Text>Historical receipt — later payments do not change these values. No real money was transferred.</Text>
   <Button title="View related booking" onPress={()=>navigation.navigate('BookingDetail',{id:receipt.bookingId})}/>
  </Card>}
  <Button title="Refresh receipt" disabled={busy||offline} onPress={()=>void refresh().catch(()=>{})}/>
 </Page>;
}
export function NotificationsScreen(props){const {user}=useAuth();return <NotificationHistory key={user?.uid||'signed-out'} {...props}/>;}
function NotificationHistory({navigation}){
 const {profile,offline}=useAuth(),[readIds,setReadIds]=useState(new Set()),[saving,setSaving]=useState(false),[failure,setFailure]=useState('');
 const feed=useNotificationHistory(),{busy,error}=feed;
 const active=useRef(true),lock=useRef(false);
 useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
 const disabled=busy||offline||saving;
 async function markRead(item){
  if(disabled||lock.current||item.readAt||readIds.has(item.id))return;
  lock.current=true;setSaving(true);setFailure('');
  try{await marketApi('notificationRead',{id:item.id});if(active.current)setReadIds(previous=>new Set([...previous,item.id]));}
  catch(e){if(active.current)setFailure(e?.message||'Unable to mark this notification read. Please retry.');}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 return <Page title="Notification history" navigation={navigation}>
  <Text>SIMULATED / TEST updates. Newest first. Refresh returns to the newest page; load more for earlier updates. Your historical updates remain available.</Text>
  <Notice busy={busy||saving} error={offline?'Connect to view your notifications.':failure||error}/>
  {!offline&&feed.items.map(item=>{
   const read=!!item.readAt||readIds.has(item.id),destination=notificationDestination(item,profile?.role);
   return <Card key={item.id}>
    <Text weight="semibold">{item.title||item.event?.replace(/_/g,' ')||'Marketplace update'}</Text>
    <Text>{read?'Read':'Unread'} · {dateLabel(item.createdAt)}</Text>
    <Text>{item.body||'Simulated marketplace update. Open the related record for details.'}</Text>
    {!read&&<Button title="Mark as read" disabled={disabled} onPress={()=>void markRead(item)}/>}
    {destination&&<Button title="Open related record" disabled={disabled} onPress={()=>navigation.navigate(...destination)}/>}
   </Card>;
  })}
  {!offline&&!busy&&!error&&!feed.items.length&&<Text>No notifications yet.</Text>}
  {!!feed.cursor&&<Button title="Load more notifications" disabled={disabled} onPress={()=>{if(!disabled)void feed.loadNext();}}/>}
  <Button title="Refresh notifications" disabled={offline||saving||feed.refreshing} onPress={()=>{if(!offline&&!saving&&!feed.refreshing)void feed.refresh();}}/>
 </Page>;
}
