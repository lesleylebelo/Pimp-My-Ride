const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),babel=require('@babel/core');
function setup(fetcher,{dev=false,base='https://api.example.test'}={}){
 const auth={currentUser:{uid:'u',getIdToken:async()=> 'firebase-token'}},calls=[],warnings=[],errors=[];
 const mocks={'./firebase':{firebase:()=>({auth})},'./network':{requireConnection:async()=>{}}};
 const code=babel.transformSync(fs.readFileSync('src/shared/services/api.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports','process','fetch','__DEV__','console',code)(n=>mocks[n],mod,mod.exports,{env:{EXPO_PUBLIC_API_URL:base}},async(url,options)=>{calls.push({url,options});const response=await fetcher(url,options,auth);if(typeof response.text!=='function'&&response.json){const body=await response.json();return {...response,text:async()=>JSON.stringify(body)};}return response;},dev,{warn:(...args)=>warnings.push(args),error:(...args)=>errors.push(args)});
 return {...mod.exports,calls,auth,warnings,errors};
}

test('429 preserves Retry-After seconds, HTTP dates and a safe fallback without automatic retries',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 for(const [kind,delay] of [['120',120000],['date',90000],[null,60000],['invalid',60000]]){
  for(const malformed of [false,true]){
   const header=kind==='date'?new Date(Date.now()+delay).toUTCString():kind;
   const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status:429,headers:{get:()=>header},text:async()=>malformed?'Too many requests':JSON.stringify({error:{code:'resource-exhausted',message:'Wait'}})});
   await assert.rejects(()=>s.apiRequest('profile/photos',{op:'status'}),error=>{
    assert.equal(error.status,429);assert.equal(error.retryAfterMs,delay);assert.equal(error.retryAt,Date.now()+delay);return true;
   });
   t.mock.timers.tick(1000);assert.equal(s.calls.length,2,'no automatic retry');
  }
 }
});
test('REST post 429s expose retry deadlines even for malformed bodies and logs exclude private response content',async()=>{
 for(const malformed of [false,true]){
  const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status:429,headers:{get:()=> '90'},text:async()=>malformed?'private provider text':JSON.stringify({error:{code:'resource-exhausted',message:'Wait',private:'never log'}})});
  await assert.rejects(()=>s.apiMethodRequest('posts'),error=>error.status===429&&error.retryAfterMs===90000);
  assert.deepEqual(s.errors,[['[PimpMyRide API request failed]',{status:429}]]);assert.equal(s.calls.length,2);
 }
});

test('missing configuration fails before health or authentication requests and differs from connectivity errors',async()=>{
 const s=setup(async()=>assert.fail('No fetch without configuration'),{base:''});
 for(const request of [()=>s.apiRequest('admin',{}),()=>s.apiRequest('marketplace',{}),()=>s.apiMethodRequest('posts')]){
  await assert.rejects(request,error=>{assert.match(error.message,/Backend setup is missing/);assert.equal(error.code,undefined);return true;});
 }
 assert.equal(s.calls.length,0);
 const configured=setup(async()=>{throw new TypeError('Failed to fetch');});
 await assert.rejects(()=>configured.apiRequest('admin',{}),error=>{assert.equal(error.code,'api/network-request-failed');assert.doesNotMatch(error.message,/setup is missing|CORS/i);return true;});
});

test('an unauthenticated configured client never probes health or requests tokens',async()=>{
 const s=setup(async()=>assert.fail('No fetch without authentication'));s.auth.currentUser=null;
 await assert.rejects(()=>s.apiRequest('admin',{}),/Please sign in again/);
 await assert.rejects(()=>s.apiMethodRequest('posts'),/Please sign in again/);
 assert.equal(s.calls.length,0);
});

test('health connection failures identify the stage without sending a token or exposing error contents',async()=>{
 const s=setup(async()=>{throw Error('private provider details and local file path');},{dev:true});
 await assert.rejects(()=>s.apiRequest('admin',{private:'request data'}),{code:'api/network-request-failed',connectionStage:'health'});
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.headers,undefined);
 assert.deepEqual(s.warnings,[['[PimpMyRide connection]',{stage:'health',origin:'https://api.example.test',reason:'network'}]]);
});

