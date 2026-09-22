function corsOrigins(value,production=false) {
 const raw=value===undefined?(production?'':'http://localhost:8081,http://127.0.0.1:8081'):value;
 const origins=raw.split(',').map(s=>s.trim()).filter(Boolean);
 for(const origin of origins) {
  let url;try{url=new URL(origin);}catch{throw Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins.');}
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password)throw Error('CORS_ORIGINS must contain exact HTTP(S) origins without paths or wildcards.');
 }
 return [...new Set(origins)];
}
module.exports={corsOrigins};
