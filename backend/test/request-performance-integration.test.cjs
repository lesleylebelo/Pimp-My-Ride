const {test,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
const {createServices}=require('../services.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'request-performance-integration'),db=getFirestore(app),auth=getAuth(app);
after(async()=>{await db.terminate();await deleteApp(app);});
test('real Firestore summaries count across pages, isolate roles/accounts and enforce current account eligibility',async()=>{
 const prefix='perf-'+Date.now(),owner=prefix+'-owner',shop=prefix+'-shop',other=prefix+'-other';
 for(const [uid,role] of [[owner,'owner'],[shop,'shop'],[other,'owner']]){
  await auth.createUser({uid,email:uid+'@example.invalid',emailVerified:true});
  await db.doc('users/'+uid).set({role,...(role==='shop'?{verificationStatus:'approved'}:{})});
 }
 const batch=db.batch();
 for(let i=0;i<45;i++)batch.set(db.doc(`conversations/${prefix}-${i}`),{ownerId:owner,shopId:shop,receivedOwner:3,readOwner:1,receivedShop:5,readShop:2});
 for(let i=0;i<45;i++)batch.set(db.doc(`notifications/${prefix}-${i}`),{recipientUid:owner,readAt:i%3===0?1:null});
 batch.set(db.doc(`notifications/${prefix}-private`),{recipientUid:other,readAt:null});await batch.commit();
 const services=createServices({db,auth,storage:{}});
 const call=(uid,service,op,data={})=>services[service]({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000+1}},data:{op,...data}});
 assert.deepEqual(await call(owner,'messaging','summary'),{unreadCount:90});
 assert.deepEqual(await call(shop,'messaging','summary'),{unreadCount:135});
 assert.deepEqual(await call(other,'messaging','summary'),{unreadCount:0});
 assert.deepEqual(await call(owner,'marketplace','notificationSummary'),{unreadCount:30});
 assert.deepEqual(await call(other,'marketplace','notificationSummary'),{unreadCount:1});
 await assert.rejects(()=>call(other,'marketplace','notificationSummary',{recipientUid:owner}),{code:'invalid-argument'});
 await auth.updateUser(owner,{disabled:true});
 await assert.rejects(()=>call(owner,'messaging','summary'),{code:'permission-denied'});
 await assert.rejects(()=>call(owner,'marketplace','notificationSummary'),{code:'permission-denied'});
 await db.doc('users/'+shop).update({verificationStatus:'pending'});
 await assert.rejects(()=>call(shop,'messaging','summary'),{code:'permission-denied'});
});
