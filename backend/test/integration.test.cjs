const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
process.env.GCLOUD_PROJECT='demo-pmr-security';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-pmr-security',storageBucket:'demo-pmr-security.appspot.com'});
const {initializeApp}=require('firebase-admin/app');
initializeApp({projectId:'demo-pmr-security'});
const {createServices}=require('../services.cjs');
const {getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const db=getFirestore(),auth=getAuth();
const files=new Map();
const storage={upload:async(path,buffer,contentType)=>{files.set(path,{size:buffer.length,contentType});},inspect:async path=>{if(!files.has(path))throw Error('Missing file');return files.get(path);},remove:async path=>{files.delete(path);},signedUrl:async path=>{if(!files.has(path))throw Error('Missing file');return 'https://storage.example.test/signed';}};
const api=createServices({db,auth,storage});
const request=(uid,data,extra={})=>({auth:{uid,token:{email_verified:true,admin:uid==='admin',auth_time:Math.floor(Date.now()/1000)+1,...extra}},data});
const call=(op,data={},uid='admin',extra={})=>api.adminApi(request(uid,{op,...data},extra));
async function seed(uid,role,extra={}){await auth.createUser({uid,email:`${uid}@example.com`,emailVerified:true});if(role==='admin')await auth.setCustomUserClaims(uid,{admin:true});await db.doc(`users/${uid}`).set({role,fullName:uid,email:`${uid}@example.com`,phone:'0821234567',...(role==='shop'?{verificationStatus:'pending'}:{}),...extra});}
before(()=>{assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST,'Run through Firebase emulators; never against live Firebase.');});
beforeEach(async()=>{
 await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));
 files.clear();
 await seed('admin','admin');await seed('customer','owner');await seed('shop','shop');
});
after(()=>db.terminate());
test('admin API denies missing auth, customers, unverified and revoked administrators',async()=>{
 await assert.rejects(()=>api.adminApi({data:{op:'dashboard'}}),{code:'unauthenticated'});
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
 await assert.rejects(()=>api.sessionEvent(request('customer',{session:'s1',state:'heartbeat'})),{code:'permission-denied'});
});
test('incomplete document approval fails and restores review state',async()=>{
 for(const kind of ['cipcCert','proofOfAddress','ownerId'])await db.doc(`users/shop/documents/${kind}`).set({size:4,contentType:'application/pdf'});
 await assert.rejects(()=>call('review',{uid:'shop',status:'approved',reason:'Checked'}),/Missing/);
 const p=(await db.doc('users/shop').get()).data();assert.equal(p.verificationStatus,'pending');assert.equal(p.reviewOperation,undefined);
});
test('approval checks real objects; rejection and resubmission remain auditable',async()=>{
 for(const kind of ['cipcCert','proofOfAddress','ownerId']){
  await api.uploadDocument({...request('shop',{}),kind,file:{buffer:Buffer.from('%PDF-1.7 sample'),originalname:'sample.pdf',mimetype:'application/pdf'}});
 }
 for(const status of ['approved','rejected','pending']){
  await call('review',{uid:'shop',status,reason:'Document review test'});
  assert.equal((await db.doc('users/shop').get()).data().verificationStatus,status);
 }
});
test('presence supports simultaneous devices and prevents caller-supplied identity',async()=>{
 for(const session of ['one','two'])await api.sessionEvent(request('customer',{session,state:'heartbeat',uid:'admin'}));
 await api.sessionEvent(request('customer',{session:'one',state:'offline'}));
 const p=(await call('presence')).items[0];assert.equal(p.uid,'customer');assert.ok(p.sessions.two>Date.now());assert.equal(p.sessions.one,undefined);
 assert.equal((await db.doc('presence/admin').get()).exists,false);
 const before=(await call('audit')).items.length;
 await api.sessionEvent(request('customer',{session:'two',state:'heartbeat'}));assert.equal((await call('audit')).items.length,before);
});

