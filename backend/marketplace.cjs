const {createHash}=require('node:crypto');
const {FieldPath,FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),B=require('./booking-domain.cjs'),P=require('./photo-domain.cjs');
const {mutation}=require('./mutations.cjs');
const {createMockPaymentProvider}=require('./payment-provider.cjs');
const {assertMockPaymentsEnabled}=require('./mock-payment-gate.cjs');
const C=require('./marketplace-communications.cjs');
const {readRecommendations}=require('./quote-recommendation-read.cjs');
const PAGE_SIZE=20;
const stamp=()=>FieldValue.serverTimestamp();
const quoteId=(requestId,shopId)=>createHash('sha256').update(`${requestId}\n${shopId}`).digest('hex');
const serialize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,serialize(v)])):value;
const row=doc=>({id:doc.id,...serialize(doc.data())});
const allowed={
 paymentSimulation:[],
 vehicles:['cursor','archived'],vehicleSave:['id','version','make','model','year','colour','registration'],vehicleArchive:['id','version','archived'],
 categories:['cursor'],shops:['cursor'],requestCreate:['vehicleId','title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId','photoIds','mandatoryServices','serviceLocation'],requestUpdate:['id','version','vehicleId','title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId','photoIds','mandatoryServices','serviceLocation'],
 requests:['feed','cursor'],request:['id','quotesCursor'],requestClose:['id'],quoteSubmit:['serviceRequestId','termsVersion','scope','items','completionDays','warranty','validForDays','depositType','depositValue','scopeConfirmed','allChargesIncluded','coveredServices'],quotes:['cursor'],quoteWithdraw:['id'],
 quoteAccept:['id','paymentMethod'],paymentMockResult:['id','paymentAttemptId','expectedBookingId','expectedAmountCents','expectedCurrency','outcome'],paymentRetry:['id'],paymentStart:['id'],paymentRecordInStore:['id','method'],bookingComplete:['id'], bookings:['cursor'],booking:['id','paymentCursor'],notifications:['cursor'],notificationRead:['id'],receipt:['id'],bookingConfirm:['id','appointmentDate','appointmentTime'],bookingCancel:['id','reason'],
};
const mutations=new Set(['vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','paymentMockResult','paymentRetry','paymentStart','paymentRecordInStore','bookingComplete','bookingConfirm','bookingCancel','notificationRead']);
function eligible(profile,role){return profile?.role===role&&D.active(profile)&&!profile.statusOperation&&!profile.provisioningOperation&&(role!=='shop'||(profile.verificationStatus==='approved'&&!profile.reviewOperation));}
function requireRole(profile,role){if(!eligible(profile,role))D.fail(role==='shop'?'An active, approved shop account is required.':'An active vehicle owner account is required.','permission-denied');}
function requestFor(value,role){const result={...value};if(Array.isArray(result.photos))result.photos=result.photos.map(photo=>P.safePhoto(photo,photo.id));if(role==='shop'){delete result.ownerId;delete result.vehicleId;delete result.acceptedQuoteId;delete result.bookingId;}return result;}
const recordVersion=value=>Number.isSafeInteger(value.version)&&value.version>0?value.version:1;
const termsVersion=value=>Number.isSafeInteger(value.termsVersion)&&value.termsVersion>0?value.termsVersion:recordVersion(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const sameValue=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
const materialRequestTerms=value=>({
 title:value.title,description:value.description,categoryId:value.categoryId,categoryName:value.categoryName,city:value.city,
 budgetMinCents:value.budgetMinCents,budgetMaxCents:value.budgetMaxCents,
 visibility:value.visibility,shopId:value.shopId,vehicleId:value.vehicleId,
 vehicle:M.vehicleSnapshot(value.vehicle||{}),photoIds:value.photoIds||[],
 mandatoryServices:value.mandatoryServices||[],serviceLocation:value.serviceLocation||null,
});
const requestEditFields=['title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId','vehicleId','vehicle','photoIds','photos','categoryName','mandatoryServices','serviceLocation'];
const sameRequestTerms=(left,right)=>sameValue(materialRequestTerms(left),materialRequestTerms(right));
const quoteMatchesTerms=(quote,request)=>{
 const version=termsVersion(request);
 if(Object.prototype.hasOwnProperty.call(quote,'termsVersion'))return Number.isSafeInteger(quote.termsVersion)&&quote.termsVersion>0&&quote.termsVersion===version;
 return Number.isSafeInteger(quote.requestVersion)&&quote.requestVersion>0&&quote.requestVersion===version;
};
function paymentAccounting(booking){
 const total=booking.totalCents;
 if(!Number.isSafeInteger(total)||total<=0||total>100000000||booking.currency!=='ZAR')D.fail('The saved booking payment terms are inconsistent. Contact support.','failed-precondition');
 const has=key=>Object.prototype.hasOwnProperty.call(booking,key),hasPaid=has('paidCents'),hasBalance=has('balanceDueCents');
 const legacy=!hasPaid&&!hasBalance,status=booking.paymentStatus;
 if(hasPaid!==hasBalance||(!legacy&&(!Number.isSafeInteger(booking.paidCents)||!Number.isSafeInteger(booking.balanceDueCents))))D.fail('The saved booking balance is malformed. Contact support.','failed-precondition');
 if((has('paymentStatus')&&!['due','pending','failed','cancelled','partially_paid','paid'].includes(status))||(!legacy&&!has('paymentStatus'))||legacy&&status==='partially_paid')D.fail('The saved booking payment status is inconsistent. Contact support.','failed-precondition');
 // Only records with both accounting fields absent use legacy defaults.
 const paid=legacy?(status==='paid'?total:0):booking.paidCents,balance=legacy?total-paid:booking.balanceDueCents;
 if(paid<0||paid>total||balance<0||balance>total||balance!==total-paid)D.fail('The saved booking balance is inconsistent. Contact support.','failed-precondition');
 if((paid===total&&status!=='paid')||(paid>0&&paid<total&&status!=='partially_paid')||(paid===0&&['paid','partially_paid'].includes(status)))D.fail('The saved booking payment status does not match its balance. Contact support.','failed-precondition');
 return {totalCents:total,paidCents:paid,balanceDueCents:balance};
}
const paymentStatus=(paid,balance,attemptStatus='due')=>balance===0?'paid':paid>0?'partially_paid':attemptStatus==='pending'?'pending':attemptStatus==='failed'||attemptStatus==='cancelled'?attemptStatus:'due';
// Balance fields describe simulated amounts only on explicitly tagged bookings.
// Never reinterpret unlabelled or real historical settlement as a test.
function assertSimulatedBooking(booking){
 if(booking.simulated!==true||booking.testTransaction!==true||booking.paymentProvider!=='mock'
  ||booking.paymentAccountingMode!==undefined&&booking.paymentAccountingMode!=='simulated')D.fail('This booking is not explicitly marked for simulated payments. Existing payment evidence has not been changed.','failed-precondition');
}
function assertSimulatedAttempt(attempt,booking,id){
 if(!attempt||attempt.provider!=='mock'||attempt.simulated!==true||attempt.testTransaction!==true||attempt.bookingId!==id||attempt.currency!==booking.currency)D.fail('The saved attempt is not a matching simulated payment. Existing payment evidence has not been changed.','failed-precondition');
}
function customerDisplayName(profile){
 const name=typeof profile?.fullName==='string'?profile.fullName.trim(): '';
 const safe=name.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'').replace(/(?:\+?\d[\d\s().-]{7,}\d)/g,'').replace(/\s+/g,' ').trim();
 return safe||'Customer';
}
function createMarketplace({db,auth,actor,paymentProvider=createMockPaymentProvider(),mockPaymentEnv=process.env}){
 const audit=(tx,uid,action,target,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:`marketplace.${action}`,target,details,createdAt:stamp()});
 const quotationHead=async(tx,requestId,shopId,headDoc,legacyDoc)=>{
  if(!headDoc.exists){
   if(!legacyDoc.exists)return {id:null,doc:null,quote:null,hasHead:false};
   const legacy=legacyDoc.data();
   if(!legacy||legacy.serviceRequestId!==requestId||legacy.shopId!==shopId)D.fail('The current quotation history is inconsistent. Refresh and contact support.','failed-precondition');
   return {id:legacyDoc.id,doc:legacyDoc,quote:legacy,hasHead:false};
  }
  const head=headDoc.data(),validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
  if(!head||!validId(head.quoteId)||head.serviceRequestId!==requestId||head.shopId!==shopId)D.fail('The current quotation history is inconsistent. Refresh and contact support.','failed-precondition');
  const quoteRef=db.doc(`quotations/${head.quoteId}`),doc=await tx.get(quoteRef),quote=doc.data();
  if(!doc.exists||!quote||quote.serviceRequestId!==requestId||quote.shopId!==shopId)D.fail('The current quotation history is inconsistent. Refresh and contact support.','failed-precondition');
  return {id:head.quoteId,doc,quote,hasHead:true};
 };
 const notify=(tx,uid,name,bookingId=null,details={})=>{
  tx.create(db.collection('notifications').doc(),{recipientUid:uid,event:name,bookingId,...details,...C.message(name,bookingId,details),target:C.target(name,bookingId,details),readAt:null,simulated:true,testTransaction:true,createdAt:stamp()});
 };
 const event=(tx,uid,name,bookingId,details={})=>{
  notify(tx,uid,name,bookingId,details);
  if(!['booking_created','booking_confirmed','booking_cancelled','service_completed'].includes(name)&&!C.successful(name))return;
  const message=C.message(name,bookingId,details);
  tx.create(db.collection('emailOutbox').doc(),{event:name,recipientUid:uid,bookingId,...details,subject:'[SIMULATED / TEST] '+message.title,body:message.body,transport:'test_outbox',deliveryStatus:'test_sink_only',deliveryDescription:'Recorded in test outbox. No email sent.',simulated:true,testTransaction:true,createdAt:stamp()});
 };
 async function current(tx,uid,role){const profile=(await tx.get(db.doc(`users/${uid}`))).data();requireRole(profile,role);return profile;}
 async function authEligible(uid){try{const user=await auth.getUser(uid);return user.emailVerified===true&&!user.disabled;}catch(error){if(error.code==='auth/user-not-found')return false;throw error;}}
 async function assertAuth(uid){if(!await authEligible(uid))D.fail('The related account is no longer available.','failed-precondition');}
 function ownVehicle(snapshot,uid){if(!snapshot.exists||snapshot.data().ownerId!==uid)D.fail('Vehicle not found.','not-found');return snapshot.data();}
 function ownRequest(snapshot,uid){if(!snapshot.exists||snapshot.data().ownerId!==uid)D.fail('Service request not found.','not-found');return snapshot.data();}
 function ownBooking(snapshot,a){const value=snapshot.data();if(!value||value[a.profile.role==='owner'?'ownerId':'shopId']!==a.uid)D.fail('Booking not found.','not-found');return value;}
 function version(value,input){if(M.integer(input.version,'Vehicle version',1,Number.MAX_SAFE_INTEGER)!==value.version)D.fail('This vehicle changed. Refresh it before saving.','failed-precondition');}
 async function page(query,cursor){
  query=query.orderBy(FieldPath.documentId());if(cursor)query=query.startAfter(D.id(cursor));
  const snap=await query.limit(PAGE_SIZE+1).get(),docs=snap.docs.slice(0,PAGE_SIZE);
  return {docs,cursor:snap.docs.length>PAGE_SIZE?docs[PAGE_SIZE-1].id:null};
 }
 async function visibleRequest(snapshot,a){
  if(!snapshot.exists)D.fail('Service request not found.','not-found');const value=snapshot.data();
  if(a.profile.role==='owner'){ownRequest(snapshot,a.uid);return {value,customerName:null};}
  if(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===a.uid))D.fail('Service request not found.','not-found');
  const [ownerDoc,vehicleDoc,categoryDoc]=await Promise.all([
   db.doc(`users/${value.ownerId}`).get(),db.doc(`vehicles/${value.vehicleId}`).get(),db.doc(`serviceCategories/${value.categoryId}`).get(),
  ]);
  const owner=ownerDoc.data(),vehicle=vehicleDoc.data();
  if(!eligible(owner,'owner')||!vehicle||vehicle.ownerId!==value.ownerId||vehicle.archived||!categoryDoc.exists||categoryDoc.data().archived!==false||!await authEligible(value.ownerId))D.fail('Service request is unavailable.','not-found');
  return {value,customerName:customerDisplayName(owner)};
 }
 return async function marketplace(request){
  const a=await actor(request),input=request.data||{},op=input.op;
  if(!Object.prototype.hasOwnProperty.call(allowed,op))D.fail('Unknown marketplace operation.');
  M.fields(input,['op',...allowed[op],...(mutations.has(op)?['requestId']:[])]);
  if(a.profile.role==='owner')requireRole(a.profile,'owner');else requireRole(a.profile,'shop');
  const role=a.profile.role;
  if(['vehicles','vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','shops','categories','quoteAccept'].includes(op))requireRole(a.profile,'owner');
  if(['quoteSubmit','quotes','quoteWithdraw','bookingConfirm'].includes(op))requireRole(a.profile,'shop');
  const paymentOperation=['quoteAccept','paymentMockResult','paymentRetry','paymentStart','paymentRecordInStore'].includes(op);
  if(paymentOperation||op==='paymentSimulation'){
   let enabled=false,mode='disabled';
   try{mode=assertMockPaymentsEnabled(mockPaymentEnv,db);enabled=paymentProvider.name==='mock'&&paymentProvider.simulated===true;}
   catch(error){if(error.code!=='failed-precondition')throw error;}
   if(op==='paymentSimulation')return {enabled,simulated:true,mode:enabled?mode:'disabled'};
   if(!enabled)D.fail('Mock payments are disabled. Explicitly enable simulation on this backend with a mock provider.','failed-precondition');
  }
  if(op==='vehicles'){
   const archived=input.archived===undefined?false:M.bool(input.archived,'Archived');
   const result=await page(db.collection('vehicles').where('ownerId','==',a.uid).where('archived','==',archived),input.cursor);
   return {items:result.docs.map(row),cursor:result.cursor};
  }
  if(op==='categories'){
   const result=await page(db.collection('serviceCategories').where('archived','==',false),input.cursor);
   return {items:result.docs.map(doc=>({id:doc.id,name:doc.data().name,description:doc.data().description})),cursor:result.cursor};
  }
  if(op==='shops'){
   // Query approval first, then filter one bounded page for live Auth/account state.
   // A sparse page can be empty and still carry a next cursor.
   const result=await page(db.collection('users').where('role','==','shop').where('verificationStatus','==','approved'),input.cursor);
   const items=await Promise.all(result.docs.map(async doc=>{const p=doc.data();if(!eligible(p,'shop')||!await authEligible(doc.id))return null;return {id:doc.id,verified:true,...Object.fromEntries(['shopName','city','province','services'].map(key=>[key,p.shop?.[key]||'']))};}));
   return {items:items.filter(Boolean),cursor:result.cursor};
  }
  if(op==='requests'){
   let query=db.collection('serviceRequests');
   if(role==='owner'){if(input.feed!=='mine')D.fail('Choose your own requests.','permission-denied');query=query.where('ownerId','==',a.uid);}
   else if(input.feed==='open')query=query.where('visibility','==','open').where('status','==','open');
   else if(input.feed==='direct')query=query.where('visibility','==','direct').where('shopId','==',a.uid).where('status','==','open');
   else D.fail('Choose open or direct requests.','permission-denied');
   // New requests must enter the first page, independent of random document IDs.
   query=query.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
   if(input.cursor){
    const previous=await db.doc(`serviceRequests/${D.id(input.cursor)}`).get();
    if(!previous.exists)D.fail('Requests changed. Refresh the list.','failed-precondition');
    query=query.startAfter(previous);
   }
   const snapshot=await query.limit(PAGE_SIZE+1).get(),docs=snapshot.docs.slice(0,PAGE_SIZE);
   const result={docs,cursor:snapshot.docs.length>PAGE_SIZE?docs.at(-1).id:null},visible=await Promise.all(result.docs.map(async doc=>{try{return {doc,...await visibleRequest(doc,a)};}catch(error){if(error.code!=='not-found')throw error;return null;}}));
   const rows=visible.filter(Boolean);
   let quotedRequestIds=new Set();
   if(role==='shop'&&input.feed==='open'&&rows.length){
    const quoted=await db.collection('quotations').where('shopId','==',a.uid).where('serviceRequestId','in',rows.map(item=>item.doc.id)).get();
    quotedRequestIds=new Set(quoted.docs.map(doc=>doc.data().serviceRequestId));
   }
   const items=rows.map(({doc,value,customerName})=>({
    ...requestFor({...row(doc),...(role==='shop'?{customerName}: {})},role),
    ...(role==='shop'&&input.feed==='open'?{quotedByMe:quotedRequestIds.has(doc.id)}:{})
   }));
   return {items,cursor:result.cursor};
  }
  if(op==='request'){
   const id=D.id(input.id),snapshot=await db.doc(`serviceRequests/${id}`).get(),visible=await visibleRequest(snapshot,a),value=visible.value;
   if(role==='owner'){
    const result=await page(db.collection('quotations').where('serviceRequestId','==',id),input.quotesCursor);
    let recommendations;
    try{recommendations=await readRecommendations({db,request:{...value,id},quoteId,eligible,authEligible});}
    catch(error){recommendations={entries:[],rankedIds:[],recommendedId:null,limitation:'Recommendations are temporarily unavailable. Review individual quotations or refresh.'};}
    return {request:requestFor({id,...serialize(value)},role),quotes:result.docs.map(row),quotesCursor:result.cursor,recommendations};
   }
   if(input.quotesCursor)D.fail('Shop quotation paging is unavailable.');
   const [head,legacy]=await Promise.all([db.doc(`quotationHeads/${quoteId(id,a.uid)}`).get(),db.doc(`quotations/${quoteId(id,a.uid)}`).get()]);
   const selected=await quotationHead({get:ref=>ref.get()},id,a.uid,head,legacy);
   return {request:requestFor({id,...serialize(value)},role),customerName:visible.customerName,quotes:selected.doc?[row(selected.doc)]:[],quotesCursor:null};
  }
  if(op==='quotes'){
   const result=await page(db.collection('quotations').where('shopId','==',a.uid),input.cursor);
   return {items:result.docs.map(row),cursor:result.cursor};
  }
  if(op==='bookings'){
   const result=await page(db.collection('bookings').where(role==='owner'?'ownerId':'shopId','==',a.uid),input.cursor);
   return {items:result.docs.map(doc=>requestFor(row(doc),role)),cursor:result.cursor};
  }
  if(op==='notifications'){
   let query=db.collection('notifications').where('recipientUid','==',a.uid).orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
   if(input.cursor){const cursor=await db.doc('notifications/'+D.id(input.cursor)).get();if(!cursor.exists||cursor.data().recipientUid!==a.uid||!cursor.data().createdAt)D.fail('Notification cursor not found. Refresh your history.','not-found');query=query.startAfter(cursor);}
   const snap=await query.limit(PAGE_SIZE+1).get(),docs=snap.docs.slice(0,PAGE_SIZE);
   return {items:docs.map(row),cursor:snap.docs.length>PAGE_SIZE?docs[PAGE_SIZE-1].id:null};
  }
  if(op==='receipt'){
   const id=D.id(input.id),doc=await db.doc('paymentReceipts/'+id).get();
   if(!doc.exists)D.fail('Receipt not found.','not-found');
   const value=doc.data(),booking=ownBooking(await db.doc('bookings/'+D.id(value.bookingId)).get(),a);
   return {receipt:serialize(C.receiptView(value,booking,id))};
  }
  if(op==='booking'){
   const id=D.id(input.id),value=ownBooking(await db.doc(`bookings/${id}`).get(),a);
   const attempts=await page(db.collection(`bookings/${id}/paymentAttempts`),input.paymentCursor);
   const attemptRow=async doc=>({...row(doc),receiptIssued:(await db.doc(`paymentReceipts/${doc.id}`).get()).exists});
   const paymentAttempts=await Promise.all(attempts.docs.map(attemptRow));
   const currentDoc=value.currentPaymentAttemptId?await db.doc(`bookings/${id}/paymentAttempts/${D.id(value.currentPaymentAttemptId)}`).get():null;
   const currentPaymentAttempt=currentDoc?.exists?await attemptRow(currentDoc):null;
   const emails=await db.collection('emailOutbox').where('bookingId','==',id).get();
   const testEmailEvents=emails.docs.filter(doc=>doc.data().recipientUid===a.uid).map(row);
   return {booking:requestFor({id,...serialize(value)},role),currentPaymentAttempt,paymentAttempts,paymentCursor:attempts.cursor,testEmailEvents};
  }
  // Unlike the legacy admin endpoint, every marketplace mutation must carry a
  // stable retry key. Missing keys never create a receipt or perform a write.
  D.id(input.requestId);const baseReceipt=mutation(db,a.uid,`marketplace:${op}`,input);
  const receipt=paymentOperation?{atomic:(handler,options)=>baseReceipt.atomic(tx=>{assertMockPaymentsEnabled(mockPaymentEnv,db);return handler(tx);},options)}:baseReceipt;
  if(op==='notificationRead'){
   const ref=db.doc('notifications/'+D.id(input.id));
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,role);const doc=await tx.get(ref);
    if(!doc.exists||doc.data().recipientUid!==a.uid)D.fail('Notification not found.','not-found');
    if(!doc.data().readAt)tx.update(ref,{readAt:stamp()});
    return {id:ref.id,read:true};
   });
  }
  if(op==='requestUpdate'){
   const ref=db.doc(`serviceRequests/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');
    const snapshot=await tx.get(ref),value=ownRequest(snapshot,a.uid);
    const changes=M.serviceRequest({...input,mandatoryServices:input.mandatoryServices===undefined?value.mandatoryServices:input.mandatoryServices,serviceLocation:input.serviceLocation===undefined?value.serviceLocation:input.serviceLocation});
    if(value.status!=='open')D.fail('Only an open service request can be edited.','failed-precondition');
    const currentVersion=recordVersion(value),currentTermsVersion=termsVersion(value);
    if(M.integer(input.version,'Request version',1,Number.MAX_SAFE_INTEGER)!==currentVersion)D.fail('This request changed. Refresh it before saving.','failed-precondition');
    M.requireFutureDate(changes.preferredDate);
    const vehicleId=D.id(input.vehicleId||value.vehicleId),vehicleRef=db.doc(`vehicles/${vehicleId}`),categoryRef=db.doc(`serviceCategories/${changes.categoryId}`);
    const photoIds=P.photoIds(input.photoIds===undefined?value.photoIds:input.photoIds);
    const [vehicleDoc,categoryDoc]=await Promise.all([tx.get(vehicleRef),tx.get(categoryRef)]),vehicle=ownVehicle(vehicleDoc,a.uid),category=categoryDoc.data();
    if(vehicle.archived)D.fail('Choose an active vehicle.','failed-precondition');
    if(!category||category.archived!==false)D.fail('Choose an active service category.','failed-precondition');
    if(changes.shopId){
     const shop=(await tx.get(db.doc(`users/${changes.shopId}`))).data();
     if(!eligible(shop,'shop'))D.fail('Choose an active, approved shop.','failed-precondition');
     await assertAuth(changes.shopId);
    }
    const photos=await P.snapshotRequestPhotos(tx,db,vehicle,a.uid,vehicleId,photoIds,vehicleId===value.vehicleId?value.photoIds:[]);
    const next={...changes,vehicleId,vehicle:M.vehicleSnapshot(vehicle),photoIds,photos,categoryName:category.name};
    const changed=requestEditFields.some(key=>!sameValue(value[key],next[key]));
    if(!changed)return {id:ref.id};
    const materialChange=!sameRequestTerms(value,next),nextTermsVersion=currentTermsVersion+(materialChange?1:0);
    tx.update(ref,{...next,version:currentVersion+1,termsVersion:nextTermsVersion,updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{version:currentVersion+1,termsVersion:nextTermsVersion,materialChange});
    return {id:ref.id};
   });
  }
  if(op==='vehicleSave'){
   const changes=M.vehicle(input),ref=input.id?db.doc(`vehicles/${D.id(input.id)}`):db.collection('vehicles').doc();
   if(!input.id&&input.version!==undefined)D.fail('A new vehicle cannot have an existing version.');
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');const snapshot=await tx.get(ref);let nextVersion=1;
    if(input.id){const value=ownVehicle(snapshot,a.uid);version(value,input);if(value.archived)D.fail('Restore this vehicle before editing.','failed-precondition');nextVersion=value.version+1;}
    const value={...changes,ownerId:a.uid,version:nextVersion,archived:false,updatedAt:stamp(),...(!snapshot.exists?{createdAt:stamp()}:{})};
    tx.set(ref,value,{merge:true});audit(tx,a.uid,op,ref.id);return {id:ref.id};
   });
  }
  if(op==='vehicleArchive'){
   const ref=db.doc(`vehicles/${D.id(input.id)}`),archived=M.bool(input.archived,'Archived');
   return receipt.atomic(async tx=>{await current(tx,a.uid,'owner');const value=ownVehicle(await tx.get(ref),a.uid);version(value,input);
    tx.update(ref,{archived,version:value.version+1,updatedAt:stamp()});audit(tx,a.uid,op,ref.id,{archived});return {id:ref.id};});
  }
  if(op==='requestCreate'){
   const changes=M.serviceRequest(input),photoIds=P.photoIds(input.photoIds),vehicleRef=db.doc(`vehicles/${D.id(input.vehicleId)}`),categoryRef=db.doc(`serviceCategories/${changes.categoryId}`),ref=db.collection('serviceRequests').doc();
   return receipt.atomic(async tx=>{
    M.requireFutureDate(changes.preferredDate);
    await current(tx,a.uid,'owner');const [vehicleDoc,categoryDoc]=await Promise.all([tx.get(vehicleRef),tx.get(categoryRef)]),vehicle=ownVehicle(vehicleDoc,a.uid),category=categoryDoc.data();
    if(vehicle.archived)D.fail('Choose an active vehicle.','failed-precondition');
    if(!category||category.archived!==false)D.fail('Choose an active service category.','failed-precondition');
    if(changes.shopId){const shop=(await tx.get(db.doc(`users/${changes.shopId}`))).data();if(!eligible(shop,'shop'))D.fail('Choose an active, approved shop.','failed-precondition');await assertAuth(changes.shopId);}
    const photos=await P.snapshotRequestPhotos(tx,db,vehicle,a.uid,vehicleRef.id,photoIds);
    tx.create(ref,{...changes,photoIds,photos,ownerId:a.uid,vehicleId:vehicleRef.id,vehicle:M.vehicleSnapshot(vehicle),categoryName:category.name,quotationCount:0,status:'open',version:1,termsVersion:1,createdAt:stamp(),updatedAt:stamp()});
    if(changes.shopId)notify(tx,changes.shopId,'new_service_request',null,{serviceRequestId:ref.id});
    audit(tx,a.uid,op,ref.id,{visibility:changes.visibility});return {id:ref.id};
   });
  }
  if(op==='requestClose'){
   const ref=db.doc(`serviceRequests/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{await current(tx,a.uid,'owner');const value=ownRequest(await tx.get(ref),a.uid);
    if(value.status!=='open')D.fail('Only an open service request can be closed.','failed-precondition');
    tx.update(ref,{status:'closed',closedAt:stamp(),updatedAt:stamp()});audit(tx,a.uid,op,ref.id);return {id:ref.id};});
  }
  if(op==='quoteSubmit'){
   const changes=M.quotation(input),serviceRequestId=D.id(input.serviceRequestId),expectedTermsVersion=M.integer(input.termsVersion,'Request terms version',1,Number.MAX_SAFE_INTEGER),requestRef=db.doc(`serviceRequests/${serviceRequestId}`),legacyRef=db.doc(`quotations/${quoteId(serviceRequestId,a.uid)}`),headRef=db.doc(`quotationHeads/${quoteId(serviceRequestId,a.uid)}`);
   return receipt.atomic(async tx=>{
    const [shop,requestDoc,headDoc,legacyDoc]=await Promise.all([current(tx,a.uid,'shop'),tx.get(requestRef),tx.get(headRef),tx.get(legacyRef)]),value=requestDoc.data();
    if(!value||(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===a.uid)))D.fail('Service request not found.','not-found');
    if(value.status!=='open')D.fail('This service request is closed.','failed-precondition');
    if(expectedTermsVersion!==termsVersion(value))D.fail('This request changed while you were preparing the quotation. Refresh it and review the current terms.','failed-precondition');
    if(changes.coveredServices.some(service=>!(value.mandatoryServices||[]).includes(service)))D.fail('Choose service requirements from the current request.');
    const head=await quotationHead(tx,serviceRequestId,a.uid,headDoc,legacyDoc),priorId=head.id,priorDoc=head.doc,prior=head.quote;
    if(head.hasHead&&prior.status!=='submitted'&&prior.status!=='accepted'&&prior.status!=='withdrawn')D.fail('The current quotation history is inconsistent. Refresh and contact support.','failed-precondition');
    if(head.hasHead&&prior.status==='superseded')D.fail('The current quotation history is inconsistent. Refresh and contact support.','failed-precondition');
    if(prior?.status==='accepted')D.fail('An accepted quotation cannot be replaced.','failed-precondition');
    if(prior?.status==='withdrawn')D.fail('A withdrawn quotation cannot be resubmitted for this request.','already-exists');
    const expired=prior?.validUntil instanceof Timestamp&&prior.validUntil.toMillis()<=Date.now();
    if(prior?.status==='submitted'&&quoteMatchesTerms(prior,value)&&!expired)D.fail('Your quotation for the current request terms is already submitted.','already-exists');
    const [ownerDoc,vehicleDoc,categoryDoc]=await Promise.all([tx.get(db.doc(`users/${value.ownerId}`)),tx.get(db.doc(`vehicles/${value.vehicleId}`)),tx.get(db.doc(`serviceCategories/${value.categoryId}`))]);
    if(!eligible(ownerDoc.data(),'owner'))D.fail('This customer is no longer available.','failed-precondition');
    await assertAuth(value.ownerId);
    const vehicle=vehicleDoc.data();if(!vehicle||vehicle.ownerId!==value.ownerId||vehicle.archived)D.fail('This vehicle is no longer available.','failed-precondition');
    if(!categoryDoc.exists||categoryDoc.data().archived!==false)D.fail('This service category is no longer available.','failed-precondition');
    const quotationCount=Number.isSafeInteger(value.quotationCount)&&value.quotationCount>=0?value.quotationCount:0;
    const ref=!legacyDoc.exists&&!headDoc.exists?legacyRef:db.collection('quotations').doc();
    if(prior?.status==='submitted')tx.update(db.doc(`quotations/${D.id(priorId)}`),{status:'superseded',supersededAt:stamp(),updatedAt:stamp()});
    tx.update(requestRef,{quotationCount:quotationCount+(prior?.status==='submitted'?0:1),updatedAt:stamp()});
    tx.create(ref,{...changes,serviceRequestId,requestVersion:recordVersion(value),termsVersion:termsVersion(value),shopId:a.uid,shopName:shop.shop?.shopName||'Shop',requestTitle:value.title,vehicle:value.vehicle,status:'submitted',validUntil:Timestamp.fromMillis(Date.now()+changes.validForDays*86400000),createdAt:stamp(),updatedAt:stamp()});
    tx.set(headRef,{quoteId:ref.id,serviceRequestId,shopId:a.uid,updatedAt:stamp()});
    notify(tx,value.ownerId,priorId?'quotation_renewed':'quotation_submitted',null,{serviceRequestId,quoteId:ref.id});
    audit(tx,a.uid,op,ref.id,{serviceRequestId,replacesQuoteId:priorId,termsVersion:termsVersion(value)});return {id:ref.id};
   });
  }
  if(op==='quoteWithdraw'){
   const ref=db.doc(`quotations/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{await current(tx,a.uid,'shop');const doc=await tx.get(ref),value=doc.data();
    if(!doc.exists||value.shopId!==a.uid)D.fail('Quotation not found.','not-found');
    if(value.status!=='submitted')D.fail('Only a submitted quotation can be withdrawn.','failed-precondition');
    const requestRef=db.doc(`serviceRequests/${D.id(value.serviceRequestId)}`),requestDoc=await tx.get(requestRef),request=requestDoc.data();
    if(!requestDoc.exists)D.fail('Service request not found.','not-found');
    const quotationCount=Number.isSafeInteger(request.quotationCount)&&request.quotationCount>=0?request.quotationCount:0;
    tx.update(requestRef,{quotationCount:Math.max(0,quotationCount-1),updatedAt:stamp()});
    tx.update(ref,{status:'withdrawn',withdrawnAt:stamp(),updatedAt:stamp()});audit(tx,a.uid,op,ref.id,{serviceRequestId:value.serviceRequestId});return {id:ref.id};});
  }
  if(op==='quoteAccept'){
   const quoteRef=db.doc(`quotations/${D.id(input.id)}`);
   if(!['pay_now','pay_deposit','pay_in_store'].includes(input.paymentMethod))D.fail('Choose pay in full, pay the shop deposit, or pay in store.','invalid-argument');
   return receipt.atomic(async tx=>{
    const customer=await current(tx,a.uid,'owner');const quoteDoc=await tx.get(quoteRef),quote=quoteDoc.data();
    if(!quote)D.fail('Quotation not found.','not-found');
    const requestRef=db.doc(`serviceRequests/${D.id(quote.serviceRequestId)}`),bookingRef=db.doc(`bookings/${requestRef.id}`);
    const headRef=db.doc(`quotationHeads/${quoteId(requestRef.id,quote.shopId)}`);
    const [requestDoc,bookingDoc,headDoc,legacyDoc]=await Promise.all([tx.get(requestRef),tx.get(bookingRef),tx.get(headRef),tx.get(db.doc(`quotations/${quoteId(requestRef.id,quote.shopId)}`))]),value=ownRequest(requestDoc,a.uid);
    const head=await quotationHead(tx,requestRef.id,quote.shopId,headDoc,legacyDoc);
    if(head.hasHead&&head.id!==quoteRef.id)D.fail('This quotation has been replaced and is no longer available for acceptance.','failed-precondition');
    if(!head.hasHead&&head.id!==quoteRef.id)D.fail('This quotation is not the current offer for this request.','failed-precondition');
    // A new retry key may still refer to the already selected offer. Return its
    // existing booking, including cancellation history, without another write.
    if(bookingDoc.exists){
     const saved=bookingDoc.data();
     if(value.status==='booked'&&value.bookingId===bookingRef.id&&value.acceptedQuoteId===quoteRef.id&&quote.status==='accepted'&&quote.bookingId===bookingRef.id&&saved.ownerId===a.uid&&saved.shopId===quote.shopId&&saved.quoteId===quoteRef.id&&saved.serviceRequestId===requestRef.id)return {id:bookingRef.id,paymentAttemptId:null,existingBooking:true};
     D.fail('A quotation has already been selected for this request.','failed-precondition');
    }
    if(value.status!=='open')D.fail('Only an open service request can accept a quotation.','failed-precondition');
    if(quote.status!=='submitted')D.fail('This quotation is no longer available for acceptance.','failed-precondition');
    if(!quoteMatchesTerms(quote,value))D.fail('This quotation has no verifiable current-terms revision or predates a material request change. Ask the shop for an updated quotation.','failed-precondition');
    if(!(quote.validUntil instanceof Timestamp)||quote.validUntil.toMillis()<=Date.now())D.fail('This quotation has expired.','failed-precondition');
    if(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===quote.shopId))D.fail('This quotation is not available for this request.','failed-precondition');
    const [shopDoc,vehicleDoc,categoryDoc]=await Promise.all([tx.get(db.doc(`users/${D.id(quote.shopId)}`)),tx.get(db.doc(`vehicles/${D.id(value.vehicleId)}`)),tx.get(db.doc(`serviceCategories/${D.id(value.categoryId)}`))]);
    if(!eligible(shopDoc.data(),'shop'))D.fail('This shop is no longer available.','failed-precondition');
    await Promise.all([assertAuth(a.uid),assertAuth(quote.shopId)]);
    const vehicle=vehicleDoc.data();if(!vehicle||vehicle.ownerId!==a.uid||vehicle.archived)D.fail('This vehicle is no longer available.','failed-precondition');
    if(!categoryDoc.exists||categoryDoc.data().archived!==false)D.fail('This service category is no longer available.','failed-precondition');
    const terms=Object.fromEntries(['scope','items','totalCents','currency','completionDays','warranty'].map(key=>[key,quote[key]]));
    const hasDeposit=quote.depositType==='percentage'||quote.depositType==='fixed';
    if(input.paymentMethod==='pay_deposit'&&(!hasDeposit||!Number.isSafeInteger(quote.depositAmountCents)||quote.depositAmountCents<=0||quote.depositAmountCents>=quote.totalCents))D.fail('This quotation has no valid deposit requirement. Choose pay in full or pay in store.','failed-precondition');
    const depositSnapshot=hasDeposit?{depositType:quote.depositType,depositValue:quote.depositValue,depositAmountCents:quote.depositAmountCents}:{depositType:'none',depositValue:null,depositAmountCents:null};
    // External Auth reads can take time; check the offer deadline again just
    // before queuing the atomic writes, on every transaction attempt.
    if(quote.validUntil.toMillis()<=Date.now())D.fail('This quotation has expired.','failed-precondition');
    const attemptRef=db.collection(`bookings/${bookingRef.id}/paymentAttempts`).doc();
    const initialAmount=input.paymentMethod==='pay_deposit'?quote.depositAmountCents:quote.totalCents;
    const initialPaymentStatus=input.paymentMethod==='pay_in_store'?'due':'pending';
    const checkout=input.paymentMethod==='pay_in_store'?null:await paymentProvider.createCheckout({paymentId:attemptRef.id,amountCents:initialAmount,currency:quote.currency});
    tx.create(bookingRef,{simulated:true,testTransaction:true,paymentProvider:'mock',paymentAccountingMode:'simulated',...terms,...depositSnapshot,customerName:customerDisplayName(customer),ownerId:a.uid,shopId:quote.shopId,serviceRequestId:requestRef.id,quoteId:quoteRef.id,vehicleId:value.vehicleId,vehicle:M.vehicleSnapshot(value.vehicle),photoIds:P.photoIds(value.photoIds),shopName:quote.shopName,requestTitle:value.title,categoryName:value.categoryName,city:value.city,status:input.paymentMethod==='pay_in_store'?'pending_confirmation':'pending_payment',paymentMethod:input.paymentMethod,paymentStatus:initialPaymentStatus,paidCents:0,balanceDueCents:quote.totalCents,currentPaymentAttemptId:attemptRef.id,serviceStatus:'not_started',createdAt:stamp(),updatedAt:stamp()});
    tx.create(attemptRef,{bookingId:bookingRef.id,provider:'mock',providerReference:checkout?.providerReference||null,method:input.paymentMethod==='pay_in_store'?'pay_in_store':'simulated_online',kind:'initial',amountCents:initialAmount,currency:quote.currency,status:initialPaymentStatus,simulated:true,testTransaction:true,createdAt:stamp(),updatedAt:stamp()});
    notify(tx,a.uid,'quotation_accepted',bookingRef.id);
    notify(tx,quote.shopId,'quotation_accepted',bookingRef.id);
    event(tx,a.uid,'booking_created',bookingRef.id);
    event(tx,quote.shopId,'booking_created',bookingRef.id);
    tx.update(requestRef,{status:'booked',bookingId:bookingRef.id,acceptedQuoteId:quoteRef.id,bookedAt:stamp(),updatedAt:stamp()});
    tx.update(quoteRef,{status:'accepted',bookingId:bookingRef.id,acceptedAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,op,bookingRef.id,{serviceRequestId:requestRef.id,quoteId:quoteRef.id,paymentMethod:input.paymentMethod,simulated:true});return {id:bookingRef.id,paymentAttemptId:attemptRef.id,existingBooking:false,amountCents:initialAmount,currency:quote.currency,paymentStatus:initialPaymentStatus,paymentAttemptStatus:initialPaymentStatus};
   },{onReplay:result=>({id:result.id,paymentAttemptId:null,existingBooking:true})});
  }
  if(op==='paymentMockResult'){
   const ref=db.doc(`bookings/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');const booking=ownBooking(await tx.get(ref),a);assertSimulatedBooking(booking);
    const paymentAttemptId=D.id(input.paymentAttemptId);
    if(paymentAttemptId!==booking.currentPaymentAttemptId)D.fail('This payment attempt changed. Refresh the booking and confirm the current amount.','failed-precondition');
    if(!['pending_payment','pending_confirmation','confirmed'].includes(booking.status))D.fail('This booking cannot receive a payment result.','failed-precondition');
    const attemptRef=db.doc(`bookings/${ref.id}/paymentAttempts/${paymentAttemptId}`),attemptDoc=await tx.get(attemptRef),attempt=attemptDoc.data();
    if(!attemptDoc.exists||attempt.simulated!==true||attempt.testTransaction!==true||attempt.method!=='simulated_online')D.fail('Simulated online payment attempt not found.','not-found');
    assertSimulatedAttempt(attempt,booking,ref.id);
    if(attempt.status!=='pending')D.fail('This payment attempt has already been resolved. Start a new attempt to retry.','failed-precondition');
    const accounting=paymentAccounting(booking);
    if(input.expectedBookingId!==ref.id||!Number.isSafeInteger(input.expectedAmountCents)||input.expectedAmountCents!==attempt.amountCents||input.expectedCurrency!==attempt.currency||attempt.currency!==booking.currency||attempt.bookingId!==ref.id)D.fail('Payment details changed or are missing. Refresh the booking and confirm the current amount and currency.','failed-precondition');
    if(!Number.isSafeInteger(attempt.amountCents)||attempt.amountCents<=0||attempt.amountCents>accounting.balanceDueCents)D.fail('The saved payment attempt exceeds the outstanding booking balance. Contact support.','failed-precondition');
    const result=paymentProvider.simulateResult({outcome:input.outcome});
    const successful=result.status==='paid';
    const paidCents=accounting.paidCents+(successful?attempt.amountCents:0),balanceDueCents=accounting.totalCents-paidCents;
    const overallStatus=paymentStatus(paidCents,balanceDueCents,result.status);
    tx.update(attemptRef,{status:result.status,updatedAt:stamp(),resolvedAt:result.status==='pending'?null:stamp()});
    tx.update(ref,{paidCents,balanceDueCents,paymentStatus:overallStatus,updatedAt:stamp(),...(successful?{simulatedPaymentVerifiedAt:stamp(),...(booking.status==='pending_payment'?{status:'pending_confirmation'}:{})}:{})});
    if(successful)tx.create(db.doc(`paymentReceipts/${attemptRef.id}`),{...C.receiptSnapshot({booking,bookingId:ref.id,attemptId:attemptRef.id,method:attempt.method,amountCents:attempt.amountCents,paidCents,balanceDueCents}),issuedAt:stamp()});
    event(tx,a.uid,`simulated_payment_${result.status}`,ref.id,{paymentAttemptId:attemptRef.id,amountCents:attempt.amountCents,currency:booking.currency});
    event(tx,booking.shopId,`simulated_payment_${result.status}`,ref.id,{paymentAttemptId:attemptRef.id,amountCents:attempt.amountCents,currency:booking.currency});
    audit(tx,a.uid,op,ref.id,{paymentAttemptId:attemptRef.id,status:result.status,amountCents:attempt.amountCents,simulated:true});return {id:ref.id,paymentAttemptId:attemptRef.id,paymentStatus:overallStatus,paymentAttemptStatus:result.status};
   });
  }
  if(op==='paymentRetry'){
   const ref=db.doc(`bookings/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');const booking=ownBooking(await tx.get(ref),a);assertSimulatedBooking(booking);
    if(!['pending_payment','pending_confirmation','confirmed'].includes(booking.status))D.fail('This booking cannot start another payment attempt.','failed-precondition');
    const accounting=paymentAccounting(booking),previousId=D.id(booking.currentPaymentAttemptId),previousRef=db.doc(`bookings/${ref.id}/paymentAttempts/${previousId}`),previousDoc=await tx.get(previousRef),previous=previousDoc.data();
    if(!previousDoc.exists||previous.status!=='failed'&&previous.status!=='cancelled'||previous.method!=='simulated_online')D.fail('Only a failed or cancelled simulated payment can be retried.','failed-precondition');
    assertSimulatedAttempt(previous,booking,ref.id);
    if(!Number.isSafeInteger(previous.amountCents)||previous.amountCents<=0||previous.amountCents>accounting.balanceDueCents)D.fail('The saved payment attempt exceeds the outstanding booking balance. Contact support.','failed-precondition');
    const attemptRef=db.collection(`bookings/${ref.id}/paymentAttempts`).doc();
    const checkout=await paymentProvider.createCheckout({paymentId:attemptRef.id,amountCents:previous.amountCents,currency:booking.currency});
    tx.create(attemptRef,{bookingId:ref.id,provider:'mock',providerReference:checkout.providerReference,method:'simulated_online',kind:'retry',amountCents:previous.amountCents,currency:booking.currency,status:'pending',simulated:true,testTransaction:true,createdAt:stamp(),updatedAt:stamp()});
    tx.update(ref,{currentPaymentAttemptId:attemptRef.id,paymentStatus:paymentStatus(accounting.paidCents,accounting.balanceDueCents,'pending'),updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{paymentAttemptId:attemptRef.id,amountCents:previous.amountCents,simulated:true});return {id:ref.id,paymentAttemptId:attemptRef.id,amountCents:previous.amountCents,currency:booking.currency,paymentStatus:paymentStatus(accounting.paidCents,accounting.balanceDueCents,'pending'),paymentAttemptStatus:'pending'};
   });
  }
  if(op==='paymentStart'){
   const ref=db.doc(`bookings/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');const booking=ownBooking(await tx.get(ref),a);assertSimulatedBooking(booking);
    if(!['pending_payment','pending_confirmation','confirmed'].includes(booking.status))D.fail('This booking cannot start another payment attempt.','failed-precondition');
    const accounting=paymentAccounting(booking);
    if(accounting.balanceDueCents<=0)D.fail('This booking has no outstanding balance.','failed-precondition');
    if(booking.currentPaymentAttemptId){
     const currentRef=db.doc(`bookings/${ref.id}/paymentAttempts/${D.id(booking.currentPaymentAttemptId)}`),currentDoc=await tx.get(currentRef),currentAttempt=currentDoc.data();
     if(currentDoc.exists)assertSimulatedAttempt(currentAttempt,booking,ref.id);
     if(currentDoc.exists&&currentAttempt.status==='pending')D.fail('A simulated payment attempt is already pending. Resolve it before starting another.','failed-precondition');
     if(currentDoc.exists&&currentAttempt.status==='due')tx.update(currentRef,{status:'superseded',resolvedAt:stamp(),updatedAt:stamp()});
    }
    const attemptRef=db.collection(`bookings/${ref.id}/paymentAttempts`).doc();
    const checkout=await paymentProvider.createCheckout({paymentId:attemptRef.id,amountCents:accounting.balanceDueCents,currency:booking.currency});
    tx.create(attemptRef,{bookingId:ref.id,provider:'mock',providerReference:checkout.providerReference,method:'simulated_online',kind:'balance',amountCents:accounting.balanceDueCents,currency:booking.currency,status:'pending',simulated:true,testTransaction:true,createdAt:stamp(),updatedAt:stamp()});
    tx.update(ref,{currentPaymentAttemptId:attemptRef.id,paymentStatus:paymentStatus(accounting.paidCents,accounting.balanceDueCents,'pending'),updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{paymentAttemptId:attemptRef.id,amountCents:accounting.balanceDueCents,simulated:true});return {id:ref.id,paymentAttemptId:attemptRef.id,amountCents:accounting.balanceDueCents,currency:booking.currency,paymentStatus:paymentStatus(accounting.paidCents,accounting.balanceDueCents,'pending'),paymentAttemptStatus:'pending'};
   });
  }
  if(op==='paymentRecordInStore'){
   const ref=db.doc(`bookings/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'shop');const booking=ownBooking(await tx.get(ref),a);assertSimulatedBooking(booking);
    if(!['pending_payment','pending_confirmation','confirmed'].includes(booking.status))D.fail('A cancelled booking cannot receive an in-store payment.','failed-precondition');
    const accounting=paymentAccounting(booking);
    if(accounting.balanceDueCents<=0)D.fail('This booking has no outstanding balance.','failed-precondition');
    if(!['simulated_cash','simulated_card','simulated_eft'].includes(input.method))D.fail('Choose a supported simulated in-store method.','invalid-argument');
    let attemptRef;
    if(booking.currentPaymentAttemptId){
     const currentRef=db.doc(`bookings/${ref.id}/paymentAttempts/${D.id(booking.currentPaymentAttemptId)}`),currentDoc=await tx.get(currentRef),currentAttempt=currentDoc.data();
     if(currentDoc.exists)assertSimulatedAttempt(currentAttempt,booking,ref.id);
     if(currentDoc.exists&&currentAttempt.status==='pending')D.fail('A simulated online payment is pending. Resolve it before recording an in-store payment.','failed-precondition');
     if(currentDoc.exists&&currentAttempt.status==='due'){
      if(currentAttempt.amountCents!==accounting.balanceDueCents)D.fail('The saved in-store payment attempt does not match the current balance. Contact support.','failed-precondition');
      attemptRef=currentRef;
      tx.update(attemptRef,{status:'paid',method:input.method,recordedBy:a.uid,resolvedAt:stamp(),updatedAt:stamp()});
     }
    }
    if(!attemptRef){
     attemptRef=db.collection(`bookings/${ref.id}/paymentAttempts`).doc();
     tx.create(attemptRef,{bookingId:ref.id,provider:'mock',method:input.method,kind:'in_store',amountCents:accounting.balanceDueCents,currency:booking.currency,status:'paid',simulated:true,testTransaction:true,recordedBy:a.uid,createdAt:stamp(),updatedAt:stamp(),resolvedAt:stamp()});
    }
    const paidCents=accounting.totalCents,balanceDueCents=0;
    tx.update(ref,{paidCents,balanceDueCents,paymentStatus:'paid',currentPaymentAttemptId:attemptRef.id,simulatedPaymentVerifiedAt:stamp(),updatedAt:stamp(),...(booking.status==='pending_payment'?{status:'pending_confirmation'}:{})});
    tx.create(db.doc(`paymentReceipts/${attemptRef.id}`),{...C.receiptSnapshot({booking,bookingId:ref.id,attemptId:attemptRef.id,method:input.method,amountCents:accounting.balanceDueCents,paidCents,balanceDueCents}),issuedAt:stamp()});
    event(tx,booking.ownerId,'simulated_in_store_payment_received',ref.id,{paymentAttemptId:attemptRef.id,amountCents:accounting.balanceDueCents,currency:booking.currency});
    event(tx,a.uid,'simulated_in_store_payment_recorded',ref.id,{paymentAttemptId:attemptRef.id,amountCents:accounting.balanceDueCents,currency:booking.currency});
    audit(tx,a.uid,op,ref.id,{paymentAttemptId:attemptRef.id,amountCents:accounting.balanceDueCents,method:input.method,simulated:true});return {id:ref.id,paymentAttemptId:attemptRef.id,paymentStatus:'paid'};
   });
  }
  if(op==='bookingComplete'){
   const ref=db.doc(`bookings/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'shop');const booking=ownBooking(await tx.get(ref),a);
    const legacyService=!Object.prototype.hasOwnProperty.call(booking,'serviceStatus')&&!Object.prototype.hasOwnProperty.call(booking,'serviceCompletedAt');
    if(booking.status!=='confirmed'||booking.serviceStatus!=='not_started'&&!legacyService)D.fail('Only a confirmed, not-yet-completed service can be marked complete.','failed-precondition');
    tx.update(ref,{serviceStatus:'completed',serviceCompletedAt:stamp(),updatedAt:stamp()});
    event(tx,booking.ownerId,'service_completed',ref.id);
    event(tx,a.uid,'service_completed',ref.id);
    audit(tx,a.uid,op,ref.id);return {id:ref.id,serviceStatus:'completed'};
   });
  }
  if(op==='bookingConfirm'){
   const ref=db.doc(`bookings/${D.id(input.id)}`),appointment=B.appointment(input);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'shop');const value=ownBooking(await tx.get(ref),a);
    if(value.status!=='pending_confirmation')D.fail('Only a booking awaiting confirmation can be confirmed.','failed-precondition');
    B.requireFutureAppointment(appointment);
    const owner=(await tx.get(db.doc(`users/${D.id(value.ownerId)}`))).data();
    if(!eligible(owner,'owner'))D.fail('This customer is no longer available.','failed-precondition');
    await Promise.all([assertAuth(a.uid),assertAuth(value.ownerId)]);
    // Existing booking terms survive later vehicle/category archival or edits.
    B.requireFutureAppointment(appointment);
    tx.update(ref,{status:'confirmed',appointmentDate:appointment.appointmentDate,appointmentTime:appointment.appointmentTime,appointmentAt:Timestamp.fromMillis(appointment.appointmentMillis),confirmedAt:stamp(),updatedAt:stamp()});
    event(tx,value.ownerId,'booking_confirmed',ref.id,{appointmentDate:appointment.appointmentDate,appointmentTime:appointment.appointmentTime});
    event(tx,a.uid,'booking_confirmed',ref.id,{appointmentDate:appointment.appointmentDate,appointmentTime:appointment.appointmentTime});
    audit(tx,a.uid,op,ref.id,{appointmentDate:appointment.appointmentDate,appointmentTime:appointment.appointmentTime});return {id:ref.id};
   });
  }
  if(op==='bookingCancel'){
   const ref=db.doc(`bookings/${D.id(input.id)}`),reason=D.text(input.reason,'Cancellation reason',500);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,role);const value=ownBooking(await tx.get(ref),a);
    if(!['pending_payment','pending_confirmation','confirmed'].includes(value.status))D.fail('This booking is already cancelled.','failed-precondition');
    await assertAuth(a.uid);
    // The current participant may cancel even if the other account is blocked.
    const accounting=paymentAccounting(value);
    tx.update(ref,{status:'cancelled',cancellationReason:reason,cancelledByRole:role,cancelledAt:stamp(),updatedAt:stamp(),...(accounting.paidCents>0?{paymentReconciliationStatus:value.simulated===true&&value.testTransaction===true?'simulated_reconciliation_required':'refund_review_required'}:{})});
    event(tx,value.ownerId,'booking_cancelled',ref.id);
    event(tx,value.shopId,'booking_cancelled',ref.id);
    audit(tx,a.uid,op,ref.id,{cancelledByRole:role});return {id:ref.id};
   });
  }
  D.fail('Unknown marketplace operation.');
 };
}
module.exports={createMarketplace,quoteId};
