const {randomUUID}=require('node:crypto');
const {FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),P=require('./photo-domain.cjs');
const {ApiError}=require('./errors.cjs');
const {mutation}=require('./mutations.cjs');
const LEASE_MS=120000;
const stamp=()=>FieldValue.serverTimestamp();
const revision=vehicle=>vehicle.photoRevision||0;
function closed(message='The upload was closed safely. Refresh photos, then select the photo again.'){
 const error=new ApiError('failed-precondition',message);error.retryWithNewRequest=true;return error;
}
function requireEligible(a,role=a.profile?.role){if(!['owner','shop'].includes(role)||!P.eligible(a.profile,role))D.fail('An active vehicle owner or approved shop account is required.','permission-denied');}
function ownVehicle(doc,uid,manage=false){const value=doc.data();if(!value||value.ownerId!==uid)D.fail('Vehicle not found.','not-found');if(manage&&value.archived)D.fail('Restore the vehicle before changing its photos.','failed-precondition');return value;}
function sameVersion(vehicle,version){if(revision(vehicle)!==version)D.fail('Vehicle photos changed. Refresh them before saving.','failed-precondition');}
function createPhotos({db,auth,storage,actor}){
 const audit=(tx,uid,action,target,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:`photos.${action}`,target,details,createdAt:stamp()});
 async function authEligible(uid){try{const user=await auth.getUser(uid);return user.emailVerified===true&&!user.disabled;}catch(error){if(error.code==='auth/user-not-found')return false;throw error;}}
 async function currentOwner(tx,uid){const profile=(await tx.get(db.doc(`users/${uid}`))).data();if(!P.eligible(profile,'owner')||!await authEligible(uid))D.fail('Vehicle owner access changed.','permission-denied');}
 async function targetFor(a,target,id){
  if(target==='vehicle'){
   if(a.profile.role!=='owner')D.fail('Vehicle not found.','not-found');
   const value=ownVehicle(await db.doc(`vehicles/${id}`).get(),a.uid);
   return {ownerId:a.uid,vehicleId:id,photoIds:Object.values(value.photoSlots||{}),vehicle:value,canManage:!value.archived};
  }
  if(target!=='request')D.fail('Choose a vehicle or service request.');
  const value=(await db.doc(`serviceRequests/${id}`).get()).data();if(!value)D.fail('Service request not found.','not-found');
  if(a.profile.role==='owner'){
   if(value.ownerId!==a.uid)D.fail('Service request not found.','not-found');
  }else if(value.status==='open'){
   if(value.visibility!=='open'&&!(value.visibility==='direct'&&value.shopId===a.uid))D.fail('Service request not found.','not-found');
   const [ownerDoc,vehicleDoc,categoryDoc]=await Promise.all([db.doc(`users/${value.ownerId}`).get(),db.doc(`vehicles/${value.vehicleId}`).get(),db.doc(`serviceCategories/${value.categoryId}`).get()]);
   const vehicle=vehicleDoc.data();
   if(!P.eligible(ownerDoc.data(),'owner')||!vehicle||vehicle.ownerId!==value.ownerId||vehicle.archived||categoryDoc.data()?.archived!==false||!await authEligible(value.ownerId))D.fail('Service request is unavailable.','not-found');
  }else{
   // Closed requests do not become a permanent gallery for competing shops.
   // Only the selected shop retains the immutable booking's request photos.
   if(!value.bookingId)D.fail('Service request photos are unavailable.','not-found');
   const booking=(await db.doc(`bookings/${D.id(value.bookingId)}`).get()).data();
   if(!booking||booking.serviceRequestId!==id||booking.shopId!==a.uid||booking.ownerId!==value.ownerId)D.fail('Service request photos are unavailable.','not-found');
  }
  return {ownerId:value.ownerId,vehicleId:value.vehicleId,photoIds:P.photoIds(value.photoIds),photos:value.photos||[],canManage:false};
 }
 function checkedAsset(doc,target){const asset=doc.data();if(!asset||asset.ownerId!==target.ownerId||asset.vehicleId!==target.vehicleId||asset.path!==`photos/${asset.ownerId}/${asset.vehicleId}/${doc.id}`)D.fail('Photo not found.','not-found');return asset;}
 async function photosApi(request){
  const a=await actor(request);requireEligible(a);const input=request.data||{},op=input.op;
  const fields={list:[],view:['photoId'],remove:['slot','version','requestId']};
  if(!Object.prototype.hasOwnProperty.call(fields,op))D.fail('Unknown photo operation.');
  M.fields(input,['op','target','id',...fields[op]]);const id=D.id(input.id);
  if(op==='remove'){
   if(a.profile.role!=='owner'||input.target!=='vehicle')D.fail('Only the vehicle owner can change its photos.','permission-denied');
   const slot=P.slot(input.slot),version=P.version(input.version);D.id(input.requestId);
   return mutation(db,a.uid,'photos:remove',input).atomic(async tx=>{
    await currentOwner(tx,a.uid);const vehicleRef=db.doc(`vehicles/${id}`),vehicle=ownVehicle(await tx.get(vehicleRef),a.uid,true);sameVersion(vehicle,version);
    const assetId=vehicle.photoSlots?.[slot];if(!assetId)D.fail('This photo was already removed. Refresh the vehicle.','failed-precondition');
    const assetDoc=await tx.get(db.doc(`marketplacePhotos/${D.id(assetId)}`)),asset=checkedAsset(assetDoc,{ownerId:a.uid,vehicleId:id});
    const previousRef=db.doc(`storagePhotosUploadAttempts/${D.id(asset.uploadAttemptId)}`),previous=await tx.get(previousRef),slots={...vehicle.photoSlots};delete slots[slot];
    tx.update(vehicleRef,{photoSlots:slots,photoIds:Object.values(slots),photoRevision:version+1,updatedAt:stamp()});
    if(previous.exists&&previous.data().assetId===assetId&&previous.data().path===asset.path)tx.update(previousRef,{state:'cleanupPending',reason:'removed',updatedAt:stamp()});
    audit(tx,a.uid,'removed',id,{assetId,slot});return {ok:true,version:version+1};
   });
  }
  const target=await targetFor(a,input.target,id);
  if(op==='list'){
   const documents=await Promise.all(target.photoIds.map(photoId=>db.doc(`marketplacePhotos/${D.id(photoId)}`).get()));
   const items=documents.map(doc=>{const value=checkedAsset(doc,target),item=P.safePhoto(value,doc.id);if(input.target==='vehicle')item.slot=Object.entries(target.vehicle.photoSlots||{}).find(([,value])=>value===doc.id)?.[0];return item;});
   return {items,version:target.vehicle?revision(target.vehicle):null,canManage:target.canManage};
  }
  const photoId=D.id(input.photoId);if(!target.photoIds.includes(photoId))D.fail('Photo not found.','not-found');
  const asset=checkedAsset(await db.doc(`marketplacePhotos/${photoId}`).get(),target);
  // Recheck current access just before minting each short-lived bearer URL.
  const fresh=await actor(request);requireEligible(fresh);const latest=await targetFor(fresh,input.target,id);
  if(!latest.photoIds.includes(photoId))D.fail('Photo changed. Refresh its details.','not-found');
  const issuedAt=Date.now(),url=await storage.signedUrl(asset.path,60);
  await db.collection('auditLogs').add({actor:a.uid,action:'photos.viewed',target:id,details:{type:input.target,assetId:photoId},createdAt:stamp()});
  return {url,expiresAt:issuedAt+60000};
 }
 async function checkPhotoUpload(request){
  const a=await actor(request);requireEligible(a,'owner');
  D.id(request.vehicleId);P.slot(request.slot);P.version(request.version);D.id(request.requestId);
  ownVehicle(await db.doc(`vehicles/${request.vehicleId}`).get(),a.uid,true);return a;
 }
 async function uploadPhoto(request){
  const a=await checkPhotoUpload(request),file=P.validatePhoto(request.file),vehicleId=request.vehicleId,slot=request.slot,version=request.version;
  const fingerprint=P.hash(JSON.stringify({vehicleId,slot,version,name:file.name,size:file.size,contentType:file.contentType,contentHash:file.contentHash}));
  const attempt=db.doc(`storagePhotosUploadAttempts/${P.hash(`${a.uid}\n${request.requestId}`)}`),vehicleRef=db.doc(`vehicles/${vehicleId}`),workerToken=randomUUID();
  const freshAssetId=randomUUID(),path=`photos/${a.uid}/${vehicleId}/${freshAssetId}`;
  function checkRecord(record){if(record&&(record.uid!==a.uid||record.fingerprint!==fingerprint))D.fail('This upload key was already used with different data.','already-exists');}
  const succeeded=record=>!!record?.result&&['referenced','cleanupPending'].includes(record.state);
  function outcome(record){checkRecord(record);if(succeeded(record))return {done:true,result:record.result};if(record?.state==='cleanupPending')throw closed();if(record?.state==='uploading'&&record.workerToken===workerToken)return {done:false,record};D.fail('The upload is still pending or its outcome is unknown. Refresh and retry the same photo shortly.','unavailable');}
  let reservation;
  try{
   reservation=await db.runTransaction(async tx=>{
    const saved=(await tx.get(attempt)).data();checkRecord(saved);
    if(saved){
     if(succeeded(saved))return {done:true,result:saved.result};
     if(saved.state==='uploading'&&saved.createdAt instanceof Timestamp&&saved.createdAt.toMillis()<=Date.now()-LEASE_MS){tx.update(attempt,{state:'cleanupPending',reason:'expired',updatedAt:stamp()});return {closed:true};}
     if(saved.state==='cleanupPending')return {closed:true};
     D.fail('The upload is still in progress. Refresh and retry the same photo shortly.','unavailable');
    }
    await currentOwner(tx,a.uid);const vehicle=ownVehicle(await tx.get(vehicleRef),a.uid,true);
    const record={provider:'supabase',uid:a.uid,vehicleId,slot,assetId:freshAssetId,path,fingerprint,workerToken,state:'uploading',createdAt:stamp(),updatedAt:stamp()};
    // Fence a stale key durably before allowing a new one. A concurrent retry
    // cannot subsequently reserve that key, even if this response is lost.
    if(revision(vehicle)!==version){tx.create(attempt,{...record,state:'cleanupPending',reason:'stale-version'});return {closed:true};}
    tx.create(attempt,record);return {done:false,record};
   });
  }catch(error){
   // A lost reservation acknowledgement may still have created our exact
   // worker's lease. Never upload without authoritative proof of that lease.
   if(error instanceof ApiError)throw error;
   try{reservation=outcome((await attempt.get()).data());}catch(settlement){if(settlement instanceof ApiError)throw settlement;D.fail('The upload reservation could not be confirmed. Retry the same photo.','unavailable');}
  }
  if(reservation.closed)throw closed();if(reservation.done)return reservation.result;
  const owned=reservation.record,assetRef=db.doc(`marketplacePhotos/${owned.assetId}`);
  async function settle(){return db.runTransaction(async tx=>{
   const saved=(await tx.get(attempt)).data();checkRecord(saved);
   if(succeeded(saved))return {done:true,result:saved.result};
   if(saved?.state==='uploading'&&saved.workerToken===workerToken)tx.update(attempt,{state:'cleanupPending',reason:'failed',updatedAt:stamp()});
   if(saved?.state==='cleanupPending'||(saved?.state==='uploading'&&saved.workerToken===workerToken))return {closed:true};
   return {unknown:true};
  });}
  try{
   await storage.upload(owned.path,file.buffer,file.contentType);
   return await db.runTransaction(async tx=>{
    await currentOwner(tx,a.uid);
    const [vehicleDoc,ledger]=await Promise.all([tx.get(vehicleRef),tx.get(attempt)]),vehicle=ownVehicle(vehicleDoc,a.uid,true),saved=ledger.data();
    if(saved?.state!=='uploading'||saved.workerToken!==workerToken||!(saved.createdAt instanceof Timestamp)||saved.createdAt.toMillis()<=Date.now()-LEASE_MS)D.fail('The upload lease expired or was closed. Refresh before trying again.','failed-precondition');sameVersion(vehicle,version);
    const previousId=vehicle.photoSlots?.[slot];let previousRef,previous;
    if(previousId){const prior=await tx.get(db.doc(`marketplacePhotos/${D.id(previousId)}`)),value=checkedAsset(prior,{ownerId:a.uid,vehicleId});previousRef=db.doc(`storagePhotosUploadAttempts/${D.id(value.uploadAttemptId)}`);previous=await tx.get(previousRef);if(previous.data()?.path!==value.path||previous.data()?.assetId!==previousId)previousRef=null;}
    // Previous-asset reads can take time too. Do not publish if the lease
    // expires while resolving replacement metadata in this transaction.
    if(saved.createdAt.toMillis()<=Date.now()-LEASE_MS)D.fail('The upload lease expired. Refresh before trying again.','failed-precondition');
    const slots={...vehicle.photoSlots,[slot]:owned.assetId},result={ok:true,id:owned.assetId,slot,version:version+1};
    tx.create(assetRef,{provider:'supabase',ownerId:a.uid,vehicleId,slot,path:owned.path,name:file.name,size:file.size,contentType:file.contentType,uploadedAt:stamp(),uploadAttemptId:attempt.id});
    tx.update(vehicleRef,{photoSlots:slots,photoIds:Object.values(slots),photoRevision:version+1,updatedAt:stamp()});
    tx.update(attempt,{state:'referenced',result,updatedAt:stamp()});
    if(previousRef)tx.update(previousRef,{state:'cleanupPending',reason:'replaced',updatedAt:stamp()});
    audit(tx,a.uid,'uploaded',vehicleId,{assetId:owned.assetId,slot,replaced:!!previousId});return result;
   });
  }catch(error){
   let settled;try{settled=await settle();}catch{
    // Settlement itself can lose its acknowledgement. Only an authoritative
    // terminal ledger read can authorize a new key or confirm success.
    try{const saved=(await attempt.get()).data();checkRecord(saved);if(succeeded(saved))settled={done:true,result:saved.result};else if(saved?.state==='cleanupPending')settled={closed:true};}catch{}
   }
   if(settled?.done)return settled.result;
   if(settled?.closed)throw closed(error instanceof ApiError?error.message:'The photo upload failed safely. Refresh photos and select it again.');
   D.fail('The upload result could not be confirmed. Refresh and retry the same photo.','unavailable');
  }
 }
 return {photosApi,checkPhotoUpload,uploadPhoto};
}
module.exports={createPhotos,LEASE_MS};
