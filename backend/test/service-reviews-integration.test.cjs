const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs'),{quoteId}=require('../marketplace.cjs'),{reviewId}=require('../service-reviews.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'service-reviews-integration'),db=getFirestore(app),auth=getAuth(app);
let http,tokens;
beforeEach(async()=>{
 await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(user=>user.uid));tokens={};
 for(const [uid,role] of [['review-owner','owner'],['review-other','owner'],['review-shop','shop'],['review-competitor','shop'],['review-admin','admin']]){
  const email=uid+'@synthetic.invalid';await auth.createUser({uid,email,emailVerified:true,password:'Synthetic-review-123!'});if(role==='admin')await auth.setCustomUserClaims(uid,{admin:true});
  await db.doc('users/'+uid).set({role,accountStatus:'active',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:uid,coordinates:{latitude:-26,longitude:28}}}:{}),fullName:'PRIVATE Customer Full Name',phone:'PRIVATE phone'});
  const signed=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Synthetic-review-123!',returnSecureToken:true})});tokens[uid]=(await signed.json()).idToken;assert.ok(tokens[uid]);
 }
 await db.doc('bookings/review-booking').set({ownerId:'review-owner',shopId:'review-shop',status:'confirmed',serviceStatus:'not_started',paymentStatus:'due',categoryName:'Paint',requestTitle:'Private booking description'});
 http=createApp({auth,services:createServices({db,auth,storage:{},photoStorage:{}})});
});
after(async()=>{await db.terminate();await deleteApp(app);});
const call=(uid,path,data)=>request(http).post('/api/'+path).set('Authorization','Bearer '+tokens[uid]).send(data);
const submit=(uid='review-owner',extra={})=>call(uid,'service-reviews',{op:'reviewSubmit',id:'review-booking',rating:5,text:'Excellent communication and careful paintwork throughout.',...extra});
const complete=()=>call('review-shop','marketplace',{op:'bookingComplete',id:'review-booking',requestId:'complete-booking'}).expect(200);
test('authorised completion to concurrent reviews, persistent notification, public profile and updated comparison',async()=>{
 await submit().expect(409);await call('review-owner','marketplace',{op:'bookingComplete',id:'review-booking',requestId:'forged-completion'}).expect(403);
 await complete();await Promise.all(Array.from({length:6},()=>submit().expect(200)));
 const id=reviewId('review-booking');assert.equal((await db.collection('serviceReviews').get()).size,1);
 assert.deepEqual((await db.doc('users/review-shop').get()).data().verifiedRating.count,1);
 const notices=await db.collection('notifications').where('event','==','service_review_created').get();assert.equal(notices.size,1);assert.equal(notices.docs[0].id,'service_review_'+id);
 const notifications=(await call('review-shop','marketplace',{op:'notifications'}).expect(200)).body.data;
 const notification=notifications.items.find(item=>item.event==='service_review_created');assert.deepEqual(notification.target,{type:'booking',id:'review-booking'});
 await call('review-shop','marketplace',{op:'notificationRead',id:notification.id,requestId:'read-review-notice'}).expect(200);
 assert.ok((await db.doc('notifications/'+notification.id).get()).data().readAt);
 // A fresh service instance and fresh client read retain the original review.
 http=createApp({auth,services:createServices({db,auth,storage:{},photoStorage:{}})});
 const profile=(await call('review-other','service-reviews',{op:'workshopReviews',shopId:'review-shop'}).expect(200)).body.data;
 assert.deepEqual(profile.summary,{average:5,count:1});assert.equal(profile.items[0].id,id);
 assert.ok(!JSON.stringify(profile).includes('review-booking'));assert.ok(!JSON.stringify(profile).includes('PRIVATE'));assert.ok(!JSON.stringify(profile).includes('review-owner'));
 const ownerReview=(await call('review-owner','service-reviews',{op:'bookingReview',id:'review-booking'}).expect(200)).body.data;assert.equal(ownerReview.review.rating,5);
 await db.doc('vehicles/review-car').set({ownerId:'review-owner',archived:false});await db.doc('serviceCategories/review-category').set({archived:false});
 await db.doc('serviceRequests/review-request').set({ownerId:'review-owner',vehicleId:'review-car',categoryId:'review-category',status:'open',termsVersion:1,mandatoryServices:['Paint'],visibility:'open',serviceLocation:{latitude:-26,longitude:28}});
 for(const shopId of ['review-shop','review-competitor']){const id=quoteId('review-request',shopId);await db.doc('quotations/'+id).set({shopId,shopName:shopId,serviceRequestId:'review-request',status:'submitted',termsVersion:1,validUntil:Timestamp.fromMillis(Date.now()+3600000),totalCents:10000,currency:'ZAR',items:[{description:'Paint',amountCents:10000}],scopeConfirmed:true,allChargesIncluded:true,coveredServices:['Paint']});}
 const compared=(await call('review-owner','marketplace',{op:'request',id:'review-request',comparison:true}).expect(200)).body.data.recommendations;
 assert.equal(compared.recommendedId,quoteId('review-request','review-shop'));assert.equal(compared.ratingUsed,true);assert.match(compared.entries.find(e=>e.id===compared.recommendedId).ratingExplanation,/1 verified reviews/);
});
test('real authentication, ownership and supplied-field boundaries prevent forged reviews',async()=>{
 await complete();await request(http).post('/api/service-reviews').send({op:'reviewSubmit'}).expect(401);
 for(const uid of ['review-other','review-shop','review-admin'])await submit(uid).expect(uid==='review-other'?404:403);
 for(const extra of [{customerId:'review-other'},{shopId:'review-competitor'},{serviceCompleted:true},{rating:'5'},{rating:6},{text:'too short'}])await submit('review-owner',extra).expect(400);
 await auth.updateUser('review-owner',{disabled:true});await submit().expect(401);assert.equal((await db.collection('serviceReviews').get()).size,0);
});
test('moderation and reconciliation adjust only visible ratings without changing the customer review',async()=>{
 await complete();await submit().expect(200);const id=reviewId('review-booking');
 const hide={op:'serviceReviewModerate',id,status:'hidden',reason:'Investigated disclosure of private information.',requestId:'hide-review'};
 await call('review-shop','admin',hide).expect(403);
 await Promise.all([call('review-admin','admin',hide).expect(200),call('review-admin','admin',hide).expect(200)]);
 assert.equal((await call('review-other','service-reviews',{op:'workshopReviews',shopId:'review-shop'}).expect(200)).body.data.items.length,0);
 assert.equal((await db.doc('users/review-shop').get()).data().verifiedRating.count,0);
 await call('review-admin','admin',{...hide,status:'visible',requestId:'restore-review',reason:'Investigation confirmed that this review is valid.'}).expect(200);
 // Replaying an acknowledged/lost hide request cannot undo a later restoration.
 await call('review-admin','admin',hide).expect(200);assert.equal((await db.doc('users/review-shop').get()).data().verifiedRating.count,1);
 await call('review-admin','admin',{op:'serviceReviewReconcile',shopId:'review-shop',reason:'Scheduled consistency check after investigation.',requestId:'reconcile-review'}).expect(200);
 const record=(await db.doc('serviceReviews/'+id).get()).data();assert.equal(record.rating,5);assert.equal(record.status,'visible');
 assert.equal((await db.collection('auditLogs').where('action','==','serviceReview.moderate').get()).size,2);
});
test('real public review query paginates, excludes hidden reviews and refuses unavailable workshops',async()=>{
 const batch=db.batch();for(let i=0;i<24;i++)batch.set(db.doc('serviceReviews/public_'+String(i).padStart(2,'0')),{shopId:'review-shop',customerId:'private-owner',bookingId:'private-booking',status:i===0?'hidden':'visible',rating:4,text:'Synthetic verified service feedback.',createdAt:Timestamp.now()});await batch.commit();
 const first=(await call('review-other','service-reviews',{op:'workshopReviews',shopId:'review-shop'}).expect(200)).body.data;assert.equal(first.items.length,20);
 await db.doc('serviceReviews/'+first.cursor).delete();const second=(await call('review-other','service-reviews',{op:'workshopReviews',shopId:'review-shop',cursor:first.cursor}).expect(200)).body.data;assert.equal(second.items.length,3);assert.equal(second.cursor,null);
 await db.doc('users/review-shop').update({accountStatus:'suspended'});await call('review-other','service-reviews',{op:'workshopReviews',shopId:'review-shop'}).expect(404);
});