test('partial Auth failure leaves the profile restricted with a recoverable operation',async()=>{
 await auth.deleteUser('customer');
 await assert.rejects(()=>call('status',{uid:'customer',status:'archived',reason:'Test failure'}),{code:'internal'});
 const p=(await db.doc('users/customer').get()).data();assert.equal(p.accountStatus,'suspended');assert.ok(p.statusOperation);
 assert.equal((await db.doc(`adminOperations/${p.statusOperation}`).get()).data().status,'failed');
 await assert.rejects(()=>call('status',{uid:'customer',status:'active',reason:'retry'}),{code:'failed-precondition'});
});
test('profile creation and its audit record are atomic and retry-safe',async()=>{
 await auth.createUser({uid:'new',email:'new@example.com'});
 const r=request('new',{role:'owner',fullName:'New owner',phone:'0821234567',agreed:true,termsVersion:'academic-v2',admin:true});
 await api.completeProfile(r);await api.completeProfile(r);
 const p=(await db.doc('users/new').get()).data();assert.equal(p.role,'owner');assert.equal(p.admin,undefined);assert.equal(p.email,'new@example.com');
 const logs=(await call('audit')).items;assert.equal(logs.length,1);assert.equal(logs[0].actor,'new');
 await assert.rejects(()=>api.completeProfile(request('new',{...r.data,role:'admin'})));
});
test('uploads enforce role, verification, file signature and pending state',async()=>{
 const file={buffer:Buffer.from('%PDF-1.7 sample'),originalname:'sample.pdf',mimetype:'application/pdf'};
 await assert.rejects(()=>api.uploadDocument({...request('customer',{}),kind:'ownerId',file}),{code:'permission-denied'});
 await assert.rejects(()=>api.uploadDocument({...request('shop',{}, {email_verified:false}),kind:'ownerId',file}),{code:'permission-denied'});
 await assert.rejects(()=>api.uploadDocument({...request('shop',{}),kind:'ownerId',file:{...file,buffer:Buffer.from('fake')}}));
 await api.uploadDocument({...request('shop',{}),kind:'ownerId',file});
 await api.uploadDocument({...request('shop',{}),kind:'ownerId',file});assert.equal(files.size,2);assert.equal((await db.collection('storageUploadAttempts').where('state','==','cleanupPending').get()).size,1);
 await db.doc('users/shop').update({verificationStatus:'approved'});
 await assert.rejects(()=>api.uploadDocument({...request('shop',{}),kind:'ownerId',file}),{code:'permission-denied'});
});
test('a review starting during upload prevents metadata replacement and queues the retained orphan',async()=>{
 const raceStorage={...storage,upload:async(...args)=>{await storage.upload(...args);await db.doc('users/shop').update({verificationStatus:'reviewing'});}};
 const race=createServices({db,auth,storage:raceStorage});
 await assert.rejects(()=>race.uploadDocument({...request('shop',{}),kind:'ownerId',file:{buffer:Buffer.from('%PDF-1.7 sample'),originalname:'sample.pdf',mimetype:'application/pdf'}}),{code:'permission-denied'});
 assert.equal(files.size,1);assert.equal((await db.collection('storageUploadAttempts').where('state','==','cleanupPending').get()).size,1);assert.equal((await db.doc('users/shop/documents/ownerId').get()).exists,false);
});

test('HTTP routes verify real emulator tokens and deny a customer at the admin endpoint',async()=>{
 const http=require('supertest'),{createApp}=require('../app.cjs');const app=createApp({services:api,auth});
 async function token(uid){await auth.updateUser(uid,{password:'TestPassword1234'});const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.com`,password:'TestPassword1234',returnSecureToken:true})});const body=await response.json();assert.ok(body.idToken);return body.idToken;}
 await http(app).post('/api/admin').set('Authorization',`Bearer ${await token('admin')}`).send({op:'dashboard'}).expect(200);
 await http(app).post('/api/admin').set('Authorization',`Bearer ${await token('customer')}`).send({op:'dashboard'}).expect(403);
});

test('a lost commit acknowledgement never deletes the newly referenced document',async()=>{
 const uncertainDb={doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async fn=>{await db.runTransaction(fn);throw Error('Acknowledgement lost');}};
 const uncertain=createServices({db:uncertainDb,auth,storage});
 await uncertain.uploadDocument({...request('shop',{}),kind:'ownerId',file:{buffer:Buffer.from('%PDF-1.7 sample'),originalname:'sample.pdf',mimetype:'application/pdf'}});
 const record=(await db.doc('users/shop/documents/ownerId').get()).data();assert.ok(files.has(record.path));
});
test('concurrent category retries produce one category and one audit; payload reuse is rejected',async()=>{
 const data={requestId:'emulator-category-retry',name:'Paint',description:'Synthetic test category'};
 const results=await Promise.all([call('categorySave',data),call('categorySave',data)]);
 assert.equal(results[0].id,results[1].id);assert.equal((await db.collection('serviceCategories').get()).size,1);
 assert.equal((await db.collection('auditLogs').get()).size,1);
 await assert.rejects(()=>call('categorySave',{...data,name:'Different'}),{code:'already-exists'});
});
test('category pages include duplicate names exactly once and continue beyond the former cap',async()=>{
 const batch=db.batch();for(let i=0;i<205;i++)batch.set(db.doc(`serviceCategories/c${String(i).padStart(3,'0')}`),{name:i%2?'Wrap':'Paint',archived:false});await batch.commit();
 let cursor,ids=[];do{const page=await call('categories',{...(cursor?{cursor}:{})});assert.ok(page.items.length<=30);ids.push(...page.items.map(v=>v.id));cursor=page.cursor;}while(cursor);
 assert.equal(ids.length,205);assert.equal(new Set(ids).size,205);
});
test('document list is shop-only, strips private paths, and rejects restricted or unverified accounts',async()=>{
 await db.doc('users/shop/documents/ownerId').set({provider:'supabase',path:'private-test-path',name:'synthetic.pdf',size:24,contentType:'application/pdf'});
 const result=await api.listDocuments(request('shop',{}));assert.equal(result.items[0].id,'ownerId');assert.equal(result.items[0].path,undefined);
 for(const uid of ['admin','customer'])await assert.rejects(()=>api.listDocuments(request(uid,{})),{code:'permission-denied'});
 await assert.rejects(()=>api.listDocuments(request('shop',{}, {email_verified:false})),{code:'permission-denied'});
 for(const status of ['suspended','archived']){await db.doc('users/shop').update({accountStatus:status});await assert.rejects(()=>api.listDocuments(request('shop',{})),{code:'permission-denied'});}
});
