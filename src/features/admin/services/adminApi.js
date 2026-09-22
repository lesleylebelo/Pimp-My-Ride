import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
const retryKeys=new Map();
const mutations=new Set(['categorySave','categoryArchive','editAccount','review','status']);
export const callBackend=(name,data)=>apiRequest(name==='sessionEvent'?'session':'admin',data);
export async function adminApi(op,data={}) {
 if(!mutations.has(op))return apiRequest('admin',{...data,op});
 const uid=firebase().auth.currentUser?.uid;
 const key=JSON.stringify([uid,op,data]);
 let requestId=retryKeys.get(key);
 if(!requestId){requestId=`r${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;retryKeys.set(key,requestId);}
 try {const result=await apiRequest('admin',{...data,op,requestId},{expectedUid:uid});retryKeys.delete(key);return result;}
 catch(e){
  if(['api/invalid-argument','api/permission-denied','api/unauthenticated','api/failed-precondition'].includes(e.code))retryKeys.delete(key);
  throw e;
 }
}
export function adminError(e){
 if(e?.code==='api/unauthenticated')return 'Your session expired. Sign out and sign in again.';
 return e?.message||'Unable to complete this action. Please refresh before retrying.';
}
