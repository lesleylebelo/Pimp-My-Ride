import {firebase} from './firebase';
import {requireConnection} from './network';
let waking=null,lastReady=0;
const listeners=new Set();
export const onBackendWaiting=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function baseURL(){
 const url=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
 if(!url)throw new Error('Backend setup is missing. Set EXPO_PUBLIC_API_URL using docs/OPERATIONS.md and restart Expo.');
 if(!url.startsWith('https://')&&!(__DEV__&&url.startsWith('http://')))throw new Error('The backend address must use HTTPS.');
 return url;
}
async function fetchWithTimeout(url,options,ms,stage){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{...options,signal:controller.signal});}
 catch(e){
  const timedOut=controller.signal.aborted||e?.name==='AbortError';
  const error=new Error(timedOut?'The server is taking too long. Check your connection, refresh, and try again.':'Cannot reach the server. Check your connection and try again.');
  error.code=timedOut?'api/connection-timeout':'api/network-request-failed';
  error.connectionStage=stage;
  if(__DEV__){
   let origin='invalid-address';try{origin=new URL(url).origin;}catch{}
   // Never print request URLs/queries, headers, bodies, local files or raw errors.
   console.warn('[PimpMyRide connection]',{stage,origin,reason:timedOut?'timeout':'network'});
  }
  throw error;
 }
 finally{clearTimeout(timer);}
}
async function ready(url){
 if(Date.now()-lastReady<60000)return;
 if(!waking){waking=(async()=>{
  const timer=setTimeout(()=>listeners.forEach(fn=>fn(true)),4000);
  try{const r=await fetchWithTimeout(`${url}/health`,{},90000,'health');if(!r.ok)throw new Error('The backend is unavailable. Please try again shortly.');let body;try{body=await r.json();}catch{throw new Error('The server is still starting. Please try again shortly.');}if(body.ok!==true)throw new Error('The backend is not ready.');lastReady=Date.now();}
  finally{clearTimeout(timer);listeners.forEach(fn=>fn(false));waking=null;}
 })();}
 await waking;
}
export async function apiRequest(path,data,{multipart=false,expectedUid,authClient}={}){
 // Onboarding may use an isolated, memory-only Auth client to save its profile.
 // All other callers retain the main session and the same account-change checks.
 await requireConnection();const url=baseURL(),auth=authClient || firebase().auth,user=auth.currentUser;
 if(!user)throw new Error('Please sign in again.');
 if(expectedUid && user.uid!==expectedUid)throw new Error('Your account changed. Please try again.');
 await ready(url);
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 const token=await user.getIdToken();
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 const response=await fetchWithTimeout(`${url}/api/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,...(!multipart?{'Content-Type':'application/json'}:{})},body:multipart?data:JSON.stringify(data)},multipart?60000:45000,multipart?'upload':'request');
 let result;try{result=await response.json();}catch{throw new Error('The server returned an unexpected response. Refresh before trying again.');}
 if(!response.ok){const error=new Error(result.error?.message||'The request failed.');error.code=`api/${result.error?.code||'internal'}`;if(result.error?.retryWithNewRequest===true)error.retryWithNewRequest=true;throw error;}
 return result.data;
}
