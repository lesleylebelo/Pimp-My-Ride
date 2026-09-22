const {setTimeout:delay}=require('node:timers/promises');

const PROPOSED_GRACE_MS=24*60*60*1000;
const SOURCES={cleanup:'storageCleanup',attempts:'storageUploadAttempts'};
const PATH=/^verification\/([A-Za-z0-9_-]{1,128})\/(cipcCert|proofOfAddress|ownerId)\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const CODES={4:'deadline-exceeded',8:'resource-exhausted',10:'aborted',13:'internal',14:'unavailable'};
const TRANSIENT=new Set(Object.values(CODES));
const SAFE_CODES=new Set([...TRANSIENT,'permission-denied','failed-precondition','not-found','unauthenticated']);
function errorCode(error){const code=CODES[error?.code]||String(error?.code||'').replace(/^firestore\//,'');return SAFE_CODES.has(code)?code:'read-failed';}
function milliseconds(value){
 try{const n=typeof value?.toMillis==='function'?value.toMillis():value instanceof Date?value.getTime():value;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;}catch{return null;}
}

// This module deliberately has no storage client or write calls. A report is
// evidence for an operator, never a deletion authorization or a durable claim.
function createCleanup({db,now=Date.now,sleep=delay}){
 async function read(action){
  for(let attempt=0;;attempt++)try{return await action();}catch(error){
   if(attempt>=2||!TRANSIENT.has(errorCode(error)))throw error;
   await sleep(100*2**attempt);
  }
 }
 async function examine(task,source,at){
  const data=task.data(),path=data?.path,match=typeof path==='string'&&PATH.exec(path);
  const keep=(reason,extra={})=>({id:ID.test(task.id)?task.id:'invalid-task-id',decision:'preserve',reason,...extra});
  if(!ID.test(task.id))return keep('invalid-task-id');
  if(!match)return keep('invalid-path');
  if(source==='attempts'&&(data.uid!==match[1]||data.kind!==match[2]))return keep('attempt-identity-mismatch');
  if(source==='attempts'&&data.state!=='cleanupPending')return keep(data.state==='uploading'?'upload-outcome-unresolved':'attempt-not-cleanup-pending');
  const created=milliseconds(data.createdAt),updated=data.updatedAt==null?created:milliseconds(data.updatedAt);
  if(created===null||updated===null||created>at||updated>at)return keep('unknown-age');
  if(at-Math.max(created,updated)<PROPOSED_GRACE_MS)return keep('within-proposed-grace');
  try{
   const current=await read(()=>db.doc(`users/${match[1]}/documents/${match[2]}`).get());
   if(current.data()?.path===path)return keep('referenced');
   // Check every document metadata record too, so an unexpected reference is
   // retained. Missing collection-group index/permissions are unknown, not safe.
   const references=await read(()=>db.collectionGroup('documents').where('path','==',path).limit(1).get());
   if(references.docs.length)return keep('referenced');
   const attempts=await read(()=>db.collection('storageUploadAttempts').where('path','==',path).limit(2).get());
   if(attempts.docs.length>1)return keep('ambiguous-upload-attempts');
   if(source==='attempts'&&(attempts.docs.length!==1||attempts.docs[0].id!==task.id))return keep('attempt-changed');
   if(attempts.docs.some(s=>s.data()?.state!=='cleanupPending'))return keep('upload-outcome-unresolved');
   // Recheck current ledger age/state. Even dry-run observations can race a
   // newer replacement. Unknown or newly transitioned records stay retained.
   for(const attempt of attempts.docs){
    const a=attempt.data(),m=PATH.exec(a.path||''),birth=milliseconds(a.createdAt),changed=a.updatedAt==null?birth:milliseconds(a.updatedAt);
    if(!m||a.uid!==m[1]||a.kind!==m[2])return keep('attempt-identity-mismatch');
    if(birth===null||changed===null||birth>at||changed>at)return keep('unknown-age');
    if(at-Math.max(birth,changed)<PROPOSED_GRACE_MS)return keep('within-proposed-grace');
   }
   return {id:task.id,decision:'candidate',reason:'unreferenced-under-proposed-policy'};
  }catch(error){return keep('reference-check-failed',{errorCode:errorCode(error)});}
 }
 async function report({source='cleanup',limit=100,cursor=null,apply=false}={}){
  if(apply!==false)throw Error('Deletion is not implemented. Retention policy approval is required.');
  if(!Object.hasOwn(SOURCES,source)||!Number.isInteger(limit)||limit<1||limit>500||(cursor!==null&&!ID.test(cursor)))throw Error('Invalid report source, limit, or cursor.');
  const at=now();if(!Number.isFinite(at))throw Error('Invalid report time.');
  let query=db.collection(SOURCES[source]).orderBy('__name__');if(cursor)query=query.startAfter(cursor);
  const snapshot=await read(()=>query.limit(limit+1).get()),page=snapshot.docs.slice(0,limit),items=[];
  for(const task of page)items.push(await examine(task,source,at));
  const counts={examined:items.length,candidates:0,preserved:0,failedChecks:0};
  for(const item of items){counts[item.decision==='candidate'?'candidates':'preserved']++;if(item.reason==='reference-check-failed')counts.failedChecks++;}
  const more=snapshot.docs.length>limit,last=page.at(-1)?.id;
  return {mode:'dry-run',source,policy:'proposed-unapproved',graceHours:24,counts,items,nextCursor:more&&ID.test(last)?last:null,...(more&&!ID.test(last)?{paginationBlocked:true}:{})};
 }
 return {report};
}
module.exports={createCleanup,errorCode,PROPOSED_GRACE_MS};
