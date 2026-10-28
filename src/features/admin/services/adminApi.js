import {invalidateReads} from '../../../shared/services/readCoordinator';
import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
const retryKeys=new Map();
const MAX_RETRY_KEYS=50;
let observedUid;
const mutations=new Set(['categorySave','categoryArchive','editAccount','review','status','serviceReviewModerate','serviceReviewReconcile']);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function observeAccount(){
 const uid=firebase().auth.currentUser?.uid;
 if(uid!==observedUid){retryKeys.clear();observedUid=uid;}
 return uid;
}
export const callBackend=(name,data)=>{const uid=observeAccount();return apiRequest(name==='sessionEvent'?'session':'admin',data,{expectedUid:uid});};
export async function adminApi(op,data={}) {
 const uid=observeAccount();
 if(!mutations.has(op))return apiRequest('admin',{...data,op},{expectedUid:uid});
 const key=JSON.stringify([uid,op,canonical(data)]);
 let requestId=retryKeys.get(key);
 if(!requestId)requestId=`r${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
 // Keep recently retried actions, bounded to this account and this process.
 retryKeys.delete(key);retryKeys.set(key,requestId);
 if(retryKeys.size>MAX_RETRY_KEYS)retryKeys.delete(retryKeys.keys().next().value);
 try {
  const result=await apiRequest('admin',{...data,op,requestId},{expectedUid:uid});
  if(retryKeys.get(key)===requestId)retryKeys.delete(key);
  return result;
 } catch(error) {
  // Only the server can establish that this review's operation is terminal.
  // A later explicit confirmation may then start a new operation; never retry
  // automatically or infer a terminal result from a timeout/recency failure.
  if(op==='review'&&error.retryWithNewRequest===true&&retryKeys.get(key)===requestId)retryKeys.delete(key);
  throw error;
 } finally {
  // Any error can follow an earlier committed response that was lost. Retain the
  // key across reauthentication and retry unless success or a terminal review
  // outcome is explicitly confirmed by the server.
  observeAccount();
 }
}
export function adminError(e){
 if(e?.code==='api/unauthenticated')return 'Your session expired. Sign out and sign in again.';
 return e?.message||'Unable to complete this action. Please refresh before retrying.';
}
