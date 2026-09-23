const {FieldValue,Timestamp}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const D=require('./domain.cjs');

// Firestore map key order is not part of a document's identity. Preserve timestamp
// nanoseconds while normalizing nested maps so equivalent reads compare equally.
const canonical=value=>value instanceof Timestamp?{seconds:value.seconds,nanoseconds:value.nanoseconds}:Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=docs=>createHash('sha256').update(JSON.stringify(docs.map(s=>s.exists?canonical(s.data()):null))).digest('hex');
function createReviews({db,auth,storage,now=Date.now}) {
 const stamp=()=>FieldValue.serverTimestamp();
 const log=(tx,actor,action,target,details)=>tx.create(db.collection('auditLogs').doc(),{actor,action,target,details,createdAt:stamp()});
 const documents=(tx,ref)=>Promise.all(D.kinds.map(k=>tx.get(ref.collection('documents').doc(k))));
 function owned(profile,op,id) {
  return profile?.reviewOperation===id && profile.verificationStatus==='reviewing' && op?.status==='pending';
 }
 async function rollback(operationId,actor,recovery=false,reason='Review could not complete.') {
  const operation=db.doc(`adminOperations/${D.id(operationId)}`);
  return db.runTransaction(async tx=>{
   const snapshot=await tx.get(operation),op=snapshot.data();
   if(!op||op.type!=='shopReview')D.fail('Review operation not found.','not-found');
   if(op.status!=='pending')return {ok:true,status:op.status,operationId};
   if(recovery && op.recoverAfter.toMillis()>now())D.fail('Wait two minutes before recovering an interrupted review.','failed-precondition');
   const ref=db.doc(`users/${op.target}`),profile=(await tx.get(ref)).data();
   if(!owned(profile,op,operationId)) {
    tx.update(operation,{status:'superseded',completedAt:stamp()});
    log(tx,actor,'shop.reviewSuperseded',op.target,{operationId,reason});
    return {ok:true,status:'superseded',operationId};
   }
   const current=await documents(tx,ref);
   // Recovery never grants marketplace access. Even an earlier approval must be rechecked.
   const previous=op.previousStatus;
   const status=!recovery && fingerprint(current)===op.documentFingerprint && previous==='rejected'?'rejected':'pending';
   tx.update(ref,{verificationStatus:status,reviewOperation:FieldValue.delete(),updatedAt:stamp()});
   const result=recovery?'recovered':'failed';
   tx.update(operation,{status:result,recoveryReason:reason,completedAt:stamp()});
   log(tx,actor,recovery?'shop.reviewRecovered':'shop.reviewFailed',op.target,{operationId,reason,previousStatus:previous,status});
   return {ok:true,status:result,operationId};
  });
 }
 async function review({actor,uid,status,reason,operationId,payloadFingerprint}) {
  if(!['pending','approved','rejected'].includes(status))D.fail('Invalid review outcome.');
  reason=D.text(reason,'Review reason',500);
  const ref=db.doc(`users/${D.id(uid)}`),operation=operationId?db.doc(`adminOperations/${D.id(operationId)}`):db.collection('adminOperations').doc();
  const prior=await db.runTransaction(async tx=>{
   const saved=(await tx.get(operation)).data();
   if(saved){
    if(saved.actor!==actor||saved.payloadFingerprint!==payloadFingerprint)D.fail('This request key was already used with different data.','already-exists');
    if(saved.status==='completed')return {ok:true,operationId:operation.id};
    D.fail('This review already has an outcome or needs recovery. Reload before starting a new review.','failed-precondition');
   }
   const profile=(await tx.get(ref)).data();
   if(!D.active(profile)||profile.role!=='shop'||profile.reviewOperation||profile.statusOperation)D.fail('Account changed or another operation is in progress. Reload it.','failed-precondition');
   const docs=await documents(tx,ref);
   tx.create(operation,{type:'shopReview',actor,target:uid,requested:status,reason,status:'pending',payloadFingerprint:payloadFingerprint||'',
    previousStatus:profile.verificationStatus||'pending',documentFingerprint:fingerprint(docs),
    createdAt:stamp(),recoverAfter:Timestamp.fromMillis(now()+120000)});
   tx.update(ref,{verificationStatus:'reviewing',reviewOperation:operation.id});
   log(tx,actor,'shop.reviewStarted',uid,{operationId:operation.id,requested:status,reason});
  });
  if(prior)return prior;
  try {
   const inspected=[];
   if(status==='approved') {
    const user=await auth.getUser(uid);
    if(!user.emailVerified||user.disabled)D.fail('Shop must have an active, verified email.');
    for(const kind of D.kinds) {
     const record=await ref.collection('documents').doc(kind).get();
     const value=record.data();
     if(!value||value.provider!=='supabase'||!D.validObject(value))D.fail(`Missing or invalid ${kind}. Upload it again.`);
     const metadata=await storage.inspect(value.path);
     if(!D.validObject(metadata)||Number(metadata.size)!==value.size||metadata.contentType!==value.contentType)D.fail(`Invalid ${kind}.`);
     inspected.push(record);
    }
   }
   await db.runTransaction(async tx=>{
    const [p,o]=await Promise.all([tx.get(ref),tx.get(operation)]),profile=p.data(),op=o.data();
    if(!owned(profile,op,operation.id)||!D.active(profile)||profile.role!=='shop'||profile.statusOperation)D.fail('Account changed. Reload it.','failed-precondition');
    const docs=await documents(tx,ref),current=fingerprint(docs);
    if(current!==op.documentFingerprint || (status==='approved'&&current!==fingerprint(inspected)))D.fail('Documents changed. Review them again.','failed-precondition');
    tx.update(ref,{verificationStatus:status,reviewOperation:FieldValue.delete(),reviewReason:reason,reviewedBy:actor,reviewedAt:stamp()});
    tx.update(operation,{status:'completed',completedAt:stamp()});
    log(tx,actor,`shop.${status}`,uid,{operationId:operation.id,reason});
   });
   return {ok:true,operationId:operation.id};
  } catch(error) {
   // A lost acknowledgement may hide a successful commit. Never undo a completed operation.
   let outcome;
   try {outcome=await rollback(operation.id,actor);}
   catch {D.fail('Review interrupted. Reload the account and recover the review after two minutes.','unavailable');}
   if(outcome.status==='completed')return {ok:true,operationId:operation.id};
   throw error;
  }
 }
 return {review,recover:({operationId,actor,reason})=>rollback(operationId,actor,true,D.text(reason,'Recovery reason',500))};
}
module.exports={createReviews};
