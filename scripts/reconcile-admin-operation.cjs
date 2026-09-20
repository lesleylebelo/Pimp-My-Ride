const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
async function main(){
 const [projectId,operationId]=process.argv.slice(2);
 if(!projectId||!operationId||!/^[\w-]+$/.test(operationId))throw Error('Usage: node scripts/reconcile-admin-operation.cjs PROJECT_ID OPERATION_ID');
 initializeApp({projectId,credential:applicationDefault()});
 const db=getFirestore(),ref=db.doc(`adminOperations/${operationId}`),snap=await ref.get();
 if(!snap.exists)throw Error('Operation not found.');
 const op=snap.data();if(op.status==='completed'){console.log('Already completed.');return;}
 if(!['pending','failed'].includes(op.status)||!['active','suspended','archived'].includes(op.requested))throw Error('Unsupported operation.');
 const userRef=db.doc(`users/${op.target}`),profile=(await userRef.get()).data();
 if(!profile||profile.role==='admin'||profile.statusOperation!==operationId)throw Error('Account lock does not match. No changes made.');
 if(op.createdAt.toMillis()>Date.now()-120000)throw Error('Wait two minutes so the original operation can finish.');
 await getAuth().updateUser(op.target,{disabled:op.requested!=='active'});
 await getAuth().revokeRefreshTokens(op.target);
 await db.runTransaction(async tx=>{
  const p=await tx.get(userRef);if(p.data().statusOperation!==operationId)throw Error('Operation changed.');
  tx.update(userRef,{accountStatus:op.requested,statusOperation:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(ref,{status:'completed',completedAt:FieldValue.serverTimestamp(),reconciled:true});
  tx.create(db.collection('auditLogs').doc(),{actor:'system:trusted-reconcile-script',action:'account.reconciled',target:op.target,details:{operationId,status:op.requested,originalAdmin:op.actor},createdAt:FieldValue.serverTimestamp()});
 });console.log('Operation completed and recorded.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
