const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),babel=require('@babel/core'),{loadUI}=require('./helpers/load-ui.cjs');
function client(platform='android'){
 const auth={currentUser:{uid:'first'}},calls=[],state={fail:false},photo=loadUI('src/features/marketplace/utils/photos.js');
 const mocks={'react-native':{Platform:{OS:platform}},'../../../shared/services/firebase':{firebase:()=>({auth})},'../../marketplace/utils/photos':photo,'../../../shared/services/api':{
  apiRequest:async(path,data,options)=>{calls.push({kind:'json',path,data,options});return state.reply?state.reply(data):{url:'https://private.example.invalid/photo',expiresAt:Date.now()+60000};},
  uploadRequest:async(path,body,options)=>{calls.push({kind:'upload',path,body,options});if(state.fail)throw Object.assign(Error('Synthetic outage'),{retryWithNewRequest:state.terminal});return {ok:true,version:1,photoId:'one'};},
 }};
 class Multipart{constructor(){this.fields=[];}append(...args){this.fields.push(args);}}
 const {code}=babel.transformSync(fs.readFileSync('src/features/auth/services/profilePhotos.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});const mod={exports:{}};
 new Function('require','module','exports','FormData','fetch',code)(name=>{assert.ok(name in mocks,name);return mocks[name];},mod,mod.exports,Multipart,async()=>({ok:true,blob:async()=>({size:3})}));
 return {...mod.exports,auth,calls,state,file:{uri:platform==='web'?'blob:one':'file:///one.jpg',mimeType:'image/jpeg',name:'one.jpg',size:3}};
}
for(const platform of ['ios','android','web'])test('profile upload uses existing authenticated multipart transport on '+platform,async()=>{
 const c=client(platform),progress=()=>{};await c.uploadProfilePhoto(c.file,0,'first',progress);assert.match(c.calls[0].path,/profile\/photos\/upload\?version=0&requestId=/);assert.equal(c.calls[0].options.expectedUid,'first');assert.equal(c.calls[0].options.onProgress,progress);assert.equal(c.calls[0].body.fields[0][0],'file');
});
test('ambiguous upload keeps the same retry key and original version after refresh; closed attempts get a fresh key',async()=>{
 const c=client();c.state.fail=true;await assert.rejects(()=>c.uploadProfilePhoto(c.file,0,'first'));await assert.rejects(()=>c.uploadProfilePhoto(c.file,4,'first'));assert.equal(c.calls[0].path,c.calls[1].path);
 c.state.terminal=true;await assert.rejects(()=>c.uploadProfilePhoto(c.file,4,'first'));c.state.fail=false;await c.uploadProfilePhoto(c.file,4,'first');assert.notEqual(c.calls[2].path,c.calls[3].path);assert.match(c.calls[3].path,/version=4/);
});
test('preview requests deduplicate, invalidate after changes and never cross accounts',async()=>{
 const c=client();await Promise.all([c.viewProfilePhoto('self',undefined,'first'),c.viewProfilePhoto('self',undefined,'first')]);assert.equal(c.calls.length,1);await c.viewProfilePhoto('self',undefined,'first');assert.equal(c.calls.length,1);
 c.invalidateProfilePhotos();await c.viewProfilePhoto('self',undefined,'first');assert.equal(c.calls.length,2);
 c.auth.currentUser={uid:'second'};await assert.rejects(()=>c.viewProfilePhoto('self',undefined,'first'));await c.viewProfilePhoto('self',undefined,'second');assert.equal(c.calls.length,3);assert.equal(c.calls[2].options.expectedUid,'second');await c.viewProfilePhoto('self',undefined,'second',2);assert.equal(c.calls.length,4);
});
test('malformed, remote and unsupported files are rejected before upload transport',async()=>{
 const c=client();for(const file of [{...c.file,uri:'https://remote.invalid/photo'},{...c.file,size:0},{...c.file,mimeType:'image/gif'},{...c.file,size:6*1024*1024}])await assert.rejects(()=>c.uploadProfilePhoto(file,0,'first'));assert.equal(c.calls.length,0);
});

test('re-entering a focused screen reuses valid previews, while same-UID new sessions clear cached URLs',async()=>{
 const c=client();await c.viewProfilePhoto('request','job','first',1);await c.viewProfilePhoto('request','job','first',1);assert.equal(c.calls.length,1);
 await c.viewProfilePhoto('request','job','first',1,true);assert.equal(c.calls.length,1);
 c.auth.currentUser={uid:'first'};await c.viewProfilePhoto('request','job','first',1);assert.equal(c.calls.length,2);
});

test('status reads coalesce and cache, then invalidate after a photo change',async()=>{
 const c=client();c.state.reply=()=>({version:0,photoId:null});
 await Promise.all(Array.from({length:10},()=>c.profilePhotoStatus('first')));
 await c.profilePhotoStatus('first');assert.equal(c.calls.length,1);
 c.invalidateProfilePhotos();await c.profilePhotoStatus('first');assert.equal(c.calls.length,2);
});

test('429 backs off every photo operation across contexts, refresh and invalidation until Retry-After',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const c=client(),error=Object.assign(Error('Wait'),{status:429,retryAt:Date.now()+120000});
 c.state.reply=()=>{throw error;};
 await assert.rejects(()=>c.viewProfilePhoto('shop','one','first'),{status:429});
 c.invalidateProfilePhotos();
 for(let i=0;i<5;i++){
  await assert.rejects(()=>c.viewProfilePhoto('shop','two','first',i,true),{status:429});
  await assert.rejects(()=>c.profilePhotoStatus('first'),{status:429});
  await assert.rejects(()=>c.removeProfilePhoto(0,'first'),{status:429});
  await assert.rejects(()=>c.uploadProfilePhoto(c.file,0,'first'),{status:429});
 }
 assert.equal(c.calls.length,1);t.mock.timers.tick(119999);
 await assert.rejects(()=>c.profilePhotoStatus('first'),{status:429});assert.equal(c.calls.length,1);
 c.state.reply=()=>({version:0});t.mock.timers.tick(1);
 assert.deepEqual(await c.profilePhotoStatus('first'),{version:0});assert.equal(c.calls.length,2);
});

test('failed reads briefly coalesce without timers, and cached missing photos survive navigation',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const c=client();c.state.reply=()=>{throw Error('Unavailable');};
 for(let i=0;i<10;i++)await assert.rejects(()=>c.viewProfilePhoto('post','one','first'),/Unavailable/);
 assert.equal(c.calls.length,1);t.mock.timers.tick(5000);
 c.state.reply=()=>({url:null,expiresAt:null});await c.viewProfilePhoto('post','one','first');
 t.mock.timers.tick(11000);await c.viewProfilePhoto('post','one','first',0,true);assert.equal(c.calls.length,2);
});
