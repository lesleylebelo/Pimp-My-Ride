import {createReadCoordinator,invalidateReads} from '../../../shared/services/readCoordinator';
import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
import {postsApi} from './postsApi';
const writes=new Set(['vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','paymentMockResult','paymentRetry','paymentStart','paymentRecordInStore','bookingComplete','bookingConfirm','bookingCancel','notificationRead']);
const pending=new Map();let lastUid;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
function account(){const uid=firebase().auth.currentUser?.uid;if(uid!==lastUid){pending.clear();lastUid=uid;}return uid;}
async function executemarketApi(op,data={}){
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

const coordinatedRead=createReadCoordinator(()=>firebase().auth.currentUser);
const reads=new Set(['paymentSimulation','vehicles','categories','shops','requests','request','quotes','bookings','booking','notifications','notificationSummary','receipt']);
export async function marketApi(op,data={},options={}){
 if(op==='posts')return executemarketApi(op,data);
 if(!reads.has(op)){try{return await executemarketApi(op,data);}finally{invalidateReads();}}
 return coordinatedRead([op,data],()=>executemarketApi(op,data),{ttl:op==='categories'?60000:op==='notificationSummary'?30000:['request','booking','receipt','paymentSimulation'].includes(op)?0:5000,...options});
}
