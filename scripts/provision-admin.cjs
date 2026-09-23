const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createTrustedAdminOperations}=require('./trusted-admin-operations.cjs');
async function main(){
 const [projectId,uid,operationId,operator,reason,...extra]=process.argv.slice(2);
 if(!projectId||!uid||!operationId||!operator||!reason||extra.length){
  console.error('Usage: node scripts/provision-admin.cjs PROJECT_ID EXISTING_AUTH_UID OPERATION_ID OPERATOR_LABEL "REASON"');
  process.exitCode=1;return;
 }
 initializeApp({credential:applicationDefault(),projectId});
 await createTrustedAdminOperations({auth:getAuth(),db:getFirestore()}).provisionAdmin({uid,operationId,operator,reason});
 console.log('Administrator provisioned and audited. Sign in again to obtain a fresh authenticated session.');
}
main().catch(()=>{console.error('Provisioning could not be confirmed. Inspect adminOperations; retry using the same operation ID, operator label and reason. No credentials or provider error details are printed.');process.exitCode=1;});
