const {setTimeout:delay}=require('node:timers/promises');
const {errorCode,PROPOSED_GRACE_MS}=require('./cleanup.cjs');
const ATTEMPTS='storagePhotosUploadAttempts';
const ATTEMPT_ID=/^[a-f0-9]{64}$/;
const PATH=/^photos\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/;
const TRANSIENT=new Set(['deadline-exceeded','resource-exhausted','aborted','internal','unavailable']);
const APPLY_ERROR='Deletion is not implemented. Photo retention policy approval is required.';
function milliseconds(value){
 try{const n=typeof value?.toMillis==='function'?value.toMillis():value instanceof Date?value.getTime():value;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}catch{return null;}
}
function identity(data){
 const parts=typeof data?.path==='string'&&PATH.exec(data.path);
 return !!parts&&data.uid===parts[1]&&data.vehicleId===parts[2]&&data.assetId===parts[3]&&data.provider==='supabase'&&typeof data.slot==='string'&&/^[1-5]$/.test(data.slot);
}
function ageReason(data,at){
 const created=milliseconds(data.createdAt),updated=milliseconds(data.updatedAt);
 if(created===null||updated===null||created>at||updated>at)return 'unknown-age';
 if(at-Math.max(created,updated)<PROPOSED_GRACE_MS)return 'within-proposed-grace';
 return null;
}

// Read-only observations, never deletion authorization. This module has no
// storage client, transaction, write call, scheduler, or mutation endpoint.
function createPhotoCleanup({db,now=Date.now,sleep=delay}){
 async function read(action){
  for(let attempt=0;;attempt++)try{return await action();}catch(error){
   if(attempt>=2||!TRANSIENT.has(errorCode(error)))throw error;
   await sleep(100*2**attempt);
  }
 }
 async function examine(task,at){
  const initial=task.data();
  const keep=(reason,extra={})=>({id:ATTEMPT_ID.test(task.id)?task.id:'invalid-attempt-id',decision:'preserve',reason,...extra});
  if(!ATTEMPT_ID.test(task.id))return keep('invalid-attempt-id');
  if(!identity(initial))return keep('attempt-identity-mismatch');
  if(initial.state!=='cleanupPending')return keep(initial.state==='uploading'?'upload-outcome-unresolved':'attempt-not-cleanup-pending');
  const age=ageReason(initial,at);if(age)return keep(age);
  try{
   // Both reference collections are authoritative, including archived vehicles
   // and closed requests. A garage removal must not erase request attachments.
   for(const collection of ['vehicles','serviceRequests']){
    const references=await read(()=>db.collection(collection).where('photoIds','array-contains',initial.assetId).limit(1).get());
    if(references.docs.length)return keep(collection==='vehicles'?'vehicle-reference':'request-reference');
   }
   const asset=await read(()=>db.doc(`marketplacePhotos/${initial.assetId}`).get());
   if(asset.exists){
    const data=asset.data();
    if(data?.path!==initial.path||data.ownerId!==initial.uid||data.vehicleId!==initial.vehicleId||data.slot!==initial.slot||data.provider!=='supabase'||data.uploadAttemptId!==task.id)return keep('asset-identity-mismatch');
   }
   // Missing asset metadata can be an upload that failed before publication.
   // Every existing ledger for the immutable path must agree on its identity.
   const ledgers=await read(()=>db.collection(ATTEMPTS).where('path','==',initial.path).limit(2).get());
   if(ledgers.docs.length>1)return keep('ambiguous-upload-attempts');
   if(ledgers.docs.length!==1||ledgers.docs[0].id!==task.id)return keep('attempt-changed');
   // Read the exact original document last. Query snapshots and the first scan
   // may be stale relative to an upload/replacement that changed its outcome.
   const latest=await read(()=>db.doc(`${ATTEMPTS}/${task.id}`).get()),data=latest.data();
   if(!latest.exists||!identity(data)||['uid','vehicleId','slot','assetId','path'].some(key=>data[key]!==initial[key]))return keep('attempt-changed');
   if(data.state!=='cleanupPending')return keep('upload-outcome-unresolved');
   const changedAge=ageReason(data,at);if(changedAge)return keep(changedAge);
   if(milliseconds(data.createdAt)!==milliseconds(initial.createdAt)||milliseconds(data.updatedAt)!==milliseconds(initial.updatedAt))return keep('attempt-changed');
   return {id:task.id,decision:'candidate',reason:'unreferenced-under-proposed-policy'};
  }catch(error){return keep('reference-check-failed',{errorCode:errorCode(error)});}
 }
 async function report({limit=100,cursor=null,apply=false}={}){
  if(apply!==false)throw Error(APPLY_ERROR);
  if(!Number.isInteger(limit)||limit<1||limit>500||(cursor!==null&&!ATTEMPT_ID.test(cursor)))throw Error('Invalid photo report limit or cursor.');
  const at=now();if(!Number.isFinite(at)||at<0)throw Error('Invalid report time.');
  let query=db.collection(ATTEMPTS).orderBy('__name__');if(cursor)query=query.startAfter(cursor);
  const snapshot=await read(()=>query.limit(limit+1).get()),page=snapshot.docs.slice(0,limit),items=[];
  for(const task of page)items.push(await examine(task,at));
  const counts={examined:items.length,candidates:0,preserved:0,failedChecks:0};
  for(const item of items){counts[item.decision==='candidate'?'candidates':'preserved']++;if(item.reason==='reference-check-failed')counts.failedChecks++;}
  const more=snapshot.docs.length>limit,last=page.at(-1)?.id;
  return {mode:'dry-run',source:'photo-attempts',policy:'proposed-unapproved',graceHours:24,counts,items,nextCursor:more&&ATTEMPT_ID.test(last)?last:null,...(more&&!ATTEMPT_ID.test(last)?{paginationBlocked:true}:{})};
 }
 return {report};
}
module.exports={createPhotoCleanup,PROPOSED_GRACE_MS,APPLY_ERROR};
