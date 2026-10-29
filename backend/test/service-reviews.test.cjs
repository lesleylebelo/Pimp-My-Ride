const {test}=require('node:test'),assert=require('node:assert/strict');
const {Timestamp}=require('firebase-admin/firestore');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createServiceReviews,ratingSummary,reviewId}=require('../service-reviews.cjs');
function fixture(){
 const db=memoryDb({'users/owner':{role:'owner'},'users/other':{role:'owner'},'users/shop':{role:'shop',verificationStatus:'approved'},'users/admin':{role:'admin'},'bookings/booking':{ownerId:'owner',shopId:'shop',status:'confirmed',serviceStatus:'completed',serviceCompletedAt:Timestamp.now(),categoryName:'Paint',paymentStatus:'due',registration:'PRIVATE'}});
 const base=db.collection;db.collection=path=>{
  function q(filters=[],cursor=null,limit=Infinity){return {...base(path),where:(key,op,value)=>q([...filters,[key,value]],cursor,limit),orderBy:()=>q(filters,cursor,limit),startAfter:id=>q(filters,id,limit),limit:n=>q(filters,cursor,n),get:async()=>({docs:[...db.rows].filter(([p,v])=>p.startsWith(path+'/')&&!p.slice(path.length+1).includes('/')&&filters.every(([k,e])=>v[k]===e)&&(!cursor||p.split('/').at(-1)>cursor)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([p])=>({id:p.split('/').at(-1),data:()=>db.rows.get(p)}))}),aggregate:()=>({get:async()=>{const docs=(await q(filters).get()).docs;return {data:()=>({count:docs.length,sum:docs.reduce((sum,doc)=>sum+doc.data().rating,0)})};}})};}
  return q();
 };
 const identities=new Map(),auth={getUser:async uid=>identities.get(uid)||{emailVerified:true,disabled:false}},actor=async(request,admin)=>{
  if(!request.auth)throw Object.assign(Error('Sign in'),{code:'unauthenticated'});
  const uid=request.auth.uid,profile=db.rows.get('users/'+uid),identity=await auth.getUser(uid);
  if(!profile||profile.accountStatus==='suspended'||!identity.emailVerified||identity.disabled||admin&&profile.role!=='admin')throw Object.assign(Error('Forbidden'),{code:'permission-denied'});
  return {uid,profile};
 };
 const service=createServiceReviews({db,auth,actor});
 const call=(op,input={},uid='owner')=>service.api({auth:uid?{uid}:null,data:{op,...input}});
 const submit=(input={},uid='owner')=>call('reviewSubmit',{id:'booking',rating:4,text:'A careful repair and clear communication throughout.',...input},uid);
 const moderate=(status='hidden',uid='admin',extra={})=>service.moderate({auth:{uid},data:{op:'serviceReviewModerate',id:reviewId('booking'),status,reason:'Personal information reported and investigated.',...extra}});
 return {db,identities,service,call,submit,moderate};
}
test('all five integer ratings are accepted, trimmed and persist without requiring payment',async()=>{
 for(const rating of [1,2,3,4,5]){const f=fixture();await f.submit({rating,text:'  A careful repair and clear communication throughout.  '});const r=f.db.rows.get('serviceReviews/'+reviewId('booking'));assert.equal(r.rating,rating);assert.equal(r.text,'A careful repair and clear communication throughout.');assert.equal(r.customerId,'owner');assert.equal(r.shopId,'shop');assert.equal(r.status,'visible');assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:rating,count:1});}
});
test('invalid ratings and abusive payload shapes do not write any review',async()=>{
 for(const rating of [0,6,1.5,'5',null,{},NaN,true]){const f=fixture();await assert.rejects(()=>f.submit({rating}),{code:'invalid-argument'});assert.ok(!f.db.rows.has('serviceReviews/'+reviewId('booking')));}
 for(const text of ['', '  ', 'short',null,{},'x'.repeat(2001),'!'.repeat(30),'x'.repeat(30),'My email is private@example.test and the service was okay','Visit https://spam.invalid for details on this service','Call +27 82 123 4567 about the service please']){const f=fixture();await assert.rejects(()=>f.submit({text}),{code:'invalid-argument'});}
});
test('forged identity, target, aggregate, status and completion fields are rejected',async()=>{
 for(const key of ['customerId','shopId','ownerId','serviceCompleted','status','verifiedRating','bookingId']){const f=fixture();await assert.rejects(()=>f.submit({[key]:'forged'}),{code:'invalid-argument'});}
});
test('only an active customer owning a completed valid booking can review',async()=>{
 for(const uid of [null,'other','shop','admin']){const f=fixture();await assert.rejects(()=>f.submit({},uid));}
 for(const change of [{status:'cancelled'},{status:'pending_confirmation'},{serviceStatus:'not_started'},{serviceCompletedAt:null},{cancelledAt:Timestamp.now()},{invalidatedAt:Timestamp.now()},{shopId:'owner'}]){const f=fixture();Object.assign(f.db.rows.get('bookings/booking'),change);await assert.rejects(()=>f.submit());}
 for(const change of [{accountStatus:'suspended'},{statusOperation:'pending'},{provisioningOperation:'pending'}]){const f=fixture();Object.assign(f.db.rows.get('users/owner'),change);await assert.rejects(()=>f.submit(),{code:'permission-denied'});}
 for(const change of [{disabled:true,emailVerified:true},{emailVerified:false}]){const f=fixture();f.identities.set('owner',change);await assert.rejects(()=>f.submit(),{code:'permission-denied'});}
});
test('unavailable workshops cannot gain new ratings',async()=>{
 for(const change of [{accountStatus:'suspended'},{verificationStatus:'pending'},{reviewOperation:'in-progress'},{statusOperation:'pending'}]){const f=fixture();Object.assign(f.db.rows.get('users/shop'),change);await assert.rejects(()=>f.submit(),{code:'failed-precondition'});}
 const f=fixture();f.identities.set('shop',{emailVerified:true,disabled:true});await assert.rejects(()=>f.submit());
});

