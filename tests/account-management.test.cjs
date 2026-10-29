const {test}=require('node:test'),assert=require('node:assert/strict'),{loadUI}=require('./helpers/load-ui.cjs');
function setup(){
 const user={uid:'synthetic-owner',email:'current@synthetic.invalid',emailVerified:true},auth={currentUser:user},isolated={currentUser:null},calls=[];
 const state={respond:async(op)=>op==='status'?{accountStatus:'deactivated',job:{state:'completed'}}:{accepted:true},reauth:async()=>{},reset:0};
 const sdk={EmailAuthProvider:{credential:(email,password)=>({email,password})},reauthenticateWithCredential:async(u,credential)=>{calls.push(['reauth',u,credential]);await state.reauth();},getIdToken:async(u,force)=>{calls.push(['token',u,force]);return 'synthetic-token';},verifyBeforeUpdateEmail:async(u,email)=>calls.push(['verifyEmail',u,email]),updatePassword:async(u,value)=>calls.push(['password',u,value]),sendPasswordResetEmail:async(a,email)=>{calls.push(['reset',a,email]);},signInWithEmailAndPassword:async(a,email)=>{a.currentUser={uid:'isolated-owner',email,emailVerified:true};calls.push(['isolatedSignIn']);return {user:a.currentUser};},signOut:async a=>{calls.push(['signOut']);a.currentUser=null;}};
 const api=loadUI('src/features/auth/services/accountManagement.js',{
  'firebase/auth':sdk,'../../../shared/services/firebase':{firebase:()=>({auth})},'../../../shared/services/network':{requireConnection:async()=>{}},
  '../../../shared/services/api':{apiRequest:async(path,payload,options)=>{calls.push(['api',path,payload,options]);return state.respond(payload.op,payload,options);}},
  '../../../shared/offline/profileCache':{clearProfileCache:async uid=>calls.push(['clearCache',uid])},
  './loginCooldown':{guardedLogin:fn=>fn()},'./accounts':{isolatedAccountAction:async fn=>{assert.equal(auth.currentUser,null);try{return await fn({auth:isolated});}finally{isolated.currentUser=null;}}},
 });return {api,state,user,auth,isolated,calls};
}
test('secure email change reauthenticates and verifies the destination through Firebase without a backend email/password payload',async()=>{
 const s=setup();await s.api.changeEmail(' next@synthetic.invalid ','synthetic-current-password');
 assert.deepEqual(s.calls.map(call=>call[0]),['reauth','token','verifyEmail']);assert.equal(s.calls[2][2],'next@synthetic.invalid');assert.equal(s.auth.currentUser.email,'current@synthetic.invalid');
 await assert.rejects(()=>s.api.changeEmail('invalid','synthetic-current-password'),/valid email/);
 s.state.reauth=async()=>{throw Error('Reauthentication failed');};await assert.rejects(()=>s.api.changeEmail('another@synthetic.invalid','bad-password'),/Reauthentication failed/);
 assert.equal(s.calls.filter(call=>call[0]==='verifyEmail').length,1);
});
test('password change enforces current policy, reauthenticates, updates Firebase, signs out and clears offline cache',async()=>{
 const s=setup();await assert.rejects(()=>s.api.changePassword('synthetic-current-password','short'),/at least 12/);assert.equal(s.calls.length,0);
 await s.api.changePassword('synthetic-current-password','new-synthetic-password');assert.deepEqual(s.calls.map(call=>call[0]),['reauth','token','password','signOut','clearCache']);assert.equal(s.auth.currentUser,null);assert.equal(s.calls[4][1],'synthetic-owner');
});
test('reset links target only the authenticated identity and account changes invalidate security operations',async()=>{
 const s=setup();await s.api.resetOwnPassword();assert.equal(s.calls[0][2],'current@synthetic.invalid');
 s.state.reauth=async()=>{s.auth.currentUser={uid:'other'};};await assert.rejects(()=>s.api.changeEmail('next@synthetic.invalid','synthetic-password'),/account changed/);assert.ok(!s.calls.some(call=>call[0]==='verifyEmail'));
});
test('account API binds identity before requests and rejects late acknowledgements after a session change',async()=>{
 const s=setup();await s.api.accountApi('save',{fullName:'Synthetic Person',phone:'0821234567',version:0,requestId:'stable'});const call=s.calls.find(call=>call[0]==='api');assert.equal(call[1],'account');assert.equal(call[3].expectedUid,'synthetic-owner');assert.ok(!Object.hasOwn(call[2],'uid'));assert.ok(!Object.hasOwn(call[2],'password'));
 s.state.respond=async()=>{s.auth.currentUser={uid:'other'};return {accepted:true};};await assert.rejects(()=>s.api.accountApi('profile'),/account changed/);
});
test('recovery uses isolated Firebase authentication, never promotes a session and cannot restore an admin restriction',async()=>{
 const s=setup();s.auth.currentUser=null;await s.api.recoverAccount('current@synthetic.invalid','synthetic-password',true);assert.equal(s.auth.currentUser,null);assert.equal(s.isolated.currentUser,null);
 const requests=s.calls.filter(call=>call[0]==='api');assert.deepEqual(requests.map(call=>call[2].op),['status','reactivate']);assert.ok(requests.every(call=>call[3].expectedUid==='isolated-owner'&&call[3].authClient===s.isolated));
 s.state.respond=async()=>({accountStatus:'suspended',job:{state:'completed'}});await assert.rejects(()=>s.api.recoverAccount('current@synthetic.invalid','synthetic-password',true),/Only a completed self-deactivation/);
});
