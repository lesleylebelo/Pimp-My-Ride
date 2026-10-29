const {rateLimit}=require('express-rate-limit');
const READS=Object.assign(Object.create(null),{account:new Set(['profile','status']),'service-reviews':new Set(['bookingReview','workshopReviews']),admin:new Set(['serviceReviews']),marketplace:new Set(['paymentSimulation','vehicles','categories','shops','requests','request','quotes','bookings','booking','notifications','notificationSummary','receipt']),messaging:new Set(['list','get','summary']),posts:new Set(['feed','mine','saved','get']),photos:new Set(['list']),'/profile/photos':new Set(['status'])});
function category(req){
 const path=req.path.toLowerCase().replace(/\/+$/,'')||'/',op=req.body?.op;
 if(path==='/session')return 'session';
 if(path==='/profile'||path==='/auth/google/authorize')return 'identity';
 if(path==='/ai/assist'||path==='/ai/studio')return 'mutation';
 if(['GET','HEAD'].includes(req.method)&&(path==='/posts'||/^\/posts\/[^/]+$/.test(path)))return 'read';
 if(req.method==='POST'&&(/^\/posts\/[^/]+\/images\/view$/.test(path)||['/photos','/profile/photos'].includes(path)&&op==='view'))return 'media';
 if(req.method==='POST'&&(READS[path.slice(1)]||READS[path])?.has(op))return 'read';
 if(req.method==='POST'&&path==='/documents/list')return 'read';
 return 'mutation'; // Unknown operations never enter a cheaper read policy.
}
function limiter({name,limit,keyGenerator,skipSuccessfulRequests=false,requestWasSuccessful}){
 return rateLimit({windowMs:60000,limit,identifier:name,keyGenerator,skipSuccessfulRequests,...(requestWasSuccessful?{requestWasSuccessful}:{}),
  standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>{
   const retryAfter=Math.max(1,Number(res.getHeader('Retry-After'))||60);
   res.status(429).json({error:{code:'resource-exhausted',message:'Too many requests. Wait a minute.',retryAfter,policy:name,
    ...(req.path==='/ai/assist'?{fields:{aiReason:'rate_limit'}}:{})}});
  }});
}
function policies(){
 const byUid=req=>req.identity.uid;
 const buckets=Object.fromEntries(Object.entries({read:60,media:60,mutation:60,identity:12,session:12}).map(([name,limit])=>[name,limiter({name,limit,keyGenerator:byUid})]));
 // Successful Firebase verification refunds the pre-auth IP attempt, including
 // service-level permission errors. Shared NATs do not accumulate valid traffic.
 const authentication=limiter({name:'authentication-ip',limit:90,skipSuccessfulRequests:true,requestWasSuccessful:req=>!!req.identity});
 return {authentication,apply(req,res,next){req.requestCategory=category(req);return buckets[req.requestCategory](req,res,next);}};
}
// Fixed-cardinality aggregates only: no URL, operation body, UID, IP or token.
function metrics(app,log){
 let counts={},started=Date.now();
 app.locals.requestMetrics=()=>structuredClone(counts);
 return (req,res,next)=>{
  const start=performance.now();res.once('finish',()=>{
   const key=`${req.requestCategory||'authentication'}:${res.statusCode}`,entry=counts[key]||(counts[key]={requests:0,totalMs:0,maxMs:0});
   const elapsed=Math.round((performance.now()-start)*100)/100;entry.requests++;entry.totalMs+=elapsed;entry.maxMs=Math.max(entry.maxMs,elapsed);
   if(Date.now()-started>=60000){log({event:'api_request_metrics',windowMs:Date.now()-started,buckets:counts});counts={};started=Date.now();}
  });next();
 };
}
module.exports={category,policies,metrics,limiter};
