const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core');
const {createHash,randomBytes}=require('node:crypto');
function setup({response={type:'success',data:{idToken:'signed-google-id-token'}},error,unavailable=false,playError,cleanupError,onPick,configured=true}={}){
 const calls=[],controller=new AbortController();
 const sdk={configure:options=>calls.push(['configure',options]),checkPlayServices:async()=>{calls.push(['play']);if(playError)throw playError;},presentExplicitSignIn:async()=>{calls.push(['picker']);await onPick?.();if(error)throw error;return response;},signOut:async()=>{calls.push(['cleanup']);if(cleanupError)throw Error('cleanup');}};
 const mocks={
  './googleAccounts':{cancelled:()=>Object.assign(Error('cancelled'),{code:'auth/google-cancelled'}),assertGoogleActive:signal=>{if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'auth/google-cancelled'});},exchangeGoogle:(...args)=>{calls.push(['exchange',...args]);return 'exchange';}},
  'react-native-nitro-google-signin':{GoogleOneTapSignIn:sdk},
  'expo-crypto':{getRandomBytesAsync:async count=>randomBytes(count),CryptoDigestAlgorithm:{SHA256:'SHA-256'},digestStringAsync:async(_,raw)=>createHash('sha256').update(raw).digest('hex')},
 };
 const source=fs.readFileSync(path.join(__dirname,'../src/features/auth/services/googleIdentity.android.js'),'utf8');
 const {code}=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const mod={exports:{}};new Function('require','module','exports','process',code)(name=>{if(name==='react-native-nitro-google-signin'&&unavailable)throw Error('Native object missing');assert.ok(mocks[name],name);return mocks[name];},mod,mod.exports,{env:{EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:configured?'existing-web.apps.googleusercontent.com':''}});
 return {...mod.exports,calls,controller,sdk};
}
test('Android picker requests the existing Web audience and a fresh nonce, then clears Google cache before returning',async()=>{
 const s=setup(),first=await s.acquireAndroidGoogle(s.controller.signal),second=await s.acquireAndroidGoogle(s.controller.signal);
 assert.equal(first.credential,'signed-google-id-token');assert.match(first.nonce,/^[a-f0-9]{64}$/);assert.notEqual(first.nonce,second.nonce);
 assert.deepEqual(s.calls[0][1],{webClientId:'existing-web.apps.googleusercontent.com',nonce:first.nonce,offlineAccess:false,autoSelectOnSignIn:false});
 assert.deepEqual(s.calls.slice(0,4).map(c=>c[0]),['configure','play','picker','cleanup']);
});
test('Android cancellation and aborted account selection return no credential and clear SDK state',async()=>{
 for(const options of [{response:{type:'cancelled'}},{error:{code:'SIGN_IN_CANCELLED'}}]){
  const s=setup(options);await assert.rejects(()=>s.acquireAndroidGoogle(s.controller.signal),{code:'auth/google-cancelled'});assert.equal(s.calls.at(-1)[0],'cleanup');
 }
 let s;s=setup({onPick:async()=>s.controller.abort()});await assert.rejects(()=>s.acquireAndroidGoogle(s.controller.signal),{code:'auth/google-cancelled'});assert.equal(s.calls.at(-1)[0],'cleanup');
});
test('native build, Play Services, network and OAuth configuration failures are clear and do not exchange tokens',async()=>{
 for(const [options,message] of [[{unavailable:true},/new Android/],[{configured:false},/existing Web client/],[{playError:{code:'PLAY_SERVICES_NOT_AVAILABLE'}},/Play Services/],[{error:{code:'NETWORK_ERROR'}},/internet connection/],[{error:{code:'DEVELOPER_ERROR'}},/signing SHA-1/],[{error:{code:10}},/could not complete/],[{response:{type:'noSavedCredentialFound'}},/No Google account/],[{response:{type:'success',data:{}}},/could not complete/],[{cleanupError:true},/cleanup failed/]]){
  const s=setup(options);await assert.rejects(()=>s.acquireAndroidGoogle(s.controller.signal),message);assert.ok(!s.calls.some(c=>c[0]==='exchange'));
 }
});
test('overlapping account pickers cannot reconfigure the nonce and next account selection works after cleanup',async()=>{
 let entered,release;const waiting=new Promise(r=>{entered=r;});const s=setup({onPick:async()=>{entered();await new Promise(r=>{release=r;});}});
 const first=s.acquireAndroidGoogle(s.controller.signal);await waiting;await assert.rejects(()=>s.acquireAndroidGoogle(s.controller.signal),/in progress/);release();await first;
 s.sdk.presentExplicitSignIn=async()=>({type:'success',data:{idToken:'other-account'}});
 assert.equal((await s.acquireAndroidGoogle(s.controller.signal)).credential,'other-account');
});
test('native exchange selects the Android path without changing the Google credential or nonce',async()=>{
 const s=setup(),payload={credential:'signed-google',nonce:'n'.repeat(64)};
 assert.equal(await s.exchangeAndroidGoogle(payload,s.controller.signal),'exchange');assert.deepEqual(s.calls,[['exchange',payload,s.controller.signal,{android:true}]]);
});
