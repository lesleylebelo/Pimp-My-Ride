const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),babel=require('@babel/core'),React=require('react'),Renderer=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({role='owner',verified=true,admin=false,cached=null}={}){
 let authListener,networkListener,appListener,profileListener,poll,context;
 const user={uid:'u1',email:'demo@example.com',emailVerified:verified};
 const auth={currentUser:user};let profile={role,verificationStatus:role==='shop'?'pending':undefined};
 let claims={admin};let reloadError=null;let nextVerified=verified;const cleared=[];let stopped=0;
 const app={currentState:'active',addEventListener:(_,fn)=>{appListener=fn;return {remove(){stopped++;}};}};
 const mocks={
 'react':React,'react/jsx-runtime':require('react/jsx-runtime'),
 'react-native':{AppState:app},'@react-native-community/netinfo':{addEventListener:fn=>{networkListener=fn;return()=>stopped++;}},
 'firebase/auth':{onAuthStateChanged:(_,fn)=>{authListener=fn;queueMicrotask(fn);return()=>stopped++;},reload:async()=>{if(reloadError)throw reloadError;user.emailVerified=nextVerified;},getIdTokenResult:async()=>({claims}),signOut:async()=>{auth.currentUser=null;authListener();}},
 'firebase/firestore':{doc:(...args)=>args,getDocFromServer:async()=>({data:()=>profile}),onSnapshot:(_,options,fn)=>{profileListener=fn;return()=>stopped++;}},
 '../../../shared/services/firebase':{configured:true,firebase:()=>({auth,db:{}})},
 '../../../shared/services/network':{isOffline:s=>s.isConnected===false,isNetworkError:e=>['app/offline','unavailable'].includes(e.code),requireConnection:async()=>{}},
 '../../../shared/offline/profileCache':{CACHE_AGE:86400000,readProfileCache:async()=>cached,saveProfileCache:async()=>{},clearProfileCache:async uid=>cleared.push(uid)},
 '../utils/authErrors':{authError:e=>e.message},
 };
 const {code}=babel.transformSync(fs.readFileSync('src/features/auth/context/AuthContext.js','utf8'),{configFile:false,babelrc:false,plugins:[[require.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const mod={exports:{}};new Function('require','module','exports','setInterval','clearInterval',code)(name=>{if(!mocks[name])throw Error(name);return mocks[name];},mod,mod.exports,fn=>{poll=fn;return 1;},()=>{});
 function Probe(){context=mod.exports.useAuth();return null;}
 let renderer;await Renderer.act(async()=>{renderer=Renderer.create(React.createElement(mod.exports.AuthProvider,null,React.createElement(Probe)));await flush();});
 const act=async fn=>Renderer.act(async()=>{await fn();await flush();});
 return {get state(){return context;},user,auth,cleared,act,
 verify:()=>{nextVerified=true;},poll:()=>poll(),offline:()=>networkListener({isConnected:false}),online:()=>networkListener({isConnected:true}),resume:()=>appListener('active'),
 profile:value=>{profile=value;},claims:value=>{claims=value;},fail:e=>{reloadError=e;},
 notify:()=>profileListener({metadata:{fromCache:false,hasPendingWrites:false}}),
 close:()=>act(()=>renderer.unmount()),get stopped(){return stopped;}};
}
test('verification automatically updates on polling and app foreground',async()=>{for(const method of ['poll','resume']){const s=await setup({verified:false});assert.equal(s.state.user.emailVerified,false);s.verify();await s.act(s[method]);assert.equal(s.state.user.emailVerified,true);await s.close();assert.ok(s.stopped>=3);}});
test('admin requires fresh claims and loses landing access offline',async()=>{const denied=await setup({role:'admin'});assert.equal(denied.state.profile,null);assert.match(denied.state.error,/authorization/);await denied.close();const s=await setup({role:'admin',admin:true});assert.equal(s.state.profile.role,'admin');await s.act(s.offline);assert.equal(s.state.profile,null);assert.equal(s.state.offline,true);await s.close();});
test('customer restores cached offline landing and clears it on logout',async()=>{const s=await setup({cached:{profile:{role:'owner'},savedAt:Date.now()}});await s.act(s.offline);assert.equal(s.state.profile.role,'owner');assert.ok(s.state.cachedAt);await s.act(()=>s.state.logout());assert.equal(s.state.user,null);assert.ok(s.cleared.includes('u1'));await s.close();});
test('unverified users cannot use an offline cache',async()=>{const s=await setup({verified:false,cached:{profile:{role:'owner'}}});await s.act(s.offline);assert.equal(s.state.profile,null);await s.close();});
test('reconnection revalidates shop approval instead of trusting cached approval',async()=>{const s=await setup({role:'shop',cached:{profile:{role:'shop',verificationStatus:'approved'},savedAt:Date.now()}});await s.act(s.offline);assert.equal(s.state.profile.verificationStatus,'approved');s.profile({role:'shop',verificationStatus:'rejected'});await s.act(s.online);assert.equal(s.state.profile.verificationStatus,'rejected');assert.equal(s.state.offline,false);await s.close();});
test('revoked session signs out and clears local cache',async()=>{const s=await setup();s.fail(Object.assign(new Error('revoked'),{code:'auth/user-token-expired'}));await s.act(s.resume);assert.equal(s.state.user,null);assert.ok(s.cleared.includes('u1'));await s.close();});
test('shop approval changes refresh automatically through the profile listener',async()=>{const s=await setup({role:'shop'});await s.act(s.notify);s.profile({role:'shop',verificationStatus:'approved'});await s.act(s.notify);assert.equal(s.state.profile.verificationStatus,'approved');await s.close();});
