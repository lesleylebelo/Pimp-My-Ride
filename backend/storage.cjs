const {createClient}=require('@supabase/supabase-js');
const {ApiError}=require('./errors.cjs');
function createStorage({url,key,bucket='verification',client,scope='verification'}){
 if(!['verification','photos'].includes(scope))throw new Error('Unknown private storage scope.');
 const allowedPath=scope==='photos'?/^photos\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/:/^verification\/[A-Za-z0-9_-]+\/(cipcCert|proofOfAddress|ownerId)\/[a-f0-9-]+$/;
 const supabase=client||(url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(25000)})}}):null);
 function pathOK(path){if(typeof path!=='string'||!allowedPath.test(path))throw new ApiError('failed-precondition','This file needs to be uploaded again.');}
 async function privateBucket(){
  if(!supabase)throw new ApiError('unavailable','Private file storage is not configured. Contact the project administrator.');
  const {data,error}=await supabase.storage.getBucket(bucket);
  if(error||!data||data.public!==false)throw new ApiError('unavailable','Private file storage is unavailable or misconfigured.');
  return supabase.storage.from(bucket);
 }
 return {
  async upload(path,buffer,contentType){pathOK(path);const store=await privateBucket();const {error}=await store.upload(path,buffer,{contentType,upsert:false,cacheControl:'0'});if(error)throw new ApiError('unavailable','Private storage could not accept the upload. Please try again.');},
  async inspect(path){pathOK(path);const store=await privateBucket();const folder=path.slice(0,path.lastIndexOf('/')),name=path.slice(path.lastIndexOf('/')+1);const {data,error}=await store.list(folder,{limit:1,search:name});const file=data?.find(f=>f.name===name);if(error||!file)throw new ApiError('not-found','The uploaded file is missing. Please upload it again.');return {size:Number(file.metadata?.size),contentType:file.metadata?.mimetype};},
  async signedUrl(path){pathOK(path);const store=await privateBucket();const {data,error}=await store.createSignedUrl(path,60);if(error||!data?.signedUrl)throw new ApiError('unavailable','Unable to open the private file.');return data.signedUrl;},
  async remove(path){pathOK(path);const store=await privateBucket();const {error}=await store.remove([path]);if(error)throw new ApiError('unavailable','File cleanup failed.');}
 };
}
module.exports={createStorage};
