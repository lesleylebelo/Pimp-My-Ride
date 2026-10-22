import React,{useEffect,useRef,useState} from 'react';
import {AppState,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../../auth/context/AuthContext';
import {useMessages} from '../hooks/useMessages';
import {messageApi} from '../services/messageApi';
import {Page,Card,Button,Field,Notice} from '../components/MarketplaceUI';
const time = value => typeof value==='number'?new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})+' SAST':'Sending…';
export function MessagesScreen(props) {const {user}=useAuth();return <Inbox key={user?.uid} {...props}/>;}
function Inbox({navigation}) {
  const {offline}=useAuth(),feed=useMessages();
  return <Page title="Messages" navigation={navigation}>
    <Text>Private request conversations and communication enquiries. Messages update while this screen is active.</Text>
    <Notice busy={feed.busy} error={offline?'Connect to view messages.':feed.error}/>
    {feed.items.map(item=><Card key={item.id}>
      <Text weight="semibold">{item.shopName} · {item.requestTitle}</Text>
      <Text>{item.unreadCount} unread · {item.consent==='pending'?'Awaiting customer approval':item.canSend?'Messaging available':'Read-only history'}</Text>
      <Text>{item.lastMessage || item.enquiry || 'No messages yet.'}</Text>
      <Button title={`Open conversation: ${item.shopName}`} disabled={offline} onPress={()=>{if(!offline)navigation.navigate('Chat',{id:item.id});}}/>
    </Card>)}
    {!feed.busy && !feed.error && !feed.items.length && <Text>No conversations yet. Open one from your request, quotation or booking.</Text>}
    {!!feed.cursor && <Button title="Load more conversations" disabled={feed.busy || offline} onPress={feed.loadMore}/>}
    <Button title="Refresh messages" disabled={feed.busy || offline} onPress={feed.refresh}/>
  </Page>;
}
export function ChatScreen(props) {const {user}=useAuth();return <Chat key={`${user?.uid}:${props.route.params.id}`} {...props}/>;}
function Chat({navigation,route}) {
  const {user,profile,offline}=useAuth(),focused=useIsFocused(),{theme}=useTheme(),feed=useMessages(route.params.id);
  const [draft,setDraft]=useState(''),[sending,setSending]=useState(false),[failure,setFailure]=useState(''),[working,setWorking]=useState(false);
  const lock=useRef(false),active=useRef(true),retry=useRef(null),permission=useRef(false),caller=useRef(user?.uid);
  caller.current=user?.uid;
  const conversation=feed.data;
  permission.current=focused && !offline && !!conversation?.canSend && (!conversation.expiresAt || conversation.expiresAt>Date.now()) && !feed.error;
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function action(op,data) {
    if(lock.current || offline || !focused || AppState.currentState!=='active')return;
    lock.current=true;setWorking(true);setFailure('');const uid=caller.current;
    try{await messageApi(op,{id:route.params.id,...data});if(active.current&&uid===caller.current)await feed.refresh();}
    catch(e){if(active.current&&uid===caller.current)setFailure(e.message||'Unable to update the conversation.');}
    finally{lock.current=false;if(active.current&&uid===caller.current)setWorking(false);}
  }
  async function send() {
    const text=draft.trim();if(lock.current || !permission.current || !text || text.length>2000 || AppState.currentState!=='active')return;
    lock.current=true;setSending(true);setFailure('');const uid=caller.current;
    if(!retry.current)retry.current=`send_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try{await messageApi('send',{id:route.params.id,text,requestId:retry.current});if(active.current&&uid===caller.current){setDraft('');retry.current=null;await feed.refresh();}}
    catch(e){if(active.current&&uid===caller.current)setFailure(e.message||'Message not sent. Retry to send the same message once.');}
    finally{lock.current=false;if(active.current&&uid===caller.current)setSending(false);}
  }
  const readThrough=Math.max(0,...feed.items.filter(item=>item.senderId!==user?.uid).map(item=>item.recipientOrdinal || 0));
  return <Page title={conversation?`Chat · ${conversation.shopName}`:'Private conversation'} navigation={navigation}>
    <Notice busy={feed.busy || working} error={offline?'Connect to view and send messages.':feed.error || failure}/>
    {conversation && <>
      <Card><Text weight="semibold">{conversation.requestTitle}</Text><Text>{[conversation.vehicle?.year,conversation.vehicle?.make,conversation.vehicle?.model].filter(Boolean).join(' ')}</Text>
        <Text>{conversation.reason}</Text><Text>Unread messages: {conversation.unreadCount}</Text>
        {!!conversation.enquiry && <Text>Communication enquiry: {conversation.enquiry}</Text>}
        <Button title="View related request" disabled={offline} onPress={()=>navigation.navigate(profile.role==='shop'?'ShopRequest':'OwnerRequest',{id:conversation.serviceRequestId})}/>
        {!!conversation.bookingId && <Button title="View related booking" disabled={offline} onPress={()=>navigation.navigate('BookingDetail',{id:conversation.bookingId})}/>}
        {profile.role==='owner' && <>
          {(conversation.consent!=='approved' || !conversation.canSend) && <Button title="Approve communication" disabled={offline || working} onPress={()=>action('consent',{decision:'approved'})}/>}
          {conversation.consent==='pending' && <Button title="Reject enquiry" disabled={offline || working} onPress={()=>action('consent',{decision:'rejected'})}/>}
          {conversation.consent!=='revoked' && conversation.consent!=='rejected' && <Button title="Revoke communication" disabled={offline || working} onPress={()=>action('consent',{decision:'revoked'})}/>}
        </>}
      </Card>
      {!!feed.cursor && <Button title="Load older messages" disabled={offline || feed.busy} onPress={feed.loadMore}/>}
      {feed.items.map(item=><View key={item.id} style={{alignSelf:item.senderId===user?.uid?'flex-end':'flex-start',maxWidth:'90%',padding:14,borderRadius:16,backgroundColor:item.senderId===user?.uid?theme.primary:theme.surfaceCard}}>
        <Text style={{color:item.senderId===user?.uid?theme.primaryText:theme.textPrimary}}>{item.text}</Text><Text style={{color:item.senderId===user?.uid?theme.primaryText:theme.textSecondary}}>{item.senderId===user?.uid?'You':'Received'} · {time(item.createdAt)}</Text>
      </View>)}
      {!feed.items.length && <Text>No messages yet.</Text>}
      {!!conversation.unreadCount && <Button title="Mark displayed messages read" disabled={offline || working || !readThrough} onPress={()=>action('read',{through:readThrough})}/>}
      {!conversation.canSend && <Text>History is available, but new messages require current authorisation. An enquiry alone does not permit messaging.</Text>}
      <Field label="Message" value={draft} onChangeText={text=>{if(!lock.current){setDraft(text);retry.current=null;}}} multiline maxLength={2000} editable={permission.current && !sending && !working}/>
      <Text>{draft.length}/2000 characters. Chat does not change quotations, bookings or payments.</Text>
      <Button title={sending?'Sending message…':failure && draft?'Retry message':'Send message'} disabled={!permission.current || sending || working || !draft.trim()} onPress={send}/>
    </>}
    <Button title="Refresh conversation" disabled={offline || feed.busy || sending || working} onPress={feed.refresh}/>
  </Page>;
}
