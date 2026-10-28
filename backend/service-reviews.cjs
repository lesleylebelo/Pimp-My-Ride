const {createHash}=require('node:crypto');
const reviewId=bookingId=>createHash('sha256').update('verified-service-review\n'+bookingId).digest('hex');
const {FieldPath,FieldValue,AggregateField}=require('firebase-admin/firestore');
const {mutation}=require('./mutations.cjs');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const stamp=()=>FieldValue.serverTimestamp();
const MIN_TEXT=20,MAX_TEXT=2000;
const eligible=(p,role)=>p?.role===role&&D.active(p)&&!p.statusOperation&&!p.provisioningOperation&&(role!=='shop'||p.verificationStatus==='approved'&&!p.reviewOperation);
function content(value,label='Review',min=MIN_TEXT,max=MAX_TEXT){
 const text=D.text(value,label,max).normalize('NFC');
 if(text.length<min||new Set(text.toLowerCase().replace(/\s/g,'')).size<4||!/[\p{L}\p{N}]/u.test(text)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))D.fail(`${label} must contain ${min}–${max} meaningful characters.`);
 // Public reviews must not publish contact details; no unreliable sentiment filter.
 if(/https?:\/\/|www\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}/i.test(text))D.fail(`${label} must not contain links, email addresses or phone numbers.`);
 return text;
}
const validTotals=s=>Number.isSafeInteger(s?.count)&&Number.isSafeInteger(s?.sum)&&s.count>=0&&s.sum>=s.count&&s.sum<=s.count*5&&(s.count!==0||s.sum===0);
function ratingSummary(profile){
 const s=profile?.verifiedRating;
 if(!s)return {average:null,count:0};
 if(!validTotals(s))return {average:null,count:0};
 return {average:s.count?s.sum/s.count:null,count:s.count};
}
function aggregate(profile,deltaCount,deltaSum){
 const raw=profile.verifiedRating,summary=ratingSummary(profile);
 if(raw&&(!validTotals(raw)||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.revision>=Number.MAX_SAFE_INTEGER))D.fail('Rating totals need administrator reconciliation.','failed-precondition');
 const count=summary.count+deltaCount,sum=(raw?.sum||0)+deltaSum;
 if(count<0||sum<count||sum>5*count||!Number.isSafeInteger(sum)||!Number.isSafeInteger(count))D.fail('Rating totals need administrator reconciliation.','failed-precondition');
 return {count,sum,revision:(raw?.revision||0)+1,updatedAt:stamp()};
}
const publicReview=doc=>{
 const v=doc.data();
 return {id:doc.id,rating:v.rating,text:v.text,customerName:v.customerName||'Verified customer',serviceCategory:v.serviceCategory||null,createdAt:v.createdAt?.toMillis?.()??null,verified:true};
};
function createServiceReviews({db,auth,actor}){
 async function authEligible(uid){try{const u=await auth.getUser(uid);return u.emailVerified===true&&!u.disabled;}catch(e){if(e.code==='auth/user-not-found')return false;throw e;}}
 async function shop(id){const doc=await db.doc('users/'+D.id(id)).get();if(!eligible(doc.data(),'shop')||!await authEligible(id))D.fail('Workshop unavailable.','not-found');return doc;}
 function requireCustomer(p){if(!eligible(p,'owner'))D.fail('An active customer account is required.','permission-denied');}
 const audit=(tx,uid,action,id,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:'serviceReview.'+action,target:id,details,createdAt:stamp()});
 async function ownReview(a,id){
  id=D.id(id);
  if(!eligible(a.profile,a.profile.role)||!['owner','shop'].includes(a.profile.role))D.fail('Account access unavailable.','permission-denied');
  const booking=(await db.doc('bookings/'+D.id(id)).get()).data();
  if(!booking||booking[a.profile.role==='shop'?'shopId':'ownerId']!==a.uid)D.fail('Booking not found.','not-found');
  const review=await db.doc('serviceReviews/'+reviewId(id)).get();
  return {review:review.exists&&(a.profile.role==='owner'||review.data().status==='visible')?{...publicReview(review),status:review.data().status}:null,
   eligible:!review.exists&&a.profile.role==='owner'&&booking.status==='confirmed'&&booking.serviceStatus==='completed'&&!!booking.serviceCompletedAt&&!booking.cancelledAt&&!booking.invalidatedAt};
 }
 async function submit(a,input){
  requireCustomer(a.profile);const id=D.id(input.id);
  if(!Number.isInteger(input.rating)||input.rating<1||input.rating>5)D.fail('Select an integer rating from 1 to 5.');
  const text=content(input.text),ref=db.doc('serviceReviews/'+reviewId(id));
  return db.runTransaction(async tx=>{
   const [actorDoc,bookingDoc,existing]=await Promise.all([tx.get(db.doc('users/'+a.uid)),tx.get(db.doc('bookings/'+id)),tx.get(ref)]);
   requireCustomer(actorDoc.data());if(!await authEligible(a.uid))D.fail('Account access is unavailable.','permission-denied');
   const b=bookingDoc.data();
   if(!b||b.ownerId!==a.uid)D.fail('Booking not found.','not-found');
   if(b.shopId===a.uid||b.status!=='confirmed'||b.serviceStatus!=='completed'||!b.serviceCompletedAt||b.cancelledAt||b.invalidatedAt)D.fail('Only completed, valid workshop bookings can be reviewed.','failed-precondition');
   const shopRef=db.doc('users/'+D.id(b.shopId)),shopDoc=await tx.get(shopRef),p=shopDoc.data();
   if(!eligible(p,'shop')||!await authEligible(b.shopId))D.fail('Workshop unavailable.','failed-precondition');
   if(existing.exists){
    const r=existing.data();
    if(r.customerId!==a.uid||r.shopId!==b.shopId||r.rating!==input.rating||r.text!==text)D.fail('This booking has already been reviewed.','already-exists');
    return {id:ref.id,review:{...publicReview(existing),status:r.status},alreadySubmitted:true};
   }
   // A generic label avoids exposing names/contact details or stable customer IDs.
   const value={bookingId:id,customerId:a.uid,shopId:b.shopId,rating:input.rating,text,customerName:'Verified customer',serviceCategory:typeof b.categoryName==='string'?b.categoryName.slice(0,80):null,status:'visible',createdAt:stamp(),updatedAt:stamp(),schemaVersion:1};
   const notice=db.doc('notifications/service_review_'+ref.id),notification=await tx.get(notice);
   const totals=aggregate(p,1,input.rating);
   tx.create(ref,value);tx.update(shopRef,{verifiedRating:totals});
   // Same transaction as review + totals: no notification delivery gap or outbox.
   if(!notification.exists)tx.create(notice,{recipientUid:b.shopId,event:'service_review_created',bookingId:id,reviewId:ref.id,title:'New verified service review',body:`Verified customer rated your completed service ${input.rating} out of 5.`,target:{type:'booking',id},readAt:null,createdAt:stamp()});
   audit(tx,a.uid,'submit',ref.id,{rating:input.rating});
   return {id:ref.id};
  });
 }
 async function list(a,input){
  if(!eligible(a.profile,a.profile.role)||!['owner','shop'].includes(a.profile.role))D.fail('Account access is unavailable.','permission-denied');
  const shopDoc=await shop(input.shopId),shopId=shopDoc.id;
  let query=db.collection('serviceReviews').where('shopId','==',shopId).where('status','==','visible').orderBy(FieldPath.documentId());
  if(input.cursor)query=query.startAfter(D.id(input.cursor));
  const snap=await query.limit(21).get(),docs=snap.docs.slice(0,20);
  return {items:docs.map(publicReview),cursor:snap.docs.length>20?docs.at(-1).id:null,summary:ratingSummary(shopDoc.data())};
 }
 async function api(request){
  const a=await actor(request),input=request.data||{};
  const fields={reviewSubmit:['id','rating','text'],bookingReview:['id'],workshopReviews:['shopId','cursor']};
  if(!Object.hasOwn(fields,input.op))D.fail('Unknown service review operation.');
  M.fields(input,['op',...fields[input.op]]);
  if(input.op==='reviewSubmit')return submit(a,input);
  if(input.op==='bookingReview')return ownReview(a,input.id);
  return list(a,input);
 }
 async function moderate(request){
  const a=await actor(request,true),input=request.data||{};
  if(!eligible(a.profile,'admin'))D.fail('Administrator access unavailable.','permission-denied');
  if(input.op==='serviceReviews'){
   M.fields(input,['op','cursor']);let query=db.collection('serviceReviews').orderBy(FieldPath.documentId());
   if(input.cursor)query=query.startAfter(D.id(input.cursor));const snap=await query.limit(21).get();
   return {items:snap.docs.slice(0,20).map(doc=>({...publicReview(doc),status:doc.data().status,shopId:doc.data().shopId,moderationReason:doc.data().moderationReason||null})),cursor:snap.docs.length>20?snap.docs[19].id:null};
  }
  if(input.op==='serviceReviewModerate'){
   M.fields(input,['op','id','status','reason','requestId']);const id=D.id(input.id),reason=content(input.reason,'Moderation reason',10,500);
   if(!['visible','hidden'].includes(input.status))D.fail('Choose visible or hidden.');
   return mutation(db,a.uid,input.op,input).atomic(async tx=>{
    const [admin,doc]=await Promise.all([tx.get(db.doc('users/'+a.uid)),tx.get(db.doc('serviceReviews/'+id))]);
    if(!eligible(admin.data(),'admin')||!await authEligible(a.uid))D.fail('Administrator access unavailable.','permission-denied');
    if(!doc.exists)D.fail('Review not found.','not-found');const v=doc.data(),ref=db.doc('users/'+D.id(v.shopId)),profile=(await tx.get(ref)).data();
    if(!profile)D.fail('Workshop profile missing.','failed-precondition');
    if(v.status===input.status)return {id,status:v.status};
    const change=input.status==='visible'?1:-1,totals=aggregate(profile,change,change*v.rating);
    tx.update(ref,{verifiedRating:totals});tx.update(doc.ref||db.doc('serviceReviews/'+id),{status:input.status,moderationReason:reason,moderatedBy:a.uid,moderatedAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,'moderate',id,{reason,before:v.status,after:input.status});return {id,status:input.status};
   });
  }
  if(input.op==='serviceReviewReconcile'){
   M.fields(input,['op','shopId','reason','requestId']);const id=D.id(input.shopId),reason=content(input.reason,'Reconciliation reason',10,500),ref=db.doc('users/'+id),before=(await ref.get()).data();
   if(!before||before.role!=='shop')D.fail('Workshop not found.','not-found');
   const observedRevision=before.verifiedRating?.revision??0;
   const revision=Number.isSafeInteger(observedRevision)&&observedRevision>=0&&observedRevision<Number.MAX_SAFE_INTEGER?observedRevision:0;
   const snapshot=await db.collection('serviceReviews').where('shopId','==',id).where('status','==','visible').aggregate({count:AggregateField.count(),sum:AggregateField.sum('rating')}).get();
   const {count,sum}=snapshot.data();
   return mutation(db,a.uid,input.op,input).atomic(async tx=>{
    const [admin,current]=await Promise.all([tx.get(db.doc('users/'+a.uid)),tx.get(ref)]);
    if(!eligible(admin.data(),'admin')||!await authEligible(a.uid))D.fail('Administrator access unavailable.','permission-denied');
    if((current.data()?.verifiedRating?.revision??0)!==observedRevision)D.fail('Reviews changed during reconciliation. Retry.','failed-precondition');
    if(!Number.isSafeInteger(count)||!Number.isSafeInteger(sum)||count<0||sum<count||sum>count*5)D.fail('Review data needs operator investigation.','failed-precondition');
    tx.update(ref,{verifiedRating:{count,sum,revision:revision+1,updatedAt:stamp()}});audit(tx,a.uid,'reconcile',id,{reason,count,sum});return {id,count};
   });
  }
  D.fail('Unknown review moderation operation.');
 }
 return {api,moderate};
}
module.exports={reviewId,createServiceReviews,ratingSummary,content,eligible};
