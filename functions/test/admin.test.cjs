const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
process.env.GCLOUD_PROJECT='demo-pmr-security';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-pmr-security',storageBucket:'demo-pmr-security.appspot.com'});
const api=require('../index.js');
const {getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth'),{getStorage}=require('firebase-admin/storage');
const db=getFirestore(),auth=getAuth();
const request=(uid,data,extra={})=>({auth:{uid,token:{email_verified:true,admin:uid==='admin',auth_time:Math.floor(Date.now()/1000)+1,...extra}},data});
const call=(op,data={},uid='admin',extra={})=>api.adminApi.run(request(uid,{op,...data},extra));
async function seed(uid,role,extra={}){await auth.createUser({uid,email:`${uid}@example.com`,emailVerified:true});if(role==='admin')await auth.setCustomUserClaims(uid,{admin:true});await db.doc(`users/${uid}`).set({role,fullName:uid,email:`${uid}@example.com`,phone:'0821234567',...(role==='shop'?{verificationStatus:'pending'}:{}),...extra});}
before(()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST&&process.env.FIREBASE_STORAGE_EMULATOR_HOST,'Run through Firebase emulators; never against live Firebase.');});
beforeEach(async()=>{
 await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));
 await getStorage().bucket().deleteFiles();
 await seed('admin','admin');await seed('customer','owner');await seed('shop','shop');
});
after(()=>db.terminate());
test('admin API denies missing auth, customers, unverified and revoked administrators',async()=>{
 await assert.rejects(()=>api.adminApi.run({data:{op:'dashboard'}}),{code:'unauthenticated'});
 await assert.rejects(()=>call('dashboard',{},'customer'),{code:'permission-denied'});
 await assert.rejects(()=>call('dashboard',{},'admin',{email_verified:false}),{code:'permission-denied'});
 await assert.rejects(()=>call('dashboard',{},'admin',{auth_time:1}),{code:'unauthenticated'});
 await auth.setCustomUserClaims('admin',{});await assert.rejects(()=>call('dashboard'),{code:'permission-denied'});
});
test('sensitive operations require recent authentication',async()=>{
 // Auth revocation and recency are independently enforced. A stale auth_time may fail revocation first.
 await assert.rejects(()=>call('categorySave',{name:'Paint',description:'Paint'},'admin',{auth_time:Math.floor(Date.now()/1000)-3600}));
});
test('category create/read/update/archive/restore writes immutable actor and logs',async()=>{
 const {id}=await call('categorySave',{name:'Paint',description:'Exterior paint',actor:'forged'});
 await call('categorySave',{id,name:'Wraps',description:'Vehicle wraps'});
 await call('categoryArchive',{id,archived:true});assert.equal((await call('categories')).items[0].archived,true);
 await call('categoryArchive',{id,archived:false});assert.equal((await call('categories')).items[0].name,'Wraps');
 const logs=(await call('audit')).items;assert.equal(logs.length,4);assert.ok(logs.every(l=>l.actor==='admin'));
});
test('account edits reject malformed fields and do not accept a role escalation',async()=>{
 await assert.rejects(()=>call('editAccount',{uid:'customer',fullName:'',phone:'123'}));
 await call('editAccount',{uid:'customer',fullName:'New name',phone:'0821234567',role:'admin'});
 const p=await call('account',{uid:'customer'});assert.equal(p.role,'owner');assert.equal(p.fullName,'New name');
});
test('suspension, restoration and archive update Auth and profile; admins are protected',async()=>{
 await assert.rejects(()=>call('status',{uid:'admin',status:'archived',reason:'test'}),{code:'permission-denied'});
 await assert.rejects(()=>call('status',{uid:'customer',status:'suspended',reason:''}));
 for(const status of ['suspended','active','archived']){
  await call('status',{uid:'customer',status,reason:'Test access lifecycle'});
  assert.equal((await auth.getUser('customer')).disabled,status!=='active');
  assert.equal((await db.doc('users/customer').get()).data().accountStatus,status);
 }
 await assert.rejects(()=>api.sessionEvent.run(request('customer',{session:'s1',state:'heartbeat'})),{code:'permission-denied'});
});
test('incomplete document approval fails and restores review state',async()=>{
 for(const kind of ['cipcCert','proofOfAddress','ownerId'])await db.doc(`users/shop/documents/${kind}`).set({size:4,contentType:'application/pdf'});
 await assert.rejects(()=>call('review',{uid:'shop',status:'approved',reason:'Checked'}),/Missing/);
 const p=(await db.doc('users/shop').get()).data();assert.equal(p.verificationStatus,'pending');assert.equal(p.reviewOperation,undefined);
});
test('approval checks real objects; rejection and resubmission remain auditable',async()=>{
 for(const kind of ['cipcCert','proofOfAddress','ownerId']){
  await getStorage().bucket().file(`verification/shop/${kind}`).save(Buffer.from('%PDF'),{contentType:'application/pdf'});
  await db.doc(`users/shop/documents/${kind}`).set({size:4,contentType:'application/pdf'});
 }
 for(const status of ['approved','rejected','pending']){
  await call('review',{uid:'shop',status,reason:'Document review test'});
  assert.equal((await db.doc('users/shop').get()).data().verificationStatus,status);
 }
});
test('presence supports simultaneous devices and prevents caller-supplied identity',async()=>{
 for(const session of ['one','two'])await api.sessionEvent.run(request('customer',{session,state:'heartbeat',uid:'admin'}));
 await api.sessionEvent.run(request('customer',{session:'one',state:'offline'}));
 const p=(await call('presence')).items[0];assert.equal(p.uid,'customer');assert.ok(p.sessions.two>Date.now());assert.equal(p.sessions.one,undefined);
 assert.equal((await db.doc('presence/admin').get()).exists,false);
 const before=(await call('audit')).items.length;
 await api.sessionEvent.run(request('customer',{session:'two',state:'heartbeat'}));assert.equal((await call('audit')).items.length,before);
});

test('partial Auth failure leaves the profile restricted with a recoverable operation',async()=>{
 await auth.deleteUser('customer');
 await assert.rejects(()=>call('status',{uid:'customer',status:'archived',reason:'Test failure'}),{code:'internal'});
 const p=(await db.doc('users/customer').get()).data();assert.equal(p.accountStatus,'suspended');assert.ok(p.statusOperation);
 assert.equal((await db.doc(`adminOperations/${p.statusOperation}`).get()).data().status,'failed');
 await assert.rejects(()=>call('status',{uid:'customer',status:'active',reason:'retry'}),{code:'failed-precondition'});
});
test('profile audit trigger is idempotent for retried events',async()=>{
 const snapshot=await db.doc('users/customer').get();
 const event={id:'event-1',authId:'customer',authType:'user',params:{uid:'customer'},data:snapshot};
 await api.profileCreated.run(event);await api.profileCreated.run(event);
 const logs=(await call('audit')).items;assert.equal(logs.length,1);assert.equal(logs[0].actor,'customer');assert.equal(logs[0].action,'profile.created');
});
