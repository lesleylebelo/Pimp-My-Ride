import {apiRequest} from '../../../shared/services/api';
import {Platform} from 'react-native';
import {guardedLogin} from './loginCooldown';
import { requireConnection } from '../../../shared/services/network';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateCurrentUser, deleteUser, getIdTokenResult, sendEmailVerification, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { firebase, withIsolatedAuth } from '../../../shared/services/firebase';
import { DOCUMENT_KEYS, fileError } from '../utils/registration';
let accountActionPending = false;
export async function isolatedAccountAction(operation) {
 if (accountActionPending) throw new Error('Another account action is in progress.');
 accountActionPending = true;
 try {
  await requireConnection();
  if (firebase().auth.currentUser) throw new Error('Sign out before starting another account action.');
  return await withIsolatedAuth(operation);
 } finally { accountActionPending = false; }
}
export async function login(email, password) {
 return isolatedAccountAction(async ({auth, db}) => {
  const { user } = await guardedLogin(() => signInWithEmailAndPassword(auth, email.trim(), password));
  try{return await validateAndPromote({auth,db},user);}
  catch(error){
   if(error?.selfDeactivated){
    const status=await apiRequest('account',{op:'status'},{authClient:auth,expectedUid:user.uid,force:true});
    if(status.accountStatus==='deactivated'&&status.job?.kind==='deactivate'&&status.job.state==='completed'){
     const recovery=new Error('Your account is self-deactivated. You can choose to reactivate it.');recovery.code='auth/self-deactivated';throw recovery;
    }
   }
   throw error;
  }
 });
}
export async function validateAndPromote({auth,db},user,assertActive=()=>{}) {
  if(!user.emailVerified){
   const unverified=new Error('Please verify your email before signing in. Open the verification link in your inbox, or resend the email.');
   unverified.code='auth/email-not-verified';throw unverified;
  }
  const snapshot = await getDocFromServer(doc(db, 'users', user.uid));
  if (!snapshot.exists()) {
   const missing=new Error('Your sign-in account exists, but its profile was not saved. Sign out, return to Create account, and submit the original signup details to finish this incomplete signup. If that does not work, contact support.');
   missing.code='auth/profile-missing';throw missing;
  }
  const profile=snapshot.data();
  if(typeof profile.fullName!=='string'||!profile.fullName.trim()||typeof profile.phone!=='string'||!profile.phone.trim()){
   const invalid=new Error('Your account profile is incomplete or damaged. Sign-in cannot continue; contact support to restore account access.');
   invalid.code='auth/profile-invalid';throw invalid;
  }
  if (profile.accountStatus && profile.accountStatus !== 'active'){const failure=new Error('Account access is restricted. Contact support.');failure.code='auth/account-restricted';failure.selfDeactivated=profile.accountStatus==='deactivated'&&['owner','shop'].includes(profile.role)&&profile.verificationStatus!=='reviewing'&&!profile.statusOperation&&!profile.reviewOperation&&!profile.provisioningOperation;throw failure;}
  const role = profile.role;
  if (!['owner','shop','admin'].includes(role)) throw new Error('Account access is unavailable. Contact the project administrator.');
  if (role === 'admin' && (await getIdTokenResult(user,true)).claims.admin !== true) throw new Error('This account does not have administrator access.');
  // Only a verified user with a valid profile may enter the persisted app session.
  const mainAuth = firebase().auth;
  if (mainAuth.currentUser) throw new Error('Your account changed. Please try again.');
  assertActive();
  await updateCurrentUser(mainAuth, user);
  try{assertActive();}
  catch(error){
   // Cancellation may arrive while Firebase writes persistence. The context's
   // account lock prevents publishing that session until cleanup completes.
   if(mainAuth.currentUser?.uid===user.uid)await signOut(mainAuth);
   throw error;
  }
  return mainAuth.currentUser;
}
export async function register(form, role) {
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 return isolatedAccountAction(async session => {
 const { auth, db } = session;
 let user;
 try{({user}=await createUserWithEmailAndPassword(auth, form.email.trim(), form.password));}
 catch(error){
  if(error.code!=='auth/email-already-in-use')throw error;
  user=await guardedLogin(()=>signInWithEmailAndPassword(auth,form.email.trim(),form.password)).then(result=>result.user,loginError=>{
   if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(loginError.code)){
    const failure=new Error('An account with this email already exists. Sign in with its password or reset the password, then try again.');
    failure.code='auth/email-already-in-use';throw failure;
   }
   throw loginError;
  });
   const snapshot=await getDocFromServer(doc(db,'users',user.uid));
   if(snapshot.exists()){
    if(typeof snapshot.data().fullName!=='string'||!snapshot.data().fullName.trim()||typeof snapshot.data().phone!=='string'||!snapshot.data().phone.trim()){
     const invalid=new Error('This account exists but its saved profile is incomplete. Contact support to restore it.');
     invalid.code='auth/profile-invalid';throw invalid;
    }
    const exists=new Error('An account with this email already exists. Sign in to continue.');
    exists.code='auth/email-already-in-use';throw exists;
   }
   await saveProfile(form,role,user,auth);
   if(!user.emailVerified)await sendVerification(user);
   return {emailVerified:user.emailVerified};
 }
 try{await saveProfile(form,role,user,auth);}
 catch(error){
  try{await deleteUser(user);}
  catch(cleanupError){
   const failure=new Error(`Your account profile could not be saved (${error.message||'server error'}), and the incomplete account could not be removed (${cleanupError.message||'cleanup error'}). Please contact support before trying again.`);
   failure.code='auth/profile-rollback-failed';throw failure;
  }
  throw error;
 }
 await sendVerification(user);
 return {emailVerified:false};
 });
}

