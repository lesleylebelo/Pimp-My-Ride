const {randomUUID}=require('node:crypto');
const {FieldValue,Timestamp}=require('firebase-admin/firestore');
const {ApiError}=require('./errors.cjs');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),P=require('./photo-domain.cjs');
const {mutation}=require('./mutations.cjs');
const LEASE_MS=120000,stamp=()=>FieldValue.serverTimestamp();
const revision=p=>p.profilePhotoRevision||0;
function eligible(p){return ['owner','shop'].includes(p?.role)&&D.active(p)&&!p.statusOperation&&!p.reviewOperation&&!p.provisioningOperation;}
function closed(){const e=new ApiError('failed-precondition','The photo attempt is closed. Refresh and select the photo again.');e.retryWithNewRequest=true;return e;}

function createProfilePhotos({db,auth,actor,storage,messaging}){
 const refFor=id=>db.doc(`profilePhotoUploads/${id}`);
 const check=(record,uid,id)=>{
  if(!record||record.uid!==uid||record.assetId!==id||record.path!==`profiles/${uid}/${id}`||record.provider!=='supabase'||record.bucket!==storage.bucket)D.fail('Profile photo is unavailable.','not-found');
 };
 async function current(request,tx){
  const a=await actor(request),p=(await (tx?tx.get(db.doc(`users/${a.uid}`)):db.doc(`users/${a.uid}`).get())).data();
  if(!eligible(p))D.fail('Profile photo access is unavailable.','permission-denied');
  const user=await auth.getUser(a.uid);
  if(!user.emailVerified||user.disabled)D.fail('Verify your account before managing photos.','permission-denied');
  return {...a,profile:p};
 }
 const status=p=>({version:revision(p),photoId:p.profilePhoto?.id||null});
 async function target(request,input){
  const a=await current(request);
  if(input.context==='self')return {a,uid:a.uid,p:a.profile};
  if(!P.eligible(a.profile,a.profile.role))D.fail('Marketplace photo access is unavailable.','permission-denied');
  let uid;
  if(input.context==='conversation')uid=await messaging.authorizeAvatar(request,D.id(input.id));
  else if(input.context==='shop')uid=D.id(input.id);
  else if(input.context==='post'){
   const post=(await db.doc(`posts/${D.id(input.id)}`).get()).data();
   if(post?.status!=='published')D.fail('Post unavailable.','not-found');
   uid=D.id(post.shopId||post.authorId);
  }else D.fail('Choose an authorised profile photo context.');
  const p=(await db.doc(`users/${uid}`).get()).data(),user=await auth.getUser(uid);
  if(!P.eligible(p,p?.role)||!user.emailVerified||user.disabled||(input.context==='shop'&&p.role!=='shop'))D.fail('Profile photo unavailable.','not-found');
  return {a,uid,p};
 }
 async function profilePhotos(request){
  const input=request.data||{},op=input.op;
  if(op==='status'){M.fields(input,['op']);return status((await current(request)).profile);}
  if(op==='view'){
   M.fields(input,['op','context','id']);
   if(input.context==='self'&&input.id!==undefined)D.fail('Your own photo does not take an account identifier.');
   const original=await target(request,input),id=original.p.profilePhoto?.id;
   if(!id)return {...status(original.p),url:null,expiresAt:null};
   const record=(await refFor(D.id(id)).get()).data();check(record,original.uid,record?.assetId);
   if(record.state!=='referenced')D.fail('Profile photo changed. Refresh it.','not-found');
   const latest=await target(request,input);
   if(latest.uid!==original.uid||latest.p.profilePhoto?.id!==id)D.fail('Profile photo changed. Refresh it.','not-found');
   const issuedAt=Date.now(),url=await storage.signedUrl(record.path,60);
   return {...status(latest.p),url,expiresAt:issuedAt+60000};
  }
  if(op==='remove'){
   M.fields(input,['op','version','requestId']);D.id(input.requestId);P.version(input.version);
   const a=await current(request),receipt=mutation(db,a.uid,'profile-photo:remove',input);
   return receipt.atomic(async tx=>{
    const fresh=await current(request,tx),p=fresh.profile;
    if(revision(p)!==input.version)D.fail('Profile photo changed. Refresh before removing.','failed-precondition');
    const old=p.profilePhoto?.id,ledger=old?refFor(D.id(old)):null,record=ledger?(await tx.get(ledger)).data():null;
    if(old)check(record,a.uid,record?.assetId);
    tx.update(db.doc(`users/${a.uid}`),{profilePhoto:FieldValue.delete(),profilePhotoRevision:revision(p)+1,updatedAt:stamp()});
    if(ledger)tx.update(ledger,{state:'cleanupPending',reason:'removed',updatedAt:stamp()});
    tx.create(db.collection('auditLogs').doc(),{actor:a.uid,action:'profilePhoto.removed',target:a.uid,createdAt:stamp()});
    return {ok:true,version:revision(p)+1,photoId:null};
   });
  }
  D.fail('Unknown profile photo operation.');
 }
 async function checkProfilePhotoUpload(request){
  P.version(request.version);D.id(request.requestId);
  if(typeof storage?.bucket!=='string'||!storage.bucket)D.fail('Private profile storage is not configured.','unavailable');
  return current(request);
 }
 async function uploadProfilePhoto(request){
  const a=await checkProfilePhotoUpload(request),file=P.validatePhoto(request.file),version=request.version;
  const fingerprint=P.hash(JSON.stringify({version,name:file.name,type:file.contentType,hash:file.contentHash}));
  const attempt=refFor(P.hash(`${a.uid}\n${request.requestId}`)),workerToken=randomUUID(),assetId=randomUUID();
  const matches=record=>{if(record&&(record.uid!==a.uid||record.fingerprint!==fingerprint))D.fail('This retry identifier belongs to a different photo.','already-exists');};
  const done=record=>record?.result&&['referenced','cleanupPending'].includes(record.state);
  let owned;
  try{
   owned=await db.runTransaction(async tx=>{
    const fresh=await current(request,tx),saved=(await tx.get(attempt)).data();matches(saved);
    if(done(saved))return {result:saved.result};
    if(saved){
     if(saved.state==='cleanupPending')return {closed:true};
     if(saved.createdAt?.toMillis?.()<=Date.now()-LEASE_MS){tx.update(attempt,{state:'cleanupPending',reason:'expired',updatedAt:stamp()});return {closed:true};}
     D.fail('Upload pending. Refresh and retry the same selected photo.','unavailable');
    }
    const record={uid:a.uid,assetId,path:`profiles/${a.uid}/${assetId}`,bucket:storage.bucket,provider:'supabase',fingerprint,workerToken,state:'uploading',createdAt:stamp(),updatedAt:stamp()};
    if(revision(fresh.profile)!==version){tx.create(attempt,{...record,state:'cleanupPending',reason:'stale-version'});return {closed:true};}
    tx.create(attempt,record);return {record};
   });
  }catch(error){
   if(error instanceof ApiError)throw error;
   try{const saved=(await attempt.get()).data();matches(saved);if(done(saved))owned={result:saved.result};else if(saved?.workerToken===workerToken&&saved.state==='uploading')owned={record:saved};else if(saved?.state==='cleanupPending')owned={closed:true};}catch{}
   if(!owned)D.fail('Unable to confirm the upload reservation. Retry the same photo.','unavailable');
  }
  if(owned.result)return owned.result;if(owned.closed)throw closed();
  const record=owned.record;
  try{
   await storage.upload(record.path,file.buffer,file.contentType);
   const inspected=await storage.inspect(record.path);
   if(inspected.size!==file.size||inspected.contentType!==file.contentType)D.fail('Stored photo verification failed.','failed-precondition');
   return await db.runTransaction(async tx=>{
    const fresh=await current(request,tx),saved=(await tx.get(attempt)).data();matches(saved);
    if(done(saved))return saved.result;
    if(saved?.state!=='uploading'||saved.workerToken!==workerToken||!(saved.createdAt instanceof Timestamp)||saved.createdAt.toMillis()<=Date.now()-LEASE_MS)D.fail('Upload lease expired.','failed-precondition');
    if(revision(fresh.profile)!==version)D.fail('Profile photo changed. Refresh before saving.','failed-precondition');
    const old=fresh.profile.profilePhoto?.id,oldRef=old?refFor(D.id(old)):null,prior=oldRef?(await tx.get(oldRef)).data():null;
    if(old)check(prior,a.uid,prior?.assetId);
    const result={ok:true,photoId:attempt.id,version:version+1};
    tx.update(db.doc(`users/${a.uid}`),{profilePhoto:{id:attempt.id},profilePhotoRevision:version+1,updatedAt:stamp()});
    tx.update(attempt,{state:'referenced',result,name:file.name,size:file.size,contentType:file.contentType,updatedAt:stamp()});
    if(oldRef)tx.update(oldRef,{state:'cleanupPending',reason:'replaced',updatedAt:stamp()});
    tx.create(db.collection('auditLogs').doc(),{actor:a.uid,action:'profilePhoto.saved',target:a.uid,createdAt:stamp()});
    return result;
   });
  }catch(error){
   // A lost commit response must replay success, never close a published asset.
   let settled;
   try{settled=await db.runTransaction(async tx=>{
    const saved=(await tx.get(attempt)).data();matches(saved);
    if(done(saved))return {result:saved.result};
    if(saved?.state==='uploading'&&saved.workerToken===workerToken){tx.update(attempt,{state:'cleanupPending',reason:'failed',updatedAt:stamp()});return {closed:true};}
    return saved?.state==='cleanupPending'?{closed:true}:null;
   });}catch{
    try{const saved=(await attempt.get()).data();matches(saved);if(done(saved))settled={result:saved.result};else if(saved?.state==='cleanupPending')settled={closed:true};}catch{}
   }
   if(settled?.result)return settled.result;if(settled?.closed)throw closed();
   D.fail('Upload outcome unknown. Refresh and retry the same photo.','unavailable');
  }
 }
 return {profilePhotos,checkProfilePhotoUpload,uploadProfilePhoto};
}
module.exports={createProfilePhotos,LEASE_MS};
