import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
import {postsApi} from './postsApi';
const writes=new Set(['vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','bookingConfirm','bookingCancel']);
const pending=new Map();let lastUid;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
function account(){const uid=firebase().auth.currentUser?.uid;if(uid!==lastUid){pending.clear();lastUid=uid;}return uid;}
export async function marketApi(op,data={}){
 if(op==='posts'){
  const {view='feed',...input}=data;
  return postsApi(view,input);
 }
 const uid=account();if(!uid)throw new Error('Sign in to continue.');
 const payload={...data,op};delete payload.requestId;
 let key,requestId;
 if(writes.has(op)){
  key=JSON.stringify([uid,canonical(payload)]);requestId=pending.get(key)||`m${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  pending.delete(key);pending.set(key,requestId);if(pending.size>50)pending.delete(pending.keys().next().value);
  payload.requestId=requestId;
 }
 try{
  const result=await apiRequest('marketplace',payload,{expectedUid:uid});
  if(account()!==uid)throw new Error('Your account changed. Reload this page.');
  if(key&&pending.get(key)===requestId)pending.delete(key);
  return result;
 }finally{account();}
}