test('deleted workshop review archives preserve history, moderation and aggregate reconciliation without allowing new reviews',async()=>{
 const f=fixture();await f.submit();f.db.rows.set('users/shop',{role:'deleted',formerRole:'shop',accountStatus:'deleted',archivedReviews:true,verifiedRating:{sum:4,count:1,revision:1}});
 assert.equal((await f.call('workshopReviews',{shopId:'shop'})).items.length,1);await assert.rejects(()=>f.submit());
 await f.moderate();assert.equal((await f.call('workshopReviews',{shopId:'shop'})).items.length,0);
 await f.service.moderate({auth:{uid:'admin'},data:{op:'serviceReviewReconcile',shopId:'shop',reason:'Reconcile retained historical review archive'}});assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:null,count:0});
 await f.moderate('visible');assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:4,count:1});
});
test('concurrent and lost-response retries create one review, one notification and one aggregate increment',async()=>{
 const f=fixture();await Promise.all(Array.from({length:8},()=>f.submit()));
 assert.equal([...f.db.rows.keys()].filter(p=>p.startsWith('serviceReviews/')).length,1);assert.equal([...f.db.rows.keys()].filter(p=>p.startsWith('notifications/')).length,1);
 assert.equal(f.db.rows.get('users/shop').verifiedRating.sum,4);assert.equal(f.db.rows.get('users/shop').verifiedRating.count,1);
 assert.equal([...f.db.rows.values()].filter(v=>v.action==='serviceReview.submit').length,1);
 await assert.rejects(()=>f.submit({rating:5}),{code:'already-exists'});
 const n=f.db.rows.get('notifications/service_review_'+reviewId('booking'));assert.equal(n.recipientUid,'shop');assert.deepEqual(n.target,{type:'booking',id:'booking'});assert.equal(n.readAt,null);assert.ok(!n.simulated);
});
test('notification write failure rolls back review and totals; a retry can safely commit',async()=>{
 const f=fixture(),original=f.db.runTransaction;let fail=true;
 f.db.runTransaction=fn=>original(tx=>fn({...tx,create:(ref,value)=>{if(fail&&ref.path.startsWith('notifications/'))throw Error('notification storage unavailable');return tx.create(ref,value);}}));
 await assert.rejects(()=>f.submit());assert.ok(!f.db.rows.has('serviceReviews/'+reviewId('booking')));assert.ok(!f.db.rows.get('users/shop').verifiedRating);
 fail=false;await f.submit();assert.equal(f.db.rows.get('users/shop').verifiedRating.count,1);
});
test('separate bookings can review the same workshop and public DTOs omit booking/customer identifiers',async()=>{
 const f=fixture();await f.submit({rating:5});f.db.rows.set('bookings/second',{...f.db.rows.get('bookings/booking')});await f.submit({id:'second',rating:1});
 const first=await f.call('workshopReviews',{shopId:'shop'});assert.deepEqual(first.summary,{average:3,count:2});assert.equal(first.items.length,2);
 for(const row of first.items){assert.deepEqual(Object.keys(row).sort(),['createdAt','customerName','id','rating','serviceCategory','text','verified']);assert.equal(row.customerName,'Verified customer');}
 await assert.rejects(()=>f.call('bookingReview',{id:'booking'},'other'),{code:'not-found'});
 assert.equal((await f.call('bookingReview',{id:'booking'},'shop')).review.rating,5);
 assert.equal((await f.call('bookingReview',{id:' booking '})).review.rating,5);
});
test('moderation removes/restores exactly one rating, logs reason and cannot be performed by shops',async()=>{
 const f=fixture();await f.submit();await assert.rejects(()=>f.moderate('hidden','shop'),{code:'permission-denied'});
 await f.moderate();await f.moderate();assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:null,count:0});
 assert.equal((await f.call('workshopReviews',{shopId:'shop'})).items.length,0);assert.equal((await f.call('bookingReview',{id:'booking'})).review.status,'hidden');assert.equal((await f.call('bookingReview',{id:'booking'},'shop')).review,null);
 await f.moderate('visible');assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:4,count:1});assert.equal(f.db.rows.get('serviceReviews/'+reviewId('booking')).rating,4);
 const audits=[...f.db.rows.values()].filter(v=>v.action==='serviceReview.moderate');assert.equal(audits.length,2);assert.ok(audits.every(v=>v.details.reason.length>=10));
});
test('aggregate reconciliation repairs totals and refuses a concurrent revision change',async()=>{
 const f=fixture();await f.submit();f.db.rows.get('users/shop').verifiedRating.sum=3;
 const reconcile=()=>f.service.moderate({auth:{uid:'admin'},data:{op:'serviceReviewReconcile',shopId:'shop',reason:'Investigated inconsistent aggregate totals'}});
 await reconcile();assert.deepEqual(ratingSummary(f.db.rows.get('users/shop')),{average:4,count:1});
 f.db.before=async()=>{f.db.rows.get('users/shop').verifiedRating.revision++;};await assert.rejects(reconcile,{code:'failed-precondition'});
});
test('public history is bounded, supports deleted cursor records and excludes hidden reviews',async()=>{
 const f=fixture();for(let i=0;i<25;i++)f.db.rows.set('serviceReviews/r'+String(i).padStart(2,'0'),{shopId:'shop',rating:4,text:'Synthetic public review',status:i===0?'hidden':'visible'});
 const first=await f.call('workshopReviews',{shopId:'shop'});assert.equal(first.items.length,20);f.db.rows.delete('serviceReviews/'+first.cursor);
 const second=await f.call('workshopReviews',{shopId:'shop',cursor:first.cursor});assert.equal(second.items.length,4);assert.equal(second.cursor,null);
 f.db.rows.get('users/shop').accountStatus='suspended';await assert.rejects(()=>f.call('workshopReviews',{shopId:'shop'}),{code:'not-found'});
});
