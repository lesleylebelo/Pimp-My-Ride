const {FieldValue,FieldPath,Timestamp}=require('firebase-admin/firestore');
const {randomUUID}=require('node:crypto');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const {mutation}=require('./mutations.cjs');
const stamp=()=>FieldValue.serverTimestamp(),PAGE=20;
const roles=['owner','shop'];
const pending=p=>p?.statusOperation||p?.reviewOperation||p?.verificationStatus==='reviewing'||p?.provisioningOperation;
// Fail closed in every environment. Only an exact server-side "true" opts in.
function deletionControls(env=process.env){return {requests:env.PMR_ACCOUNT_DELETION_REQUESTS_ENABLED==='true',worker:env.PMR_ACCOUNT_DELETION_WORKER_ENABLED==='true'};}
function recent(request){const at=Number(request.auth?.token?.auth_time);if(!Number.isFinite(at)||at>Date.now()/1000+60||Date.now()/1000-at>300)D.fail('Confirm your password, then retry this account action.','failed-precondition');}
function obligation(b){
 if(b.disputeStatus&& !['closed','resolved'].includes(b.disputeStatus)||b.activeDispute===true)return true;
 if(b.paymentReconciliationStatus&&!['resolved','not_required'].includes(b.paymentReconciliationStatus))return true;
 if(b.status==='cancelled')return false;
 return b.serviceStatus!=='completed'||!Number.isSafeInteger(b.balanceDueCents)||b.balanceDueCents!==0;
}
function createAccountManagement({db,auth,actor,stores={},now=Date.now,settleMs=120000,env=process.env}){
 const audit=(tx,uid,event,details={})=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:'account.self.'+event,target:uid,details,createdAt:stamp()});
 const jobRef=uid=>db.doc('accountLifecycleJobs/'+uid);
 async function self(request,recovery=false){
  const a=await actor(request,false,recovery);
  if(!roles.includes(a.profile.role))D.fail('Self-service account management is for customers and workshops.','permission-denied');
  if(!recovery&&(pending(a.profile)||!D.active(a.profile)))D.fail('An account operation is in progress.','failed-precondition');
  return a;
 }
 async function clear(tx,uid,role){
  const result=await tx.get(db.collection('bookings').where(role==='owner'?'ownerId':'shopId','==',uid).limit(201));
  if(result.docs.length>200||result.docs.some(doc=>obligation(doc.data())))D.fail('Resolve active bookings, balances, reconciliation or disputes with the workshop/support before closing your account.','failed-precondition');
 }
 async function api(request){
  const input=request.data||{},op=input.op;
  const allowed={profile:[],save:['fullName','phone','shop','version'],syncEmail:[],deactivate:['confirmation'],delete:['confirmation'],reactivate:[],status:[]};
  if(!Object.hasOwn(allowed,op))D.fail('Unknown account operation.');
  M.fields(input,['op',...allowed[op],...(['save','syncEmail','deactivate','delete','reactivate'].includes(op)?['requestId']:[])]);
  const a=await self(request,['reactivate','status'].includes(op)),ref=db.doc('users/'+a.uid);
  if(op==='profile')return {profile:{fullName:a.profile.fullName,phone:a.profile.phone,role:a.profile.role,shop:a.profile.shop||null,version:a.profile.profileVersion||0},email:(await auth.getUser(a.uid)).email};
  if(op==='status'){const job=(await jobRef(a.uid).get()).data();return {accountStatus:a.profile.accountStatus||'active',job:job?{kind:job.kind,state:job.state,phase:job.phase,issue:job.issue||null}:null};}
  if(op==='save'){
   const fields=D.editable(input);M.integer(input.version,'Profile version',0,Number.MAX_SAFE_INTEGER);
   if(a.profile.role==='shop')M.fields(input.shop||{},['shopName','regNumber','address','city','province','services']);
   const business=a.profile.role==='shop'?D.shop(input.shop):null;if(a.profile.role!=='shop'&&input.shop!==undefined)D.fail('Only workshops can edit business details.');
   D.id(input.requestId);
   return mutation(db,a.uid,'account.save',input).atomic(async tx=>{
    const p=(await tx.get(ref)).data();if(!p||p.role!==a.profile.role||!D.active(p)||pending(p))D.fail('Profile access changed. Reload your account.','failed-precondition');
    if((p.profileVersion||0)!==input.version)D.fail('Your profile changed. Reload before saving.','failed-precondition');
    const identityChanged=business&&(fields.fullName!==p.fullName||['shopName','regNumber','address','city','province'].some(key=>business[key]!==p.shop?.[key]));
    const live=await auth.getUser(a.uid);if(live.disabled||!live.emailVerified)D.fail('Account access unavailable.','permission-denied');
    tx.update(ref,{...fields,email:live.email,profileVersion:input.version+1,...(business?{shop:{...p.shop,...business}}:{}),...(identityChanged?{verificationStatus:'pending',reviewReason:'Business identity changed. Administrator verification is required.'}:{}),updatedAt:stamp()});
    audit(tx,a.uid,'profileUpdated',{businessReverification:!!identityChanged});return {version:input.version+1,reverificationRequired:!!identityChanged};
   });
  }
  recent(request);D.id(input.requestId);
  if(op==='delete'&&!deletionControls(env).requests)D.fail('Permanent account deletion is temporarily unavailable. Deactivation remains available.','unavailable');
  if(op==='syncEmail'){
   const live=await auth.getUser(a.uid);if(!live.emailVerified)D.fail('Verify the new email first.','failed-precondition');
   return mutation(db,a.uid,'account.syncEmail',input).atomic(async tx=>{const p=(await tx.get(ref)).data();if(!D.active(p)||pending(p))D.fail('Account access changed.','failed-precondition');tx.update(ref,{email:live.email,updatedAt:stamp()});audit(tx,a.uid,'emailSynced');return {email:live.email};});
  }
  if(op==='reactivate'){
   return db.runTransaction(async tx=>{
    const p=(await tx.get(ref)).data(),job=(await tx.get(jobRef(a.uid))).data();
    if(p?.accountStatus==='active'&&!pending(p)&&job?.kind==='deactivate'&&job.state==='reactivated')return {reactivated:true};
    if(p?.accountStatus!=='deactivated'||pending(p)||job?.kind!=='deactivate'||job.state!=='completed')D.fail('Only your own completed self-deactivation can be reactivated. Contact support for other restrictions.','failed-precondition');
    tx.update(ref,{accountStatus:'active',statusReason:FieldValue.delete(),updatedAt:stamp()});tx.update(jobRef(a.uid),{state:'reactivated',updatedAt:stamp()});audit(tx,a.uid,'reactivated');return {reactivated:true};
   });
  }
  if(input.confirmation!==(op==='delete'?'DELETE':'DEACTIVATE'))D.fail('Enter the exact confirmation word.');
  const job=await mutation(db,a.uid,'account.'+op,input).atomic(async tx=>{
   const p=(await tx.get(ref)).data(),previous=(await tx.get(jobRef(a.uid))).data();
   if(!p||!roles.includes(p.role)||!D.active(p)||pending(p))D.fail('Account access changed. Refresh and contact support if an account request is pending.','failed-precondition');
   if(previous?.kind==='delete'&&previous.state!=='completed')D.fail('Deletion is already pending.','failed-precondition');
   if(p.accountClosureHold===true)D.fail('Support must resolve the account closure hold before this action.','failed-precondition');
   await clear(tx,a.uid,p.role);
   const value={uid:a.uid,role:p.role,kind:op,state:'pending',phase:'revoke',cursor:null,dueAt:Timestamp.fromMillis(now()),createdAt:stamp(),updatedAt:stamp(),revision:0};
   tx.set(jobRef(a.uid),value);tx.update(ref,{accountStatus:op==='delete'?'deleting':'deactivated',statusOperation:'self:'+a.uid,updatedAt:stamp()});audit(tx,a.uid,op+'Requested');return value;
  });
  // The durable restriction above already denies marketplace actions, even if
  // Auth revocation or the worker is temporarily unavailable.
  try{await process(a.uid);}catch{} // Status remains pending; never claim deletion.
  return {accepted:true,kind:job.kind,status:(await jobRef(a.uid).get()).data()?.state||'pending'};
 }
 const phases=[
  ['bookmarks',uid=>db.collection(`users/${uid}/savedPosts`),()=>null],
  ['documents',uid=>db.collection(`users/${uid}/documents`),()=>null],
  ['vehicles',uid=>db.collection('vehicles').where('ownerId','==',uid),()=>null],
  ['posts',uid=>db.collection('posts').where('authorId','==',uid),()=>({status:'removed',authorRole:'deleted',title:'Removed account content',images:[],description:'',authorAvatar:null})],
  ['requests',uid=>db.collection('serviceRequests').where('ownerId','==',uid),v=>({ownerId:v.ownerId,shopId:v.shopId||null,status:'closed',bookingId:v.bookingId||null,title:'Historical service request'})],
  ['quotes',uid=>db.collection('quotations').where('shopId','==',uid),v=>v.status==='accepted'?v:null],
  ['quoteHeads',uid=>db.collection('quotationHeads').where('shopId','==',uid),()=>null],
  ['presence',uid=>db.collection('presence').where('uid','==',uid),()=>null],
  ['notifications',uid=>db.collection('notifications').where('recipientUid','==',uid),()=>null],
  ['photoAttempts',uid=>db.collection('storagePhotosUploadAttempts').where('uid','==',uid),()=>null],
  ['profileUploads',uid=>db.collection('profilePhotoUploads').where('uid','==',uid),()=>null],
  ['documentAttempts',uid=>db.collection('storageUploadAttempts').where('uid','==',uid),()=>null],
  ['postUploads',uid=>db.collection('postPhotoUploads').where('uid','==',uid),()=>null],
  ['photoMetadata',uid=>db.collection('marketplacePhotos').where('ownerId','==',uid),()=>null],
  ['messages',uid=>db.collectionGroup('messages').where('senderId','==',uid),v=>({senderId:v.senderId,text:'[Message removed with account]',sequence:v.sequence,recipientOrdinal:v.recipientOrdinal,createdAt:v.createdAt||null,accountDeleted:true})],
  ['conversationsOwner',uid=>db.collection('conversations').where('ownerId','==',uid),v=>({...v,customerName:'Deleted customer',enquiry:'',requestTitle:'Historical service',lastMessage:'Account participant removed',customerAvatar:null})],
  ['conversationsShop',uid=>db.collection('conversations').where('shopId','==',uid),v=>({...v,shopName:'Former workshop',lastMessage:'Account participant removed',shopAvatar:null})],
  ['bookings',uid=>db.collection('bookings').where('ownerId','==',uid),v=>({...v,customerName:'Deleted customer'})],
  ['receipts',uid=>db.collection('paymentReceipts').where('customer.id','==',uid),v=>({...v,customer:{id:v.customer.id,name:'Deleted customer'}})],
  ['emailSink',uid=>db.collection('emailOutbox').where('recipientUid','==',uid),()=>null],
  ['emailJobs',uid=>db.collection('transactionalEmailJobs').where('recipientUid','==',uid),v=>({recipientUid:v.recipientUid,kind:v.kind||null,status:'cancelled',accountDeleted:true})],
  ['audits',uid=>db.collection('auditLogs').where('actor','==',uid),v=>({...v,details:{accountDeleted:true}})],
 ];
 const media=['verification','photos','requests','profiles','showcase'];
 async function process(uid){
  D.id(uid);const ref=jobRef(uid),token=randomUUID();
  const job=await db.runTransaction(async tx=>{
   const doc=await tx.get(ref),value=doc.data(),p=(await tx.get(db.doc('users/'+uid))).data();
   if(!value||value.uid!==uid||value.state==='completed'||value.state==='reactivated')return null;
   if(!['delete','deactivate'].includes(value.kind))D.fail('Unknown account lifecycle kind.','failed-precondition');
   if(value.kind==='delete'&&!deletionControls(env).worker)return {paused:true};
   if(p?.statusOperation!=='self:'+uid||p.accountStatus!==(value.kind==='delete'?'deleting':'deactivated'))D.fail('Account lifecycle ownership changed.','failed-precondition');
   if(value.leaseUntil?.toMillis?.()>now())return null;
   tx.update(ref,{leaseToken:token,leaseUntil:Timestamp.fromMillis(now()+120000)});return value;
  });
  if(!job)return {pending:true};
  if(job.paused)return {pending:true,paused:true};
  async function progress(changes){return db.runTransaction(async tx=>{const owned=(await tx.get(ref)).data();if(owned?.leaseToken!==token)D.fail('Account worker lease changed.','failed-precondition');tx.update(ref,{issue:FieldValue.delete(),...changes,leaseToken:FieldValue.delete(),leaseUntil:FieldValue.delete(),dueAt:Timestamp.fromMillis(now()+60000),updatedAt:stamp()});});}
  try{
   if(job.phase==='revoke'){
    await auth.revokeRefreshTokens(uid);
    if(job.kind==='deactivate'){
     await db.runTransaction(async tx=>{const p=(await tx.get(db.doc('users/'+uid))).data(),j=(await tx.get(ref)).data();if(p?.statusOperation!=='self:'+uid||j?.leaseToken!==token)D.fail('Account lifecycle changed.','failed-precondition');tx.update(db.doc('users/'+uid),{statusOperation:FieldValue.delete(),statusReason:'Self-deactivated. Sign in through account recovery to reactivate.'});tx.update(ref,{state:'completed',phase:'deactivated',leaseToken:FieldValue.delete(),leaseUntil:FieldValue.delete(),updatedAt:stamp()});audit(tx,uid,'deactivated');});return {completed:true};
    }
    await progress({phase:'settle'});return {pending:true};
   }
   if(job.phase==='settle'){
    if(now()-(job.createdAt?.toMillis?.()??now())<settleMs){await progress({});return {pending:true};}
    for(const name of ['storageUploadAttempts','storagePhotosUploadAttempts','profilePhotoUploads','postPhotoUploads']){
     const active=await db.collection(name).where('uid','==',uid).where('state','==','uploading').limit(1).get();
     if(active.docs.length)D.fail('An upload outcome needs operator reconciliation before cleanup.','failed-precondition');
    }
    await progress({phase:'media:0'});return {pending:true};
   }
   if(job.phase.startsWith('media:')){
    const index=Number(job.phase.split(':')[1]),store=stores[media[index]];
    if(!store?.purgeOwnerPage)D.fail('Account media cleanup is not configured.','failed-precondition');
    const result=await store.purgeOwnerPage(uid);
    await progress(result.done?{phase:index===media.length-1?'data:0':'media:'+(index+1)}:{});return {pending:true};
   }
   if(job.phase.startsWith('data:')){
    const index=Number(job.phase.split(':')[1]),[name,query,project]=phases[index];
    let q=query(uid).orderBy(FieldPath.documentId());
    if(job.cursor)q=q.startAfter(job.cursor);
    const snapshot=await q.limit(PAGE+1).get(),docs=snapshot.docs.slice(0,PAGE);
    // Keep references to unknown buckets/providers for operator reconciliation,
    // even after known namespaces have been swept. Never claim their erasure.
    for(const doc of docs){const value=doc.data(),scope={documents:'verification',photoAttempts:value.purpose==='request'?'requests':'photos',profileUploads:'profiles',documentAttempts:'verification',postUploads:'showcase',photoMetadata:value.purpose==='request'?'requests':'photos'}[name];if(scope){if(!stores[scope]?.checkOwnerReference)D.fail('Media reference validation is not configured.','failed-precondition');stores[scope].checkOwnerReference(uid,value);}if(name==='posts')for(const image of value.images||[]){if(!stores.showcase?.checkOwnerReference)D.fail('Showcase reference validation is not configured.','failed-precondition');stores.showcase.checkOwnerReference(uid,image);}}
    await db.runTransaction(async tx=>{
     const owned=(await tx.get(ref)).data();if(owned?.leaseToken!==token)D.fail('Account worker lease changed.','failed-precondition');
     for(const doc of docs){const data=project(doc.data()),target=doc.ref;if(data===null)tx.delete(target);else tx.set(target,data);}
     const more=snapshot.docs.length>PAGE;tx.update(ref,{phase:more?job.phase:index===phases.length-1?'identity':'data:'+(index+1),cursor:more?(name==='messages'?docs.at(-1).ref.path:docs.at(-1).id):null,leaseToken:FieldValue.delete(),leaseUntil:FieldValue.delete(),issue:FieldValue.delete(),dueAt:Timestamp.fromMillis(now()+60000),updatedAt:stamp()});
    });return {pending:true};
   }
   if(job.phase==='identity'){
    // Delete Auth last. Retry tolerates a lost response after identity removal.
    try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
    await db.runTransaction(async tx=>{
     const p=(await tx.get(db.doc('users/'+uid))).data(),j=(await tx.get(ref)).data();if(j?.leaseToken!==token||p?.statusOperation!=='self:'+uid)D.fail('Account lifecycle changed.','failed-precondition');
     tx.set(db.doc('users/'+uid),{role:'deleted',formerRole:job.role,accountStatus:'deleted',deletedAt:stamp(),retentionReviewRequired:true,...(job.role==='shop'?{verifiedRating:p.verifiedRating||{count:0,sum:0,revision:0},archivedReviews:true}:{})});
     tx.update(ref,{state:'completed',phase:'completed',leaseToken:FieldValue.delete(),leaseUntil:FieldValue.delete(),issue:FieldValue.delete(),updatedAt:stamp()});audit(tx,uid,'deleted',{historicalEvidenceRetained:true});
    });return {completed:true};
   }
   D.fail('Unknown cleanup phase.','failed-precondition');
  }catch(e){await progress({issue:'Cleanup requires retry or operator reconciliation.'}).catch(()=>{});throw e;}
 }
 async function tick(){let query=db.collection('accountLifecycleJobs').where('state','==','pending');if(!deletionControls(env).worker)query=query.where('kind','==','deactivate');const snap=await query.where('dueAt','<=',Timestamp.fromMillis(now())).orderBy('dueAt').limit(3).get();for(const doc of snap.docs)try{await process(doc.id);}catch{}return {examined:snap.docs.length};}
 return {api,process,tick};
}
module.exports={createAccountManagement,obligation,deletionControls};
