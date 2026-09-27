const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),babel=require('@babel/core');
function setup(profile,claims={},options={}) {
 if(profile)profile={fullName:'Demo User',phone:'0821234567',...profile};
 const calls=[],sessions=[];const user={uid:'u1',email:'demo@example.com',emailVerified:options.existingVerified!==false};const instance={auth:{currentUser:null},db:{main:true}};
 const checkIsolated=auth=>{assert.notEqual(auth,instance.auth,'Credentials must never authenticate the persistent app before verification.');assert.ok(sessions.some(session=>session.auth===auth));};
 const signOut=async auth=>{checkIsolated(auth);calls.push(['logout']);auth.currentUser=null;};
 const mocks={
 'react-native':{Platform:{OS:'android'}},
 '../../../shared/services/api':{apiRequest:async(path,data,requestOptions)=>{calls.push(['profile',data,requestOptions]);assert.equal(path,'profile');checkIsolated(requestOptions.authClient);assert.equal(requestOptions.expectedUid,user.uid);assert.equal(requestOptions.authClient.currentUser.uid,user.uid);if(options.onProfile)await options.onProfile();if(options.profileError)throw options.profileError;}},
 './loginCooldown':{guardedLogin:async fn=>fn()},
 '../../../shared/services/network':{requireConnection:async()=>{if(options.connectionError)throw options.connectionError;}},
 'firebase/auth':{
  signInWithEmailAndPassword:async(auth,email)=>{checkIsolated(auth);calls.push(['login',email]);if(options.loginError)throw options.loginError;auth.currentUser=user;return {user};},
  signOut,getIdTokenResult:async()=>{calls.push(['claims']);if(options.onClaims)await options.onClaims();return {claims};},
  updateCurrentUser:async(auth,verifiedUser)=>{assert.equal(auth,instance.auth);assert.equal(verifiedUser.emailVerified,true);calls.push(['promote']);if(options.promotionError)throw options.promotionError;auth.currentUser={...verifiedUser};},
  createUserWithEmailAndPassword:async auth=>{checkIsolated(auth);calls.push(['create']);if(options.createError)throw options.createError;auth.currentUser={...user,emailVerified:false};if(options.onCreate)await options.onCreate();return {user:auth.currentUser};},
  deleteUser:async()=>{calls.push(['delete']);if(options.deleteError)throw options.deleteError;},
  sendEmailVerification:async()=>{calls.push(['verify']);if(options.onVerify)await options.onVerify();if(options.verificationError)throw options.verificationError;}},
 'firebase/firestore':{doc:(...args)=>args,getDocFromServer:async([db])=>{assert.notEqual(db,instance.db,'Account validation must use the transient user identity.');assert.ok(sessions.some(session=>session.db===db));calls.push(['read-profile']);if(options.onReadProfile)await options.onReadProfile();return {exists:()=>!!profile,data:()=>profile};}},
  '../../../shared/services/firebase':{firebase:()=>instance,withIsolatedAuth:async operation=>{const session={auth:{currentUser:null},db:{isolated:true}};sessions.push(session);try{return await operation(session);}finally{await signOut(session.auth);}}},
 '../utils/registration':{DOCUMENT_KEYS:['cipcCert','proofOfAddress','ownerId'],fileError:()=> 'Choose a document.'}
 };
 const code=babel.transformSync(fs.readFileSync(path.resolve(__dirname,'../src/features/auth/services/accounts.js'),'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports',code)(name=>{if(!mocks[name])throw Error(name);return mocks[name];},mod,mod.exports);
 return {...mod.exports,calls,auth:instance.auth,sessions};
}
test('one sign-in works for owner and shop without a role argument',async()=>{for(const role of ['owner','shop']){const s=setup({role});assert.equal((await s.login(' demo@example.com ','password')).uid,'u1');assert.equal(s.calls[0][1],'demo@example.com');}});
test('unverified users cannot establish a persistent login session or fetch a profile',async()=>{const s=setup({role:'owner'},{},{existingVerified:false});await assert.rejects(()=>s.login('demo@example.com','password'),{code:'auth/email-not-verified'});assert.ok(s.calls.some(c=>c[0]==='logout'));assert.ok(!s.calls.some(c=>['read-profile','promote'].includes(c[0])));assert.equal(s.auth.currentUser,null);});
test('invalid stored role is rejected and signs out',async()=>{const s=setup({role:'root'});await assert.rejects(()=>s.login('demo@example.com','password'),/unavailable/);assert.ok(s.calls.some(c=>c[0]==='logout'));});
test('admin requires both profile role and trusted claim',async()=>{const denied=setup({role:'admin'});await assert.rejects(()=>denied.login('demo@example.com','password','admin'),/administrator access/);assert.ok(denied.calls.some(c=>c[0]==='logout'));const allowed=setup({role:'admin'},{admin:true});assert.equal((await allowed.login('demo@example.com','password','admin')).uid,'u1');});
test('admin self-registration is rejected before account creation',async()=>{const s=setup(null);await assert.rejects(()=>s.register({},'admin'),/cannot register/);assert.equal(s.calls.length,0);});
test('auth account creation failures do not attempt to save a profile',async()=>{const s=setup(null,{}, {createError:Object.assign(new Error('Choose a stronger password.'),{code:'auth/weak-password'})});await assert.rejects(()=>s.register({email:'demo@example.com',password:'password'},'owner'),/Choose a stronger password/);assert.ok(!s.calls.some(c=>c[0]==='profile'));});
test('existing complete account is not changed and tells the user to sign in',async()=>{const s=setup({role:'owner',fullName:'Existing name'}, {}, {createError:Object.assign(new Error('exists'),{code:'auth/email-already-in-use'})});await assert.rejects(()=>s.register({fullName:'New name',phone:'0821111111',email:'demo@example.com',password:'secret',agreed:true},'owner'),/already exists\. Sign in to continue/);assert.ok(s.calls.some(c=>c[0]==='logout'));assert.ok(!s.calls.some(c=>c[0]==='profile'));assert.ok(!s.calls.some(c=>c[0]==='verify'));});
test('duplicate auth account left without a profile is completed, emailed and signed out',async()=>{const s=setup(null,{}, {createError:Object.assign(new Error('exists'),{code:'auth/email-already-in-use'}),existingVerified:false});await s.register({fullName:'Recovered owner',phone:'0821234567',email:'demo@example.com',password:'secret',agreed:true},'owner');const data=s.calls.find(c=>c[0]==='profile')[1];assert.equal(data.fullName,'Recovered owner');assert.equal(data.phone,'0821234567');assert.ok(s.calls.some(c=>c[0]==='verify'));assert.deepEqual(s.calls.slice(-2).map(c=>c[0]),['verify','logout']);assert.equal(s.auth.currentUser,null);});
test('duplicate auth account with wrong password is not signed in or repaired',async()=>{const s=setup(null,{}, {createError:Object.assign(new Error('exists'),{code:'auth/email-already-in-use'}),loginError:Object.assign(new Error('bad'),{code:'auth/invalid-credential'})});await assert.rejects(()=>s.register({fullName:'Recovered owner',phone:'0821234567',email:'demo@example.com',password:'wrong',agreed:true},'owner'),/already exists.*Sign in/);assert.ok(!s.calls.some(c=>c[0]==='profile'));});
test('new owner sends consent without passwords, then signs out pending email verification',async()=>{const s=setup(null);await s.register({fullName:' Demo ',phone:'0821234567',email:'demo@example.com',password:'secret',agreed:true},'owner');const data=s.calls.find(c=>c[0]==='profile')[1];assert.equal(data.fullName,'Demo');assert.equal(data.role,'owner');assert.equal(data.agreed,true);assert.equal(data.termsVersion,'academic-v2');assert.equal(data.password,undefined);assert.ok(s.calls.some(c=>c[0]==='verify'));assert.deepEqual(s.calls.slice(-2).map(c=>c[0]),['verify','logout']);assert.equal(s.auth.currentUser,null);});
test('shop registration saves account identity and shop details before sending verification and signing out',async()=>{const s=setup(null);await s.register({fullName:' Shop Owner ',phone:'+27 82 123 4567',email:'shop@example.com',password:'secret',agreed:true,shopName:'Demo Shop',regNumber:'REG-1',address:'1 Main Road',city:'Pretoria',province:'Gauteng',services:'Paint'},'shop');const data=s.calls.find(c=>c[0]==='profile')[1];assert.equal(data.fullName,'Shop Owner');assert.equal(data.phone,'+27821234567');assert.equal(data.role,'shop');assert.equal(data.shop.shopName,'Demo Shop');assert.equal(data.verificationStatus,'pending');assert.ok(s.calls.findIndex(c=>c[0]==='profile')<s.calls.findIndex(c=>c[0]==='verify'));assert.deepEqual(s.calls.slice(-2).map(c=>c[0]),['verify','logout']);assert.equal(s.auth.currentUser,null);});
test('profile persistence failure rolls back the new auth account and is surfaced',async()=>{const failure=Object.assign(new Error('Profile service unavailable.'),{code:'api/network-request-failed'}),s=setup(null,{}, {profileError:failure});await assert.rejects(()=>s.register({fullName:'Demo',phone:'0821234567',email:'demo@example.com',password:'secret',agreed:true},'owner'),/Profile service unavailable/);assert.ok(s.calls.some(c=>c[0]==='delete'));assert.ok(!s.calls.some(c=>c[0]==='verify'));});
test('verification email failure preserves the completed account and leaves the app signed out',async()=>{const s=setup(null,{}, {verificationError:Object.assign(new Error('Private mail transport details.'),{code:'auth/network-request-failed'})});await assert.rejects(()=>s.register({fullName:'Demo',phone:'0821234567',email:'demo@example.com',password:'secret',agreed:true},'owner'),error=>{assert.equal(error.code,'auth/verification-email-failed');assert.match(error.message,/profile were created.*couldn't send/);assert.doesNotMatch(error.message,/Private mail transport/);return true;});assert.ok(s.calls.some(c=>c[0]==='profile'));assert.ok(!s.calls.some(c=>c[0]==='delete'));assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);});
test('missing account profiles cannot sign in or route users into profile setup',async()=>{const s=setup(null);await assert.rejects(()=>s.login('demo@example.com','password'),/profile was not saved.*contact support/i);assert.ok(s.calls.some(c=>c[0]==='logout'));});
test('incomplete account profiles fail closed',async()=>{const s=setup({role:'owner',fullName:'',phone:''});await assert.rejects(()=>s.login('demo@example.com','password'),/profile is incomplete or damaged/i);assert.ok(s.calls.some(c=>c[0]==='logout'));});
test('invalid document set cannot trigger uploads',async()=>{const s=setup({role:'shop'});await assert.rejects(()=>s.uploadDocuments({}),/Choose a document/);assert.ok(!s.calls.some(c=>c[0]==='upload'));});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const ownerForm={fullName:'Demo User',phone:'0821234567',email:'demo@example.com',password:'secret',agreed:true};

test('signup never exposes an app session while creation, profile saving or email delivery are pending',async()=>{
 for(const stage of ['onCreate','onProfile','onVerify']){
  const entered=deferred(),finish=deferred();
  const s=setup(null,{}, {[stage]:async()=>{entered.resolve();await finish.promise;}});
  const registration=s.register(ownerForm,'owner');
  await entered.promise;
  assert.equal(s.auth.currentUser,null,stage);
  assert.equal(s.sessions[0].auth.currentUser.emailVerified,false,stage);
  assert.ok(!s.calls.some(c=>c[0]==='promote'));
  finish.resolve();await registration;
  assert.equal(s.auth.currentUser,null);
  assert.equal(s.sessions[0].auth.currentUser,null);
 }
});

test('verified users enter the persistent session only after server profile and admin claim validation',async()=>{
 for(const stage of ['onReadProfile','onClaims']){
  const entered=deferred(),finish=deferred();
  const s=setup({role:'admin'},{admin:true},{[stage]:async()=>{entered.resolve();await finish.promise;}});
  const login=s.login('demo@example.com','password');await entered.promise;
  assert.equal(s.auth.currentUser,null);assert.ok(!s.calls.some(c=>c[0]==='promote'));
  finish.resolve();const result=await login;
  assert.equal(result,s.auth.currentUser);assert.equal(result.emailVerified,true);
  assert.deepEqual(s.calls.map(c=>c[0]),['login','read-profile','claims','promote','logout']);
  assert.equal(s.sessions[0].auth.currentUser,null);
 }
});

test('suspended and archived profiles never enter the persistent session',async()=>{
 for(const accountStatus of ['suspended','archived']){
  const s=setup({role:'owner',accountStatus});
  await assert.rejects(()=>s.login('demo@example.com','password'),/restricted/);
  assert.equal(s.auth.currentUser,null);assert.ok(!s.calls.some(c=>c[0]==='promote'));
  assert.equal(s.sessions[0].auth.currentUser,null);
 }
});

test('promotion failures clean up the transient session without claiming successful sign-in',async()=>{
 const error=new Error('Session storage failed.'),s=setup({role:'owner'},{},{promotionError:error});
 await assert.rejects(()=>s.login('demo@example.com','password'),error);
 assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);
});

test('profile rollback failure still leaves the main and temporary sessions signed out',async()=>{
 const s=setup(null,{}, {profileError:new Error('Profile unavailable'),deleteError:new Error('Delete unavailable')});
 await assert.rejects(()=>s.register(ownerForm,'owner'),{code:'auth/profile-rollback-failed'});
 assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);
 assert.ok(!s.calls.some(c=>['verify','promote'].includes(c[0])));
});

test('resending an unverified account email never signs into the app or reads profile data',async()=>{
 const entered=deferred(),finish=deferred(),s=setup({role:'owner'},{},{existingVerified:false,onVerify:async()=>{entered.resolve();await finish.promise;}});
 const resend=s.resendVerification(' demo@example.com ','password');await entered.promise;
 assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser.emailVerified,false);
 finish.resolve();await resend;
 assert.deepEqual(s.calls.map(c=>c[0]),['login','verify','logout']);
 assert.equal(s.calls[0][1],'demo@example.com');assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);
});

test('resend rejects wrong credentials and already verified accounts without granting app access',async()=>{
 const cases=[{options:{loginError:Object.assign(new Error('Incorrect credentials.'),{code:'auth/invalid-credential'})},code:'auth/invalid-credential'},
 {options:{},code:'auth/email-already-verified'}];
 for(const {options,code} of cases){
  const s=setup({role:'owner'},{},options);await assert.rejects(()=>s.resendVerification('demo@example.com','password'),{code});
  assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);assert.ok(!s.calls.some(c=>['verify','promote','read-profile'].includes(c[0])));
 }
});

test('resend mail errors close the transient session and leave the operation available for retry',async()=>{
 const options={existingVerified:false,verificationError:new Error('Mail unavailable')},s=setup({role:'owner'},{},options);
 await assert.rejects(()=>s.resendVerification('demo@example.com','password'),/Mail unavailable/);
 assert.equal(s.auth.currentUser,null);assert.equal(s.sessions[0].auth.currentUser,null);
 options.verificationError=null;await s.resendVerification('demo@example.com','password');
 assert.equal(s.sessions.length,2);assert.equal(s.sessions[1].auth.currentUser,null);
});

test('login, registration and resend cannot overlap an unfinished account operation',async()=>{
 const entered=deferred(),finish=deferred(),s=setup(null,{}, {onVerify:async()=>{entered.resolve();await finish.promise;}});
 const registration=s.register(ownerForm,'owner');await entered.promise;
 for(const action of [()=>s.login('demo@example.com','password'),()=>s.register(ownerForm,'owner'),()=>s.resendVerification('demo@example.com','password')]){
  await assert.rejects(action,/Another account action is in progress/);
 }
 assert.equal(s.sessions.length,1);assert.equal(s.auth.currentUser,null);
 finish.resolve();await registration;
 await assert.rejects(()=>s.resendVerification('demo@example.com','password'),{code:'auth/email-already-verified'});
 assert.equal(s.sessions.length,2);
});

test('offline account operations fail before creating a transient or persistent session',async()=>{
 const s=setup(null,{}, {connectionError:new Error('A connection is required.')});
 for(const action of [()=>s.login('demo@example.com','password'),()=>s.register(ownerForm,'owner'),()=>s.resendVerification('demo@example.com','password')])await assert.rejects(action,/connection is required/);
 assert.equal(s.sessions.length,0);assert.equal(s.auth.currentUser,null);assert.deepEqual(s.calls,[]);
});

test('an existing app session is never overwritten by another account operation',async()=>{
 const s=setup({role:'owner'}),existing={uid:'existing-verified',emailVerified:true};s.auth.currentUser=existing;
 for(const action of [()=>s.login('demo@example.com','password'),()=>s.register(ownerForm,'owner'),()=>s.resendVerification('demo@example.com','password')])await assert.rejects(action,/Sign out before/);
 assert.equal(s.auth.currentUser,existing);assert.equal(s.sessions.length,0);assert.deepEqual(s.calls,[]);
});
