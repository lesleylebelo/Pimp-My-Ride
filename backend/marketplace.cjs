const {createHash}=require('node:crypto');
const {FieldPath,FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),B=require('./booking-domain.cjs'),P=require('./photo-domain.cjs');
const {mutation}=require('./mutations.cjs');
const PAGE_SIZE=20;
const stamp=()=>FieldValue.serverTimestamp();
const quoteId=(requestId,shopId)=>createHash('sha256').update(`${requestId}\n${shopId}`).digest('hex');
const serialize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,serialize(v)])):value;
const row=doc=>({id:doc.id,...serialize(doc.data())});
const allowed={
 vehicles:['cursor','archived'],vehicleSave:['id','version','make','model','year','colour','registration'],vehicleArchive:['id','version','archived'],
 categories:['cursor'],shops:['cursor'],requestCreate:['vehicleId','title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId','photoIds'],requestUpdate:['id','version','vehicleId','title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId','photoIds'],
 requests:['feed','cursor'],request:['id','quotesCursor'],requestClose:['id'],quoteSubmit:['serviceRequestId','scope','items','completionDays','warranty','validForDays'],quotes:['cursor'],quoteWithdraw:['id'],
 quoteAccept:['id'],bookings:['cursor'],booking:['id'],bookingConfirm:['id','appointmentDate','appointmentTime'],bookingCancel:['id','reason'],
};
const mutations=new Set(['vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','bookingConfirm','bookingCancel']);
function eligible(profile,role){return profile?.role===role&&D.active(profile)&&!profile.statusOperation&&!profile.provisioningOperation&&(role!=='shop'||(profile.verificationStatus==='approved'&&!profile.reviewOperation));}
function requireRole(profile,role){if(!eligible(profile,role))D.fail(role==='shop'?'An active, approved shop account is required.':'An active vehicle owner account is required.','permission-denied');}
function requestFor(value,role){const result={...value};if(Array.isArray(result.photos))result.photos=result.photos.map(photo=>P.safePhoto(photo,photo.id));if(role==='shop'){delete result.ownerId;delete result.vehicleId;delete result.acceptedQuoteId;delete result.bookingId;}return result;}
function createMarketplace({db,auth,actor}){
 const audit=(tx,uid,action,target,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:`marketplace.${action}`,target,details,createdAt:stamp()});
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
  if(a.profile.role==='owner'){ownRequest(snapshot,a.uid);return value;}
  if(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===a.uid))D.fail('Service request not found.','not-found');
  const [ownerDoc,vehicleDoc,categoryDoc]=await Promise.all([
   db.doc(`users/${value.ownerId}`).get(),db.doc(`vehicles/${value.vehicleId}`).get(),db.doc(`serviceCategories/${value.categoryId}`).get(),
  ]);
  const owner=ownerDoc.data(),vehicle=vehicleDoc.data();
  if(!eligible(owner,'owner')||!vehicle||vehicle.ownerId!==value.ownerId||vehicle.archived||!categoryDoc.exists||categoryDoc.data().archived!==false||!await authEligible(value.ownerId))D.fail('Service request is unavailable.','not-found');
  return value;
 }
 return async function marketplace(request){
  const a=await actor(request),input=request.data||{},op=input.op;
  if(!Object.prototype.hasOwnProperty.call(allowed,op))D.fail('Unknown marketplace operation.');
  M.fields(input,['op',...allowed[op],...(mutations.has(op)?['requestId']:[])]);
  if(a.profile.role==='owner')requireRole(a.profile,'owner');else requireRole(a.profile,'shop');
  const role=a.profile.role;
  if(['vehicles','vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','shops','categories','quoteAccept'].includes(op))requireRole(a.profile,'owner');
  if(['quoteSubmit','quotes','quoteWithdraw','bookingConfirm'].includes(op))requireRole(a.profile,'shop');
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
   const items=await Promise.all(result.docs.map(async doc=>{const p=doc.data();if(!eligible(p,'shop')||!await authEligible(doc.id))return null;return {id:doc.id,...Object.fromEntries(['shopName','city','province','services'].map(key=>[key,p.shop?.[key]||'']))};}));
   return {items:items.filter(Boolean),cursor:result.cursor};
  }
  if(op==='requests'){
   let query=db.collection('serviceRequests');
   if(role==='owner'){if(input.feed!=='mine')D.fail('Choose your own requests.','permission-denied');query=query.where('ownerId','==',a.uid);}
   else if(input.feed==='open')query=query.where('visibility','==','open').where('status','==','open');
   else if(input.feed==='direct')query=query.where('visibility','==','direct').where('shopId','==',a.uid).where('status','==','open');
   else D.fail('Choose open or direct requests.','permission-denied');
   const result=await page(query,input.cursor),items=await Promise.all(result.docs.map(async doc=>{try{await visibleRequest(doc,a);return requestFor(row(doc),role);}catch(error){if(error.code!=='not-found')throw error;return null;}}));
   return {items:items.filter(Boolean),cursor:result.cursor};
  }
  if(op==='request'){
   const id=D.id(input.id),snapshot=await db.doc(`serviceRequests/${id}`).get(),value=await visibleRequest(snapshot,a);
   if(role==='owner'){
    const result=await page(db.collection('quotations').where('serviceRequestId','==',id),input.quotesCursor);
    return {request:requestFor({id,...serialize(value)},role),quotes:result.docs.map(row),quotesCursor:result.cursor};
   }
   if(input.quotesCursor)D.fail('Shop quotation paging is unavailable.');
   const own=await db.doc(`quotations/${quoteId(id,a.uid)}`).get();
   return {request:requestFor({id,...serialize(value)},role),quotes:own.exists?[row(own)]:[],quotesCursor:null};
  }
  if(op==='quotes'){
   const result=await page(db.collection('quotations').where('shopId','==',a.uid),input.cursor);
   return {items:result.docs.map(row),cursor:result.cursor};
  }
  if(op==='bookings'){
   const result=await page(db.collection('bookings').where(role==='owner'?'ownerId':'shopId','==',a.uid),input.cursor);
   return {items:result.docs.map(doc=>requestFor(row(doc),role)),cursor:result.cursor};
  }
  if(op==='booking'){
   const id=D.id(input.id),value=ownBooking(await db.doc(`bookings/${id}`).get(),a);
   return {booking:requestFor({id,...serialize(value)},role)};
  }
  // Unlike the legacy admin endpoint, every marketplace mutation must carry a
  // stable retry key. Missing keys never create a receipt or perform a write.
  D.id(input.requestId);const receipt=mutation(db,a.uid,`marketplace:${op}`,input);
  if(op==='requestUpdate'){
   const changes=M.serviceRequest(input),ref=db.doc(`serviceRequests/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');
    const snapshot=await tx.get(ref),value=ownRequest(snapshot,a.uid);
    if(value.status!=='open')D.fail('Only an open service request can be edited.','failed-precondition');
    const currentVersion=value.version||1;
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
    const photos=await P.snapshotRequestPhotos(tx,db,vehicle,a.uid,vehicleId,photoIds);
    tx.update(ref,{...changes,vehicleId,vehicle:M.vehicleSnapshot(vehicle),photoIds,photos,categoryName:category.name,version:currentVersion+1,updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id);
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
    tx.create(ref,{...changes,photoIds,photos,ownerId:a.uid,vehicleId:vehicleRef.id,vehicle:M.vehicleSnapshot(vehicle),categoryName:category.name,status:'open',version:1,createdAt:stamp(),updatedAt:stamp()});
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
   const changes=M.quotation(input),serviceRequestId=D.id(input.serviceRequestId),requestRef=db.doc(`serviceRequests/${serviceRequestId}`),ref=db.doc(`quotations/${quoteId(serviceRequestId,a.uid)}`);
   return receipt.atomic(async tx=>{
    const shop=await current(tx,a.uid,'shop'),[requestDoc,existing]=await Promise.all([tx.get(requestRef),tx.get(ref)]),value=requestDoc.data();
    if(!value||(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===a.uid)))D.fail('Service request not found.','not-found');
    if(existing.exists)D.fail('You already quoted on this request. A withdrawn quotation cannot be resubmitted in this milestone.','already-exists');
    if(value.status!=='open')D.fail('This service request is closed.','failed-precondition');
    const [ownerDoc,vehicleDoc,categoryDoc]=await Promise.all([tx.get(db.doc(`users/${value.ownerId}`)),tx.get(db.doc(`vehicles/${value.vehicleId}`)),tx.get(db.doc(`serviceCategories/${value.categoryId}`))]);
    if(!eligible(ownerDoc.data(),'owner'))D.fail('This customer is no longer available.','failed-precondition');
    await assertAuth(value.ownerId);
    const vehicle=vehicleDoc.data();if(!vehicle||vehicle.ownerId!==value.ownerId||vehicle.archived)D.fail('This vehicle is no longer available.','failed-precondition');
    if(!categoryDoc.exists||categoryDoc.data().archived!==false)D.fail('This service category is no longer available.','failed-precondition');
    tx.create(ref,{...changes,serviceRequestId,shopId:a.uid,shopName:shop.shop?.shopName||'Shop',requestTitle:value.title,vehicle:value.vehicle,status:'submitted',validUntil:Timestamp.fromMillis(Date.now()+changes.validForDays*86400000),createdAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{serviceRequestId});return {id:ref.id};
   });
  }
  if(op==='quoteWithdraw'){
   const ref=db.doc(`quotations/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{await current(tx,a.uid,'shop');const doc=await tx.get(ref),value=doc.data();
    if(!doc.exists||value.shopId!==a.uid)D.fail('Quotation not found.','not-found');
    if(value.status!=='submitted')D.fail('Only a submitted quotation can be withdrawn.','failed-precondition');
   tx.update(ref,{status:'withdrawn',withdrawnAt:stamp(),updatedAt:stamp()});audit(tx,a.uid,op,ref.id,{serviceRequestId:value.serviceRequestId});return {id:ref.id};});
  }
  if(op==='quoteAccept'){
   const quoteRef=db.doc(`quotations/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,'owner');const quoteDoc=await tx.get(quoteRef),quote=quoteDoc.data();
    if(!quote)D.fail('Quotation not found.','not-found');
    const requestRef=db.doc(`serviceRequests/${D.id(quote.serviceRequestId)}`),bookingRef=db.doc(`bookings/${requestRef.id}`);
    const [requestDoc,bookingDoc]=await Promise.all([tx.get(requestRef),tx.get(bookingRef)]),value=ownRequest(requestDoc,a.uid);
    // A new retry key may still refer to the already selected offer. Return its
    // existing booking, including cancellation history, without another write.
    if(bookingDoc.exists){
     const saved=bookingDoc.data();
     if(value.status==='booked'&&value.bookingId===bookingRef.id&&value.acceptedQuoteId===quoteRef.id&&quote.status==='accepted'&&quote.bookingId===bookingRef.id&&saved.ownerId===a.uid&&saved.shopId===quote.shopId&&saved.quoteId===quoteRef.id&&saved.serviceRequestId===requestRef.id)return {id:bookingRef.id};
     D.fail('A quotation has already been selected for this request.','failed-precondition');
    }
    if(value.status!=='open')D.fail('Only an open service request can accept a quotation.','failed-precondition');
    if(quote.status!=='submitted')D.fail('This quotation is no longer available for acceptance.','failed-precondition');
    if(!(quote.validUntil instanceof Timestamp)||quote.validUntil.toMillis()<=Date.now())D.fail('This quotation has expired.','failed-precondition');
    if(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===quote.shopId))D.fail('This quotation is not available for this request.','failed-precondition');
    const [shopDoc,vehicleDoc,categoryDoc]=await Promise.all([tx.get(db.doc(`users/${D.id(quote.shopId)}`)),tx.get(db.doc(`vehicles/${D.id(value.vehicleId)}`)),tx.get(db.doc(`serviceCategories/${D.id(value.categoryId)}`))]);
    if(!eligible(shopDoc.data(),'shop'))D.fail('This shop is no longer available.','failed-precondition');
    await Promise.all([assertAuth(a.uid),assertAuth(quote.shopId)]);
    const vehicle=vehicleDoc.data();if(!vehicle||vehicle.ownerId!==a.uid||vehicle.archived)D.fail('This vehicle is no longer available.','failed-precondition');
    if(!categoryDoc.exists||categoryDoc.data().archived!==false)D.fail('This service category is no longer available.','failed-precondition');
    const terms=Object.fromEntries(['scope','items','totalCents','currency','completionDays','warranty'].map(key=>[key,quote[key]]));
    // External Auth reads can take time; check the offer deadline again just
    // before queuing the atomic writes, on every transaction attempt.
    if(quote.validUntil.toMillis()<=Date.now())D.fail('This quotation has expired.','failed-precondition');
    tx.create(bookingRef,{...terms,ownerId:a.uid,shopId:quote.shopId,serviceRequestId:requestRef.id,quoteId:quoteRef.id,vehicleId:value.vehicleId,vehicle:M.vehicleSnapshot(value.vehicle),photoIds:P.photoIds(value.photoIds),shopName:quote.shopName,requestTitle:value.title,categoryName:value.categoryName,city:value.city,status:'pending_confirmation',createdAt:stamp(),updatedAt:stamp()});
    tx.update(requestRef,{status:'booked',bookingId:bookingRef.id,acceptedQuoteId:quoteRef.id,bookedAt:stamp(),updatedAt:stamp()});
    tx.update(quoteRef,{status:'accepted',bookingId:bookingRef.id,acceptedAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,op,bookingRef.id,{serviceRequestId:requestRef.id,quoteId:quoteRef.id});return {id:bookingRef.id};
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
    audit(tx,a.uid,op,ref.id,{appointmentDate:appointment.appointmentDate,appointmentTime:appointment.appointmentTime});return {id:ref.id};
   });
  }
  if(op==='bookingCancel'){
   const ref=db.doc(`bookings/${D.id(input.id)}`),reason=D.text(input.reason,'Cancellation reason',500);
   return receipt.atomic(async tx=>{
    await current(tx,a.uid,role);const value=ownBooking(await tx.get(ref),a);
    if(!['pending_confirmation','confirmed'].includes(value.status))D.fail('This booking is already cancelled.','failed-precondition');
    await assertAuth(a.uid);
    // The current participant may cancel even if the other account is blocked.
    tx.update(ref,{status:'cancelled',cancellationReason:reason,cancelledByRole:role,cancelledAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{cancelledByRole:role});return {id:ref.id};
   });
  }
  D.fail('Unknown marketplace operation.');
 };
}
module.exports={createMarketplace,quoteId};
