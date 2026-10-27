import {cancelled,assertGoogleActive,exchangeGoogle} from './googleAccounts';

let picking=false;
const failure=(code,message)=>Object.assign(new Error(message),{code});
function nativeSdk(){
 // Load only after a tap: Expo Go/older APKs keep working with email/password.
 try{return require('react-native-nitro-google-signin').GoogleOneTapSignIn;}
 catch{throw failure('auth/google-native-unavailable','Google sign-in needs a new Android development or preview build. It is unavailable in Expo Go and older APKs.');}
}
function nativeError(error){
 if(error?.code==='SIGN_IN_CANCELLED')return cancelled();
 const messages={
  PLAY_SERVICES_NOT_AVAILABLE:'Google Play Services is missing or outdated. Update it or use email/password.',
  DEVELOPER_ERROR:'Google sign-in configuration does not match this Android build. Check its package, signing SHA-1 and Web client ID.',
  IN_PROGRESS:'Another Google account selection is in progress. Close it before trying again.',
  NETWORK_ERROR:'Google could not connect. Check your internet connection and try again.',
  NO_SAVED_CREDENTIAL_FOUND:'No Google account was available. Add an account on the device or use email/password.',
 };
 return failure('auth/google-native-error',messages[error?.code]||'Google account selection could not complete. Check your connection and Android OAuth configuration, or use email/password.');
}

export async function acquireAndroidGoogle(signal){
 assertGoogleActive(signal);
 if(picking)throw failure('auth/google-native-error','Another Google account selection is in progress.');
 const webClientId=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
 if(!webClientId)throw failure('auth/google-native-error','Google sign-in is not configured. Set the existing Web client ID for this Android build.');
 picking=true;
 let sdk,successful=false;
 try{
  sdk=nativeSdk();
  const Crypto=require('expo-crypto');
  const bytes=await Crypto.getRandomBytesAsync(32);assertGoogleActive(signal);
  const raw=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  // Nitro sends this exact digest to Google's setNonce(). The backend compares
  // it with the signed JWT claim, just as with web GIS; it must never decode and
  // trust a client-supplied claim instead of verifying Google's signature.
  const nonce=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,raw);assertGoogleActive(signal);
  sdk.configure({webClientId,nonce,offlineAccess:false,autoSelectOnSignIn:false});
  await sdk.checkPlayServices();assertGoogleActive(signal);
  const response=await sdk.presentExplicitSignIn();assertGoogleActive(signal);
  if(response?.type==='cancelled')throw cancelled();
  if(response?.type==='noSavedCredentialFound')throw {code:'NO_SAVED_CREDENTIAL_FOUND'};
  if(response?.type!=='success'||typeof response.data?.idToken!=='string'||!response.data.idToken)throw new Error('Missing Google ID token');
  successful=true;
  return {credential:response.data.idToken,nonce};
 }catch(error){
  if(signal?.aborted)throw cancelled();
  if(typeof error?.code==='string'&&error.code.startsWith('auth/google-'))throw error;
  throw nativeError(error);
 }finally{
  try{
   // Firebase is the sole app session. Clear Google's local selected-account
   // cache after every attempt; do not revoke the person's OAuth consent.
   if(sdk)try{await sdk.signOut();}catch{
    if(successful)throw failure('auth/google-native-error','Google account cleanup failed. Retry sign-in or use email/password.');
   }
   if(successful)assertGoogleActive(signal);
  }finally{picking=false;}
 }
}

export const exchangeAndroidGoogle=(data,signal)=>exchangeGoogle(data,signal,{android:true});
