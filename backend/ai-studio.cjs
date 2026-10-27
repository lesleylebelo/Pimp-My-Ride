const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const {createAIStudioProvider}=require('./ai-studio-provider.cjs');
const {ApiError}=require('./errors.cjs');
const {AIFailure}=require('./ai-errors.cjs');
const {schema}=require('./ai-studio-contract.cjs');
const unavailable=()=>new ApiError('unavailable','PimpPilot Studio is unavailable. Please try again later.');
function validatePlan(value,rule=schema){
 if(rule.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(rule.properties,key))||rule.required.some(key=>!Object.hasOwn(value,key)))throw unavailable();
  return Object.fromEntries(Object.entries(rule.properties).map(([key,child])=>[key,validatePlan(value[key],child)]));
 }
 if(rule.type==='array'){
  if(!Array.isArray(value)||value.length>rule.maxItems)throw unavailable();
  return value.map(item=>validatePlan(item,rule.items));
 }
 if(typeof value!=='string'||!value.trim()||value.length>rule.maxLength||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||/https?:\/\//i.test(value))throw unavailable();
 return value.trim();
}
function createAIStudio({db,actor,provider=createAIStudioProvider(),timeoutMs=30000}={}){
 const pending=new Set();
 async function access(request){
  const a=await actor(request),p=a.profile;
  if(p.role!=='owner'||!D.active(p)||p.statusOperation||p.reviewOperation||p.provisioningOperation)D.fail('Studio requires an active customer account.','permission-denied');
  return a;
 }
 async function vehicleFor(id,uid){
  const v=(await db.doc('vehicles/'+D.id(id)).get()).data();
  if(!v||v.ownerId!==uid||v.archived)D.fail('Active vehicle not found.','not-found');
  return Object.fromEntries(['make','model','year','colour'].filter(key=>v[key]!==undefined).map(key=>[key,v[key]]));
 }
 return async request=>{
  const a=await access(request),input=request.data;
  M.fields(input,['vehicleId','message','history','image']);
  const vehicleId=D.id(input.vehicleId),message=D.text(input.message,'Studio message',1500);
  const vehicle=await vehicleFor(vehicleId,a.uid);
  const history=input.history??[];
  if(!Array.isArray(history)||history.length>6)D.fail('Start a new Studio conversation.');
  const turns=history.map(turn=>{M.fields(turn,['message','plan']);return {message:D.text(turn.message,'Previous message',1500),plan:validatePlan(turn.plan)};});
  let image;
  if(input.image!==undefined){
   M.fields(input.image,['mimeType','data']);
   const {mimeType,data}=input.image;
   if(mimeType!=='image/jpeg'||typeof data!=='string'||data.length>1400000||data.length<8||data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))D.fail('Choose a JPEG photo under 1 MB.');
   const bytes=Buffer.from(data,'base64');
   if(bytes.length>1048576||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.toString('base64')!==data)D.fail('Choose a valid JPEG photo under 1 MB.');
   image={mimeType,data};
  }
  if(!provider.enabled)throw unavailable();
  if(pending.has(a.uid)||pending.size>=4)D.fail('Studio is busy. Wait for the current plan to finish.','resource-exhausted');
  pending.add(a.uid);const controller=new AbortController();let timer;
  try{
   const plan=validatePlan(await Promise.race([
    Promise.resolve().then(()=>provider.suggest({mode:'studio',vehicle,message,history:turns,...(image?{image}:{})},{signal:controller.signal})).catch(error=>{const safe=unavailable();if(error instanceof AIFailure)safe.fields=error.fields;throw safe;}),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable());},timeoutMs);}),
   ]));
   if(!image)plan.observations=[];
   const fresh=await access(request);if(fresh.uid!==a.uid)D.fail('Account changed.','permission-denied');
   const currentVehicle=await vehicleFor(vehicleId,a.uid);
   if(JSON.stringify(currentVehicle)!==JSON.stringify(vehicle))D.fail('Vehicle details changed. Start a new concept.','failed-precondition');
   return {vehicleId,plan,imageEditingAvailable:false};
  }catch(error){if(error instanceof ApiError)throw error;throw unavailable();}
  finally{clearTimeout(timer);controller.abort();pending.delete(a.uid);}
 };
}
module.exports={createAIStudio,validatePlan};
