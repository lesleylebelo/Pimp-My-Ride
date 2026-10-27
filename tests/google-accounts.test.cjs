const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core');

function setup({profile={role:'owner',fullName:'Existing',phone:'0821234567'},link=false,authorizationError,profileError,exchangeError,afterAuthorize,onPersist,wrongUid=false}={}){
 const calls=[],sessions=[],main={currentUser:null},owned={vehicles:{car:{ownerId:'original'}},requests:{r:{ownerId:'original'}},quotes:{q:{shopId:'original'}},bookings:{b:{ownerId:'original'}}};
 let saved=profile;
 const user={uid:'original',email:'owner@example.test',emailVerified:true,getIdToken:async()=>{calls.push('password-proof');return 'fresh-proof';}};
 const mocks={
  'react-native':{Platform:{OS:'web'}},
  '../../../shared/services/firebase':{firebase:()=>({auth:main}),withIsolatedAuth:async fn=>{const session={auth:{currentUser:null},db:{isolated:true}};sessions.push(session);try{return await fn(session);}finally{session.auth.currentUser=null;calls.push('cleanup');}}},
  '../../../shared/services/network':{requireConnection:async()=>{}},
  './loginCooldown':{guardedLogin:async fn=>fn()},
  '../utils/registration':{DOCUMENT_KEYS:[],fileError:()=>null},
  'firebase/auth':{
   signInWithCustomToken:async(auth,token)=>{assert.notEqual(auth,main);calls.push('firebase-google');auth.currentUser=user;return {user};},
   signInWithEmailAndPassword:async(auth,email,password)=>{assert.notEqual(auth,main);assert.equal(email,user.email);assert.equal(password,'existing-password');calls.push('password-login');auth.currentUser=user;return {user};},
   getIdTokenResult:async()=>({claims:{}}),
   updateCurrentUser:async(auth,u)=>{assert.equal(auth,main);calls.push('persist');await onPersist?.();main.currentUser={...u};},
   signOut:async auth=>{calls.push('sign-out');auth.currentUser=null;},
  },
  'firebase/firestore':{doc:(db,collection,uid)=>{assert.equal(db.isolated,true);assert.equal(uid,user.uid);return uid;},getDocFromServer:async()=>{calls.push('read-profile');return {exists:()=>!!saved,data:()=>saved};}},
  '../../../shared/services/api':{apiRequest:async(endpoint,data,options)=>{
   assert.equal(main.currentUser,null,'Persistent app must remain signed out while backend validates');assert.equal(options.expectedUid,user.uid);assert.equal(options.authClient.currentUser.uid,user.uid);
   if(endpoint==='profile'){
    calls.push('create-profile');if(profileError)throw profileError;assert.equal(saved,null);assert.equal(data.password,undefined);assert.equal(data.role==='admin',false);saved={...data,verificationStatus:data.role==='shop'?'pending':undefined};return {ok:true};
   }
   assert.equal(endpoint,'auth/google/authorize');calls.push('authorize');if(authorizationError)throw authorizationError;await afterAuthorize?.();return {uid:wrongUid?'other':user.uid};
  }},
 };
 const cache={};function load(file){if(cache[file])return cache[file];const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../src/features/auth/services',file+'.js'),'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;const mod={exports:{}};new Function('require','module','exports',code)(name=>{if(name==='./accounts')return load('accounts');if(mocks[name])return mocks[name];throw Error('Missing mock '+name);},mod,mod.exports);return cache[file]=mod.exports;}
 const service=load('googleAccounts');
 const controller=new AbortController();
 const args={credential:'signed',nonce:'nonce',signal:controller.signal,run:async fn=>{calls.push('run');return fn();},
  exchange:async data=>{assert.equal(main.currentUser,null);calls.push('exchange');if(exchangeError)throw exchangeError;if(link&&!data.proofToken)return {status:'link-required',email:user.email};if(link)assert.equal(data.proofToken,'fresh-proof');return {status:'authenticated',customToken:'firebase-custom',uid:user.uid};},
  askPassword:async()=>{calls.push('ask-password');return 'existing-password';},
  askProfile:async()=>{calls.push('ask-profile');return {role:'owner',form:{fullName:'New customer',phone:'0821234567',agreed:true}};},
 };
 return {...service,args,controller,calls,main,sessions,owned,getProfile:()=>saved};
}
test('new Google Customer and Workshop onboard in isolation and persist only after backend authorization',async()=>{
 for(const role of ['owner','shop']){
  const s=setup({profile:null});s.args.askProfile=async()=>({role,form:{fullName:'New user',phone:'0821234567',agreed:true,shopName:'Shop',regNumber:'R',address:'Road',city:'City',province:'Province',services:'Paint'}});
  const before=structuredClone(s.owned);await s.googleLogin(s.args);
  assert.equal(s.getProfile().role,role);if(role==='shop')assert.equal(s.getProfile().verificationStatus,'pending');
  assert.ok(s.calls.indexOf('create-profile')<s.calls.indexOf('authorize'));assert.ok(s.calls.indexOf('authorize')<s.calls.indexOf('persist'));
  assert.equal(s.main.currentUser.uid,'original');assert.equal(s.sessions[0].auth.currentUser,null);assert.deepEqual(s.owned,before);
 }
});
test('existing Google login does not create or overwrite a profile or owned records',async()=>{
 const s=setup(),before=structuredClone(s.owned),profile=structuredClone(s.getProfile());await s.googleLogin(s.args);
 assert.ok(!s.calls.includes('create-profile'));assert.deepEqual(s.getProfile(),profile);assert.deepEqual(s.owned,before);
 assert.deepEqual(s.calls,['exchange','firebase-google','read-profile','run','authorize','read-profile','persist','cleanup']);
});
test('email/password proof is temporary and explicit linking preserves the UID and profile',async()=>{
 const s=setup({link:true}),before=structuredClone(s.owned);await s.googleLogin(s.args);
 assert.deepEqual(s.calls.slice(0,6),['exchange','ask-password','password-login','password-proof','exchange','firebase-google']);
 assert.equal(s.main.currentUser.uid,'original');assert.equal(s.sessions.length,1);assert.ok(!s.calls.includes('create-profile'));assert.deepEqual(s.owned,before);
});
test('conflict and denied backend authorization never persist a session',async()=>{
 for(const options of [{exchangeError:Error('Google linked elsewhere')},{authorizationError:Error('Restricted')},{wrongUid:true},{profile:{role:'owner',fullName:'',phone:''}}]){
  const s=setup(options);await assert.rejects(()=>s.googleLogin(s.args));assert.equal(s.main.currentUser,null);assert.ok(!s.calls.includes('persist'));assert.equal(s.sessions[0].auth.currentUser,null);
 }
});
test('cancellation before exchange, during linking, onboarding and authorization always cleans up without persistence',async()=>{
 const cases=[
  s=>s.controller.abort(),
  s=>{s.args.exchange=async()=>({status:'link-required',email:'owner@example.test'});s.args.askPassword=async()=>{s.controller.abort();return 'existing-password';};},
  s=>{s.args.askProfile=async()=>{s.controller.abort();return {role:'owner',form:{}};};},
 ];
 for(let i=0;i<cases.length;i++){
  const s=setup(i===2?{profile:null}:{});cases[i](s);await assert.rejects(()=>s.googleLogin(s.args),{code:'auth/google-cancelled'});assert.equal(s.main.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);assert.ok(!s.calls.includes('persist'));
 }
 let s;s=setup({afterAuthorize:async()=>s.controller.abort()});await assert.rejects(()=>s.googleLogin(s.args),{code:'auth/google-cancelled'});assert.equal(s.main.currentUser,null);
});
test('failed Google onboarding retains the account, cleans temporary auth and allows retry',async()=>{
 const s=setup({profile:null,profileError:Error('Backend unavailable')});await assert.rejects(()=>s.googleLogin(s.args),/Backend unavailable/);
 assert.equal(s.main.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);assert.ok(!s.calls.includes('persist'));
 // There is deliberately no deleteUser dependency or ownership mutation in this flow.
 assert.equal(s.getProfile(),null);
});
test('cancelling while Firebase persists signs out before the operation can publish app access',async()=>{
 let release,entered;const waiting=new Promise(r=>{entered=r;});
 const s=setup({onPersist:async()=>{entered();await new Promise(r=>{release=r;});}});
 const attempt=s.googleLogin(s.args);await waiting;s.controller.abort();release();
 await assert.rejects(()=>attempt,{code:'auth/google-cancelled'});assert.equal(s.main.currentUser,null);assert.ok(s.calls.includes('sign-out'));assert.equal(s.sessions[0].auth.currentUser,null);
});
test('Google and existing email/password actions share the account operation lock',async()=>{
 const s=setup({link:true});let release,entered;const waiting=new Promise(r=>{entered=r;});
 s.args.askPassword=()=>{entered();return new Promise(r=>{release=r;});};
 const attempt=s.googleLogin(s.args);await waiting;
 await assert.rejects(()=>s.googleLogin(s.args),/Another account action/);release('existing-password');await attempt;
});
