const {test,before,after,beforeEach}=require('node:test');const fs=require('fs');
require('../../scripts/assert-emulators.cjs').assertEmulators();
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,getDocs}=require('firebase/firestore');
let env;before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pmr-security',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});});after(async()=>env?.cleanup());beforeEach(async()=>env.clearFirestore());
const ctx=(uid,verified=true,admin=false)=>env.authenticatedContext(uid,{email_verified:verified,admin});
test('simulation metadata cannot be read, forged or removed by any direct client role',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'bookings','simulation-protected'),{simulated:true,testTransaction:true,paymentProvider:'mock',paymentAccountingMode:'simulated',paidCents:0,balanceDueCents:100}));
 for(const role of ['owner','shop','admin']){await seed(role,role);const ref=doc(ctx(role,true,role==='admin').firestore(),'bookings','simulation-protected');await assertFails(getDoc(ref));await assertFails(setDoc(ref,{enabled:true}));await assertFails(deleteDoc(ref));}
});
async function seed(uid,role='owner',status='active'){await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users',uid),{role,accountStatus:status}));}
test('a user can read their own onboarding profile but not another account',async()=>{await seed('u');await assertSucceeds(getDoc(doc(ctx('u',false).firestore(),'users','u')));await assertFails(getDoc(doc(ctx('other').firestore(),'users','u')));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users','u')));});
test('profile creation, updates and deletion require the backend for every role',async()=>{for(const role of ['owner','shop','admin']){await seed(role,role);const db=ctx(role,true,role==='admin').firestore();await assertFails(setDoc(doc(db,'users',role+'new'),{role}));await assertFails(updateDoc(doc(db,'users',role),{role:'admin'}));await assertFails(deleteDoc(doc(db,'users',role)));await assertFails(getDocs(collection(db,'users')));}});
test('even admins cannot forge logs, presence, metadata or categories',async()=>{await seed('admin','admin');const db=ctx('admin',true,true).firestore();for(const col of ['auditLogs','presence','adminOperations','storageCleanup','storageUploadAttempts','mutationReceipts','serviceCategories']){await assertFails(setDoc(doc(db,col,'x'),{actor:'forged'}));if(col!=='serviceCategories')await assertFails(getDocs(collection(db,col)));}await assertFails(setDoc(doc(db,'users','admin','documents','ownerId'),{path:'forged'}));});
test('document metadata requires the revoked-token-aware backend for every client',async()=>{await seed('shop','shop');await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','shop','documents','ownerId'),{name:'demo.pdf'}));await assertFails(getDoc(doc(ctx('shop').firestore(),'users','shop','documents','ownerId')));for(const c of [ctx('shop',false),ctx('other'),ctx('admin',true,true)])await assertFails(getDoc(doc(c.firestore(),'users','shop','documents','ownerId')));await seed('shop','shop','suspended');await assertFails(getDoc(doc(ctx('shop').firestore(),'users','shop','documents','ownerId')));});
test('catalogue access requires the backend and clients never modify it',async()=>{await seed('u');const db=ctx('u').firestore();await assertFails(getDocs(collection(db,'serviceCategories')));await assertFails(setDoc(doc(db,'serviceCategories','x'),{name:'fake'}));await seed('u','owner','archived');await assertFails(getDocs(collection(db,'serviceCategories')));});
test('marketplace records cannot be read or forged through direct Firestore clients, including administrators',async()=>{
 for(const role of ['owner','shop','admin']){await seed(role,role);const db=ctx(role,true,role==='admin').firestore();for(const name of ['vehicles','serviceRequests','quotations','bookings','paymentReceipts','marketplacePhotos','storagePhotosUploadAttempts','profilePhotoUploads','conversations']){await assertFails(getDocs(collection(db,name)));await assertFails(getDoc(doc(db,name,'x')));await assertFails(setDoc(doc(db,name,'x'),{ownerId:role,shopId:role,status:'open'}));}await assertFails(setDoc(doc(db,'bookings','x','paymentAttempts','attempt'),{amountCents:1,status:'paid',paidCents:1}));await assertFails(getDoc(doc(db,'conversations','x','messages','one')));await assertFails(setDoc(doc(db,'conversations','x','messages','one'),{senderId:role,text:'Forged'}));}
});

async function seedModerationPost(){
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'posts','moderation-fixture'),{
  authorId:'post-owner',authorRole:'customer',type:'build',title:'Synthetic build',description:'Emulator-only post',
  images:[],category:'Other',vehicle:'Synthetic vehicle',city:'Test city',province:'Test province',
  authorName:'Test owner',authorAvatar:null,createdAt:new Date(1000),updatedAt:new Date(1000),status:'published',
 }));
}
const moderate=db=>updateDoc(doc(db,'posts','moderation-fixture'),{status:'removed',updatedAt:new Date(2000)});

test('trusted administrators cannot moderate posts before verifying their email',async()=>{
 await seed('admin','admin');await seedModerationPost();
 await assertFails(moderate(ctx('admin',false,true).firestore()));
});

test('suspended and archived administrators cannot moderate posts even with verified email and trusted claims',async()=>{
 await seedModerationPost();
 for(const status of ['suspended','archived']){
  await seed('admin','admin',status);
  await assertFails(moderate(ctx('admin',true,true).firestore()));
 }
});

test('verified active administrators can moderate posts, including legacy profiles without an account status',async()=>{
 for(const profile of [{role:'admin',accountStatus:'active'},{role:'admin'}]){
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','admin'),profile));
  await seedModerationPost();
  await assertSucceeds(moderate(ctx('admin',true,true).firestore()));
 }
});

test('post moderation requires both the trusted admin claim and the stored admin role',async()=>{
 await seedModerationPost();
 await seed('role-only','admin');
 await assertFails(moderate(ctx('role-only',true,false).firestore()));
 await seed('claim-only','owner');
 await assertFails(moderate(ctx('claim-only',true,true).firestore()));
 await assertFails(moderate(ctx('missing-profile',true,true).firestore()));
 await assertFails(moderate(env.unauthenticatedContext().firestore()));
});

test('administrators with a pending status or provisioning operation cannot moderate posts',async()=>{
 await seedModerationPost();
 for(const operation of ['statusOperation','provisioningOperation']){
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','admin'),{
   role:'admin',accountStatus:'active',[operation]:'pending-operation',
  }));
  await assertFails(moderate(ctx('admin',true,true).firestore()));
 }
});


