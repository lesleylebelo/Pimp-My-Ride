const {FieldValue}=require('firebase-admin/firestore');
const {ApiError}=require('../backend/errors.cjs');
const D=require('../backend/domain.cjs');
const stamp=()=>FieldValue.serverTimestamp();
const fail=message=>{throw new ApiError('failed-precondition',message);};
const safeCode=error=>/^[a-z/-]{1,80}$/.test(error?.code||'')?error.code:'unknown';

// Operator labels annotate the audit trail; IAM/Application Default Credentials
// authorize callers. This module is never imported into the client or HTTP API.
function createTrustedAdminOperations({db,auth,now=Date.now}){
 const audit=(tx,actor,action,target,details)=>tx.create(db.collection('auditLogs').doc(),{actor,action,target,details,createdAt:stamp()});
 async function recordFailure(ref,userRef,lock,error,action,operator,reason){
  try {
   return await db.runTransaction(async tx=>{
    const [o,p]=await Promise.all([tx.get(ref),tx.get(userRef)]);
    if(o.data()?.status==='completed')return true;
    if(p.data()?.[lock]===ref.id&&['pending','failed'].includes(o.data()?.status)){
     tx.update(ref,{status:'failed',errorCode:safeCode(error),lastAttemptAt:stamp()});
     audit(tx,operator,action,o.data().target,{operationId:ref.id,reason,errorCode:safeCode(error)});
    }
    return false;
   });
  }catch{
   // An unconfirmed outcome never clears the account restriction.
   try{return (await ref.get()).data()?.status==='completed';}catch{return false;}
  }
 }
 async function provisionAdmin({uid,operationId,operator,reason}){
  uid=D.id(uid);operationId=D.id(operationId);operator=D.text(operator,'Operator label',128);reason=D.text(reason,'Reason',500);
  const ref=db.doc(`adminOperations/${operationId}`),userRef=db.doc(`users/${uid}`);
  const user=await auth.getUser(uid);
  if(!user.emailVerified||user.disabled)fail('An enabled account with a verified email is required.');
  const done=await db.runTransaction(async tx=>{
   const [o,p]=await Promise.all([tx.get(ref),tx.get(userRef)]),op=o.data(),profile=p.data();
   if(op){
    if(op.type!=='adminProvision'||op.target!==uid||op.actor!==operator||op.reason!==reason)fail('Operation ID belongs to another request.');
    if(op.status==='completed')return true;
    if(!['pending','failed'].includes(op.status)||profile?.provisioningOperation!==operationId||profile.role!=='admin'||profile.accountStatus!=='suspended')fail('Provisioning lock changed. Inspect the operation before retrying.');
    tx.update(ref,{status:'pending',lastAttemptAt:stamp()});
   }else{
    if(profile&&(!D.active(profile)||profile.statusOperation||profile.reviewOperation||profile.provisioningOperation))fail('Resolve account restrictions or pending operations before provisioning.');
    tx.create(ref,{type:'adminProvision',target:uid,actor:operator,reason,status:'pending',createdAt:stamp(),lastAttemptAt:stamp()});
    tx.set(userRef,{...(!profile?{fullName:user.displayName||'Project administrator',email:user.email||'',phone:user.phoneNumber||'',createdAt:stamp()}:{}),role:'admin',accountStatus:'suspended',provisioningOperation:operationId,updatedAt:stamp()},{merge:true});
   }
   audit(tx,operator,'admin.provisionRequested',uid,{operationId,reason});
   return false;
  });
  if(done)return {ok:true,alreadyCompleted:true};
  try{
   // Re-read claims so unrelated grants are preserved when resuming later.
   const current=await auth.getUser(uid);
   if(!current.emailVerified||current.disabled)fail('Account eligibility changed.');
   await auth.setCustomUserClaims(uid,{...current.customClaims,admin:true});
   await auth.revokeRefreshTokens(uid);
   await db.runTransaction(async tx=>{
    const [o,p]=await Promise.all([tx.get(ref),tx.get(userRef)]);
    if(o.data()?.status==='completed')return;
    if(o.data()?.status!=='pending'||p.data()?.provisioningOperation!==operationId||p.data()?.role!=='admin'||p.data()?.accountStatus!=='suspended')fail('Provisioning lock changed.');
    tx.update(userRef,{accountStatus:'active',provisioningOperation:FieldValue.delete(),updatedAt:stamp()});
    tx.update(ref,{status:'completed',completedAt:stamp()});
    audit(tx,operator,'admin.provisioned',uid,{operationId,reason});
   });
   return {ok:true};
  }catch(error){
   if(await recordFailure(ref,userRef,'provisioningOperation',error,'admin.provisionFailed',operator,reason))return {ok:true};
   throw new ApiError('unavailable','Provisioning is incomplete. The profile remains restricted; inspect and retry the same operation ID, operator label and reason.');
  }
 }
 async function reconcileStatus({operationId,operator,reason,workerQuiesced}){
  operationId=D.id(operationId);operator=D.text(operator,'Operator label',128);reason=D.text(reason,'Reason',500);
  if(workerQuiesced!==true)fail('Stop new account operations and confirm the original API worker has terminated before reconciliation.');
  const ref=db.doc(`adminOperations/${operationId}`),initial=(await ref.get()).data();
  if(!initial)fail('Operation not found.');
  if(initial.type!=='accountStatus'||!['active','suspended','archived'].includes(initial.requested))fail('This script only reconciles account status operations.');
  const userRef=db.doc(`users/${D.id(initial.target)}`);
  const done=await db.runTransaction(async tx=>{
   const [o,p]=await Promise.all([tx.get(ref),tx.get(userRef)]),op=o.data(),profile=p.data();
   if(op?.type!=='accountStatus'||op.target!==initial.target||op.requested!==initial.requested)fail('Operation changed.');
   if(op.status==='completed')return true;
   if(!['pending','failed'].includes(op.status)||!profile||profile.role==='admin'||profile.statusOperation!==operationId||profile.provisioningOperation||profile.reviewOperation)fail('Account lock does not match.');
   if(!Number.isFinite(op.createdAt?.toMillis?.())||op.createdAt.toMillis()>now()-120000)fail('Wait at least two minutes for the original operation to finish.');
   tx.update(ref,{reconciliationOperator:operator,reconciliationReason:reason,workerQuiescedAcknowledged:true,lastReconciliationAt:stamp()});
   audit(tx,operator,'account.reconcileRequested',op.target,{operationId,status:op.requested,reason,originalAdmin:op.actor,workerQuiescedAcknowledged:true});
   return false;
  });
  if(done)return {ok:true,alreadyCompleted:true};
  try{
   const user=await auth.getUser(initial.target);
   if(user.customClaims?.admin===true)fail('Administrator accounts cannot be changed by this script.');
   await auth.updateUser(initial.target,{disabled:initial.requested!=='active'});
   await auth.revokeRefreshTokens(initial.target);
   await db.runTransaction(async tx=>{
    const [o,p]=await Promise.all([tx.get(ref),tx.get(userRef)]),op=o.data(),profile=p.data();
    if(op?.status==='completed')return;
    if(op?.type!=='accountStatus'||op.target!==initial.target||op.requested!==initial.requested||!['pending','failed'].includes(op.status)||profile?.role==='admin'||profile?.statusOperation!==operationId||profile?.provisioningOperation||profile?.reviewOperation)fail('Account operation changed.');
    tx.update(userRef,{accountStatus:op.requested,statusReason:op.reason||reason,statusOperation:FieldValue.delete(),updatedAt:stamp()});
    tx.update(ref,{status:'completed',completedAt:stamp(),reconciled:true,reconciliationOperator:operator,reconciliationReason:reason});
    audit(tx,operator,'account.reconciled',op.target,{operationId,status:op.requested,reason,originalAdmin:op.actor});
   });
   return {ok:true};
  }catch(error){
   if(await recordFailure(ref,userRef,'statusOperation',error,'account.reconcileFailed',operator,reason))return {ok:true};
   throw new ApiError('unavailable','Reconciliation is incomplete. Preserve the account lock and retry this operation after inspecting the failure.');
  }
 }
 return {provisionAdmin,reconcileStatus};
}
module.exports={createTrustedAdminOperations};