export async function resendVerification(email, password) {
 return isolatedAccountAction(async ({auth}) => {
  const {user} = await guardedLogin(() => signInWithEmailAndPassword(auth, email.trim(), password));
  if (user.emailVerified) {
   const error = new Error('Your email is already verified. Return to sign in to continue.');
   error.code = 'auth/email-already-verified';
   throw error;
  }
  await sendEmailVerification(user);
 });
}

export function profilePayload(form,role,user) {
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 const data = {
  fullName: form.fullName.trim(), email: user.email, phone: form.phone.replace(/[\s()-]/g,''), role,
  termsVersion: 'academic-v2', agreed: form.agreed === true,
 };
 if (role === 'shop') {
  data.shop = Object.fromEntries(['shopName','regNumber','address','city','province','services'].map(k => [k, form[k].trim()]));
  data.verificationStatus = 'pending';
 }
 return data;
}
async function saveProfile(form,role,user,authClient) {
 if(!user)throw new Error('Please sign in again.');
 await apiRequest('profile',profilePayload(form,role,user),{authClient,expectedUid:user.uid});
}
async function sendVerification(user) {
 try{await sendEmailVerification(user);}
 catch{const failure=new Error("Your account and profile were created, but we couldn't send the verification email. Use Resend verification email to try again. You remain signed out.");failure.code='auth/verification-email-failed';throw failure;}
}
export async function listDocuments(expectedUid) {
 const user = firebase().auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 const result = await apiRequest('documents/list', {}, {expectedUid:expectedUid || user.uid});
 if (!Array.isArray(result?.items)) throw new Error('Unable to read document status. Please refresh and try again.');
 return result.items.filter(item => DOCUMENT_KEYS.includes(item.id)).map(({id,name,size,contentType,uploadedAt}) => ({id,name,size,contentType,uploadedAt}));
}
export async function uploadDocument(kind, file, expectedUid) {
 await requireConnection();
 const { auth } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 if (expectedUid && user.uid !== expectedUid) throw new Error('Your account changed. Please choose the document again.');
 if (!user.emailVerified) throw new Error('Verify your email before uploading shop documents.');
 if (!DOCUMENT_KEYS.includes(kind)) throw new Error('Choose a supported verification document.');
 const error = fileError(file);
 if (error) throw new Error(error);
 const body = new FormData();
 if (Platform.OS === 'web') {
  const response = await fetch(file.uri);
  if (!response.ok) throw new Error('Unable to read the selected file. Please choose it again.');
  body.append('file', await response.blob(), file.name);
 } else {
  body.append('file', {uri:file.uri,name:file.name,type:file.mimeType});
 }
 if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Please choose the document again.');
 return apiRequest(`documents/${kind}`, body, {multipart:true,expectedUid:user.uid});
}
// Retained for existing callers; the account screen uploads each document separately.
export async function uploadDocuments(files) {
 for (const kind of DOCUMENT_KEYS) {
  const error = fileError(files[kind]);
  if (error) throw new Error(error);
 }
 for (const kind of DOCUMENT_KEYS) await uploadDocument(kind, files[kind]);
}