test('request and upload failures are distinguished, redacted and never automatically retried',async()=>{
 for(const multipart of [false,true]){
  const s=setup(async url=>{if(url.endsWith('/health'))return {ok:true,json:async()=>({ok:true})};throw Error('firebase-token private filename private payload');},{dev:true});
  await assert.rejects(()=>s.apiRequest('photos/vehicles/private-vehicle/1?requestId=private-retry',{private:'file data'},{multipart}),{code:'api/network-request-failed',connectionStage:multipart?'upload':'request'});
  assert.equal(s.calls.length,2);
  assert.deepEqual(s.warnings,[['[PimpMyRide connection]',{stage:multipart?'upload':'request',origin:'https://api.example.test',reason:'network'}]]);
 }
});

test('connection diagnostics are disabled in production and redact URL credentials and paths in development',async()=>{
 const fail=async()=>{throw Error('private failure');},production=setup(fail);
 await assert.rejects(()=>production.apiRequest('admin',{}));assert.deepEqual(production.warnings,[]);
 const dev=setup(fail,{dev:true,base:'https://private-user:private-password@api.example.test/private-path'});
 await assert.rejects(()=>dev.apiRequest('admin',{}));assert.deepEqual(dev.warnings,[['[PimpMyRide connection]',{stage:'health',origin:'https://api.example.test',reason:'network'}]]);
});

test('aborted connections retain timeout classification and safe stage diagnostics',async()=>{
 const s=setup(async()=>{throw Object.assign(Error('private timeout details'),{name:'AbortError'});},{dev:true});
 await assert.rejects(()=>s.apiRequest('admin',{}),{code:'api/connection-timeout',connectionStage:'health'});
 assert.deepEqual(s.warnings,[['[PimpMyRide connection]',{stage:'health',origin:'https://api.example.test',reason:'timeout'}]]);
 assert.equal(s.calls.length,1);
});

test('a stalled status or upload response body times out and never reports success',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 for(const mode of ['status','upload','rest']){
  const multipart=mode==='upload';
  const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:true,status:200,text:()=>new Promise(()=>{})},{dev:true});
  const request=mode==='rest'?s.apiMethodRequest('posts'):s.apiRequest('photos',{}, {multipart});
  const rejected=assert.rejects(request,{code:'api/connection-timeout',connectionStage:multipart?'upload':'request'});
  for(let i=0;i<20;i++)await Promise.resolve();
  assert.equal(s.calls.length,2);
  t.mock.timers.tick(multipart?60000:45000);
  await rejected;
  assert.equal(s.calls[1].options.signal.aborted,true);
  assert.equal(s.calls.length,2);
 }
});

test('a health fetch that never settles releases the waiting indicator at its deadline',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const s=setup(()=>new Promise(()=>{})),waiting=[];
 s.onBackendWaiting(value=>waiting.push(value));
 const rejected=assert.rejects(s.apiRequest('photos',{}),{code:'api/connection-timeout',connectionStage:'health'});
 for(let i=0;i<20;i++)await Promise.resolve();
 t.mock.timers.tick(4000);assert.deepEqual(waiting,[true]);
 t.mock.timers.tick(86000);await rejected;
 assert.deepEqual(waiting,[true,false]);assert.equal(s.calls.length,1);
});
test('backend wakes before sending the Firebase token; normal responses are unwrapped',async()=>{
 const s=setup(async url=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true}:{data:{ok:true}}}));
 assert.deepEqual(await s.apiRequest('admin',{op:'dashboard'}),{ok:true});assert.equal(s.calls.length,2);
 assert.equal(s.calls[0].options.headers,undefined);assert.equal(s.calls[1].options.headers.Authorization,'Bearer firebase-token');assert.equal(JSON.parse(s.calls[1].options.body).op,'dashboard');
});

