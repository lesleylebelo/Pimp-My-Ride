const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const {createAIProvider,unavailable}=require('./ai-provider.cjs');
const {ApiError}=require('./errors.cjs');
const {AIFailure,failure}=require('./ai-errors.cjs');
const {createAIReleaseControl}=require('./ai-release-control.cjs');
const showcaseCategories=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
const neutral=new Set(('a an the i we you your our it its this that these those to for of and or in on at by with from as is are be been was were have has would could can please request service work project showcase description title details information clarify explain provide consider prefer preferred which what when how any about want like need clearly accurately regarding includes').split(' '));
const words=value=>String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
function grounded(source,value){
 const supplied=new Set(words(source));
 if(words(value).some(word=>!supplied.has(word)&&!neutral.has(word)))throw failure('grounding_rejected');
 const numbers=source.match(/\d+(?:[.,]\d+)*/g)||[];
 if((value.match(/\d+(?:[.,]\d+)*/g)||[]).some(number=>!numbers.includes(number))||/[£$€%]/.test(value)&&!/[£$€%]/.test(source))throw failure('grounding_rejected');
 for(const word of ['no','not','never','without'])if(supplied.has(word)&&!words(value).includes(word))throw failure('grounding_rejected');
}
function validateSuggestion(value,draft){
 try{
  M.fields(value,['title','description','categoryId','missingDetails']);
  const title=D.text(value.title,'Suggested title',draft.limits.title),description=D.text(value.description,'Suggested description',draft.limits.description);
  if(!Object.hasOwn(value,'categoryId')||value.categoryId!==null&&!draft.categories.some(category=>category.id===value.categoryId))throw failure('malformed_output');
  if(!Array.isArray(value.missingDetails)||value.missingDetails.length>5)throw failure('malformed_output');
  const missingDetails=value.missingDetails.map(item=>D.text(item,'Missing detail',180));
  if(missingDetails.some(item=>!item.endsWith('?')))throw failure('malformed_output');
  const source=`${draft.title}\n${draft.description}`;
  grounded(source,`${title}\n${description}`);
  const supplied=new Set(words(source)),clarifications=new Set([...neutral,'scope','timing','condition','preferences','constraints']);
  if(missingDetails.some(item=>words(item).some(word=>!supplied.has(word)&&!clarifications.has(word))))throw failure('grounding_rejected');
  // Questions may request clarification, never introduce prices/specifications.
  const numeric=source.match(/\d+(?:[.,]\d+)*/g)||[];
  if(missingDetails.some(item=>(item.match(/\d+(?:[.,]\d+)*/g)||[]).some(number=>!numeric.includes(number))))throw failure('grounding_rejected');
  return {title,description,category:value.categoryId===null?null:draft.categories.find(category=>category.id===value.categoryId),missingDetails};
 }catch(error){if(error instanceof AIFailure)throw error;throw failure('malformed_output');}
}
function createAIAssist({db,actor,provider=createAIProvider(),releaseControl=createAIReleaseControl({db}),now=Date.now,timeoutMs=15000}){
 const usage=new Map();let concurrent=0;
 return async request=>{
  const account=await actor(request),p=account.profile,input=request.data;
  if(!['owner','shop'].includes(p.role)||!D.active(p)||p.statusOperation||p.reviewOperation||p.provisioningOperation||p.role==='shop'&&p.verificationStatus!=='approved')D.fail('AI Assist requires an active customer or approved shop.','permission-denied');
  M.fields(input,['kind','title','description','categoryId']);
  if(input.kind!==(p.role==='owner'?'request':'showcase'))D.fail('AI Assist is unavailable for this draft type.','permission-denied');
  if(Buffer.byteLength(JSON.stringify(input))>8192)D.fail('The AI draft is too large.');
  const limits={title:100,description:input.kind==='request'?300:2000};
  const title=M.optional(input.title,'Title',limits.title),description=M.optional(input.description,'Description',limits.description);
  if(`${title}${description}`.trim().length<3)D.fail('Enter a title or description before using AI Assist.');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(title+description))D.fail('Remove unsupported control characters.');
  if(!provider.enabled)throw unavailable();
  releaseControl.authorize(account.uid);
  let categories=showcaseCategories.map(name=>({id:name,name}));
  if(input.kind==='request'){
   const snapshot=await db.collection('serviceCategories').where('archived','==',false).limit(101).get();
   if(snapshot.docs.length>100)throw unavailable();
   categories=snapshot.docs.map(doc=>({id:doc.id,name:D.text(doc.data().name,'Category',100)}));
  }
  if(!categories.length)throw unavailable();
  if(input.categoryId!==undefined&&input.categoryId!==''&&input.categoryId!==null&&!categories.some(category=>category.id===input.categoryId))D.fail('Choose an existing active category.');
  const clock=now();for(const [uid,value] of usage)if(!value.pending&&clock-value.hour>=3600000)usage.delete(uid);
  let quota=usage.get(account.uid);
  if(!quota){if(usage.size>=5000)D.fail('AI Assist is busy. Try again later.','resource-exhausted');quota={hour:clock,hourCount:0,minute:clock,minuteCount:0,pending:false};usage.set(account.uid,quota);}
  if(clock-quota.minute>=60000){quota.minute=clock;quota.minuteCount=0;}
  if(quota.pending||quota.minuteCount>=3||quota.hourCount>=10||concurrent>=4)D.fail('AI usage limit reached. Please wait before trying again.','resource-exhausted');
  quota.pending=true;++quota.minuteCount;++quota.hourCount;++concurrent;
  const controller=new AbortController();let timer,validated=false,attempt;
  // Keep quota reservation errors separate from provider errors, retaining 429.
  try{attempt=await releaseControl.reserve();}
  catch(error){quota.pending=false;--concurrent;throw error;}
  try{
   await attempt?.dispatch();
   const draft={kind:input.kind,title,description,categoryId:input.categoryId||null,categories,limits,editorialWords:[...neutral]};
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('provider_timeout'));},timeoutMs);});
   const raw=await Promise.race([Promise.resolve().then(()=>provider.suggest(draft,{signal:controller.signal,onResponse:status=>attempt?.response(status)})),deadline]);
   const suggestion=validateSuggestion(raw,draft);validated=true;const fresh=await actor(request);
   if(fresh.uid!==account.uid||fresh.profile.role!==p.role||!D.active(fresh.profile)||fresh.profile.statusOperation||fresh.profile.reviewOperation||fresh.profile.provisioningOperation||p.role==='shop'&&fresh.profile.verificationStatus!=='approved')D.fail('Account access changed.','permission-denied');
   if(input.kind==='request'&&suggestion.category&&(await db.doc('serviceCategories/'+suggestion.category.id).get()).data()?.archived!==false)throw failure('category_changed');
   await attempt?.finish({outputValidated:true});
   return suggestion;
  }catch(error){
   const access=validated&&error instanceof ApiError&&(error.code==='permission-denied'||error.code==='unauthenticated');
   const safe=error instanceof AIFailure?error:failure(access?'account_changed':'unknown');
   // Storage errors must never turn into a returned suggestion. A failed finish
   // may have committed; leave that outcome uncertain and do not retry it.
   if(safe.reason!=='diagnostic_storage')await attempt?.finish({error:safe,outputValidated:validated});
   if(access)throw error;throw safe;
  }
  finally{clearTimeout(timer);controller.abort();quota.pending=false;--concurrent;}
 };
}
module.exports={createAIAssist,validateSuggestion};
