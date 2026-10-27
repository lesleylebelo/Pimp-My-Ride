const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const {createAIProvider,unavailable}=require('./ai-provider-selection.cjs');
const {ApiError}=require('./errors.cjs');
const {AIFailure,failure,rejection}=require('./ai-errors.cjs');
const {randomUUID,createHash}=require('node:crypto');
const showcaseCategories=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
const {validateGrounding,editorialWords,questionWords}=require('./ai-grounding.cjs');
function validateSuggestion(value,draft){
 try{
  const bad=outputRule=>failure('malformed_output',{outputStage:'suggestion',outputRule});
  const keys=['title','description','categoryId','missingDetails'];
  if(!value||typeof value!=='object'||Array.isArray(value))throw bad('object_type');
  if(Object.keys(value).some(key=>!keys.includes(key)))throw bad('unknown_field');
  if(keys.some(key=>!Object.hasOwn(value,key)))throw bad('required_field');
  function text(input,field,max){
   if(typeof input!=='string')throw bad(field+'_type');
   const trimmed=input.trim();if(!trimmed)throw bad(field+'_empty');
   if(trimmed.length>max)throw bad(field+'_length');return trimmed;
  }
  const title=text(value.title,'title',draft.limits.title),description=text(value.description,'description',draft.limits.description);
  if(value.categoryId!==null&&typeof value.categoryId!=='string')throw bad('category_type');
  if(value.categoryId!==null&&!draft.categories.some(category=>category.id===value.categoryId))throw failure('malformed_output',{outputStage:'suggestion',outputRule:'category_unsupported',rejectedField:'categoryId',validationRule:'category_unsupported'});
  if(!Array.isArray(value.missingDetails))throw bad('questions_type');
  if(value.missingDetails.length>5)throw bad('questions_count');
  const missingDetails=value.missingDetails.map(item=>text(item,'question',180));
  if(missingDetails.some(item=>!item.endsWith('?')))throw bad('question_format');
  validateGrounding({title,description,missingDetails},draft);
  return {title,description,category:value.categoryId===null?null:draft.categories.find(category=>category.id===value.categoryId),missingDetails};
 }catch(error){if(error instanceof AIFailure)throw error;throw failure('malformed_output',{outputStage:'suggestion',outputRule:'unexpected_validation'});}
}
// Active entries are leases for work currently running, never generation counts.
const MAX_CONCURRENT=4;
function createAIAssist({db,actor,provider=createAIProvider(),now=Date.now,timeoutMs=15000,
 onDiagnostic=entry=>console.info('PimpPilot operation',entry)}={}){
 const inFlight=new Map();
 async function accountFor(request){
  try{return await actor(request);}catch(error){
   if(error instanceof ApiError&&error.code==='permission-denied')throw rejection('permission-denied','account_access','Account access is unavailable.');
   if(error instanceof ApiError&&error.code==='unauthenticated')throw error;
   throw failure('account_lookup');
  }
 }
 async function currentAccess(request,account){
  const fresh=await accountFor(request),p=account.profile;
  if(fresh.uid!==account.uid||fresh.profile.role!==p.role||!D.active(fresh.profile)||fresh.profile.statusOperation||fresh.profile.reviewOperation||fresh.profile.provisioningOperation||p.role==='shop'&&fresh.profile.verificationStatus!=='approved')throw rejection('permission-denied','account_changed','Account access changed.');
 }
 return async request=>{
  const account=await accountFor(request),p=account.profile,input=request.data;
  if(!['owner','shop'].includes(p.role)||!D.active(p)||p.statusOperation||p.reviewOperation||p.provisioningOperation||p.role==='shop'&&p.verificationStatus!=='approved')throw rejection('permission-denied','account_eligibility','AI Assist requires an active customer or approved shop.');
  M.fields(input,['kind','title','description','categoryId','requestId']);
  if(input.kind!==(p.role==='owner'?'request':'showcase'))throw rejection('permission-denied','draft_type','AI Assist is unavailable for this draft type.');
  if(Buffer.byteLength(JSON.stringify(input))>8192)D.fail('The AI draft is too large.');
  if(input.requestId!==undefined&&(typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId)))D.fail('Invalid generation request identifier.');
  const limits={title:100,description:input.kind==='request'?300:2000};
  const title=M.optional(input.title,'Title',limits.title),description=M.optional(input.description,'Description',limits.description);
  if((title+description).trim().length<3)D.fail('Enter a title or description before using AI Assist.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(title+description))D.fail('Remove unsupported control characters.');
  if(!provider.enabled)throw unavailable();
  let categories=showcaseCategories.map(name=>({id:name,name}));
  if(input.kind==='request'){
   try{
    const snapshot=await db.collection('serviceCategories').where('archived','==',false).limit(101).get();
    if(snapshot.docs.length>100)throw failure('category_unavailable');
    categories=snapshot.docs.map(doc=>({id:doc.id,name:D.text(doc.data().name,'Category',100)}));
   }catch{throw failure('category_unavailable');}
  }
  if(!categories.length)throw failure('category_unavailable');
  if(input.categoryId!==undefined&&input.categoryId!==''&&input.categoryId!==null&&!categories.some(category=>category.id===input.categoryId))D.fail('Choose an existing active category.');
  const fingerprint=createHash('sha256').update(JSON.stringify([p.role,input.kind,title,description,input.categoryId||null])).digest('hex');
  const pending=inFlight.get(account.uid);
  if(pending){
   if(input.requestId&&pending.requestId===input.requestId){
    if(pending.fingerprint!==fingerprint)throw rejection('already-exists','request_conflict','This generation identifier belongs to another draft.');
    const suggestion=await pending.promise;await currentAccess(request,account);return suggestion;
   }
   throw rejection('resource-exhausted','busy','A generation is already running. Please wait for it to finish.');
  }
  if(inFlight.size>=MAX_CONCURRENT)throw rejection('resource-exhausted','busy','AI Assist is busy. Try again shortly.');
  const entry={requestId:input.requestId,fingerprint,promise:null};inFlight.set(account.uid,entry);
  entry.promise=Promise.resolve().then(async()=>{
   const correlationId=randomUUID(),started=now(),controller=new AbortController();let timer,status=null,safe=null,validated=false;
   try{
    const draft={kind:input.kind,title,description,categoryId:input.categoryId||null,categories,limits,editorialWords:editorialWords(title+'\n'+description),questionWords:questionWords()};
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('provider_timeout'));},timeoutMs);});
    const raw=await Promise.race([Promise.resolve().then(()=>provider.suggest(draft,{signal:controller.signal,onResponse:value=>{status=Number.isInteger(value)&&value>=100&&value<=599?value:null;}})),deadline]);
    const suggestion=validateSuggestion(raw,draft);validated=true;
    await currentAccess(request,account);
    if(input.kind==='request'&&suggestion.category&&(await db.doc('serviceCategories/'+suggestion.category.id).get()).data()?.archived!==false)throw failure('category_changed');
    return suggestion;
   }catch(error){
    const access=validated&&error instanceof ApiError&&['permission-denied','unauthenticated'].includes(error.code);
    safe=error instanceof AIFailure?error:failure(access?'account_changed':'unknown');
    if(access)throw error;throw safe;
   }finally{
    clearTimeout(timer);controller.abort();
    // Best-effort, content-free telemetry cannot gate access or consume a quota.
    const diagnostic={correlationId,durationMs:Math.max(0,now()-started),providerHttpStatus:status,state:safe?'failed':'successful',reasonCode:safe?.reason??null,rejectedField:safe?.rejectedField??null,validationRule:safe?.validationRule??null,outputStage:safe?.outputStage??null,outputRule:safe?.outputRule??null};
    try{Promise.resolve(onDiagnostic(diagnostic)).catch(()=>{});}catch{}
   }
  }).finally(()=>{if(inFlight.get(account.uid)===entry)inFlight.delete(account.uid);});
  return entry.promise;
 };
}
module.exports={createAIAssist,validateSuggestion,MAX_CONCURRENT};
