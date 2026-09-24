const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),babel=require('@babel/core');
function setup(fetcher,{dev=false,base='https://api.example.test'}={}){
 const auth={currentUser:{uid:'u',getIdToken:async()=> 'firebase-token'}},calls=[],warnings=[];
 const mocks={'./firebase':{firebase:()=>({auth})},'./network':{requireConnection:async()=>{}}};
 const code=babel.transformSync(fs.readFileSync('src/shared/services/api.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports','process','fetch','__DEV__','console',code)(n=>mocks[n],mod,mod.exports,{env:{EXPO_PUBLIC_API_URL:base}},async(url,options)=>{calls.push({url,options});return fetcher(url,options,auth);},dev,{warn:(...args)=>warnings.push(args)});
 return {...mod.exports,calls,auth,warnings};
}

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
test('backend wakes before sending the Firebase token; normal responses are unwrapped',async()=>{
 const s=setup(async url=>({ok:true,json:async()=>url.endsWith('/health')?{ok:true}:{data:{ok:true}}}));
 assert.deepEqual(await s.apiRequest('admin',{op:'dashboard'}),{ok:true});assert.equal(s.calls.length,2);
 assert.equal(s.calls[0].options.headers,undefined);assert.equal(s.calls[1].options.headers.Authorization,'Bearer firebase-token');assert.equal(JSON.parse(s.calls[1].options.body).op,'dashboard');
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
