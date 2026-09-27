const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),babel=require('@babel/core'),React=require('react'),Renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({role='owner',verified=true,admin=false,cached=null,initialOffline=false,signOutError=null,cacheClearError=null,refreshedVerified=verified}={}){
 let authListener,networkListener,appListener,profileListener,poll,context;
 const user={uid:'u1',email:'demo@example.com',emailVerified:verified};
 const auth={currentUser:user};let profile={role,verificationStatus:role==='shop'?'pending':undefined};
 let claims={admin};let reloadError=null;let nextVerified=refreshedVerified;const cleared=[],states=[];let stopped=0;
 const calls={reload:0,tokens:0,profile:0,cacheRead:0,cacheSave:0,signOut:0};
 const app={currentState:'active',addEventListener:(_,fn)=>{appListener=fn;return {remove(){stopped++;}};}};
 const mocks={
 '../../activity/sessionLifecycle':{endPresence:async()=>{}},
 'react':React,'react/jsx-runtime':require('react/jsx-runtime'),
 'react-native':{AppState:app},'@react-native-community/netinfo':{addEventListener:fn=>{networkListener=fn;if(initialOffline)fn({isConnected:false});return()=>stopped++;}},
 'firebase/auth':{onAuthStateChanged:(_,fn)=>{authListener=fn;queueMicrotask(fn);return()=>stopped++;},reload:async()=>{calls.reload++;if(reloadError)throw reloadError;auth.currentUser.emailVerified=nextVerified;},getIdTokenResult:async()=>{calls.tokens++;return {claims};},signOut:async()=>{calls.signOut++;if(signOutError)throw signOutError;auth.currentUser=null;authListener?.();}},
 'firebase/firestore':{doc:(...args)=>args,getDocFromServer:async()=>{calls.profile++;return {data:()=>profile};},onSnapshot:(_,options,fn)=>{profileListener=fn;return()=>stopped++;}},
 '../../../shared/services/firebase':{configured:true,firebase:()=>({auth,db:{}})},
 '../../../shared/services/network':{isOffline:s=>s.isConnected===false,isNetworkError:e=>['app/offline','unavailable'].includes(e.code),requireConnection:async()=>{}},
 '../../../shared/offline/profileCache':{CACHE_AGE:86400000,readProfileCache:async()=>{calls.cacheRead++;return cached;},saveProfileCache:async()=>{calls.cacheSave++;},clearProfileCache:async uid=>{cleared.push(uid);if(cacheClearError)throw cacheClearError;}},
 '../utils/authErrors':{authError:e=>e.message},
 };
 const {code}=babel.transformSync(fs.readFileSync('src/features/auth/context/AuthContext.js','utf8'),{configFile:false,babelrc:false,plugins:[[require.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const mod={exports:{}};new Function('require','module','exports','setInterval','clearInterval',code)(name=>{if(!mocks[name])throw Error(name);return mocks[name];},mod,mod.exports,fn=>{poll=fn;return 1;},()=>{});
 function Probe(){context=mod.exports.useAuth();states.push({user:context.user,profile:context.profile});return null;}
 let renderer;await Renderer.act(async()=>{renderer=Renderer.create(React.createElement(mod.exports.AuthProvider,null,React.createElement(Probe)));await flush();});
 const act=async fn=>Renderer.act(async()=>{await fn();await flush();});
 return {get state(){return context;},user,auth,cleared,states,calls,act,
 verify:()=>{nextVerified=true;},poll:()=>poll?.(),offline:()=>networkListener({isConnected:false}),online:()=>networkListener({isConnected:true}),resume:()=>appListener('active'),
 restore:restored=>{auth.currentUser=restored;authListener();},
 profile:value=>{profile=value;},claims:value=>{claims=value;},fail:e=>{reloadError=e;},
 notify:()=>profileListener({metadata:{fromCache:false,hasPendingWrites:false}}),
 close:()=>act(()=>renderer.unmount()),get stopped(){return stopped;}};
}
test('restored unverified sessions are signed out before any reload, token or profile read',async()=>{
 for(const role of ['owner','shop','admin']){
  const s=await setup({role,verified:false,cached:{profile:{role},savedAt:Date.now()}});
  assert.equal(s.auth.currentUser,null);assert.equal(s.state.user,null);assert.equal(s.state.profile,null);
  assert.match(s.state.error,/verify your email before signing in/i);assert.ok(s.cleared.includes('u1'));
  assert.equal(s.calls.reload,0);assert.equal(s.calls.tokens,0);assert.equal(s.calls.profile,0);assert.equal(s.calls.cacheRead,0);assert.equal(s.calls.cacheSave,0);
  assert.ok(s.states.every(value=>value.user===null&&value.profile===null));
  s.verify();await s.act(s.resume);await s.act(s.poll);assert.equal(s.state.user,null);assert.equal(s.calls.reload,0);
  await s.close();assert.ok(s.stopped>=3);
 }
});
test('reopening offline discards an unverified session without trusting a saved landing profile',async()=>{
 for(const cached of [null,{profile:{role:'owner'},savedAt:Date.now()},{profile:{role:'shop',verificationStatus:'approved'},savedAt:1}]){
  const s=await setup({verified:false,initialOffline:true,cached});
  assert.equal(s.auth.currentUser,null);assert.equal(s.state.user,null);assert.equal(s.state.profile,null);assert.equal(s.state.offline,true);
  assert.equal(s.calls.reload,0);assert.equal(s.calls.tokens,0);assert.equal(s.calls.profile,0);assert.equal(s.calls.cacheRead,0);assert.ok(s.cleared.includes('u1'));
  await s.act(s.online);assert.equal(s.state.user,null);assert.equal(s.calls.reload,0);await s.close();
 }
});
test('sign-out or cache cleanup failure cannot expose or later promote an unverified session',async()=>{
 for(const initialOffline of [false,true]){
  const s=await setup({verified:false,initialOffline,cached:{profile:{role:'owner'},savedAt:Date.now()},signOutError:Error('Synthetic storage failure'),cacheClearError:Error('Synthetic cache failure')});
  assert.equal(s.auth.currentUser,s.user);assert.equal(s.state.user,null);assert.equal(s.state.profile,null);assert.equal(s.state.initializing,false);
  assert.match(s.state.error,/verify your email before signing in/i);
  s.verify();s.user.emailVerified=true;await s.act(s.resume);await s.act(s.online);
  assert.equal(s.state.user,null);assert.equal(s.state.profile,null);assert.equal(s.calls.reload,0);assert.equal(s.calls.profile,0);assert.equal(s.calls.cacheRead,0);
  assert.ok(s.calls.signOut>=2);assert.ok(s.states.every(value=>value.user===null&&value.profile===null));await s.close();
 }
});
test('reload that discovers an unverified email signs out before profile or token access',async()=>{
 const s=await setup({verified:true,refreshedVerified:false,cached:{profile:{role:'owner'},savedAt:Date.now()}});
 assert.equal(s.calls.reload,1);assert.equal(s.calls.tokens,0);assert.equal(s.calls.profile,0);assert.equal(s.auth.currentUser,null);
 assert.equal(s.state.user,null);assert.equal(s.state.profile,null);assert.ok(s.cleared.includes('u1'));
 assert.ok(s.states.every(value=>value.user===null&&value.profile===null));await s.close();
});
test('a later verified sign-in can enter after the old unverified session has been cleared',async()=>{
 const s=await setup({verified:false});s.verify();await s.act(()=>s.restore({...s.user,emailVerified:true}));
 assert.equal(s.state.user.emailVerified,true);assert.equal(s.state.profile.role,'owner');assert.equal(s.state.error,'');await s.close();
});
test('admin requires fresh claims and loses landing access offline',async()=>{const denied=await setup({role:'admin'});assert.equal(denied.state.profile,null);assert.match(denied.state.error,/authorization/);await denied.close();const s=await setup({role:'admin',admin:true});assert.equal(s.state.profile.role,'admin');await s.act(s.offline);assert.equal(s.state.profile,null);assert.equal(s.state.offline,true);await s.close();});
test('customer restores cached offline landing and clears it on logout',async()=>{const s=await setup({cached:{profile:{role:'owner'},savedAt:Date.now()}});await s.act(s.offline);assert.equal(s.state.profile.role,'owner');assert.ok(s.state.cachedAt);await s.act(()=>s.state.logout());assert.equal(s.state.user,null);assert.ok(s.cleared.includes('u1'));await s.close();});
test('unverified users cannot use an offline cache',async()=>{const s=await setup({verified:false,cached:{profile:{role:'owner'}}});await s.act(s.offline);assert.equal(s.state.profile,null);await s.close();});
test('reconnection revalidates shop approval instead of trusting cached approval',async()=>{const s=await setup({role:'shop',cached:{profile:{role:'shop',verificationStatus:'approved'},savedAt:Date.now()}});await s.act(s.offline);assert.equal(s.state.profile.verificationStatus,'approved');s.profile({role:'shop',verificationStatus:'rejected'});await s.act(s.online);assert.equal(s.state.profile.verificationStatus,'rejected');assert.equal(s.state.offline,false);await s.close();});
test('revoked session signs out and clears local cache',async()=>{const s=await setup();s.fail(Object.assign(new Error('revoked'),{code:'auth/user-token-expired'}));await s.act(s.resume);assert.equal(s.state.user,null);assert.ok(s.cleared.includes('u1'));await s.close();});
test('shop approval changes refresh automatically through the profile listener',async()=>{const s=await setup({role:'shop'});await s.act(s.notify);s.profile({role:'shop',verificationStatus:'approved'});await s.act(s.notify);assert.equal(s.state.profile.verificationStatus,'approved');await s.close();});
