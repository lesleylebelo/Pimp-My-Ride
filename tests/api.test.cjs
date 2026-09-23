const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),babel=require('@babel/core');
function setup(fetcher){
 const auth={currentUser:{uid:'u',getIdToken:async()=> 'firebase-token'}},calls=[];
 const mocks={'./firebase':{firebase:()=>({auth})},'./network':{requireConnection:async()=>{}}};
 const code=babel.transformSync(fs.readFileSync('src/shared/services/api.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports','process','fetch','__DEV__',code)(n=>mocks[n],mod,mod.exports,{env:{EXPO_PUBLIC_API_URL:'https://api.example.test'}},async(url,options)=>{calls.push({url,options});return fetcher(url,options,auth);},false);
 return {...mod.exports,calls,auth};
}
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
