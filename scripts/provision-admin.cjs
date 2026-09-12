// Run from a trusted local environment only. Never import into the mobile app.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
async function main(){
 const [projectId,uid]=process.argv.slice(2);
 if(!projectId||!uid) throw new Error('Usage: node scripts/provision-admin.cjs PROJECT_ID EXISTING_AUTH_UID');
 initializeApp({credential:applicationDefault(),projectId});
 const auth=getAuth(),user=await auth.getUser(uid);
 await auth.setCustomUserClaims(uid,{...user.customClaims,admin:true});
 await getFirestore().collection('users').doc(uid).set({fullName:user.displayName || 'Project administrator',email:user.email,phone:user.phoneNumber || '',role:'admin',createdAt:FieldValue.serverTimestamp()});
 console.log('Administrator provisioned. Verify the email, then sign in again.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