test('multipart uploads preserve FormData and let native fetch supply its boundary',async()=>{
 const body={syntheticMultipart:true};
 const s=setup(async url=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true}:{data:{ok:true}}}));
 assert.deepEqual(await s.apiRequest('photos/vehicles/test/1',body,{multipart:true,expectedUid:'u'}),{ok:true});
 assert.equal(s.calls[1].options.body,body);
 assert.deepEqual(s.calls[1].options.headers,{Authorization:'Bearer firebase-token'});
});
test('REST posts requests preserve method, encode filters and send JSON only for mutations',async()=>{
 const s=setup(async(url,options)=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true}:{data:{id:'post-1'}},text:async()=>url.endsWith('/health')?JSON.stringify({ok:true}):JSON.stringify({data:{id:'post-1'}})}));
 assert.deepEqual(await s.apiMethodRequest('posts',{method:'GET',expectedUid:'u',query:{service:'Body Kit',q:'paint & tune',limit:20}}),{id:'post-1'});
 assert.equal(s.calls[1].url,'https://api.example.test/api/posts?service=Body%20Kit&q=paint%20%26%20tune&limit=20');
 assert.equal(s.calls[1].options.method,'GET');assert.equal(s.calls[1].options.body,undefined);
 await s.apiMethodRequest('posts/post-1',{method:'PATCH',data:{title:'Updated'},expectedUid:'u'});
 assert.equal(s.calls[2].options.method,'PATCH');assert.deepEqual(JSON.parse(s.calls[2].options.body),{title:'Updated'});
});
test('account change during wake prevents sending a request for the previous user',async()=>{
 const s=setup(async(url,options,auth)=>{auth.currentUser={uid:'other'};return {ok:true,json:async()=>({ok:true})};});
 await assert.rejects(()=>s.apiRequest('admin',{}),/account changed/);assert.equal(s.calls.length,1);
});
test('failed mutations are not retried automatically',async()=>{
 const s=setup(async url=>({ok:url.endsWith('/health'),json:async()=>url.endsWith('/health')?{ok:true}:{error:{code:'permission-denied',message:'Denied'}}}));
 await assert.rejects(()=>s.apiRequest('admin',{op:'status'}),{code:'api/permission-denied'});assert.equal(s.calls.length,2);
});
test('a terminal review response exposes the explicit retry decision without automatically sending another request',async()=>{
 const s=setup(async url=>({ok:url.endsWith('/health'),json:async()=>url.endsWith('/health')?{ok:true}:{error:{code:'failed-precondition',message:'Review finished',retryWithNewRequest:true}}}));
 await assert.rejects(()=>s.apiRequest('admin',{op:'review'}),{code:'api/failed-precondition',retryWithNewRequest:true});assert.equal(s.calls.length,2);
});

test('an upload prepared for another account is rejected before network requests',async()=>{
 const s=setup(async()=>assert.fail('No request may use the new account.'));
 await assert.rejects(()=>s.apiRequest('documents/ownerId',{}, {multipart:true,expectedUid:'previous-account'}),/account changed/);
 assert.equal(s.calls.length,0);
});

test('account change during token refresh prevents sending the previous token',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>({ok:true})}));
 s.auth.currentUser.getIdToken=async()=>{s.auth.currentUser={uid:'other'};return 'old-token';};
 await assert.rejects(()=>s.apiRequest('documents/ownerId',{}, {multipart:true,expectedUid:'u'}),/account changed/);
 assert.equal(s.calls.length,1);
 assert.ok(s.calls[0].url.endsWith('/health'));
});

test('profile creation uses only the isolated client token while the app remains signed out',async()=>{
 const s=setup(async url=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true}:{data:{saved:true}}}));
 s.auth.currentUser=null;
 const authClient={currentUser:{uid:'new-account',getIdToken:async()=> 'isolated-token'}};
 assert.deepEqual(await s.apiRequest('profile',{fullName:'Demo'},{authClient,expectedUid:'new-account'}),{saved:true});
 assert.equal(s.auth.currentUser,null);
 assert.equal(s.calls[0].options.headers,undefined);
 assert.equal(s.calls[1].options.headers.Authorization,'Bearer isolated-token');
});

