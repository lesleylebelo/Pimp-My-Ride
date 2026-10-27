const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createGoogleAuth}=require('../google-auth.cjs');
const {createApp}=require('../app.cjs');
const {createServices}=require('../services.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
const NOW=Date.now(),seconds=Math.floor(NOW/1000),nonce='n'.repeat(64),clientId='synthetic.apps.googleusercontent.com';
const missing=()=>Object.assign(Error('missing'),{code:'auth/user-not-found'});
function setup({existing=false,linked=false,profile,identity={},proof={},disabled=false,verified=true}={}){
 const users=new Map(),calls=[],db=memoryDb(profile?{'users/original':profile,'vehicles/car':{ownerId:'original'},'bookings/b':{ownerId:'original'}}:{});
 if(existing)users.set('original',{uid:'original',email:'owner@example.test',emailVerified:verified,disabled,providerData:linked?[{providerId:'google.com',uid:'subject'}]:[{providerId:'password',uid:'owner@example.test'}],passwordHash:'unchanged-hash',customClaims:{},metadata:{creationTime:'2020-01-01T00:00:00Z'},tokensValidAfterTime:'2020-01-01T00:00:00Z'});
 const auth={
  getUser:async uid=>{if(!users.has(uid))throw missing();return users.get(uid);},
  getUserByEmail:async email=>{const u=[...users.values()].find(u=>u.email===email);if(!u)throw missing();return u;},
  getUserByProviderUid:async(provider,uid)=>{const u=[...users.values()].find(u=>u.providerData.some(p=>p.providerId===provider&&p.uid===uid));if(!u)throw missing();return u;},
  createUser:async fields=>{calls.push(['create',fields]);if([...users.values()].some(u=>u.email===fields.email))throw Object.assign(Error('exists'),{code:'auth/email-already-exists'});const user={...fields,disabled:false,providerData:[],metadata:{creationTime:'2020-01-01T00:00:00Z'},tokensValidAfterTime:'2020-01-01T00:00:00Z'};users.set(user.uid,user);return user;},
  updateUser:async(uid,fields)=>{calls.push(['link',uid,fields]);assert.deepEqual(Object.keys(fields),['providerToLink']);const u=await auth.getUser(uid);u.providerData=[...u.providerData.filter(p=>p.providerId!==fields.providerToLink.providerId),fields.providerToLink];return u;},
  verifyIdToken:async(token,revoked)=>{calls.push(['verify',token,revoked]);if(token!=='password-proof')throw Error('invalid');return {uid:'original',email_verified:true,auth_time:seconds,firebase:{sign_in_provider:'password'},...proof};},
  createCustomToken:async uid=>{calls.push(['token',uid]);return 'custom:'+uid;},
 };
 const claims={iss:'https://accounts.google.com',aud:clientId,sub:'subject',email:'owner@example.test',email_verified:true,nonce,iat:seconds,exp:seconds+3600,...identity};
 const exchange=createGoogleAuth({auth,db,clientId,verifyGoogle:async credential=>{if(credential!=='signed-google')throw Error('bad signature');return claims;},now:()=>NOW});
 return {auth,db,users,calls,claims,exchange,input:{credential:'signed-google',nonce},services:createServices({auth,db,storage:{}})};
}
test('new Google customer and workshop reuse backend profile creation; workshops remain pending',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(),result=await s.exchange(s.input),uid=result.uid;
  assert.equal(result.status,'authenticated');assert.equal(s.calls.filter(c=>c[0]==='create').length,1);
  assert.equal(s.db.rows.has('users/'+uid),false);
  const auth={uid,token:{email_verified:true,auth_time:seconds}};
  const data={role,fullName:'New user',phone:'0821234567',agreed:true,termsVersion:'academic-v2',verificationStatus:'approved',admin:true,
   shop:{shopName:'Shop',regNumber:'R',address:'Street',city:'City',province:'Province',services:'Paint'}};
  await s.services.completeProfile({auth,data});
  const saved=s.db.rows.get('users/'+uid);
  assert.equal(saved.role,role);assert.equal(saved.admin,undefined);
  assert.deepEqual(await s.services.authorizeGoogleSession({auth,data:{}}),{uid});
  if(role==='shop'){
   assert.equal(saved.verificationStatus,'pending');
   await assert.rejects(()=>s.services.marketplace({auth,data:{op:'quotes'}}),/approved shop/);
  }
  await s.services.completeProfile({auth,data:{...data,fullName:'Overwrite attempt'}});
  assert.equal(s.db.rows.get('users/'+uid).fullName,'New user');
 }
});
test('existing Google login is identified by provider subject, not matching email',async()=>{
 const s=setup({existing:true,linked:true,profile:{role:'owner',fullName:'Owner',phone:'0821234567'},identity:{email:'changed@example.test'}});
 const before=structuredClone([...s.db.rows]);const result=await s.exchange(s.input);
 assert.equal(result.uid,'original');assert.equal(s.calls.filter(c=>['create','link'].includes(c[0])).length,0);assert.deepEqual([...s.db.rows],before);
});
test('matching email never links without recent password proof; UID, password and owned records survive explicit linking',async()=>{
 const s=setup({existing:true,profile:{role:'owner',fullName:'Owner',phone:'0821234567'}}),before=structuredClone([...s.db.rows]);
 assert.deepEqual(await s.exchange(s.input),{status:'link-required',email:'owner@example.test'});
 assert.equal(s.calls.filter(c=>['create','link','token'].includes(c[0])).length,0);
 const result=await s.exchange({...s.input,proofToken:'password-proof'});
 assert.equal(result.uid,'original');assert.equal(s.users.size,1);assert.equal(s.users.get('original').passwordHash,'unchanged-hash');
 assert.deepEqual(s.users.get('original').providerData.map(p=>p.providerId),['password','google.com']);for(const [key,value] of before)assert.deepEqual(s.db.rows.get(key),value);
 assert.ok(s.calls.some(c=>c[0]==='verify'&&c[2]===true));
});
test('wrong UID, stale, revoked, unverified and non-password proofs cannot link',async()=>{
 for(const proof of [{uid:'other'},{auth_time:seconds-301},{email_verified:false},{firebase:{sign_in_provider:'google.com'}},{auth_time:seconds+120}]){
  const s=setup({existing:true,proof});await assert.rejects(()=>s.exchange({...s.input,proofToken:'password-proof'}));assert.ok(!s.calls.some(c=>c[0]==='link'));
 }
 const s=setup({existing:true});await assert.rejects(()=>s.exchange({...s.input,proofToken:'revoked'}));assert.ok(!s.calls.some(c=>c[0]==='link'));
});
test('invalid signatures, audiences, issuers, nonce, freshness and email verification fail before any mutation',async()=>{
 for(const identity of [{aud:'evil'},{iss:'evil'},{nonce:'wrong'},{email_verified:false},{iat:seconds-601},{iat:seconds+120},{exp:seconds-1},{sub:''}]){
  const s=setup({identity});await assert.rejects(()=>s.exchange(s.input));assert.equal(s.users.size,0);assert.equal(s.db.rows.size,0);
 }
 const s=setup();await assert.rejects(()=>s.exchange({...s.input,credential:'forged'}));assert.equal(s.users.size,0);
});
test('disabled, unverified, restricted and admin accounts fail closed',async()=>{
 for(const options of [{disabled:true},{verified:false},{profile:{role:'admin'}},{profile:{role:'owner',accountStatus:'suspended'}},{profile:{role:'owner',statusOperation:'pending'}}]){
  const s=setup({existing:true,...options});await assert.rejects(()=>s.exchange({...s.input,proofToken:'password-proof'}));assert.ok(!s.calls.some(c=>['link','token'].includes(c[0])));
 }
});
test('an email already connected to a different Google subject is not replaced',async()=>{
 const s=setup({existing:true,linked:true,identity:{sub:'other-subject'}});await assert.rejects(()=>s.exchange({...s.input,proofToken:'password-proof'}),/another Google/);assert.ok(!s.calls.some(c=>c[0]==='link'));
});
test('interrupted new-user provider linking can retry without deletion or duplicate UID',async()=>{
 const s=setup(),update=s.auth.updateUser;s.auth.updateUser=async()=>{throw Error('temporary outage');};
 await assert.rejects(()=>s.exchange(s.input),/temporary outage/);assert.equal(s.users.size,1);const uid=[...s.users.keys()][0];
 s.auth.updateUser=update;assert.equal((await s.exchange(s.input)).uid,uid);assert.equal(s.users.size,1);
});
test('concurrent different Google identities cannot replace the same account provider',async()=>{
 const s=setup({existing:true});let release,entered;
 const waiting=new Promise(r=>{entered=r;});const update=s.auth.updateUser;
 s.auth.updateUser=async(...args)=>{entered();await new Promise(r=>{release=r;});return update(...args);};
 const first=s.exchange({...s.input,proofToken:'password-proof'});await waiting;
 const other=createGoogleAuth({auth:s.auth,db:s.db,clientId,verifyGoogle:async()=>({...s.claims,sub:'other-subject'}),now:()=>NOW});
 await assert.rejects(()=>other({...s.input,proofToken:'password-proof'}),/reserved/);
 release();await first;assert.equal(s.users.get('original').providerData.find(p=>p.providerId==='google.com').uid,'subject');
});
test('profile authorization rejects missing/malformed profiles and never bypasses current backend status checks',async()=>{
 for(const profile of [undefined,{role:'owner',fullName:'',phone:'0821234567'},{role:'owner',fullName:'Owner',phone:'bad'},{role:'shop',fullName:'Owner',phone:'0821234567',accountStatus:'archived'}]){
  const s=setup({existing:true,linked:true,profile});await assert.rejects(()=>s.services.authorizeGoogleSession({auth:{uid:'original',token:{email_verified:true,auth_time:seconds}}}));
 }
});
test('web exchange enforces origin, JSON bounds and hides unexpected errors; API verification remains required',async()=>{
 let exchanges=0;const app=createApp({auth:{verifyIdToken:async()=>{throw Error('revoked');}},services:{},allowedOrigins:['https://app.example'],googleExchange:async()=>{exchanges++;throw Error('PRIVATE credential');}});
 for(const origin of [undefined,'https://evil.example']){let r=request(app).post('/auth/google');if(origin)r=r.set('Origin',origin);await r.send({}).expect(403);}
 const r=await request(app).post('/auth/google').set('Origin','https://app.example').send({}).expect(503);assert.equal(exchanges,1);assert.ok(!r.text.includes('PRIVATE'));assert.match(r.headers['cache-control'],/no-store/);
 await request(app).post('/auth/google').set('Origin','https://app.example').send({credential:'x'.repeat(40000)}).expect(400);
 await request(app).post('/api/auth/google/authorize').send({}).expect(401);
});
