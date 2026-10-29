const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'account-management-integration'),db=getFirestore(app),auth=getAuth(app);
let http,services,tokens,media,failStorage,lostDelete,accountDeletionEnv;
async function signIn(uid){const result=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:uid+'@synthetic.invalid',password:'Synthetic-account-123!',returnSecureToken:true})});const data=await result.json();assert.ok(data.idToken);tokens[uid]=data.idToken;}
beforeEach(async()=>{
 await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(user=>user.uid));tokens={};media=[];failStorage=false;lostDelete=false;
 for(const [uid,role] of [['account-owner','owner'],['account-other','owner'],['account-shop','shop'],['account-admin','admin']]){
  await auth.createUser({uid,email:uid+'@synthetic.invalid',emailVerified:true,password:'Synthetic-account-123!'});if(role==='admin')await auth.setCustomUserClaims(uid,{admin:true});
  await db.doc('users/'+uid).set({role,fullName:'Synthetic Person',phone:'0821234567',email:uid+'@synthetic.invalid',accountStatus:'active',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:'Synthetic Workshop',regNumber:'SYNTHETIC-REG',address:'Synthetic business address',city:'Pretoria',province:'Gauteng',services:'Paint'}}:{})});await signIn(uid);
 }
 const adapter={checkOwnerReference(uid,reference){if(reference.bucket==='unconfigured')throw Error('Unknown media reference');},purgeOwnerPage:async uid=>{media.push(uid);if(failStorage)throw Error('Synthetic storage outage');return {done:true};}};
 const authProxy=new Proxy(auth,{get(target,key){if(key==='deleteUser')return async uid=>{await target.deleteUser(uid);if(lostDelete){lostDelete=false;throw Error('Lost identity deletion response');}};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 accountDeletionEnv={NODE_ENV:'production',PMR_ACCOUNT_DELETION_REQUESTS_ENABLED:'true',PMR_ACCOUNT_DELETION_WORKER_ENABLED:'true'};
 services=createServices({db,auth:authProxy,storage:adapter,photoStorage:adapter,profileStorage:adapter,requestStorage:adapter,postStorage:adapter,accountDeletionEnv});http=createApp({auth:authProxy,services});
});
after(async()=>{await db.terminate();await deleteApp(app);});
const call=(uid,path,data)=>request(http).post('/api/'+path).set('Authorization','Bearer '+tokens[uid]).send(data);
const account=(uid,op,data={})=>call(uid,'account',{op,...data});
const resume=uid=>call('account-admin','admin',{op:'accountLifecycleResume',uid});
async function finish(uid){for(let i=0;i<70;i++){const job=(await db.doc('accountLifecycleJobs/'+uid).get()).data();if(job.state==='completed')return job;await resume(uid).expect(200);}throw Error('Cleanup did not finish within its bounded phase budget');}
test('customer/workshop profile updates whitelist fields, use versions and renew verification only for identity changes',async()=>{
 const p=(await account('account-owner','profile').expect(200)).body.data;assert.equal(p.profile.fullName,'Synthetic Person');assert.equal(p.profile.version,0);
 await account('account-owner','save',{fullName:'Updated Customer',phone:'0831234567',version:0,requestId:'save-owner'}).expect(200);
 await account('account-owner','save',{fullName:'Updated Customer',phone:'0831234567',version:0,requestId:'save-owner'}).expect(200);
 await account('account-owner','save',{fullName:'Stale Update',phone:'0831234567',version:0,requestId:'save-stale'}).expect(409);
 for(const key of ['role','uid','accountStatus','verificationStatus','verifiedRating','email'])await account('account-owner','save',{fullName:'Forged Customer',phone:'0831234567',version:1,requestId:'forged-'+key,[key]:'forged'}).expect(400);
 const shop=(await db.doc('users/account-shop').get()).data().shop;
 let response=await account('account-shop','save',{fullName:'Synthetic Person',phone:'0821234567',shop:{...shop,services:'Paint and wheels'},version:0,requestId:'shop-services'}).expect(200);assert.equal(response.body.data.reverificationRequired,false);
 response=await account('account-shop','save',{fullName:'Synthetic Person',phone:'0821234567',shop:{...shop,shopName:'Changed Workshop'},version:1,requestId:'shop-identity'}).expect(200);assert.equal(response.body.data.reverificationRequired,true);assert.equal((await db.doc('users/account-shop').get()).data().verificationStatus,'pending');
 await account('account-admin','profile').expect(403);
});
test('deactivation revokes existing sessions, blocks marketplace actions and permits only authenticated self-reactivation',async()=>{
 await account('account-owner','deactivate',{confirmation:'DEACTIVATE',requestId:'deactivate-owner'}).expect(200);
 assert.equal((await db.doc('users/account-owner').get()).data().accountStatus,'deactivated');
 const denied=await call('account-owner','marketplace',{op:'vehicles'});assert.ok([401,403].includes(denied.status));
 await signIn('account-owner');const state=(await account('account-owner','status').expect(200)).body.data;assert.equal(state.job.state,'completed');assert.equal(state.accountStatus,'deactivated');
 await account('account-other','reactivate',{requestId:'cannot-reactivate-other'}).expect(409);
 await account('account-owner','reactivate',{uid:'account-other',requestId:'forged-recovery'}).expect(400);
 await account('account-owner','reactivate',{requestId:'reactivate-owner'}).expect(200);
 await call('account-owner','marketplace',{op:'vehicles'}).expect(200);
 await db.doc('users/account-owner').update({accountStatus:'suspended'});await account('account-owner','reactivate',{requestId:'not-admin-restoration'}).expect(403);
 assert.equal(media.length,0);
});
test('active services, nonzero completed balances, reconciliation and disputes prevent closure without side effects',async()=>{
 for(const booking of [{status:'confirmed',serviceStatus:'not_started',balanceDueCents:0},{status:'confirmed',serviceStatus:'completed',balanceDueCents:100},{status:'cancelled',paymentReconciliationStatus:'simulated_reconciliation_required'},{status:'cancelled',activeDispute:true}]){
  await db.doc('bookings/account-booking').set({ownerId:'account-owner',shopId:'account-shop',...booking});
  for(const op of ['deactivate','delete'])await account('account-owner',op,{confirmation:op==='delete'?'DELETE':'DEACTIVATE',requestId:'blocked-'+op}).expect(409);
  assert.equal((await db.doc('users/account-owner').get()).data().accountStatus,'active');assert.ok(!(await db.doc('accountLifecycleJobs/account-owner').get()).exists);
 }
});
test('deletion preserves business/review evidence, removes only owned records/media, and never finishes after storage failure',async()=>{
 await db.doc('bookings/settled').set({ownerId:'account-owner',shopId:'account-shop',serviceStatus:'completed',status:'confirmed',balanceDueCents:0,customerName:'PRIVATE NAME'});
 await db.doc('vehicles/owned').set({ownerId:'account-owner',registration:'PRIVATE'});await db.doc('vehicles/other').set({ownerId:'account-other',registration:'KEEP'});
 await db.doc('users/account-owner/savedPosts/post').set({postId:'post'});await db.doc('users/account-other/savedPosts/post').set({postId:'post'});
 await db.doc('serviceReviews/retained').set({customerId:'account-owner',shopId:'account-shop',bookingId:'settled',rating:1,text:'Legitimate critical feedback must remain available.',status:'visible',customerName:'Verified customer'});
 await db.doc('conversations/shared').set({ownerId:'account-owner',shopId:'account-shop',enquiry:'PRIVATE enquiry',lastMessage:'PRIVATE preview',sequence:2});
 await db.doc('conversations/shared/messages/own').set({senderId:'account-owner',text:'PRIVATE message',sequence:1,recipientOrdinal:1});await db.doc('conversations/shared/messages/other').set({senderId:'account-shop',text:'Other participant evidence',sequence:2,recipientOrdinal:1});
 await account('account-owner','delete',{confirmation:'DELETE',requestId:'delete-owner'}).expect(200);
 const ref=db.doc('accountLifecycleJobs/account-owner');assert.equal((await ref.get()).data().state,'pending');assert.equal((await db.doc('users/account-owner').get()).data().accountStatus,'deleting');
 await ref.update({createdAt:Timestamp.fromMillis(Date.now()-180000)});await resume('account-owner').expect(200);failStorage=true;await resume('account-owner').expect(500);assert.ok((await auth.getUser('account-owner')).uid);assert.equal((await ref.get()).data().state,'pending');assert.ok((await ref.get()).data().issue);
 failStorage=false;await finish('account-owner');
 await assert.rejects(()=>auth.getUser('account-owner'),{code:'auth/user-not-found'});assert.equal((await db.doc('users/account-owner').get()).data().role,'deleted');
 assert.ok(!(await db.doc('vehicles/owned').get()).exists);assert.equal((await db.doc('vehicles/other').get()).data().registration,'KEEP');assert.ok((await db.doc('users/account-other/savedPosts/post').get()).exists);
 assert.equal((await db.doc('bookings/settled').get()).data().customerName,'Deleted customer');assert.ok((await db.doc('serviceReviews/retained').get()).exists);
 assert.equal((await db.doc('conversations/shared/messages/own').get()).data().text,'[Message removed with account]');assert.equal((await db.doc('conversations/shared/messages/own').get()).data().sequence,1);assert.equal((await db.doc('conversations/shared/messages/other').get()).data().text,'Other participant evidence');
 assert.ok(media.every(uid=>uid==='account-owner'));
});
test('workshop deletion retains public historical reviews and a lost Auth deletion response can be recovered',async()=>{
 await db.doc('users/account-shop').update({verifiedRating:{sum:1,count:1,revision:1}});await db.doc('serviceReviews/retained').set({customerId:'account-other',shopId:'account-shop',bookingId:'historic',rating:1,text:'Legitimate critical feedback must remain available.',status:'visible',customerName:'Verified customer'});
 await account('account-shop','delete',{confirmation:'DELETE',requestId:'delete-shop'}).expect(200);await db.doc('accountLifecycleJobs/account-shop').update({createdAt:Timestamp.fromMillis(Date.now()-180000)});
 for(let i=0;i<60;i++){const job=(await db.doc('accountLifecycleJobs/account-shop').get()).data();if(job.phase==='identity')break;await resume('account-shop').expect(200);}
 lostDelete=true;await resume('account-shop').expect(500);assert.equal((await db.doc('accountLifecycleJobs/account-shop').get()).data().state,'pending');
 await call('account-admin','admin',{op:'account',uid:'account-shop'}).expect(200).then(response=>assert.equal(response.body.data.accountStatus,'deleting'));await resume('account-shop').expect(200);
 await call('account-admin','admin',{op:'account',uid:'account-shop'}).expect(200).then(response=>assert.equal(response.body.data.accountStatus,'deleted'));
 const publicHistory=(await call('account-other','service-reviews',{op:'workshopReviews',shopId:'account-shop'}).expect(200)).body.data;assert.equal(publicHistory.archived,true);assert.equal(publicHistory.items[0].rating,1);assert.deepEqual(publicHistory.summary,{average:1,count:1});
 await call('account-other','marketplace',{op:'shops'}).expect(200).then(response=>assert.ok(!response.body.data.items.some(item=>item.id==='account-shop')));
});
test('an unresolved in-flight upload holds deletion and cannot silently be discarded',async()=>{
 await db.doc('postPhotoUploads/inflight').set({uid:'account-owner',state:'uploading',path:'posts/account-owner/synthetic'});
 await account('account-owner','delete',{confirmation:'DELETE',requestId:'delete-waiting'}).expect(200);await db.doc('accountLifecycleJobs/account-owner').update({createdAt:Timestamp.fromMillis(Date.now()-180000)});
 await resume('account-owner').expect(409);assert.equal(media.length,0);assert.equal((await db.doc('accountLifecycleJobs/account-owner').get()).data().phase,'settle');
 await db.doc('postPhotoUploads/inflight').update({state:'cleanupPending'});await resume('account-owner').expect(200);assert.equal((await db.doc('accountLifecycleJobs/account-owner').get()).data().phase,'media:0');
});

test('unknown media references keep their ledger and Auth identity pending for operator reconciliation',async()=>{
 await db.doc('users/account-shop/documents/ownerId').set({path:'verification/account-shop/ownerId/legacy',provider:'supabase',bucket:'unconfigured'});
 await db.doc('posts/unknown-image').set({authorId:'account-shop',images:[{path:'posts/account-shop/legacy',bucket:'unconfigured'}]});
 await account('account-shop','delete',{confirmation:'DELETE',requestId:'delete-unknown-reference'}).expect(200);await db.doc('accountLifecycleJobs/account-shop').update({createdAt:Timestamp.fromMillis(Date.now()-180000)});
 for(let i=0;i<12;i++){if((await db.doc('accountLifecycleJobs/account-shop').get()).data().phase==='data:1')break;await resume('account-shop').expect(200);}
 await resume('account-shop').expect(500);assert.ok((await db.doc('users/account-shop/documents/ownerId').get()).exists);assert.ok(await auth.getUser('account-shop'));assert.equal((await db.doc('accountLifecycleJobs/account-shop').get()).data().state,'pending');
 await db.doc('users/account-shop/documents/ownerId').update({bucket:'configured'});
 for(let i=0;i<4;i++){if((await db.doc('accountLifecycleJobs/account-shop').get()).data().phase==='data:3')break;await resume('account-shop').expect(200);}
 await resume('account-shop').expect(500);assert.equal((await db.doc('posts/unknown-image').get()).data().images.length,1);assert.ok(await auth.getUser('account-shop'));
});

test('a self-deactivated workshop disappears from eligible discovery and cannot receive marketplace work',async()=>{
 await account('account-shop','deactivate',{confirmation:'DEACTIVATE',requestId:'deactivate-shop'}).expect(200);
 await call('account-owner','marketplace',{op:'shops'}).expect(200).then(response=>assert.ok(!response.body.data.items.some(item=>item.id==='account-shop')));
 await signIn('account-shop');await call('account-shop','marketplace',{op:'quotes'}).expect(403);
 await account('account-shop','reactivate',{requestId:'reactivate-shop'}).expect(200);assert.equal((await db.doc('users/account-shop').get()).data().verificationStatus,'approved');
});

test('concurrent closure creates one job and audit; scheduled cleanup honours a live lease and resumes an expired lease',async()=>{
 const results=await Promise.all(Array.from({length:4},()=>account('account-owner','delete',{confirmation:'DELETE',requestId:'concurrent-delete'})));
 assert.ok(results.some(result=>result.status===200));assert.ok(results.every(result=>[200,401,403,409].includes(result.status)));
 assert.equal((await db.collection('accountLifecycleJobs').get()).docs.length,1);assert.equal((await db.collection('auditLogs').where('action','==','account.self.deleteRequested').get()).docs.length,1);
 const ref=db.doc('accountLifecycleJobs/account-owner');await ref.update({createdAt:Timestamp.fromMillis(Date.now()-180000),dueAt:Timestamp.fromMillis(Date.now()-1000),leaseToken:'other-worker',leaseUntil:Timestamp.fromMillis(Date.now()+120000)});
 await services.accountCleanupTick();assert.equal((await ref.get()).data().phase,'settle');
 await ref.update({leaseUntil:Timestamp.fromMillis(Date.now()-1000)});await services.accountCleanupTick();assert.equal((await ref.get()).data().phase,'media:0');assert.equal(media.length,0);
});

test('both gates disabled still permit profile editing, verified email sync, deactivation and authorized reactivation',async()=>{
 delete accountDeletionEnv.PMR_ACCOUNT_DELETION_REQUESTS_ENABLED;delete accountDeletionEnv.PMR_ACCOUNT_DELETION_WORKER_ENABLED;
 await account('account-owner','delete',{confirmation:'DELETE',requestId:'disabled-intake'}).expect(503);assert.ok(!(await db.doc('accountLifecycleJobs/account-owner').get()).exists);assert.equal((await db.doc('users/account-owner').get()).data().accountStatus,'active');
 await account('account-owner','save',{fullName:'Updated Customer',phone:'0831234567',version:0,requestId:'edit-while-paused'}).expect(200);await account('account-owner','syncEmail',{requestId:'email-while-paused'}).expect(200);
 for(const uid of ['account-owner','account-shop']){await account(uid,'deactivate',{confirmation:'DEACTIVATE',requestId:'deactivate-while-paused'}).expect(200);await signIn(uid);await account(uid,'reactivate',{requestId:'recover-while-paused'}).expect(200);}
 // Pending deletion jobs must not starve a failed deactivation revocation retry.
 for(let i=0;i<4;i++)await db.doc('accountLifecycleJobs/delete-'+i).set({kind:'delete',state:'pending',dueAt:Timestamp.fromMillis(0),cursor:'keep'});
 await db.doc('users/account-other').update({accountStatus:'deactivated',statusOperation:'self:account-other'});await db.doc('accountLifecycleJobs/account-other').set({uid:'account-other',kind:'deactivate',state:'pending',phase:'revoke',dueAt:Timestamp.fromMillis(1)});
 assert.equal((await services.accountCleanupTick()).examined,1);assert.equal((await db.doc('accountLifecycleJobs/account-other').get()).data().state,'completed');assert.equal(media.length,0);
});

test('paused deletion blocks scheduled execution and admin resume without changing the saved phase/cursor, then resumes safely',async()=>{
 accountDeletionEnv.PMR_ACCOUNT_DELETION_WORKER_ENABLED='false';
 await account('account-owner','delete',{confirmation:'DELETE',requestId:'queued-deletion'}).expect(200);const ref=db.doc('accountLifecycleJobs/account-owner');
 assert.equal((await ref.get()).data().phase,'revoke');
 await ref.update({dueAt:Timestamp.fromMillis(0),cursor:'unchanged'});const before=(await ref.get()).data();
 await resume('account-owner').expect(200).then(response=>assert.equal(response.body.data.paused,true));assert.equal((await services.accountCleanupTick()).examined,0);assert.deepEqual((await ref.get()).data(),before);assert.ok(await auth.getUser('account-owner'));assert.equal(media.length,0);
 accountDeletionEnv.PMR_ACCOUNT_DELETION_REQUESTS_ENABLED='false';accountDeletionEnv.PMR_ACCOUNT_DELETION_WORKER_ENABLED='true';
 await resume('account-owner').expect(200);assert.equal((await ref.get()).data().phase,'settle');assert.equal((await db.doc('users/account-owner').get()).data().accountStatus,'deleting');
});