test('an isolated account mismatch is rejected before any backend request',async()=>{
 const s=setup(async()=>assert.fail('A mismatched isolated user must not contact the backend.'));
 const authClient={currentUser:{uid:'different-account',getIdToken:async()=>assert.fail('No token should be requested.')}};
 await assert.rejects(()=>s.apiRequest('profile',{}, {authClient,expectedUid:'new-account'}),/account changed/);
 assert.equal(s.calls.length,0);
});

test('an isolated client never falls back to the signed-in app user',async()=>{
 const s=setup(async()=>assert.fail('An empty isolated client must not use the main account.'));
 await assert.rejects(()=>s.apiRequest('profile',{}, {authClient:{currentUser:null}}),/Please sign in again/);
 assert.equal(s.calls.length,0);
 assert.equal(s.auth.currentUser.uid,'u');
});

test('HTTP failures log status, response body and request URL and guide the user to reauthenticate',async()=>{
 const body={error:{code:'unauthenticated',message:'Your session expired.'}};
 const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status:401,json:async()=>body});
 await assert.rejects(()=>s.apiRequest('posts',{op:'feed'}),error=>{
  assert.equal(error.status,401);
  assert.equal(error.code,'api/unauthenticated');
  assert.equal(error.message,'Your session expired. Please sign out and sign in again.');
  assert.deepEqual(error.responseBody,body.error);
  return true;
 });
 assert.deepEqual(s.errors,[['[PimpMyRide API request failed]',{status:401}]]);
});

test('server failures are distinguished and response envelopes are validated',async()=>{
 const body={error:{code:'internal',message:'The server could not complete this action.'}};
 const failed=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status:500,json:async()=>body});
 await assert.rejects(()=>failed.apiRequest('marketplace',{op:'requests'}),error=>{
  assert.equal(error.status,500);
  assert.equal(error.message,'The server could not complete this request (HTTP 500). Please try again shortly.');
  return true;
 });
 assert.deepEqual(failed.errors[0],['[PimpMyRide API request failed]',{status:500}]);
 const invalid=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:true,status:200,json:async()=>({items:[]})});
 await assert.rejects(()=>invalid.apiRequest('posts',{op:'feed'}),{code:'api/unexpected-response',status:200});
 assert.deepEqual(invalid.errors[0][1],{status:200});
});

test('successful feed responses larger than diagnostic log limits remain intact',async()=>{
 const data={items:Array.from({length:30},(_,index)=>({id:`post-${index}`,description:'A'.repeat(300)})),cursor:'next'};
 const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:true,status:200,json:async()=>({data})});
 assert.deepEqual(await s.apiRequest('posts',{op:'feed'}),data);
});

test('an isolated account change during backend wake prevents profile creation',async()=>{
 const authClient={currentUser:{uid:'new-account',getIdToken:async()=>assert.fail('No token should be requested after the account changes.')}};
 const s=setup(async()=>{authClient.currentUser={uid:'different-account'};return {ok:true,json:async()=>({ok:true})};});
 await assert.rejects(()=>s.apiRequest('profile',{}, {authClient,expectedUid:'new-account'}),/account changed/);
 assert.equal(s.calls.length,1);
 assert.ok(s.calls[0].url.endsWith('/health'));
 assert.equal(s.auth.currentUser.uid,'u');
});

test('an isolated account change during token retrieval prevents sending its old token',async()=>{
 const s=setup(async()=>({ok:true,json:async()=>({ok:true})}));
 const authClient={currentUser:{uid:'new-account',getIdToken:async()=>{authClient.currentUser=null;return 'old-isolated-token';}}};
 await assert.rejects(()=>s.apiRequest('profile',{}, {authClient,expectedUid:'new-account'}),/account changed/);
 assert.equal(s.calls.length,1);
 assert.ok(s.calls[0].url.endsWith('/health'));
 assert.equal(s.auth.currentUser.uid,'u');
});

