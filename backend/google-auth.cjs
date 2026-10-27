const {createHash,randomUUID}=require('node:crypto');
const {OAuth2Client}=require('google-auth-library');
const {ApiError}=require('./errors.cjs');
const fail=(code,message)=>{throw new ApiError(code,message);};
const googleProvider=user=>user.providerData?.find(p=>p.providerId==='google.com');
const passwordProvider=user=>user.providerData?.some(p=>p.providerId==='password');

// Never exchange an unlinked Google credential through signInWithIdp: Firebase
// may implicitly link by email. Add the provider only after ownership is proved.
function createGoogleAuth({auth,db,clientId=process.env.GOOGLE_WEB_CLIENT_ID,verifyGoogle,googleClient=new OAuth2Client(),now=Date.now}){
 const client=googleClient;
 const verify=verifyGoogle|| (async credential=>(await client.verifyIdToken({idToken:credential,audience:clientId})).getPayload());
 const lookup=async fn=>{try{return await fn();}catch(e){if(e.code==='auth/user-not-found')return null;throw e;}};
 async function eligible(user){
  if(user.disabled||!user.emailVerified)fail('permission-denied','Verify your email using email/password sign-in before connecting Google, or contact support.');
  const profile=(await db.doc(`users/${user.uid}`).get()).data();
  if(profile?.role==='admin'||user.customClaims?.admin===true)fail('permission-denied','Administrators must continue using email/password sign-in.');
  if(profile&&((profile.accountStatus&&profile.accountStatus!=='active')||profile.statusOperation||profile.provisioningOperation))fail('permission-denied','Account access is restricted. Contact support.');
 }
 return async function exchange(input){
  if(!clientId)fail('unavailable','Google sign-in is not configured on the server. Use email/password.');
  if(!input||Object.keys(input).some(k=>!['credential','nonce','proofToken'].includes(k))||typeof input.credential!=='string'||input.credential.length>16000||!/^[-_a-zA-Z0-9]{32,128}$/.test(input.nonce||''))fail('invalid-argument','Start Google sign-in again.');
  let identity;
  try{identity=await verify(input.credential);}catch{fail('unauthenticated','Google authentication expired or could not be verified. Try again.');}
  const seconds=now()/1000;
  if(!identity||!['accounts.google.com','https://accounts.google.com'].includes(identity.iss)||identity.aud!==clientId||identity.email_verified!==true||typeof identity.email!=='string'||!identity.email||typeof identity.sub!=='string'||!identity.sub||identity.nonce!==input.nonce||!Number.isFinite(identity.iat)||!Number.isFinite(identity.exp)||identity.iat>seconds+60||seconds-identity.iat>600||identity.exp<=seconds)fail('unauthenticated','Google authentication expired or could not be verified. Try again.');
  let user=await lookup(()=>auth.getUserByProviderUid('google.com',identity.sub));
  if(!user){
   user=await lookup(()=>auth.getUserByEmail(identity.email));
   // Durable, server-only reservation permits recovery from interrupted account
   // creation without adopting users by email or deleting incomplete accounts.
   const ref=db.doc(`googleAuthIdentities/${createHash('sha256').update(identity.sub).digest('hex')}`);
   const reservation=await db.runTransaction(async tx=>{
    const saved=await tx.get(ref);
    if(saved.exists)return saved.data();
    if(user)return null;
    const value={uid:randomUUID(),email:identity.email};tx.create(ref,value);return value;
   });
   if(user&&user.uid!==reservation?.uid){
    await eligible(user);
    if(googleProvider(user))fail('already-exists','This account is connected to another Google identity. Use email/password or contact support.');
    if(!passwordProvider(user))fail('already-exists','This email belongs to an existing account. Sign in with its original method or contact support.');
    if(!input.proofToken)return {status:'link-required',email:identity.email};
    let proof;
    try{proof=await auth.verifyIdToken(input.proofToken,true);}catch{fail('unauthenticated','Confirm your existing account password again.');}
    if(proof.uid!==user.uid||proof.firebase?.sign_in_provider!=='password'||proof.email_verified!==true||!Number.isFinite(proof.auth_time)||seconds-proof.auth_time>300||proof.auth_time>seconds+60)fail('permission-denied','A recent password sign-in to this existing account is required.');
    user=await auth.getUser(user.uid);await eligible(user);
    if(googleProvider(user))fail('already-exists','Account providers changed. Restart Google sign-in.');
   }else{
    if(!reservation)fail('already-exists','Account changed. Restart Google sign-in.');
    user=await lookup(()=>auth.getUser(reservation.uid));
    if(!user){
     try{user=await auth.createUser({uid:reservation.uid,email:identity.email,emailVerified:true});}
     catch(e){
      if(['auth/email-already-exists','auth/uid-already-exists'].includes(e.code))fail('already-exists','Account creation changed. Restart Google sign-in to continue safely.');
      throw e;
     }
    }
    if(user.email?.toLowerCase()!==reservation.email.toLowerCase()||passwordProvider(user)||(googleProvider(user)&&googleProvider(user).uid!==identity.sub))fail('already-exists','Account changed. Contact support before continuing.');
    await eligible(user);
   }
   // Reserve the provider slot across server instances. Concurrent attempts with
   // different Google subjects must never replace an already-proved identity.
   await db.runTransaction(async tx=>{
    const link=db.doc(`googleAuthProviderLinks/${user.uid}`),saved=await tx.get(link);
    if(saved.exists&&saved.data().subject!==identity.sub)fail('already-exists','Another Google connection is in progress or already reserved. Contact support.');
    if(!saved.exists)tx.create(link,{subject:identity.sub});
   });
   // This update deliberately omits password, email, claims and profile fields.
   try{user=await auth.updateUser(user.uid,{providerToLink:{providerId:'google.com',uid:identity.sub,email:identity.email}});}
   catch(e){if(['auth/uid-already-exists','auth/email-already-exists','auth/credential-already-in-use'].includes(e.code))fail('already-exists','Google is already connected to another account. Contact support.');throw e;}
  }
  await eligible(user);
  if(googleProvider(user)?.uid!==identity.sub)fail('permission-denied','Google identity could not be connected safely.');
  return {status:'authenticated',customToken:await auth.createCustomToken(user.uid),uid:user.uid};
 };
}
module.exports={createGoogleAuth};
