const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),babel=require('@babel/core');
function setup(){
 const auth={currentUser:{uid:'owner',getIdToken:async()=> 'private-token'}},sent=[],fetched=[],warnings=[];
 const state={status:200,result:{data:{ok:true,id:'asset',version:3}},mode:'load'};
 class Multipart{constructor(){this.fields=[];}append(...args){this.fields.push(args);}}
 class XHR{
  constructor(){this.upload={};this.headers={};}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  send(body){sent.push({xhr:this,body});this.upload.onprogress?.({lengthComputable:true,loaded:512,total:1024});if(state.mode==='stall')return;
   queueMicrotask(()=>{if(state.mode==='network'){this.onerror();return;}
    this.status=state.status;this.responseText=state.raw??JSON.stringify(state.result);state.beforeLoad?.();this.onload();});}
  abort(){this.aborted=true;this.onabort?.();}
 }
 function load(file,mocks){const code=babel.transformSync(fs.readFileSync(file,'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const mod={exports:{}};new Function('require','module','exports','process','fetch','XMLHttpRequest','FormData','__DEV__','console',code)(name=>{assert.ok(Object.hasOwn(mocks,name),name);return mocks[name];},mod,mod.exports,{env:{EXPO_PUBLIC_API_URL:'https://api.example.test'}},async url=>{fetched.push(url);if(!url.endsWith('/health'))throw Error('Native multipart fetch fails');return {ok:true,text:async()=>'{"ok":true}'};},XHR,Multipart,true,{warn:(...args)=>warnings.push(args),error:()=>{}});return mod.exports;}
 const api=load('src/shared/services/api.js',{'./firebase':{firebase:()=>({auth})},'./network':{requireConnection:async()=>{}}});
 const photos=load('src/features/marketplace/services/photoApi.js',{'react-native':{Platform:{OS:'ios'}},'../../../shared/services/api':api,'../../../shared/services/firebase':{firebase:()=>({auth})},'../utils/photos':{photoFileError:()=>''}});
 return {api,photos,auth,sent,fetched,state,warnings};
}
const file={uri:'file:///cache/prepared.jpg',name:'prepared.jpg',mimeType:'image/jpeg',size:1024};

test('vehicle and request photos use the working showcase XHR transport, preserving native multipart and query contracts',async()=>{
 for(const target of ['vehicle','request']){
  const s=setup();const upload=version=>target==='vehicle'?s.photos.uploadVehiclePhoto('car','2',version,file,'owner'):s.photos.uploadRequestPhoto('car',version,file,'owner');
  assert.equal((await upload(2)).id,'asset');assert.equal(s.sent.length,1);assert.equal(s.fetched.length,1);
  const {xhr,body}=s.sent[0],url=new URL(xhr.url);
  assert.equal(url.pathname,target==='vehicle'?'/api/photos/vehicles/car/2':'/api/photos/requests/car');assert.equal(url.searchParams.get('version'),'2');assert.ok(url.searchParams.get('requestId'));
  assert.equal(xhr.method,'POST');assert.deepEqual(xhr.headers,{Authorization:'Bearer private-token'});
  assert.deepEqual(body.fields,[['file',{uri:file.uri,name:file.name,type:file.mimeType}]]);
 }
});

test('customer XHR network loss retains the original upload key and revision for manual retry',async()=>{
 const s=setup();s.state.mode='network';
 await assert.rejects(()=>s.photos.uploadRequestPhoto('car',2,file,'owner'),{code:'api/network-request-failed',connectionStage:'upload'});
 s.state.mode='load';await s.photos.uploadRequestPhoto('car',3,file,'owner');
 assert.equal(s.sent[1].xhr.url,s.sent[0].xhr.url);assert.equal(s.sent.length,2);
 assert.deepEqual(s.warnings,[['[PimpMyRide connection]',{stage:'upload',origin:'https://api.example.test',reason:'network'}]]);
});

test('terminal upload rejection retains retryWithNewRequest and status so a new attempt can recover',async()=>{
 const s=setup();s.state.status=409;s.state.result={error:{code:'failed-precondition',message:'Closed safely',retryWithNewRequest:true}};
 await assert.rejects(()=>s.photos.uploadVehiclePhoto('car','1',2,file,'owner'),{code:'api/failed-precondition',status:409,retryWithNewRequest:true});
 const original=new URL(s.sent[0].xhr.url).searchParams.get('requestId');s.state.status=200;s.state.result={data:{id:'asset'}};
 await s.photos.uploadVehiclePhoto('car','1',3,file,'owner');const retry=new URL(s.sent[1].xhr.url);
 assert.notEqual(retry.searchParams.get('requestId'),original);assert.equal(retry.searchParams.get('version'),'3');
});

test('XHR malformed success and stale-account responses never acknowledge a saved customer photo',async()=>{
 for(const raw of ['not JSON','{}','{"data":null}','{"data":[]}']){
  const s=setup();s.state.raw=raw;await assert.rejects(()=>s.api.uploadRequest('photos/vehicles/car/1',{}, {expectedUid:'owner'}),/unexpected response/);
 }
 const s=setup();s.state.beforeLoad=()=>{s.auth.currentUser={uid:'other'};};
 await assert.rejects(()=>s.photos.uploadRequestPhoto('car',2,file,'owner'),/account changed/);
});

test('the existing showcase upload keeps progress and response handling with the shared transport',async()=>{
 const s=setup(),progress=[];s.state.result={data:{path:'posts/owner/synthetic-image'}};
 assert.deepEqual(await s.api.uploadRequest('posts/images',{}, {expectedUid:'owner',onProgress:value=>progress.push(value)}),s.state.result.data);
 assert.deepEqual(progress,[50]);assert.equal(s.sent.length,1);
});

test('changed accounts cannot send customer files before or during token retrieval',async()=>{
 const before=setup();before.auth.currentUser={uid:'other'};
 await assert.rejects(()=>before.photos.uploadRequestPhoto('car',2,file,'owner'),/account changed/);assert.equal(before.sent.length,0);assert.equal(before.fetched.length,0);
 const during=setup();during.auth.currentUser.getIdToken=async()=>{during.auth.currentUser=null;return 'old-token';};
 await assert.rejects(()=>during.photos.uploadVehiclePhoto('car','1',2,file,'owner'),/account changed/);assert.equal(during.sent.length,0);
});

test('a stalled native XHR has a bounded deadline, aborts, and never automatically resubmits',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const s=setup();s.state.mode='stall';
 const rejected=assert.rejects(s.photos.uploadVehiclePhoto('car','1',2,file,'owner'),{code:'api/connection-timeout',connectionStage:'upload'});
 for(let i=0;i<30;i++)await Promise.resolve();assert.equal(s.sent.length,1);
 t.mock.timers.tick(60000);await rejected;assert.equal(s.sent[0].xhr.aborted,true);assert.equal(s.sent.length,1);
});
