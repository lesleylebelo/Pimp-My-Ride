import {firebase,localDemo,prepareLocalDemo} from './firebase';
import {requireConnection} from './network';
let waking=null,lastReady=0;
let lastHealthFailure=null,lastConnectionWarning=null;
const HEALTH_FAILURE_COOLDOWN=5000,CONNECTION_WARNING_INTERVAL=30000;
function retryAfter(error,status,header){
 if(status!==429)return error;
 const now=Date.now(),value=header?.trim(),seconds=value&&/^\d+$/.test(value)?Number(value):NaN;
 const until=Number.isFinite(seconds)?now+seconds*1000:value?Date.parse(value):NaN;
 error.retryAt=Number.isFinite(until)?Math.max(now,until):now+60000;
 error.retryAfterMs=error.retryAt-now;
 return error;
}
const listeners=new Set();
export const onBackendWaiting=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function baseURL(){
 if(localDemo)return localDemo.apiURL;
 const url=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
 if(!url)throw new Error('Backend setup is missing. Set EXPO_PUBLIC_API_URL using docs/OPERATIONS.md and restart Expo.');
 if(!url.startsWith('https://')&&!(__DEV__&&url.startsWith('http://')))throw new Error('The backend address must use HTTPS.');
 return url;
}
function connectionError(url,stage,timedOut){
 const error=new Error(timedOut?'The server is taking too long. Check your connection, refresh, and try again.':'Cannot reach the server. Check your connection and try again.');
 error.code=timedOut?'api/connection-timeout':'api/network-request-failed';
 error.connectionStage=stage;
 if(__DEV__){
  let origin='invalid-address';try{origin=new URL(url).origin;}catch{}
  // Never print request URLs/queries, headers, bodies, local files or raw errors.
  const reason=timedOut?'timeout':'network',key=`${origin}:${stage}:${reason}`,now=Date.now();
  if(lastConnectionWarning?.key!==key||now-lastConnectionWarning.at>=CONNECTION_WARNING_INTERVAL){
   lastConnectionWarning={key,at:now};
   console.warn('[PimpMyRide connection]',{stage,origin,reason});
  }
 }
 return error;
}
async function fetchWithTimeout(url,options,ms,stage){
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
  controller.abort();reject(Object.assign(new Error('Request deadline exceeded.'),{name:'AbortError'}));
 },ms);});
 try{return await Promise.race([(async()=>{
  const response=await fetch(url,{...options,signal:controller.signal});
  // Keep the deadline active until the body is read, including on native fetch.
  const responseBody=await response.text();
  return {response,responseBody};
 })(),deadline]);}
 catch(e){
  const timedOut=controller.signal.aborted||e?.name==='AbortError';
  throw connectionError(url,stage,timedOut);
 }
 finally{clearTimeout(timer);}
}
async function ready(url){
 if(localDemo)await prepareLocalDemo();
 if(Date.now()-lastReady<60000)return;
 // Share fast health failures between polling screens and foreground events.
 // No timer retries requests: the next caller may probe again after five seconds.
 if(lastHealthFailure?.url===url&&Date.now()<lastHealthFailure.retryAt)throw lastHealthFailure.error;
 if(!waking){waking=(async()=>{
  const timer=setTimeout(()=>listeners.forEach(fn=>fn(true)),4000);
  try{const {response:r,responseBody}=await fetchWithTimeout(`${url}/health`,{},90000,'health');if(!r.ok)throw new Error('The backend is unavailable. Please try again shortly.');let body;try{body=JSON.parse(responseBody);}catch{throw new Error('The server is still starting. Please try again shortly.');}if(body.ok!==true)throw new Error('The backend is not ready.');lastReady=Date.now();lastHealthFailure=null;}
  catch(error){lastHealthFailure={url,error,retryAt:Date.now()+HEALTH_FAILURE_COOLDOWN};throw error;}
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
 if(localDemo&&multipart)data=await require('./demoMedia').demoUploadBody(data);
 const {response,responseBody}=await fetchWithTimeout(`${url}/api/${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,...(!multipart?{'Content-Type':'application/json'}:{})},body:multipart?data:JSON.stringify(data)},multipart?60000:45000,multipart?'upload':'request');
 const requestUrl=response.url||`${url}/api/${path}`,loggedBody=responseBody.slice(0,4000);
 let result;
 try{result=JSON.parse(responseBody);}
 catch{
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:'The server returned an unexpected response. Please try again.';
  const error=new Error(message);error.code=`api/http-${response.status}`;error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API request failed]',{status:response.status});
  throw retryAfter(error,response.status,response.headers?.get('Retry-After'));
 }
 if(!response.ok){
  const payload=result&&typeof result==='object'?result:{},errorBody=payload.error||payload;
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:payload.error?.message||'The request failed.';
  const error=new Error(message);error.code=`api/${payload.error?.code||'internal'}`;error.status=response.status;error.responseBody=errorBody;error.requestUrl=requestUrl;
  if(payload.error?.retryWithNewRequest===true)error.retryWithNewRequest=true;
  const expectedAI=path==='ai/assist'&&((response.status===503&&payload.error?.code==='unavailable')||(response.status===429&&payload.error?.code==='resource-exhausted')||(response.status===403&&payload.error?.code==='permission-denied'));
  if(!expectedAI)console.error('[PimpMyRide API request failed]',{status:response.status});
  throw retryAfter(error,response.status,response.headers?.get('Retry-After'));
 }
 if(!result||typeof result!=='object'||!Object.prototype.hasOwnProperty.call(result,'data')){
  const error=new Error('The server returned an unexpected response. Please try again.');
  error.code='api/unexpected-response';error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API response invalid]',{status:response.status});
  throw error;
 }
 return result.data;
}

export async function uploadRequest(path,body,{expectedUid,onProgress}={}){
 await requireConnection();
 const url=baseURL(),auth=firebase().auth,user=auth.currentUser;
 if(!user)throw new Error('Please sign in again.');
 if(expectedUid&&user.uid!==expectedUid)throw new Error('Your account changed. Please try again.');
 await ready(url);
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 const token=await user.getIdToken();
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 if(localDemo)body=await require('./demoMedia').demoUploadBody(body);
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest(),requestUrl=`${url}/api/${path}`;let settled=false,timer;
  const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);callback(value);};
  const failConnection=timedOut=>{if(!settled)finish(reject,connectionError(requestUrl,'upload',timedOut));};
  xhr.open('POST',requestUrl);
  xhr.timeout=60000;
  xhr.setRequestHeader('Authorization',`Bearer ${token}`);
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
  xhr.onerror=()=>failConnection(false);
  xhr.ontimeout=()=>failConnection(true);
  xhr.onabort=()=>failConnection(false);
  xhr.onload=()=>{
   if(settled)return;
   if(auth.currentUser?.uid!==user.uid){finish(reject,new Error('Your account changed. Please try again.'));return;}
   let result;
   try{result=JSON.parse(xhr.responseText);}
   catch(_){const error=new Error('The server returned an unexpected response. Refresh before trying again.');error.status=xhr.status;error.code=`api/http-${xhr.status}`;finish(reject,retryAfter(error,xhr.status,xhr.getResponseHeader?.('Retry-After')));return;}
   if(xhr.status<200||xhr.status>=300){
    const error=new Error(xhr.status===401?'Your session expired. Please sign out and sign in again.':xhr.status>=500?`The server could not complete this request (HTTP ${xhr.status}). Please try again shortly.`:result?.error?.message||'The upload failed.');
    error.code=`api/${result?.error?.code||'internal'}`;error.status=xhr.status;
    if(result?.error?.retryWithNewRequest===true)error.retryWithNewRequest=true;
    finish(reject,retryAfter(error,xhr.status,xhr.getResponseHeader?.('Retry-After')));return;
   }
   if(!result||typeof result!=='object'||!result.data||typeof result.data!=='object'||Array.isArray(result.data)){
    const error=new Error('The server returned an unexpected response. Refresh before trying again.');error.code='api/unexpected-response';error.status=xhr.status;finish(reject,error);return;
   }
   finish(resolve,result.data);
  };
  // Native timeout events can be lost after a network interruption. Bound the
  // whole upload/response and keep ambiguous outcomes for manual receipt replay.
  timer=setTimeout(()=>{failConnection(true);xhr.abort();},60000);
  try{xhr.send(body);}catch{failConnection(false);}
 });
}

export async function apiMethodRequest(path,{method='GET',query,data,expectedUid}={}){
 await requireConnection();
 const root=baseURL(),auth=firebase().auth,user=auth.currentUser;
 if(!user)throw new Error('Please sign in again.');
 if(expectedUid&&user.uid!==expectedUid)throw new Error('Your account changed. Please try again.');
 await ready(root);
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 const token=await user.getIdToken();
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 const params=query?Object.entries(query).filter(([,value])=>value!==undefined&&value!==null)
  .map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&'):'';
 const requestUrlBase=`${root}/api/${path}${params?`?${params}`:''}`;
 const hasBody=data!==undefined&&data!==null;
 const {response,responseBody}=await fetchWithTimeout(requestUrlBase,{
  method,headers:{Authorization:`Bearer ${token}`,...(hasBody?{'Content-Type':'application/json'}:{})},
  ...(hasBody?{body:JSON.stringify(data)}:{})
 },45000,'request');
 const requestUrl=response.url||requestUrlBase,loggedBody=responseBody.slice(0,4000);
 let result;
 try{result=JSON.parse(responseBody);}
 catch{
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:'The server returned an unexpected response. Please try again.';
  const error=new Error(message);error.code=`api/http-${response.status}`;error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API request failed]',{status:response.status});throw retryAfter(error,response.status,response.headers?.get('Retry-After'));
 }
 if(!response.ok){
  const payload=result&&typeof result==='object'?result:{},errorBody=payload.error||payload;
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:payload.error?.message||'The request failed.';
  const error=new Error(message);error.code=`api/${payload.error?.code||'internal'}`;error.status=response.status;error.responseBody=errorBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API request failed]',{status:response.status});throw retryAfter(error,response.status,response.headers?.get('Retry-After'));
 }
 if(!result||typeof result!=='object'||!Object.hasOwn(result,'data')){
  const error=new Error('The server returned an unexpected response. Please try again.');
  error.code='api/unexpected-response';error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API response invalid]',{status:response.status});throw retryAfter(error,response.status,response.headers?.get('Retry-After'));
 }
 return result.data;
}
