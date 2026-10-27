const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const babel=require('@babel/core');
const backendRequire=createRequire(path.resolve(__dirname,'../backend/package.json'));
const request=backendRequire('supertest');
const {createApp}=require('../backend/app.cjs');

// Execute the actual frontend transport against the actual Express registration.
// Supertest supplies local HTTP; no Google/Render/Firebase calls or data writes.
function setup({legacy=false}={}){
 const origin='http://localhost:8081',base='https://pimp-my-ride.onrender.com';
 const calls=[],handled=[],verified=[];
 const auth={verifyIdToken:async(token,checkRevoked)=>{
  verified.push([token,checkRevoked]);assert.equal(token,'synthetic-firebase-token');
  return {uid:'existing-uid',email_verified:true};
 }};
 const services=Object.fromEntries(['completeProfile','authorizeGoogleSession','marketplace'].map(name=>[name,async value=>{handled.push([name,value]);return {uid:value.auth.uid};}]));
 let app;
 if(legacy){app=backendRequire('express')();app.use((req,res)=>res.status(404).json({error:{code:'not-found',message:'Endpoint not found.'}}));}
 else app=createApp({auth,services,allowedOrigins:[origin],googleExchange:async data=>{
  handled.push(['googleExchange',data]);return {status:'authenticated',uid:'existing-uid',customToken:'synthetic-custom-token'};
 }});
 const fetch=async(url,options={})=>{
  const parsed=new URL(url);assert.equal(parsed.origin,base);
  calls.push({path:parsed.pathname,method:options.method||'GET',credentials:options.credentials,headers:options.headers});
  let call=request(app)[(options.method||'GET').toLowerCase()](parsed.pathname).set('Origin',origin);
  for(const [key,value] of Object.entries(options.headers||{}))call=call.set(key,value);
  if(options.body!==undefined)call=call.send(options.body);
  const response=await call;
  return {ok:response.status>=200&&response.status<300,status:response.status,url,json:async()=>response.body,text:async()=>response.text};
 };
 const user={uid:'existing-uid',getIdToken:async()=> 'synthetic-firebase-token'};
 const mocks={
  'firebase/auth':{},'firebase/firestore':{},'./accounts':{},'./loginCooldown':{},
  '../../../shared/services/api':{},'../../../shared/services/firebase':{},
  './firebase':{firebase:()=>({auth:{currentUser:user}})},
  './network':{requireConnection:async()=>{}},
 };
 function load(file){
  const source=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
  const {code}=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});
  const mod={exports:{}};
  new Function('require','module','exports','process','fetch','__DEV__',code)(name=>{
   assert.ok(Object.hasOwn(mocks,name),'Unexpected frontend dependency: '+name);return mocks[name];
  },mod,mod.exports,{env:{EXPO_PUBLIC_API_URL:base+'/'}},fetch,false);
  return mod.exports;
 }
 return {google:load('src/features/auth/services/googleAccounts.js'),api:load('src/shared/services/api.js'),calls,handled,verified};
}

test('actual Google frontend exchange reaches the Express POST /auth/google handler without /api or Firebase authorization',async()=>{
 const s=setup(),payload={credential:'synthetic-google-credential',nonce:'n'.repeat(64)};
 const result=await s.google.exchangeGoogle(payload);
 assert.equal(result.uid,'existing-uid');assert.equal(result.status,'authenticated');
 assert.deepEqual(s.handled,[['googleExchange',payload]]);
 assert.deepEqual(s.calls.map(({path,method})=>({path,method})),[{path:'/auth/google',method:'POST'}]);
 assert.equal(s.calls[0].credentials,'omit');assert.equal(s.calls[0].headers.Authorization,undefined);assert.equal(s.verified.length,0);
});

test('actual shared client adds /api for profile, Google authorization and marketplace while retaining Firebase verification',async()=>{
 const s=setup();
 for(const endpoint of ['profile','auth/google/authorize','marketplace']){
  assert.deepEqual(await s.api.apiRequest(endpoint,{op:'synthetic'},{expectedUid:'existing-uid'}),{uid:'existing-uid'});
 }
 assert.deepEqual(s.calls.map(({path,method})=>({path,method})),[
  {path:'/health',method:'GET'},
  {path:'/api/profile',method:'POST'},
  {path:'/api/auth/google/authorize',method:'POST'},
  {path:'/api/marketplace',method:'POST'},
 ]);
 assert.deepEqual(s.handled.map(([name,value])=>[name,value.auth.uid]),[
  ['completeProfile','existing-uid'],['authorizeGoogleSession','existing-uid'],['marketplace','existing-uid'],
 ]);
 assert.deepEqual(s.verified,Array.from({length:3},()=>['synthetic-firebase-token',true]));
});

test('a backend without the Google route produces the observed 404 without retrying a different path',async()=>{
 const s=setup({legacy:true});
 await assert.rejects(()=>s.google.exchangeGoogle({credential:'synthetic',nonce:'n'.repeat(64)}),{code:'api/not-found',message:'Endpoint not found.'});
 assert.deepEqual(s.calls.map(({path,method})=>({path,method})),[{path:'/auth/google',method:'POST'}]);
 assert.equal(s.handled.length,0);
});
