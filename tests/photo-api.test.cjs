const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),babel=require('@babel/core');
const {loadUI}=require('./helpers/load-ui.cjs');
const file=(name='paint.jpg')=>({uri:`file:///selected/${name}`,name,mimeType:'image/jpeg',size:1024});
function setup({platform='android',fetchFile}={}){
 const auth={currentUser:{uid:'owner'}},calls=[];let respond=async()=>({ok:true});
 const mocks={'react-native':{Platform:{OS:platform}},'../../../shared/services/firebase':{firebase:()=>({auth})},
  '../utils/photos':loadUI('src/features/marketplace/utils/photos.js'),
  '../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);return respond(...args);},uploadRequest:async(...args)=>{calls.push(args);return respond(...args);}}};
 class Multipart{constructor(){this.fields=[];}append(...args){this.fields.push(args);}}
 const {code}=babel.transformSync(fs.readFileSync('src/features/marketplace/services/photoApi.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const mod={exports:{}};
 new Function('require','module','exports','FormData','fetch',code)(name=>{assert.ok(Object.hasOwn(mocks,name),name);return mocks[name];},mod,mod.exports,Multipart,fetchFile||(()=>assert.fail('Native photos must not be fetched.')));
 return {...mod.exports,auth,calls,respond:fn=>{respond=fn;}};
}
const uploadParams=call=>new URL(call[0],'https://example.invalid/').searchParams;

test('photo validation rejects missing, invalid, oversized and remote files before upload',async()=>{
 const s=setup();
 for(const [selected,pattern] of [[null,/Choose/],[{...file(),mimeType:'image/gif'},/Choose a JPEG, PNG or WebP photo\./],[{...file(),size:0},/size/],[{...file(),size:1.5},/size/],[{...file(),size:5*1024*1024+1},/5 MB/],[{...file(),uri:'https://example.invalid/private.jpg'},/device/]]){
  await assert.rejects(()=>s.uploadVehiclePhoto('car','1',0,selected,'owner'),pattern);
 }
 assert.equal(s.calls.length,0);
 await s.uploadVehiclePhoto('car','1',0,{...file(),size:5*1024*1024},'owner');assert.equal(s.calls.length,1);
});

test('a lost upload acknowledgement keeps its original key and revision after metadata refresh',async()=>{
 const s=setup(),selected=file();s.respond(async()=>{throw Error('Connection interrupted');});
 await assert.rejects(()=>s.uploadVehiclePhoto('car','1',2,selected,'owner'));
 const first=uploadParams(s.calls[0]);assert.equal(first.get('version'),'2');assert.ok(first.get('requestId'));
 s.respond(async path=>path==='photos'?{items:[],version:3,canManage:true}:{ok:true,id:'already-saved',version:3});
 assert.equal((await s.listPhotos('vehicle','car','owner')).version,3);
 assert.deepEqual(await s.uploadVehiclePhoto('car','1',3,{...selected},'owner'),{ok:true,id:'already-saved',version:3});
 const retried=uploadParams(s.calls[2]);assert.equal(retried.get('requestId'),first.get('requestId'));assert.equal(retried.get('version'),'2');
 assert.deepEqual(s.calls[2][1].fields,[['file',{uri:selected.uri,name:selected.name,type:selected.mimeType}]]);
 assert.deepEqual(s.calls[2][2],{expectedUid:'owner'});
 await s.uploadVehiclePhoto('car','1',3,selected,'owner');assert.notEqual(uploadParams(s.calls[3]).get('requestId'),first.get('requestId'));assert.equal(uploadParams(s.calls[3]).get('version'),'3');
});

test('uncertain upload keys are isolated by selected file, vehicle, slot and account',async()=>{
 const s=setup();s.respond(async()=>{throw Error('Unknown outcome');});
 const attempts=[['car','1',file()],['car','1',file('different.jpg')],['other','1',file()],['car','2',file()]];
 for(const [id,slot,selected] of attempts)await assert.rejects(()=>s.uploadVehiclePhoto(id,slot,1,selected,'owner'));
 const keys=s.calls.map(call=>uploadParams(call).get('requestId'));assert.equal(new Set(keys).size,attempts.length);
 s.auth.currentUser={uid:'other-owner'};await assert.rejects(()=>s.uploadVehiclePhoto('car','1',1,file(),'owner'),/account changed/);assert.equal(s.calls.length,4);
 await assert.rejects(()=>s.uploadVehiclePhoto('car','1',1,file(),'other-owner'));assert.ok(!keys.includes(uploadParams(s.calls[4]).get('requestId')));
});

test('only an explicit terminal server result releases an unresolved upload intent',async()=>{
 const s=setup();let terminal=false;s.respond(async()=>{const e=Error('Refresh first');e.code='api/failed-precondition';if(terminal)e.retryWithNewRequest=true;throw e;});
 await assert.rejects(()=>s.uploadVehiclePhoto('car','1',1,file(),'owner'));const original=uploadParams(s.calls[0]).get('requestId');
 terminal=true;await assert.rejects(()=>s.uploadVehiclePhoto('car','1',2,file(),'owner'));assert.equal(uploadParams(s.calls[1]).get('requestId'),original);assert.equal(uploadParams(s.calls[1]).get('version'),'1');
 await assert.rejects(()=>s.uploadVehiclePhoto('car','1',2,file(),'owner'));assert.notEqual(uploadParams(s.calls[2]).get('requestId'),original);assert.equal(uploadParams(s.calls[2]).get('version'),'2');
});

test('photo removal uses its displayed revision and retains its receipt key for a manual retry',async()=>{
 const s=setup();s.respond(async()=>{throw Error('Unknown outcome');});
 await assert.rejects(()=>s.removeVehiclePhoto('car',2,4,'owner'));const first=s.calls[0][1];
 assert.deepEqual({...first,requestId:undefined},{op:'remove',target:'vehicle',id:'car',slot:'2',version:4,requestId:undefined});
 s.respond(async()=>({ok:true}));await s.removeVehiclePhoto('car','2',4,'owner');assert.equal(s.calls[1][1].requestId,first.requestId);
 await s.removeVehiclePhoto('car','2',5,'owner');assert.notEqual(s.calls[2][1].requestId,first.requestId);
});

test('list and view carry an expected identity and reject stale-account responses',async()=>{
 const s=setup();s.respond(async()=>({items:[],version:0,canManage:true}));await s.listPhotos('vehicle','car','owner');
 assert.deepEqual(s.calls[0],['photos',{op:'list',target:'vehicle',id:'car'},{expectedUid:'owner'}]);
 s.respond(async()=>{s.auth.currentUser={uid:'other'};return {url:'https://example.invalid/signed'};});
 await assert.rejects(()=>s.viewPhoto('request','request','photo','owner'),/account changed/);
 assert.deepEqual(s.calls[1][1],{op:'view',target:'request',id:'request',photoId:'photo'});
 s.auth.currentUser=null;await assert.rejects(()=>s.listPhotos('vehicle','car'),/Sign in/);assert.equal(s.calls.length,2);
 const malformed=setup();malformed.respond(async()=>({items:null}));await assert.rejects(()=>malformed.listPhotos('vehicle','car'),/photo status/);
});

test('web uploads read local blobs, verify their size and send multipart metadata',async()=>{
 const selected={...file(),uri:'blob:local-photo'},blob={size:1024};
 const s=setup({platform:'web',fetchFile:async uri=>{assert.equal(uri,selected.uri);return {ok:true,blob:async()=>blob};}});
 await s.uploadVehiclePhoto('car/encoded','1',0,selected,'owner');assert.match(s.calls[0][0],/^photos\/vehicles\/car%2Fencoded\/1\?/);assert.deepEqual(s.calls[0][1].fields,[['file',blob,selected.name]]);
 const invalid=setup({platform:'web',fetchFile:async()=>({ok:true,blob:async()=>({size:5})})});
 await assert.rejects(()=>invalid.uploadVehiclePhoto('car','1',0,selected,'owner'),/changed/);assert.equal(invalid.calls.length,0);
 await assert.rejects(()=>invalid.uploadVehiclePhoto('car','1',0,file(),'owner'),/device/);
 const unavailable=setup({platform:'web',fetchFile:async()=>({ok:false})});await assert.rejects(()=>unavailable.uploadVehiclePhoto('car','1',0,selected,'owner'),/read/);assert.equal(unavailable.calls.length,0);
});

test('an account switch during a blob read or native response prevents delivery to another account',async()=>{
 let s;s=setup({platform:'web',fetchFile:async()=>({ok:true,blob:async()=>{s.auth.currentUser={uid:'other'};return {size:1024};}})});
 await assert.rejects(()=>s.uploadVehiclePhoto('car','1',0,{...file(),uri:'blob:local'},'owner'),/account changed/);assert.equal(s.calls.length,0);
 const native=setup();native.respond(async()=>{native.auth.currentUser={uid:'other'};return {ok:true};});await assert.rejects(()=>native.uploadVehiclePhoto('car','1',0,file(),'owner'),/account changed/);assert.equal(native.calls.length,1);
});

test('web vehicle uploads accept supported WebP data URLs and use the actual blob',async()=>{
 const blob={size:4,type:'image/webp'};const s=setup({platform:'web',fetchFile:async()=>({ok:true,blob:async()=>blob})});
 await s.uploadVehiclePhoto('car','1',0,{uri:'data:image/webp;base64,YWJjZA==',name:'test.webp',size:4,mimeType:'image/webp'},'owner');
 assert.deepEqual(s.calls[0][1].fields,[['file',blob,'test.webp']]);
});

test('request uploads use their own route, preserve uncertain retry identity and cannot become Garage uploads',async()=>{
 const s=setup();let uncertain=true;s.respond(async()=>{if(uncertain)throw Error('Synthetic lost acknowledgement');return {id:'request-asset'};});
 await assert.rejects(()=>s.uploadRequestPhoto('car',3,file(), 'owner'),/lost acknowledgement/);
 uncertain=false;await s.uploadRequestPhoto('car',4,file(), 'owner');
 assert.match(s.calls[0][0],/^photos\/requests\/car\?/);
 assert.equal(uploadParams(s.calls[0]).get('requestId'),uploadParams(s.calls[1]).get('requestId'));
 assert.equal(uploadParams(s.calls[1]).get('version'),'3');
 await s.uploadVehiclePhoto('car','1',4,file(),'owner');assert.match(s.calls[2][0],/^photos\/vehicles\/car\/1\?/);
 assert.notEqual(uploadParams(s.calls[2]).get('requestId'),uploadParams(s.calls[0]).get('requestId'));
 s.auth.currentUser={uid:'other'};await assert.rejects(()=>s.uploadRequestPhoto('car',4,file(),'owner'),/account changed/);
});
