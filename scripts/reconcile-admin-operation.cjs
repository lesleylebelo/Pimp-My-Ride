const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createTrustedAdminOperations}=require('./trusted-admin-operations.cjs');
async function main(){
 const [projectId,operationId,operator,reason,acknowledgement,...extra]=process.argv.slice(2);
 if(!projectId||!operationId||!operator||!reason||acknowledgement!=='--worker-quiesced'||extra.length){
  console.error('Usage: node scripts/reconcile-admin-operation.cjs PROJECT_ID OPERATION_ID OPERATOR_LABEL "REASON" --worker-quiesced');
  console.error('The flag acknowledges that new account operations are stopped and the original API worker has terminated. Waiting two minutes alone is insufficient.');
  process.exitCode=1;return;
 }
 initializeApp({projectId,credential:applicationDefault()});
 await createTrustedAdminOperations({auth:getAuth(),db:getFirestore()}).reconcileStatus({operationId,operator,reason,workerQuiesced:true});
 console.log('Account operation completed and audited.');
}
main().catch(()=>{console.error('Reconciliation could not be confirmed. Inspect adminOperations and preserve the account lock before retrying. No credentials or provider error details are printed.');process.exitCode=1;});
