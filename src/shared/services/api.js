import {firebase,localDemo,prepareLocalDemo} from './firebase';
import {requireConnection} from './network';
let waking=null,lastReady=0;
const listeners=new Set();
export const onBackendWaiting=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function baseURL(){
 if(localDemo)return localDemo.apiURL;
 const url=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
 if(!url)throw new Error('Backend setup is missing. Set EXPO_PUBLIC_API_URL using docs/OPERATIONS.md and restart Expo.');
 if(!url.startsWith('https://')&&!(__DEV__&&url.startsWith('http://')))throw new Error('The backend address must use HTTPS.');
 return url;
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
 if(localDemo)await prepareLocalDemo();
 if(Date.now()-lastReady<60000)return;
 if(!waking){waking=(async()=>{
  const timer=setTimeout(()=>listeners.forEach(fn=>fn(true)),4000);
  try{const {response:r,responseBody}=await fetchWithTimeout(`${url}/health`,{},90000,'health');if(!r.ok)throw new Error('The backend is unavailable. Please try again shortly.');let body;try{body=JSON.parse(responseBody);}catch{throw new Error('The server is still starting. Please try again shortly.');}if(body.ok!==true)throw new Error('The backend is not ready.');lastReady=Date.now();}
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
  console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});
  throw error;
 }
 if(!response.ok){
  const payload=result&&typeof result==='object'?result:{},errorBody=payload.error||payload;
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:payload.error?.message||'The request failed.';
  const error=new Error(message);error.code=`api/${payload.error?.code||'internal'}`;error.status=response.status;error.responseBody=errorBody;error.requestUrl=requestUrl;
  if(payload.error?.retryWithNewRequest===true)error.retryWithNewRequest=true;
  console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});
  throw error;
 }
 if(!result||typeof result!=='object'||!Object.prototype.hasOwnProperty.call(result,'data')){
  const error=new Error('The server returned an unexpected response. Please try again.');
  error.code='api/unexpected-response';error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API response invalid]',{status:response.status,responseBody:loggedBody,requestUrl});
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
 const token=await user.getIdToken();
 if(auth.currentUser?.uid!==user.uid)throw new Error('Your account changed. Please try again.');
 if(localDemo)body=await require('./demoMedia').demoUploadBody(body);
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',`${url}/api/${path}`);
  xhr.timeout=60000;
  xhr.setRequestHeader('Authorization',`Bearer ${token}`);
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
  xhr.onerror=()=>reject(new Error('Cannot reach the server. Check your connection and try again.'));
  xhr.ontimeout=()=>reject(new Error('The upload is taking too long. Refresh before trying again.'));
  xhr.onload=()=>{
   let result;
   try{result=JSON.parse(xhr.responseText);}
   catch(_){reject(new Error('The server returned an unexpected response. Refresh before trying again.'));return;}
   if(auth.currentUser?.uid!==user.uid){reject(new Error('Your account changed. Please try again.'));return;}
   if(xhr.status<200||xhr.status>=300){const error=new Error(result.error?.message||'The upload failed.');error.code=`api/${result.error?.code||'internal'}`;reject(error);return;}
   resolve(result.data);
  };
  xhr.send(body);
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
  console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});throw error;
 }
 if(!response.ok){
  const payload=result&&typeof result==='object'?result:{},errorBody=payload.error||payload;
  const message=response.status===401?'Your session expired. Please sign out and sign in again.':response.status>=500?`The server could not complete this request (HTTP ${response.status}). Please try again shortly.`:payload.error?.message||'The request failed.';
  const error=new Error(message);error.code=`api/${payload.error?.code||'internal'}`;error.status=response.status;error.responseBody=errorBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});throw error;
 }
 if(!result||typeof result!=='object'||!Object.hasOwn(result,'data')){
  const error=new Error('The server returned an unexpected response. Please try again.');
  error.code='api/unexpected-response';error.status=response.status;error.responseBody=loggedBody;error.requestUrl=requestUrl;
  console.error('[PimpMyRide API response invalid]',{status:response.status,responseBody:loggedBody,requestUrl});throw error;
 }
 return result.data;
}