test('expected AI failures remain handled errors without severe console errors or retries',async()=>{
 for(const [status,code] of [[503,'unavailable'],[429,'resource-exhausted'],[403,'permission-denied']]){
  const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status,json:async()=>({error:{code,message:'AI Assist is optional.'}})});
  await assert.rejects(()=>s.apiRequest('ai/assist',{}),{status,code:'api/'+code});assert.deepEqual(s.errors,[]);assert.equal(s.calls.length,2);
 }
 const s=setup(async url=>url.endsWith('/health')?{ok:true,json:async()=>({ok:true})}:{ok:false,status:500,json:async()=>({error:{code:'internal'}})});
 await assert.rejects(()=>s.apiRequest('ai/assist',{}));assert.equal(s.errors.length,1);
});

test('concurrent health failures coalesce and a short cooldown bounds polling without replaying API calls',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 let fail=true,release;
 const s=setup(async url=>{
  if(url.endsWith('/health')){if(fail){await new Promise(r=>{release=r;});throw new TypeError('Failed to fetch');}return {ok:true,json:async()=>({ok:true})};}
  return {ok:true,json:async()=>({data:{ready:true}})};
 },{dev:true});
 const first=assert.rejects(s.apiRequest('admin',{}),{code:'api/network-request-failed'});
 const second=assert.rejects(s.apiRequest('session',{}),{code:'api/network-request-failed'});
 for(let i=0;i<20;i++)await Promise.resolve();assert.equal(s.calls.length,1);
 release();await Promise.all([first,second]);
 for(let i=0;i<10;i++)await assert.rejects(()=>s.apiRequest('admin',{}),{connectionStage:'health'});
 assert.equal(s.calls.length,1);assert.equal(s.warnings.length,1);
 fail=false;t.mock.timers.tick(5000);
 assert.deepEqual(await s.apiRequest('admin',{}),{ready:true});
 assert.equal(s.calls.length,3);assert.equal(s.calls[2].options.headers.Authorization,'Bearer firebase-token');
 await s.apiRequest('admin',{});assert.equal(s.calls.length,4,'successful health is reused for sixty seconds');
});

test('repeated health failures remain recoverable while duplicate development warnings are rate limited',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const s=setup(async()=>{throw new TypeError('Failed to fetch');},{dev:true});
 for(let i=0;i<6;i++){await assert.rejects(()=>s.apiRequest('admin',{}));t.mock.timers.tick(5000);}
 assert.equal(s.calls.length,6);assert.equal(s.warnings.length,1);
 await assert.rejects(()=>s.apiRequest('admin',{}));assert.equal(s.calls.length,7);assert.equal(s.warnings.length,2);
});

test('opaque browser CORS failures and other network failures share safe classification, without claiming a known cause',async()=>{
 for(const failure of [new TypeError('Failed to fetch'),new Error('A private DNS or TLS failure')]){
  const s=setup(async()=>{throw failure;},{dev:true,base:'https://pimp-my-ride.onrender.com'});
  await assert.rejects(()=>s.apiRequest('admin',{}),e=>{
   assert.equal(e.code,'api/network-request-failed');assert.equal(e.connectionStage,'health');
   assert.equal(e.message.includes('CORS'),false);assert.equal(e.message.includes('private'),false);return true;
  });
  assert.equal(s.calls[0].options.mode,undefined,'never bypass CORS with no-cors mode');
  assert.equal(s.calls[0].options.headers,undefined);assert.equal(s.calls.length,1);
 }
});

test('readable unhealthy and malformed health responses never send credentials and can recover after the cooldown',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 for(const bad of [{ok:false,status:503,text:async()=>'{"ok":false}'},{ok:true,text:async()=>'<html>Starting</html>'},{ok:true,text:async()=>'{"ok":false}'}]){
  let response=bad;const s=setup(async url=>url.endsWith('/health')?response:{ok:true,json:async()=>({data:{ok:true}})});
  await assert.rejects(()=>s.apiRequest('admin',{}));await assert.rejects(()=>s.apiRequest('admin',{}));assert.equal(s.calls.length,1);
  response={ok:true,json:async()=>({ok:true})};t.mock.timers.tick(5000);
  assert.deepEqual(await s.apiRequest('admin',{}),{ok:true});assert.equal(s.calls.length,3);
 }
});
