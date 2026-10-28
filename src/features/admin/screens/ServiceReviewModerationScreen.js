import React,{useEffect,useRef,useState} from 'react';
import {Text} from 'react-native';
import {useAuth} from '../../auth/context/AuthContext';
import {Page,Card,Button,Notice,Field,useAdminStyles} from '../components/AdminUI';
import {useAdminData} from '../services/useAdminData';
import {adminApi,adminError} from '../services/adminApi';
export default function ServiceReviewModerationScreen(){
 const {user}=useAuth();return <Moderation key={user?.uid}/>;
}
function Moderation(){
 const styles=useAdminStyles(),[cursor,setCursor]=useState(null),[items,setItems]=useState([]),[reason,setReason]=useState(''),[selected,setSelected]=useState(null),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const state=useAdminData('serviceReviews',{cursor}),lock=useRef(false),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(state.data)setItems(previous=>cursor?[...previous,...state.data.items.filter(item=>!previous.some(old=>old.id===item.id))]:state.data.items);},[state.data,cursor]);
 async function action(op,input){
  if(lock.current||saving||state.busy)return;
  if(reason.trim().length<10){setMessage('Provide a reason of at least 10 characters.');return;}
  lock.current=true;setSaving(true);setMessage('');
  try{await adminApi(op,{...input,reason:reason.trim()});if(active.current){setSelected(null);setReason('');setMessage('Review records updated.');setItems([]);if(cursor)setCursor(null);else await state.refresh();}}
  catch(e){if(active.current)setMessage(adminError(e));}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 return <Page><Text style={styles.heading}>Verified service reviews</Text><Text style={styles.muted}>Hide only abusive, private or invalid content. Low ratings alone are not grounds for removal. Restore a review if a moderation decision is overturned.</Text><Notice busy={saving||state.busy} error={state.error}/>{!!message&&<Text accessibilityLiveRegion="polite" style={styles.muted}>{message}</Text>}
  {items.map(item=><Card key={item.id}><Text style={styles.heading}>{item.rating} / 5 · {item.status}</Text><Text style={styles.muted}>{item.text}</Text><Text style={styles.muted}>Review: {item.id} · Workshop: {item.shopId}</Text>{!!item.moderationReason&&<Text style={styles.muted}>Moderation reason: {item.moderationReason}</Text>}<Button title={`Moderate review ${item.id}`} disabled={saving||state.busy} onPress={()=>{setSelected(item);setReason('');setMessage('');}}/>
   {selected?.id===item.id&&<><Field label="Moderation reason" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!saving}/><Button title={item.status==='visible'?'Hide abusive review':'Restore review'} disabled={saving||state.busy} onPress={()=>void action('serviceReviewModerate',{id:item.id,status:item.status==='visible'?'hidden':'visible'})}/><Button title="Reconcile workshop rating totals" disabled={saving||state.busy} onPress={()=>void action('serviceReviewReconcile',{shopId:item.shopId})}/><Button title="Cancel moderation" disabled={saving} onPress={()=>setSelected(null)}/></>}
  </Card>)}
  {!state.busy&&!state.error&&state.data&&!items.length&&<Text style={styles.muted}>No service reviews yet.</Text>}
  {!!state.data?.cursor&&<Button title="Load more service reviews" disabled={state.busy||saving} onPress={()=>setCursor(state.data.cursor)}/>}
  <Button title={state.error?'Retry loading service reviews':'Refresh service reviews'} disabled={state.busy||saving} onPress={()=>{setItems([]);if(cursor)setCursor(null);else void state.refresh();}}/>
 </Page>;
}
