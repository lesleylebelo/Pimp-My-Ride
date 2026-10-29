const {createClient}=require('@supabase/supabase-js');
const {ApiError}=require('./errors.cjs');
function createStorage({url,key,bucket='verification',client,scope='verification'}){
 if(!['verification','photos','requests','showcase','public-posts','profiles'].includes(scope))throw new Error('Unknown storage scope.');
 const vehiclePath=/^photos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 const requestPath=/^requests\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 const postPath=/^posts\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 const documentPath=/^verification\/[A-Za-z0-9_-]+\/(cipcCert|proofOfAddress|ownerId)\/[a-f0-9-]+$/;
 const profilePath=/^profiles\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 const scopedPath={profiles:profilePath,photos:vehiclePath,requests:requestPath,showcase:postPath,'public-posts':postPath,verification:documentPath}[scope];
 const supabase=client||(url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(25000)})}}):null);
 function pathOK(path){if(typeof path!=='string'||!scopedPath.test(path))throw new ApiError('failed-precondition','This file needs to be uploaded again.');}
 function checkOwnerReference(uid,reference){
  pathOK(reference?.path);
  const prefix={verification:'verification',photos:'photos',requests:'requests',profiles:'profiles',showcase:'posts','public-posts':'posts'}[scope]+'/'+uid+'/';
  if(!reference.path.startsWith(prefix)||reference.bucket&&reference.bucket!==bucket||reference.provider&&reference.provider!=='supabase')throw new ApiError('failed-precondition','Media reference needs operator reconciliation.');
 }
 async function privateBucket(){
  if(!supabase)throw new ApiError('unavailable','Private file storage is not configured. Contact the project administrator.');
  const {data,error}=await supabase.storage.getBucket(bucket);
  if(error||!data||data.public!==false)throw new ApiError('unavailable','Private file storage is unavailable or misconfigured.');
  return supabase.storage.from(bucket);
 }
 async function postBucket(){
  if(!supabase)throw new ApiError('unavailable','Public post storage is not configured. Contact the project administrator.');
  const {data,error}=await supabase.storage.getBucket(bucket);
  if(error||!data||data.public!==true)throw new ApiError('unavailable','Public post storage is unavailable or is not configured for public reads.');
  return supabase.storage.from(bucket);
 }
 async function purgeOwnerPage(uid){
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid))throw new ApiError('invalid-argument','Invalid account namespace.');
  const root={verification:'verification',photos:'photos',requests:'requests',profiles:'profiles',showcase:'posts','public-posts':'posts'}[scope]+'/'+uid;
  const store=scope==='public-posts'?await postBucket():await privateBucket();
  const listed=await store.list(root,{limit:21,offset:0,sortBy:{column:'name',order:'asc'}});
  if(listed.error||!Array.isArray(listed.data))throw new ApiError('unavailable','Account media listing failed.');
  if(!listed.data.length)return {done:true};
  const safe=name=>typeof name==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(name)&&!['.','..'].includes(name);
  const first=listed.data[0];if(!safe(first.name))throw new ApiError('failed-precondition','Unexpected media namespace.');
  let folder=root,files=listed.data;
  if(first.id===null&&first.metadata===null){
   if(!['photos','requests','verification'].includes(scope))throw new ApiError('failed-precondition','Unexpected nested media folder.');
   folder=root+'/'+first.name;const nested=await store.list(folder,{limit:21,offset:0,sortBy:{column:'name',order:'asc'}});
   if(nested.error||!Array.isArray(nested.data)||!nested.data.length)throw new ApiError('unavailable','Account media folder needs reconciliation.');files=nested.data;
  }
  const paths=files.slice(0,20).map(file=>{if(!safe(file.name)||file.id===null&&file.metadata===null)throw new ApiError('failed-precondition','Unexpected account media object.');const path=folder+'/'+file.name;pathOK(path);if(!path.startsWith(root+'/'))throw new ApiError('failed-precondition','Media ownership mismatch.');return path;});
  const removed=await store.remove(paths);if(removed.error)throw new ApiError('unavailable','Account media removal failed.');
  // Success requires a later empty namespace scan, including orphaned files.
  return {done:false,removed:paths.length};
 }
 if(scope==='public-posts')return {purgeOwnerPage,checkOwnerReference,
  async upload(path,buffer,contentType){pathOK(path);const store=await postBucket();const {error}=await store.upload(path,buffer,{contentType,upsert:false,cacheControl:'31536000'});if(error)throw new ApiError('unavailable','Public photo storage could not accept the upload. Please try again.');},
  async inspect(path){pathOK(path);const store=await postBucket();const folder=path.slice(0,path.lastIndexOf('/')),name=path.slice(path.lastIndexOf('/')+1);const {data,error}=await store.list(folder,{limit:1,search:name});const file=data?.find(f=>f.name===name);if(error||!file)throw new ApiError('not-found','The uploaded photo is missing. Please upload it again.');return {size:Number(file.metadata?.size),contentType:file.metadata?.mimetype};},
  publicUrl(path){pathOK(path);if(!supabase)throw new ApiError('unavailable','Public post storage is not configured.');return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;}
 };
 return {purgeOwnerPage,checkOwnerReference,
  ...(scope==='profiles'?{bucket}:{}),
  async upload(path,buffer,contentType){pathOK(path);const store=await privateBucket();const {error}=await store.upload(path,buffer,{contentType,upsert:false,cacheControl:'0'});if(error)throw new ApiError('unavailable','Private storage could not accept the upload. Please try again.');},
  async inspect(path){pathOK(path);const store=await privateBucket();const folder=path.slice(0,path.lastIndexOf('/')),name=path.slice(path.lastIndexOf('/')+1);const {data,error}=await store.list(folder,{limit:1,search:name});const file=data?.find(f=>f.name===name);if(error||!file)throw new ApiError('not-found','The uploaded file is missing. Please upload it again.');return {size:Number(file.metadata?.size),contentType:file.metadata?.mimetype};},
  async signedUrl(path){pathOK(path);const store=await privateBucket();const {data,error}=await store.createSignedUrl(path,60);if(error||!data?.signedUrl)throw new ApiError('unavailable','Unable to open the private file.');return data.signedUrl;},
  ...(scope==='showcase'?{}:{async remove(path){pathOK(path);const store=await privateBucket();const {error}=await store.remove([path]);if(error)throw new ApiError('unavailable','File cleanup failed.');}})
 };
}
// Persist bucket identity for new media; never reinterpret an untagged legacy
// reference as belonging to the newly configured bucket.
function createMediaStorage({url,key,client,bucket,legacyBucket,scope}){
 const primary=createStorage({url,key,client,bucket,scope});
 const legacy=legacyBucket?createStorage({url,key,client,bucket:legacyBucket,scope:scope==='showcase'?'public-posts':scope}):null;
 return {bucket,checkOwnerReference(uid,reference){const selected=reference.bucket===bucket?primary:legacy&&(!reference.bucket||reference.bucket===legacyBucket)?legacy:null;if(!selected)throw new ApiError('failed-precondition','The original media bucket needs reconciliation.');selected.checkOwnerReference(uid,reference);},purgeOwnerPage:async uid=>{const first=await primary.purgeOwnerPage(uid);if(!first.done)return first;return legacy?legacy.purgeOwnerPage(uid):first;},upload:primary.upload,inspect:primary.inspect,signedUrl:primary.signedUrl,
  forReference(reference){
   if(reference.bucket===bucket)return primary;
   if(legacy&&(!reference.bucket||reference.bucket===legacyBucket))return legacy;
   throw new ApiError('failed-precondition','The original media bucket is unavailable. Contact the project administrator.');
  }
 };
}
module.exports={createStorage,createMediaStorage};
