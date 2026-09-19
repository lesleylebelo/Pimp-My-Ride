const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue,Timestamp,FieldPath}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreatedWithAuthContext,onDocumentWrittenWithAuthContext}=require('firebase-functions/v2/firestore');
const {createHash}=require('node:crypto');
const D=require('./domain.cjs');
initializeApp();
const db=getFirestore(),auth=getAuth();
const options={region:'us-central1',maxInstances:10,timeoutSeconds:30};
const stamp=()=>FieldValue.serverTimestamp();
const audit=(actor,action,target,details={})=>({actor,action,target,details,createdAt:stamp()});
async function actor(request,admin=false){
 if(!request.auth)D.fail('Sign in to continue.','unauthenticated');
 const uid=request.auth.uid;
 const [profile,user]=await Promise.all([db.doc(`users/${uid}`).get(),auth.getUser(uid)]);
 const p=profile.data();
 if(!['owner','shop','admin'].includes(p?.role)||!user.emailVerified||!request.auth.token.email_verified||user.disabled||!D.active(p))D.fail('Account access is unavailable.','permission-denied');
 // Compare whole seconds because Firebase auth_time has second precision.
 if(!Number.isFinite(Number(request.auth.token.auth_time))||Number(request.auth.token.auth_time)<Math.floor(Math.max(Date.parse(user.tokensValidAfterTime)||0,Date.parse(user.metadata.creationTime)||0)/1000))D.fail('Sign in again.','unauthenticated');
 if(admin&&(request.auth.token.admin!==true||user.customClaims?.admin!==true||p.role!=='admin'))D.fail('Administrator access required.','permission-denied');
 return {uid,profile:p};
}
function recent(request){if(Date.now()/1000-Number(request.auth.token.auth_time)>900)D.fail('Confirm your password, then retry this action.','failed-precondition');}
function serialize(value){if(value instanceof Timestamp)return value.toMillis();if(Array.isArray(value))return value.map(serialize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,serialize(v)]));return value;}
function rows(snapshot){return snapshot.docs.map(d=>({id:d.id,...serialize(d.data())}));}
async function recorded(actorId,action,target,change){
 await db.runTransaction(async tx=>{await change(tx);tx.create(db.collection('auditLogs').doc(),audit(actorId,action,target));});
}
exports.adminApi=onCall(options,async request=>{
 const a=await actor(request,true),input=request.data||{},op=input.op;
 if(op==='dashboard'){
  const counts=await Promise.all([db.collection('users'),db.collection('users').where('role','==','shop').where('verificationStatus','==','pending'),db.collection('users').where('accountStatus','==','suspended'),db.collection('serviceCategories').where('archived','==',false)].map(q=>q.count().get()));
  return {accounts:counts[0].data().count,pending:counts[1].data().count,suspended:counts[2].data().count,categories:counts[3].data().count};
 }
 if(op==='accounts'){
  let q=db.collection('users');
  if(input.filter==='pending')q=q.where('role','==','shop').where('verificationStatus','==','pending');
  else if(['owner','shop','admin'].includes(input.filter))q=q.where('role','==',input.filter);
  else if(['suspended','archived'].includes(input.filter))q=q.where('accountStatus','==',input.filter);
  q=q.orderBy(FieldPath.documentId());if(input.cursor)q=q.startAfter(D.id(input.cursor));
  const snap=await q.limit(31).get(),items=rows(snap);
  return {items:items.slice(0,30),cursor:items.length>30?items[29].id:null};
 }
 if(op==='account'){
  const uid=D.id(input.uid),snapshot=await db.doc(`users/${uid}`).get();if(!snapshot.exists)D.fail('Account not found.','not-found');
  const u=await auth.getUser(uid);
  const docs=await db.collection(`users/${uid}/documents`).get();
  return {id:uid,...serialize(snapshot.data()),emailVerified:u.emailVerified,disabled:u.disabled,lastSignIn:u.metadata.lastSignInTime||null,documents:rows(docs)};
 }
 if(op==='audit'){
  let q=db.collection('auditLogs').orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
  if(input.cursor){const c=await db.doc(`auditLogs/${D.id(input.cursor)}`).get();if(c.exists)q=q.startAfter(c);}
  const items=rows(await q.limit(31).get());return {items:items.slice(0,30),cursor:items.length>30?items[29].id:null};
 }
 if(op==='presence'){
  const items=rows(await db.collection('presence').orderBy('lastSeen','desc').limit(100).get());
  return {items,serverNow:Date.now()};
 }
 if(op==='categories')return {items:rows(await db.collection('serviceCategories').orderBy('name').limit(200).get())};
 recent(request);
 if(op==='categorySave'||op==='categoryArchive'){
  const ref=input.id?db.doc(`serviceCategories/${D.id(input.id)}`):db.collection('serviceCategories').doc();
  const changes=op==='categorySave'?D.category(input):{archived:input.archived===true};
  await recorded(a.uid,op,ref.id,async tx=>{
   const before=await tx.get(ref);if(op==='categoryArchive'&&!before.exists)D.fail('Category not found.','not-found');
   tx.set(ref,{...(!before.exists?{createdAt:stamp(),archived:false}:{}),...changes,updatedAt:stamp()}, {merge:true});
  });return {id:ref.id};
 }
 const uid=D.id(input.uid),ref=db.doc(`users/${uid}`),before=await ref.get();
 if(!before.exists)D.fail('Account not found.','not-found');
 const p=before.data();
 if(op==='document'){
  if(!D.kinds.includes(input.kind)||p.role!=='shop')D.fail('Invalid document.');
  const file=getStorage().bucket().file(`verification/${uid}/${input.kind}`);
  const [exists]=await file.exists();if(!exists)D.fail('Document has not been uploaded.','not-found');
  const [url]=await file.getSignedUrl({action:'read',expires:Date.now()+60000,version:'v4'});
  await db.collection('auditLogs').add(audit(a.uid,'document.view',uid,{kind:input.kind}));
  return {url};
 }
 D.protect(a.uid,uid,p);
 if(op==='editAccount'){
  const changes=D.editable(input);if(p.role==='shop')changes.shop=D.shop(input.shop);
  await db.runTransaction(async tx=>{const current=await tx.get(ref);D.protect(a.uid,uid,current.data());
   tx.update(ref,{...changes,updatedAt:stamp()});tx.create(db.collection('auditLogs').doc(),audit(a.uid,op,uid,{fields:Object.keys(changes)}));});
  return {ok:true};
 }
 if(op==='review'){
  if(p.role!=='shop'||!D.active(p))D.fail('Only active shop accounts can be reviewed.');
  if(!['pending','approved','rejected'].includes(input.status))D.fail('Invalid review outcome.');
  const reason=D.text(input.reason,'Review reason',500);
  const reviewId=db.collection('adminOperations').doc().id;
  // Freeze uploads while examining Storage so approval cannot race with replacements.
  await db.runTransaction(async tx=>{
   const current=await tx.get(ref),value=current.data();
   if(!D.active(value)||value.role!=='shop'||value.reviewOperation||value.statusOperation)D.fail('Account changed or another operation is in progress. Reload it.');
   tx.update(ref,{verificationStatus:'reviewing',reviewOperation:reviewId});
   tx.create(db.collection('auditLogs').doc(),audit(a.uid,'shop.reviewStarted',uid,{reviewId}));
  });
  try{
   if(input.status==='approved'){
    const u=await auth.getUser(uid);if(!u.emailVerified)D.fail('Shop email must be verified first.');
    for(const kind of D.kinds){
     const file=getStorage().bucket().file(`verification/${uid}/${kind}`);
     const [exists]=await file.exists();if(!exists)D.fail(`Missing ${kind}.`);
     const [metadata]=await file.getMetadata();if(!D.validObject(metadata))D.fail(`Invalid ${kind}.`);
    }
   }
   await db.runTransaction(async tx=>{
    const current=await tx.get(ref);if(!D.active(current.data())||current.data().reviewOperation!==reviewId)D.fail('Account changed. Reload it.');
    const docs=await Promise.all(D.kinds.map(k=>tx.get(ref.collection('documents').doc(k))));
    if(input.status==='approved'&&docs.some(d=>!d.exists||!D.validObject(d.data())))D.fail('All valid document records are required.');
    tx.update(ref,{verificationStatus:input.status,reviewOperation:FieldValue.delete(),reviewReason:reason,reviewedBy:a.uid,reviewedAt:stamp()});
    tx.create(db.collection('auditLogs').doc(),audit(a.uid,`shop.${input.status}`,uid,{reason,reviewId}));
   });
  }catch(e){
   await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.reviewOperation===reviewId){
    tx.update(ref,{verificationStatus:p.verificationStatus,reviewOperation:FieldValue.delete()});
    tx.create(db.collection('auditLogs').doc(),audit(a.uid,'shop.reviewFailed',uid,{reviewId}));
   }});throw e;
  }
  return {ok:true};
 }
 if(op==='status'){
  if(!['active','suspended','archived'].includes(input.status))D.fail('Invalid account status.');
  const reason=D.text(input.reason,'Reason',500),operation=db.collection('adminOperations').doc();
  // A per-account transaction lock prevents overlapping Auth/Firestore changes.
  await db.runTransaction(async tx=>{
   const current=await tx.get(ref);D.protect(a.uid,uid,current.data());
   if(current.data().statusOperation||current.data().reviewOperation)D.fail('An account operation needs completion. Contact the operator.','failed-precondition');
   tx.update(ref,{accountStatus:'suspended',statusOperation:operation.id});
   tx.create(operation,{actor:a.uid,target:uid,status:'pending',requested:input.status,createdAt:stamp()});
   tx.create(db.collection('auditLogs').doc(),audit(a.uid,'account.statusRequested',uid,{status:input.status,reason,operation:operation.id}));
  });
  try{
   await auth.updateUser(uid,{disabled:input.status!=='active'});await auth.revokeRefreshTokens(uid);
   await db.runTransaction(async tx=>{
    tx.update(ref,{accountStatus:input.status,statusReason:reason,statusOperation:FieldValue.delete(),updatedAt:stamp()});
    tx.update(operation,{status:'completed',completedAt:stamp()});
    tx.create(db.collection('auditLogs').doc(),audit(a.uid,`account.${input.status}`,uid,{reason,operation:operation.id}));
   });
  }catch(e){
   await operation.update({status:'failed',errorCode:String(e.code||'unknown'),completedAt:stamp()});
   await db.collection('auditLogs').add(audit(a.uid,'account.statusFailed',uid,{operation:operation.id}));
   throw new HttpsError('internal','Account remains restricted. An operator must reconcile the failed operation before retrying.');
  }
  return {ok:true};
 }
 D.fail('Unknown operation.');
});
exports.sessionEvent=onCall(options,async request=>{
 const a=await actor(request),input=request.data||{},session=D.id(input.session);
 if(!['heartbeat','offline'].includes(input.state))D.fail('Invalid session event.');
 const ref=db.doc(`presence/${a.uid}`),sessionRef=ref.collection('sessions').doc(session),now=Date.now();
 await db.runTransaction(async tx=>{
  const previous=await tx.get(sessionRef),aggregate=await tx.get(ref);
  const old=previous.data(),sessions={...(aggregate.data()?.sessions||{})};
  for(const [key,deadline] of Object.entries(sessions))if(deadline<=now)delete sessions[key];
  if(input.state==='heartbeat')sessions[session]=now+90000;else delete sessions[session];
  // Bound profile size for a user who opens many concurrent clients.
  const live=Object.fromEntries(Object.entries(sessions).sort((a,b)=>b[1]-a[1]).slice(0,20));
  if(input.state==='heartbeat'&&old?.state==='heartbeat'&&now-old.lastSeen.toMillis()<20000)return;
  tx.set(sessionRef,{state:input.state,lastSeen:stamp(),expiresAt:Timestamp.fromMillis(now+86400000)});
  tx.set(ref,{uid:a.uid,role:a.profile.role,fullName:a.profile.fullName,lastSeen:stamp(),sessions:live});
  const beginning=input.state==='heartbeat'&&(!old||old.state!=='heartbeat'||now-old.lastSeen.toMillis()>90000);
  const ending=input.state==='offline'&&old?.state==='heartbeat';
  if(beginning||ending)tx.create(db.collection('auditLogs').doc(),audit(a.uid,beginning?'session.active':'session.inactive',a.uid));
 });return {ok:true};
});
exports.profileCreated=onDocumentCreatedWithAuthContext({...options,document:'users/{uid}'},async event=>{
 if(!event.data)return;const id=createHash('sha256').update(event.id).digest('hex');
 await db.doc(`auditLogs/${id}`).set({...audit(event.authId||'system','profile.created',event.params.uid,{role:event.data.data().role||'unknown',authType:event.authType||'unknown'}),createdAt:event.data.createTime});
});
exports.documentRecorded=onDocumentWrittenWithAuthContext({...options,document:'users/{uid}/documents/{kind}'},async event=>{
 if(!event.data?.after.exists)return;const id=createHash('sha256').update(event.id).digest('hex');
 await db.doc(`auditLogs/${id}`).set({...audit(event.authId||'system','document.recorded',event.params.uid,{kind:event.params.kind}),createdAt:event.data.after.updateTime});
});
