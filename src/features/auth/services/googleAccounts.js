import {signInWithCustomToken,signInWithEmailAndPassword} from 'firebase/auth';
import {doc,getDocFromServer} from 'firebase/firestore';
import {isolatedAccountAction,profilePayload,validateAndPromote} from './accounts';
import {guardedLogin} from './loginCooldown';
import {apiRequest} from '../../../shared/services/api';
import {localDemo} from '../../../shared/services/firebase';

export const cancelled=()=>Object.assign(new Error('Google sign-in cancelled. Your app remains signed out.'),{code:'auth/google-cancelled'});
export function assertGoogleActive(signal){if(signal?.aborted)throw cancelled();}

// Credentials and tokens stay inside this operation, never route params/storage.
export async function exchangeGoogle(data,signal){
 const base=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
 if(!/^https:\/\//.test(base)&&!(__DEV__&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)))throw new Error('Google sign-in requires a configured HTTPS backend.');
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,90000);
 try{
  assertGoogleActive(signal);
  const response=await fetch(`${base}/auth/google`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal});
  const body=await response.json();
  assertGoogleActive(signal);
  if(!response.ok)throw Object.assign(new Error(body?.error?.message||'Google sign-in could not complete.'),{code:`api/${body?.error?.code||'unavailable'}`});
  if(!['link-required','authenticated'].includes(body?.data?.status))throw new Error('Invalid Google sign-in response. Use email/password or try again.');
  return body.data;
 }catch(e){if(signal?.aborted)throw cancelled();if(e.name==='AbortError')throw new Error('Google sign-in timed out. Try again.');throw e;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export async function googleLogin({credential,nonce,signal,askPassword,askProfile,run,exchange=exchangeGoogle}){
 if(localDemo)throw new Error('Real Google sign-in is disabled in local demo mode. Use the synthetic email/password accounts.');
 return isolatedAccountAction(async session=>{
  const check=()=>assertGoogleActive(signal);
  check();
  let result=await exchange({credential,nonce},signal);check();
  if(result.status==='link-required'){
   const password=await askPassword(result.email);check();
   const {user}=await guardedLogin(()=>signInWithEmailAndPassword(session.auth,result.email,password));check();
   if(!user.emailVerified)throw new Error('Verify your existing account email before linking Google.');
   const proofToken=await user.getIdToken(true);check();
   result=await exchange({credential,nonce,proofToken},signal);check();
  }
  if(result.status!=='authenticated'||typeof result.customToken!=='string'||typeof result.uid!=='string')throw new Error('Google could not be connected safely. Restart sign-in.');
  const {user}=await signInWithCustomToken(session.auth,result.customToken);check();
  if(user.uid!==result.uid||!user.emailVerified)throw new Error('Account identity could not be verified.');
  const profile=await getDocFromServer(doc(session.db,'users',user.uid));check();
  if(!profile.exists()){
   const {form,role}=await askProfile({email:user.email});check();
   await apiRequest('profile',profilePayload(form,role,user),{authClient:session.auth,expectedUid:user.uid});check();
  }
  return run(async()=>{
   check();
   const authorization=await apiRequest('auth/google/authorize',{}, {authClient:session.auth,expectedUid:user.uid});check();
   if(authorization?.uid!==user.uid)throw new Error('Backend account authorization did not match.');
   return validateAndPromote(session,user,check);
  });
 });
}
