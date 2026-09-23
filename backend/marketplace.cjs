const {createHash}=require('node:crypto');
const {FieldPath,FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const {mutation}=require('./mutations.cjs');
const PAGE_SIZE=20;
const stamp=()=>FieldValue.serverTimestamp();
const quoteId=(requestId,shopId)=>createHash('sha256').update(`${requestId}\n${shopId}`).digest('hex');
const serialize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,serialize(v)])):value;
const row=doc=>({id:doc.id,...serialize(doc.data())});
const allowed={
 vehicles:['cursor','archived'],vehicleSave:['id','version','make','model','year','colour','registration'],vehicleArchive:['id','version','archived'],
 categories:['cursor'],shops:['cursor'],requestCreate:['vehicleId','title','description','categoryId','city','budgetMinCents','budgetMaxCents','preferredDate','visibility','shopId'],
 requests:['feed','cursor'],request:['id','quotesCursor'],requestClose:['id'],quoteSubmit:['serviceRequestId','scope','items','completionDays','warranty','validForDays'],quotes:['cursor'],quoteWithdraw:['id'],
};
const mutations=new Set(['vehicleSave','vehicleArchive','requestCreate','requestClose','quoteSubmit','quoteWithdraw']);
function eligible(profile,role){return profile?.role===role&&D.active(profile)&&!profile.statusOperation&&!profile.provisioningOperation&&(role!=='shop'||(profile.verificationStatus==='approved'&&!profile.reviewOperation));}
function requireRole(profile,role){if(!eligible(profile,role))D.fail(role==='shop'?'An active, approved shop account is required.':'An active vehicle owner account is required.','permission-denied');}
function requestFor(value,role){const result={...value};if(role==='shop'){delete result.ownerId;delete result.vehicleId;}return result;}
function createMarketplace({db,auth,actor}){
 const audit=(tx,uid,action,target,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:`marketplace.${action}`,target,details,createdAt:stamp()});
 async function current(tx,uid,role){const profile=(await tx.get(db.doc(`users/${uid}`))).data();requireRole(profile,role);return profile;}
 async function authEligible(uid){try{const user=await auth.getUser(uid);return user.emailVerified===true&&!user.disabled;}catch(error){if(error.code==='auth/user-not-found')return false;throw error;}}
 async function assertAuth(uid){if(!await authEligible(uid))D.fail('The related account is no longer available.','failed-precondition');}
 function ownVehicle(snapshot,uid){if(!snapshot.exists||snapshot.data().ownerId!==uid)D.fail('Vehicle not found.','not-found');return snapshot.data();}
 function ownRequest(snapshot,uid){if(!snapshot.exists||snapshot.data().ownerId!==uid)D.fail('Service request not found.','not-found');return snapshot.data();}
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
  if(['vehicles','vehicleSave','vehicleArchive','requestCreate','requestClose','shops','categories'].includes(op))requireRole(a.profile,'owner');
  if(['quoteSubmit','quotes','quoteWithdraw'].includes(op))requireRole(a.profile,'shop');
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
  // Unlike the legacy admin endpoint, every marketplace mutation must carry a
  // stable retry key. Missing keys never create a receipt or perform a write.
  D.id(input.requestId);const receipt=mutation(db,a.uid,`marketplace:${op}`,input);
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
   const changes=M.serviceRequest(input),vehicleRef=db.doc(`vehicles/${D.id(input.vehicleId)}`),categoryRef=db.doc(`serviceCategories/${changes.categoryId}`),ref=db.collection('serviceRequests').doc();
   return receipt.atomic(async tx=>{
    M.requireFutureDate(changes.preferredDate);
    await current(tx,a.uid,'owner');const [vehicleDoc,categoryDoc]=await Promise.all([tx.get(vehicleRef),tx.get(categoryRef)]),vehicle=ownVehicle(vehicleDoc,a.uid),category=categoryDoc.data();
    if(vehicle.archived)D.fail('Choose an active vehicle.','failed-precondition');
    if(!category||category.archived!==false)D.fail('Choose an active service category.','failed-precondition');
    if(changes.shopId){const shop=(await tx.get(db.doc(`users/${changes.shopId}`))).data();if(!eligible(shop,'shop'))D.fail('Choose an active, approved shop.','failed-precondition');await assertAuth(changes.shopId);}
    tx.create(ref,{...changes,ownerId:a.uid,vehicleId:vehicleRef.id,vehicle:M.vehicleSnapshot(vehicle),categoryName:category.name,status:'open',createdAt:stamp(),updatedAt:stamp()});
    audit(tx,a.uid,op,ref.id,{visibility:changes.visibility});return {id:ref.id};
   });
  }
  if(op==='requestClose'){
   const ref=db.doc(`serviceRequests/${D.id(input.id)}`);
   return receipt.atomic(async tx=>{await current(tx,a.uid,'owner');const value=ownRequest(await tx.get(ref),a.uid);
    if(value.status!=='open')D.fail('This service request is already closed.','failed-precondition');
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
    if(value.status!=='submitted')D.fail('This quotation is already withdrawn.','failed-precondition');
    tx.update(ref,{status:'withdrawn',withdrawnAt:stamp(),updatedAt:stamp()});audit(tx,a.uid,op,ref.id,{serviceRequestId:value.serviceRequestId});return {id:ref.id};});
  }
  D.fail('Unknown marketplace operation.');
 };
}
module.exports={createMarketplace,quoteId};