test('Phase 3 receipts, outbox, notifications and attempts deny direct reads and all writes even by participants and administrators',async()=>{
 const paths=['paymentReceipts/r','emailOutbox/e','notifications/n','bookings/b/paymentAttempts/a','quotationHeads/h'];
 await env.withSecurityRulesDisabled(async c=>{for(const path of paths)await setDoc(doc(c.firestore(),path),{recipientUid:'owner',ownerId:'owner',shopId:'shop',amountCents:100,readAt:null});});
 for(const role of ['owner','shop','admin']){
  await seed(role,role);const client=ctx(role,true,role==='admin').firestore();
  for(const path of paths){await assertFails(getDoc(doc(client,path)));await assertFails(setDoc(doc(client,path+'new'),{recipientUid:role,amountCents:1}));await assertFails(updateDoc(doc(client,path),{readAt:new Date(),amountCents:1}));await assertFails(deleteDoc(doc(client,path)));}
 }
});


test('profile photo references cannot be forged directly even by their own account',async()=>{
 for(const role of ['owner','shop','admin']){
  await seed(role,role);const db=ctx(role,true,role==='admin').firestore();
  await assertFails(updateDoc(doc(db,'users',role),{profilePhoto:{id:'forged'},profilePhotoRevision:100}));
 }
});
