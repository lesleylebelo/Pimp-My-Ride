let loading;
export function googleNonce(){
 if(!globalThis.crypto?.getRandomValues)throw new Error('Google sign-in requires a secure browser connection.');
 return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function loadGoogleIdentity(){
 if(globalThis.google?.accounts?.id)return Promise.resolve(globalThis.google.accounts.id);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(()=>{script.remove();reject(new Error('Google sign-in could not load. Check your connection and try again.'));},20000);
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{clearTimeout(timer);if(globalThis.google?.accounts?.id)resolve(globalThis.google.accounts.id);else reject(new Error('Google sign-in is unavailable.'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Google sign-in could not load. Check browser privacy settings or use email/password.'));};
  document.head.appendChild(script);
 }).catch(error=>{loading=null;throw error;});
 return loading;
}
