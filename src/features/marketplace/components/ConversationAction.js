import React,{useEffect,useRef,useState} from 'react';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {messageApi} from '../services/messageApi';
import {useMarketData} from '../hooks/useMarketData';
import {Button,Field,Notice,Card,useInfiniteCursor} from './MarketplaceUI';

export function ConversationAction({serviceRequestId,shopId,navigation,disabled=false,askApproval=false}) {
  const {user,profile,offline} = useAuth(),[busy,setBusy] = useState(false),[error,setError] = useState(''),[reason,setReason] = useState('');
  const active = useRef(true),lock = useRef(false),uid = useRef(user?.uid),blocked = useRef(false);
  uid.current=user?.uid;blocked.current=disabled || offline;
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function open(enquiry = false) {
    if (lock.current || blocked.current || !serviceRequestId) return;
    const caller = uid.current;lock.current=true;setBusy(true);setError('');
    try {
      const result = await messageApi(enquiry?'enquire':'open',{serviceRequestId,...(profile?.role==='owner'?{shopId}:{}),...(enquiry?{reason:reason.trim()}:{})});
      if (active.current && uid.current===caller) navigation.navigate('Chat',{id:result.id});
    } catch (e) {if (active.current && uid.current===caller) setError(e.message || 'Unable to open this conversation.');}
    finally {lock.current=false;if (active.current && uid.current===caller) setBusy(false);}
  }
  return <>
    {profile?.role==='owner' && <Text>Starting this chat explicitly approves communication with this shop for the current request terms.</Text>}
    <Button title={profile?.role==='owner'?'Message shop':'Open authorised chat'} disabled={busy || disabled || offline} onPress={()=>open()}/>
    {askApproval && profile?.role==='shop' && <>
      <Text>An enquiry does not allow chat. The customer must approve it first.</Text>
      <Field label="Communication enquiry" value={reason} onChangeText={setReason} multiline maxLength={300} editable={!busy && !disabled && !offline}/>
      <Button title="Request communication approval" disabled={busy || disabled || offline || !reason.trim()} onPress={()=>{if(reason.trim())void open(true);}}/>
    </>}
    <Notice busy={busy} error={error}/>
  </>;
}
export function CustomerConversationPicker({request,navigation,disabled}) {
  const [open,setOpen] = useState(false);
  if (request.status !== 'open') return null;
  if (request.visibility === 'direct') return <ConversationAction serviceRequestId={request.id} shopId={request.shopId} navigation={navigation} disabled={disabled}/>;
  return <Card>
    <Button title="Choose a shop to message" disabled={disabled} onPress={()=>{if(!disabled)setOpen(value=>!value);}}/>
    {open && <ShopChoices request={request} navigation={navigation} disabled={disabled}/>}
  </Card>;
}
function ShopChoices({request,navigation,disabled}) {
  const [cursor,setCursor] = useState(null), feed = useMarketData('shops',{cursor});
  const rows = useInfiniteCursor(feed.data,feed.busy,setCursor,{autoLoad:false,pageCursor:cursor});
  return <><Notice busy={feed.busy} error={feed.error}/>{rows.items.map(shop=><Card key={shop.id}><Text>{shop.shopName} · {shop.city}</Text><ConversationAction serviceRequestId={request.id} shopId={shop.id} navigation={navigation} disabled={disabled || feed.busy}/></Card>)}
    {!!feed.data?.cursor && <Button title="More shops" disabled={feed.busy || disabled} onPress={rows.loadNext}/>}
    {!feed.busy && !feed.error && !rows.items.length && <Text>No eligible shops available.</Text>}
  </>;
}
