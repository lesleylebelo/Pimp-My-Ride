const {FieldValue,Timestamp,FieldPath}=require('firebase-admin/firestore');
const {ApiError}=require('./errors.cjs');
const D=require('./domain.cjs');
const {createReviews}=require('./reviews.cjs');
const {createServiceReviews}=require('./service-reviews.cjs');
const {mutation}=require('./mutations.cjs');
const {createDocuments}=require('./documents.cjs');
const {createPresence}=require('./presence.cjs');
const {createMarketplace}=require('./marketplace.cjs');
const {createPhotos}=require('./photos.cjs');
const {createProfilePhotos}=require('./profile-photos.cjs');
const {createPosts}=require('./posts.cjs');
const {saveShopLocation}=require('./shop-location.cjs');
const {createMessaging}=require('./messaging.cjs');
const {createAIAssist}=require('./ai-assist.cjs');
const {createAIStudio}=require('./ai-studio.cjs');
function createServices({db,auth,storage,photoStorage,profileStorage=photoStorage,requestStorage=photoStorage,postStorage=photoStorage,mockPaymentEnv=process.env,aiProvider,aiStudioProvider,aiDiagnostic}){
const reviews=createReviews({db,auth,storage});
const stamp=()=>FieldValue.serverTimestamp();
const audit=(actor,action,target,details={})=>({actor,action,target,details,createdAt:stamp()});
async function actor(request,admin=false){
 if(!request.auth)D.fail('Sign in to continue.','unauthenticated');
 const uid=request.auth.uid;
 const [profile,user]=await Promise.all([db.doc(`users/${uid}`).get(),auth.getUser(uid)]);
 const p=profile.data();
 if(!['owner','shop','admin'].includes(p?.role)||!user.emailVerified||!request.auth.token.email_verified||user.disabled||!D.active(p))D.fail('Account access is unavailable.','permission-denied');
 if(!Number.isFinite(Number(request.auth.token.auth_time))||Number(request.auth.token.auth_time)<Math.floor(Math.max(Date.parse(user.tokensValidAfterTime)||0,Date.parse(user.metadata.creationTime)||0)/1000))D.fail('Sign in again.','unauthenticated');
 if(admin&&(request.auth.token.admin!==true||user.customClaims?.admin!==true||p.role!=='admin'))D.fail('Administrator access required.','permission-denied');
 return {uid,profile:p};
}
function recent(request){if(Date.now()/1000-Number(request.auth.token.auth_time)>900)D.fail('Confirm your password, then retry this action.','failed-precondition');}
function serialize(value){if(value instanceof Timestamp)return value.toMillis();if(Array.isArray(value))return value.map(serialize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,serialize(v)]));return value;}
function rows(snapshot){return snapshot.docs.map(d=>({id:d.id,...serialize(d.data())}));}
async function adminApi(request){
 const a=await actor(request,true),input=request.data||{},op=input.op;
 if(['serviceReviews','serviceReviewModerate','serviceReviewReconcile'].includes(op)){if(op!=='serviceReviews')recent(request);return serviceReviews.moderate(request);}
 if(op==='posts'){
  let query=db.collection('posts').orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
  if(input.cursor){const cursor=await db.doc(`posts/${D.id(input.cursor)}`).get();if(!cursor.exists)D.fail('Post list changed. Refresh the list.','failed-precondition');query=query.startAfter(cursor);}
  const snapshot=await query.limit(21).get();
  return {items:snapshot.docs.slice(0,20).map(doc=>({id:doc.id,...serialize(doc.data())})),cursor:snapshot.size>20?snapshot.docs[19].id:null};
 }
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
 if(op==='categories'){
  let q=db.collection('serviceCategories').orderBy('name').orderBy(FieldPath.documentId());
  if(input.cursor){const c=await db.doc('serviceCategories/'+D.id(input.cursor)).get();if(!c.exists)D.fail('Category page changed. Return to the first page.','failed-precondition');q=q.startAfter(c);}
  const items=rows(await q.limit(31).get());return {items:items.slice(0,30),cursor:items.length>30?items[29].id:null};
 }
 recent(request);
 if(op==='reviewRecover')return reviews.recover({actor:a.uid,operationId:input.operationId,reason:input.reason});
 const receipt=mutation(db,a.uid,op,input);
 if(op==='postRemove'){
  const postId=D.id(input.id),reason=D.text(input.reason,'Reason',500),ref=db.doc(`posts/${postId}`);
  return receipt.atomic(async tx=>{
   const post=(await tx.get(ref)).data();if(!post||post.status!=='published')D.fail('Published post not found.','not-found');
   tx.update(ref,{status:'removed',moderationReason:reason,updatedAt:stamp()});
   tx.create(db.collection('auditLogs').doc(),audit(a.uid,'post.remove',postId,{reason}));
   return {id:postId};
  });
 }
 if(op==='categorySave'||op==='categoryArchive'){
  const ref=input.id?db.doc(`serviceCategories/${D.id(input.id)}`):db.collection('serviceCategories').doc();
  const changes=op==='categorySave'?D.category(input):{archived:input.archived===true};
  return receipt.atomic(async tx=>{
   const before=await tx.get(ref);if(op==='categoryArchive'&&!before.exists)D.fail('Category not found.','not-found');
   tx.set(ref,{...(!before.exists?{createdAt:stamp(),archived:false}:{}),...changes,updatedAt:stamp()}, {merge:true});
   tx.create(db.collection('auditLogs').doc(),audit(a.uid,op,ref.id));
   return {id:ref.id};
  });
 }
 const uid=D.id(input.uid),ref=db.doc(`users/${uid}`),before=await ref.get();
 if(!before.exists)D.fail('Account not found.','not-found');
 const p=before.data();
 if(op==='document'){
  if(!D.kinds.includes(input.kind)||p.role!=='shop')D.fail('Invalid document.');
  const record=(await ref.collection('documents').doc(input.kind).get()).data();
  if(!record||record.provider!=='supabase')D.fail('Please ask the shop to upload this document again.','not-found');
  const url=await storage.signedUrl(record.path);
  await db.collection('auditLogs').add(audit(a.uid,'document.view',uid,{kind:input.kind}));
  return {url};
 }
 D.protect(a.uid,uid,p);
 if(op==='editAccount'){
  const changes=D.editable(input);if(p.role==='shop')changes.shop=D.shop(input.shop);
  return receipt.atomic(async tx=>{const current=await tx.get(ref);D.protect(a.uid,uid,current.data());
   if(current.data().reviewOperation)D.fail('Wait for the shop review to finish before editing.','failed-precondition');
   tx.update(ref,{...changes,...(changes.shop?{shop:{...current.data().shop,...changes.shop}}:{}),updatedAt:stamp()});tx.create(db.collection('auditLogs').doc(),audit(a.uid,op,uid,{fields:Object.keys(changes)}));return {ok:true};});
 }
 if(op==='review')return reviews.review({actor:a.uid,uid,status:input.status,reason:input.reason,operationId:receipt.id,payloadFingerprint:receipt.fingerprint});
 if(op==='status'){
  if(!['active','suspended','archived'].includes(input.status))D.fail('Invalid account status.');
  const reason=D.text(input.reason,'Reason',500),operation=db.doc(`adminOperations/${receipt.id}`);
  const prior=await db.runTransaction(async tx=>{
   const saved=(await tx.get(operation)).data();
   if(saved){
    if(saved.actor!==a.uid||saved.payloadFingerprint!==receipt.fingerprint)D.fail('This request key was already used with different data.','already-exists');
    if(saved.status==='completed')return {ok:true};
    D.fail('This account operation needs reconciliation. Reload the account.','failed-precondition');
   }
   const current=await tx.get(ref);D.protect(a.uid,uid,current.data());
   if(current.data().statusOperation||current.data().reviewOperation)D.fail('An account operation needs completion. Contact the operator.','failed-precondition');
   tx.update(ref,{accountStatus:'suspended',statusOperation:operation.id});
   tx.create(operation,{type:'accountStatus',actor:a.uid,target:uid,status:'pending',requested:input.status,reason,payloadFingerprint:receipt.fingerprint,createdAt:stamp()});
   tx.create(db.collection('auditLogs').doc(),audit(a.uid,'account.statusRequested',uid,{status:input.status,reason,operation:operation.id}));
  });
  if(prior)return prior;
  try{
   await auth.updateUser(uid,{disabled:input.status!=='active'});await auth.revokeRefreshTokens(uid);
   await db.runTransaction(async tx=>{
    const current=await tx.get(ref),owned=await tx.get(operation);
    if(current.data()?.statusOperation!==operation.id||owned.data()?.status!=='pending')D.fail('Account operation changed. Reload it.','failed-precondition');
    tx.update(ref,{accountStatus:input.status,statusReason:reason,statusOperation:FieldValue.delete(),updatedAt:stamp()});
    tx.update(operation,{status:'completed',completedAt:stamp()});
    tx.create(db.collection('auditLogs').doc(),audit(a.uid,`account.${input.status}`,uid,{reason,operation:operation.id}));
   });
  }catch(e){
   const state=await db.runTransaction(async tx=>{
    const [o,p]=await Promise.all([tx.get(operation),tx.get(ref)]);
    if(o.data()?.status==='completed')return 'completed';
    if(o.data()?.status==='pending'&&p.data()?.statusOperation===operation.id){
     tx.update(operation,{status:'failed',errorCode:String(e.code||'unknown'),completedAt:stamp()});
     tx.create(db.collection('auditLogs').doc(),audit(a.uid,'account.statusFailed',uid,{operation:operation.id}));
    }
    return 'restricted';
   });
   if(state==='completed')return {ok:true};
   throw new ApiError('internal','Account remains restricted. An operator must reconcile the failed operation before retrying.');
  }
  return {ok:true};
 }
 D.fail('Unknown operation.');
}
const sessionEvent=createPresence({db,actor});
async function authorizeGoogleSession(request){
 const a=await actor(request),user=await auth.getUser(a.uid);
 if(!user.providerData.some(p=>p.providerId==='google.com')||a.profile.role==='admin'||user.customClaims?.admin===true)D.fail('Google access is unavailable for this account. Use email/password.','permission-denied');
 D.editable(a.profile);
 if(a.profile.statusOperation||a.profile.provisioningOperation)D.fail('Account access is restricted.','permission-denied');
 return {uid:a.uid};
}
async function completeProfile(request){
 if(request.data?.op==='shopLocationSave')return saveShopLocation({db,actor,request});
 if(!request.auth)D.fail('Sign in to continue.','unauthenticated');
 const uid=request.auth.uid,input=request.data||{},u=await auth.getUser(uid);
 if(u.disabled)D.fail('Account is disabled.','permission-denied');
 if(!['owner','shop'].includes(input.role))D.fail('This role cannot register.');
 if(input.agreed!==true||input.termsVersion!=='academic-v2')D.fail('Accept the terms and privacy notice.');
 const fields={...D.editable(input),email:u.email,role:input.role,createdAt:stamp(),termsVersion:'academic-v2',termsAcceptedAt:stamp()};
 if(input.role==='shop')Object.assign(fields,{shop:D.shop(input.shop),verificationStatus:'pending'});
 const ref=db.doc(`users/${uid}`);
 return db.runTransaction(async tx=>{
  const existing=await tx.get(ref);
  if(existing.exists){if(existing.data().role!==input.role)D.fail('An account profile already exists.','already-exists');return {ok:true};}
  tx.create(ref,fields);tx.create(db.collection('auditLogs').doc(),audit(uid,'profile.created',uid,{role:fields.role}));return {ok:true};
 });
}
const {listDocuments,checkUpload,uploadDocument}=createDocuments({db,storage,actor});
const serviceReviews=createServiceReviews({db,auth,actor});
const marketplace=createMarketplace({db,auth,actor,mockPaymentEnv});
const messaging=createMessaging({db,auth,actor});
const profilePhotos=createProfilePhotos({db,auth,actor,storage:profileStorage,messaging,marketplace});
const aiAssist=createAIAssist({db,actor,provider:aiProvider,onDiagnostic:aiDiagnostic});
const aiStudio=createAIStudio({db,actor,provider:aiStudioProvider});
const {photosApi,checkPhotoUpload,uploadPhoto}=createPhotos({db,auth,storage:photoStorage,requestStorage,actor});
const {postsApi,postsList,postDetail,createShowcase,updateShowcase,deleteShowcase,uploadPostImage,viewPostImage}=createPosts({db,auth,actor,storage:postStorage});
return {serviceReviews:serviceReviews.api,...profilePhotos,adminApi,sessionEvent,completeProfile,authorizeGoogleSession,listDocuments,checkUpload,uploadDocument,marketplace,messaging,aiAssist,aiStudio,photosApi,checkPhotoUpload,uploadPhoto,postsApi,postsList,postDetail,createShowcase,updateShowcase,deleteShowcase,uploadPostImage,viewPostImage};
}
module.exports={createServices};
