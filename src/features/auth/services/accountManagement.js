import {EmailAuthProvider,reauthenticateWithCredential,getIdToken,verifyBeforeUpdateEmail,updatePassword,sendPasswordResetEmail,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {firebase} from '../../../shared/services/firebase';
import {apiRequest} from '../../../shared/services/api';
import {clearProfileCache} from '../../../shared/offline/profileCache';
import {invalidateReads} from '../../../shared/services/readCoordinator';
import {clearSessionCaches} from '../../../shared/services/sessionCaches';
import {isolatedAccountAction} from './accounts';
import {guardedLogin} from './loginCooldown';
import {validateEmailField,validatePasswordField} from '../utils/validators';
export async function accountApi(op,data={},options={}){
 const user=(options.authClient||firebase().auth).currentUser;if(!user)throw Error('Sign in to continue.');
 try{const result=await apiRequest('account',{op,...data},{...options,expectedUid:user.uid});if((options.authClient||firebase().auth).currentUser!==user)throw Error('Your account changed. Reload this page.');return result;}
 finally{if(!['profile','status'].includes(op))invalidateReads();}
}
export const accountRequestId=()=>`account_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export async function confirmPassword(password){
 const auth=firebase().auth,user=auth.currentUser;if(!user?.email)throw Error('Sign in again.');
 if(!password)throw Error('Enter your current password. Google-only accounts can first use the password reset link to set a password.');
 await guardedLogin(()=>reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password)));
 if(auth.currentUser!==user)throw Error('Your account changed. Retry after signing in.');await getIdToken(user,true);return user;
}
export async function changeEmail(email,password){
 const validation=validateEmailField(email);if(validation)throw Error(validation);
 const user=await confirmPassword(password);await verifyBeforeUpdateEmail(user,email.trim());
 return 'Verification sent to the new email address. Your current email stays in use until you open that link. Sign in again afterwards and refresh your account.';
}
export async function changePassword(password,next){
 const validation=validatePasswordField(next);if(validation)throw Error(validation);
 const user=await confirmPassword(password);await updatePassword(user,next);await closeLocalSession();
}
export async function resetOwnPassword(){const auth=firebase().auth;if(!auth.currentUser?.email)throw Error('Sign in again.');await sendPasswordResetEmail(auth,auth.currentUser.email);}
export async function closeLocalSession(){
 const auth=firebase().auth,uid=auth.currentUser?.uid;
 clearSessionCaches();
 try{await signOut(auth);}
 finally{await clearProfileCache(uid);}
}
export async function recoverAccount(email,password,reactivate=false){
 return isolatedAccountAction(async({auth})=>{
  const {user}=await guardedLogin(()=>signInWithEmailAndPassword(auth,email.trim(),password));
  if(!user.emailVerified)throw Error('Verify your email before account recovery.');
  const status=await accountApi('status',{}, {authClient:auth});
  if(firebase().auth.currentUser)throw Error('Sign out before starting another account action.');
  if(!reactivate)return status;
  if(status.accountStatus!=='deactivated'||status.job?.kind!=='deactivate'||status.job?.state!=='completed')throw Error('Only a completed self-deactivation can be reactivated here. Other restrictions require support.');
  return accountApi('reactivate',{requestId:accountRequestId()},{authClient:auth});
 });
}
