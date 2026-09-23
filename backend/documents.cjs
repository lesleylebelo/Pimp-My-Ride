const {FieldValue}=require('firebase-admin/firestore');
const {randomUUID,createHash}=require('node:crypto');
const {validateFile}=require('./files.cjs');
const D=require('./domain.cjs');
function createDocuments({db,storage,actor}) {
 const stamp=()=>FieldValue.serverTimestamp();
 async function listDocuments(request){
  const a=await actor(request);
  if(a.profile.role!=='shop')D.fail('Shop account required.','permission-denied');
  const docs=await Promise.all(D.kinds.map(k=>db.doc(`users/${a.uid}/documents/${k}`).get()));
  return {items:docs.filter(d=>d.exists).map(d=>{const v=d.data();return {id:d.id,name:v.name||'Uploaded document',size:v.size,contentType:v.contentType,uploadedAt:v.uploadedAt?.toMillis?.()||null};})};
 }
 async function checkUpload(request){
  const a=await actor(request);
  if(a.profile.role!=='shop'||a.profile.verificationStatus!=='pending')D.fail('Only a verified pending shop may upload documents.','permission-denied');
  if(!D.kinds.includes(request.kind))D.fail('Invalid document kind.');
  return a;
 }
 async function uploadDocument(request){
  const a=await checkUpload(request),file=validateFile(request.file),kind=request.kind,id=randomUUID();
  const path=`verification/${a.uid}/${kind}/${id}`,attempt=db.doc(`storageUploadAttempts/${id}`);
  const ref=db.doc(`users/${a.uid}`),record=ref.collection('documents').doc(kind);
  // Persist intent before external I/O. Uncertain uploads are retained for investigation.
  await attempt.set({path,uid:a.uid,kind,state:'uploading',createdAt:stamp(),updatedAt:stamp()});
  async function settleFailure(){return db.runTransaction(async tx=>{
   const [current,ledger]=await Promise.all([tx.get(record),tx.get(attempt)]);
   if(current.data()?.path===path)return true;
   if(ledger.data()?.state==='uploading')tx.update(attempt,{state:'cleanupPending',updatedAt:stamp()});
   return false;
  });}
  try {
   await storage.upload(path,file.buffer,file.contentType);
   await db.runTransaction(async tx=>{
    const [p,old,ledger]=await Promise.all([tx.get(ref),tx.get(record),tx.get(attempt)]),previous=old.data();
    if(!D.active(p.data())||p.data().role!=='shop'||p.data().verificationStatus!=='pending')D.fail('Shop access changed during upload.','permission-denied');
    if(ledger.data()?.state!=='uploading')D.fail('Upload attempt was closed. Choose the file again.','failed-precondition');
    let priorAttempt,prior;
    if(previous?.uploadAttemptId){priorAttempt=db.doc(`storageUploadAttempts/${D.id(previous.uploadAttemptId)}`);prior=await tx.get(priorAttempt);}
    tx.set(record,{provider:'supabase',path,uploadAttemptId:id,name:file.name,size:file.buffer.length,contentType:file.contentType,uploadedAt:stamp()});
    tx.update(attempt,{state:'referenced',updatedAt:stamp()});
    if(previous?.provider==='supabase'&&previous.path!==path){
     if(prior?.exists&&prior.data().path===previous.path)tx.update(priorAttempt,{state:'cleanupPending',updatedAt:stamp()});
     else tx.set(db.doc(`storageCleanup/${createHash('sha256').update(previous.path).digest('hex')}`),{path:previous.path,createdAt:stamp()});
    }
    tx.create(db.collection('auditLogs').doc(),{actor:a.uid,action:'document.recorded',target:a.uid,details:{kind},createdAt:stamp()});
   });
  }catch(error){
   let referenced;
   try{referenced=await settleFailure();}catch{
    // Even the settlement acknowledgement can be lost. A read may confirm the
    // referenced file, but failure to read never authorizes deletion.
    try{referenced=(await record.get()).data()?.path===path;}catch{}
    if(!referenced)D.fail('Upload result could not be confirmed. Refresh before retrying.','unavailable');
   }
   if(!referenced)throw error;
  }
  return {ok:true,kind};
 }
 return {listDocuments,checkUpload,uploadDocument};
}
module.exports={createDocuments};
