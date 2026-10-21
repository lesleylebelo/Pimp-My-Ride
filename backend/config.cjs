function corsOrigins(value,production=false) {
 const raw=value===undefined?(production?'':'http://localhost:8081,http://127.0.0.1:8081'):value;
 const origins=raw.split(',').map(s=>s.trim()).filter(Boolean);
 for(const origin of origins) {
  let url;try{url=new URL(origin);}catch{throw Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins.');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password)throw Error('CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards.');
 }
 return [...new Set(origins)];
}
function storageConfig(env=process.env) {
 const urlValue=typeof env.SUPABASE_URL==='string'?env.SUPABASE_URL.trim():'';
 const key=typeof env.SUPABASE_SECRET_KEY==='string'?env.SUPABASE_SECRET_KEY.trim():'';
 if(!urlValue)throw Error('Set SUPABASE_URL.');
 if(!key)throw Error('Set SUPABASE_SECRET_KEY.');
 let url;try{url=new URL(urlValue);}catch{throw Error('SUPABASE_URL must be a valid HTTPS URL.');}
 const localHttp=env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!localHttp)||url.username||url.password||url.search||url.hash)throw Error('SUPABASE_URL must be an HTTPS endpoint without credentials, query parameters or fragments.');
 const buckets={
  bucket:env.SUPABASE_BUCKET||'verification',
  photoBucket:env.SUPABASE_PHOTO_BUCKET||'vehicle-images',
  requestBucket:env.SUPABASE_REQUEST_BUCKET||'request-images',
  legacyPhotoBucket:env.SUPABASE_LEGACY_PHOTO_BUCKET||'marketplace-photos',
  legacyPostsBucket:env.SUPABASE_LEGACY_POSTS_BUCKET||'public-posts',
  postsBucket:env.SUPABASE_POSTS_BUCKET||'showcase-images',
 };
 for(const [name,bucket] of Object.entries(buckets))if(typeof bucket!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(bucket))throw Error(`Invalid ${name} configuration.`);
 if(new Set(Object.values(buckets)).size!==Object.keys(buckets).length)throw Error('Verification, new media and legacy buckets must be distinct.');
 return {url:urlValue.replace(/\/+$/,''),key,...buckets};
}
function validateEmulatorHost(name,value) {
 if(value===undefined)return;
 const match=/^(?:\[([0-9a-fA-F:.]+)\]|([A-Za-z0-9.-]+)):([0-9]{1,5})$/.exec(value);
 const port=match?Number(match[3]):0;
 if(!match||port<1||port>65535)throw Error(`${name} must be a host and port, such as localhost:8080.`);
}
function listenHost(env=process.env){
 const host=env.HOST||'0.0.0.0';
 if(!['127.0.0.1','0.0.0.0','::1'].includes(host))throw Error('HOST must be 127.0.0.1, ::1 or 0.0.0.0.');
 return host;
}
module.exports={corsOrigins,storageConfig,validateEmulatorHost,listenHost};
