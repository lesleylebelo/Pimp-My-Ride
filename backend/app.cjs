const express=require('express');
const helmet=require('helmet');
const {rateLimit}=require('express-rate-limit');
const multer=require('multer');
const {ApiError}=require('./errors.cjs');
const cors = require('cors');
const {corsOrigins}=require('./config.cjs');
const STATUS={'invalid-argument':400,validation_error:400,unauthenticated:401,unauthorized:401,'permission-denied':403,forbidden:403,'not-found':404,not_found:404,'already-exists':409,'failed-precondition':409,'resource-exhausted':429,'unavailable':503,'internal':500};
function createApp({services,auth,trustProxy=false,allowedOrigins=corsOrigins()}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',trustProxy);app.use(helmet());
 app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));
 app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/health',(_,res)=>res.json({ok:true}));
 const rateResponse=(req,res,next,options)=>res.status(options.statusCode).json(
  req.path==='/ai/assist'?{error:{...options.message.error,fields:{aiReason:'rate_limit'}}}:options.message);
 const limits=rateLimit({windowMs:60000,limit:90,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'resource-exhausted',message:'Too many requests. Wait a minute.'}},handler:rateResponse});
 // Separate generous pre-authentication IP budget for heartbeats; ordinary
 // shared-network presence does not consume the administrative/API IP budget.
 const sessionIps=rateLimit({windowMs:60000,limit:600,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'resource-exhausted',message:'Too many session requests. Wait a minute.'}}});
 app.use('/api',(req,res,next)=>req.path==='/session'?sessionIps(req,res,next):limits(req,res,next),async(req,res,next)=>{
  try{
   const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');
   if(!match)throw new ApiError('unauthenticated','Sign in to continue.');
   const token=await auth.verifyIdToken(match[1],true);
   req.identity={uid:token.uid,token};next();
  }catch{next(new ApiError('unauthenticated','Your session expired. Sign in again.'));}
 });
 const limitMessage={error:{code:'resource-exhausted',message:'Too many requests. Wait a minute.'}};
 const perUser=rateLimit({windowMs:60000,limit:60,keyGenerator:req=>req.identity.uid,standardHeaders:'draft-8',legacyHeaders:false,message:limitMessage,handler:rateResponse});
 const heartbeats=rateLimit({windowMs:60000,limit:12,keyGenerator:req=>req.identity.uid,standardHeaders:'draft-8',legacyHeaders:false,message:limitMessage});
 app.use('/api',(req,res,next)=>req.path==='/session'?heartbeats(req,res,next):perUser(req,res,next));
 const studioJson=express.json({limit:'1600kb'}),ordinaryJson=express.json({limit:'32kb'});
 app.use('/api',(req,res,next)=>(req.path==='/ai/studio'?studioJson:ordinaryJson)(req,res,next));
 const action=(fn)=>async(req,res,next)=>{try{if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')throw new ApiError('invalid-argument','Expected a JSON object.');res.json({data:await fn({auth:req.identity,data:req.body})});}catch(e){next(e);}};
 const postAction=(fn,status=200)=>async(req,res,next)=>{try{if(['POST','PATCH'].includes(req.method)&&(!req.body||Array.isArray(req.body)||typeof req.body!=='object'))throw new ApiError('validation_error','Expected a JSON object.');res.status(status).json({data:await fn({auth:req.identity,data:req.body||{},query:req.query,id:req.params.id})});}catch(e){next(e);}};
 app.get('/api/posts',postAction(services.postsList));
 app.get('/api/posts/:id',postAction(services.postDetail));
 app.post('/api/posts/:id/images/view',postAction(services.viewPostImage));
 app.patch('/api/posts/:id',postAction(services.updateShowcase));
 app.delete('/api/posts/:id',postAction(services.deleteShowcase));
 app.post('/api/admin',action(services.adminApi));
 app.post('/api/marketplace',action(services.marketplace));
 app.post('/api/messaging',action(services.messaging));
 app.post('/api/ai/assist',action(services.aiAssist));
 app.post('/api/ai/studio',action(services.aiStudio));
 app.post('/api/posts',(req,res,next)=>req.body?.op?action(services.postsApi)(req,res,next):postAction(services.createShowcase,201)(req,res,next));
 app.post('/api/photos',action(services.photosApi));
 app.post('/api/profile/photos',action(services.profilePhotos));
 app.post('/api/session',action(services.sessionEvent));
 app.post('/api/profile',action(services.completeProfile));
 app.post('/api/documents/list',action(services.listDocuments));
 let uploading=0;
 const disconnected=(req,res)=>req.aborted||res.destroyed;
 const uploadSlot=(req,res,next)=>{
  if(disconnected(req,res))return;
  if(uploading>=2)return next(new ApiError('resource-exhausted','The upload service is busy. Please try again shortly.'));
  uploading++;let released=false,processing=false;
  const release=()=>{
   if(released)return;released=true;uploading--;
   req.off('aborted',close);res.off('finish',close);res.off('close',close);
  };
  // A closed connection can free an interrupted parser. Once service work has
  // begun, its buffers and storage calls stay counted until that work settles.
  const close=()=>{if(!processing)release();};
  req.uploadSlot={release,start:()=>{
   if(released||disconnected(req,res)){release();return false;}
   processing=true;return true;
  }};
  req.once('aborted',close);res.once('finish',close);res.once('close',close);next();
 };
 const uploadAction=fn=>async(req,res,next)=>{
  if(!req.uploadSlot.start())return;
  try{const data=await fn(req);if(!disconnected(req,res))res.json({data});}
  catch(e){if(!disconnected(req,res))next(e);}
  finally{req.uploadSlot.release();}
 };
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5242880,files:1,fields:0,parts:1}}).single('file');
 const uploadLimit=rateLimit({windowMs:60000,limit:6,keyGenerator:req=>req.identity.uid,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{code:'resource-exhausted',message:'Please wait a minute before uploading more files.'}}});
 app.post('/api/documents/:kind',uploadLimit,async(req,res,next)=>{try{await services.checkUpload({auth:req.identity,kind:req.params.kind});next();}catch(e){next(e);}},uploadSlot,upload,
  uploadAction(req=>services.uploadDocument({auth:req.identity,kind:req.params.kind,file:req.file})));
 app.post('/api/photos/vehicles/:vehicleId/:slot',uploadLimit,async(req,res,next)=>{
  try{
   if(Object.keys(req.query).some(key=>!['version','requestId'].includes(key))||typeof req.query.version!=='string'||!/^(0|[1-9]\d{0,15})$/.test(req.query.version)||typeof req.query.requestId!=='string')throw new ApiError('invalid-argument','Include a valid photo version and retry identifier.');
   req.photoRequest={auth:req.identity,vehicleId:req.params.vehicleId,slot:req.params.slot,version:Number(req.query.version),requestId:req.query.requestId};
   await services.checkPhotoUpload(req.photoRequest);next();
  }catch(e){next(e);}
 },uploadSlot,upload,uploadAction(req=>services.uploadPhoto({...req.photoRequest,file:req.file})));
 app.post('/api/photos/requests/:vehicleId',uploadLimit,async(req,res,next)=>{
  try{
   if(Object.keys(req.query).some(key=>!['version','requestId'].includes(key))||typeof req.query.version!=='string'||!/^(0|[1-9]\d{0,15})$/.test(req.query.version)||typeof req.query.requestId!=='string')throw new ApiError('invalid-argument','Include a valid photo version and retry identifier.');
   req.photoRequest={auth:req.identity,target:'request',vehicleId:req.params.vehicleId,slot:'1',version:Number(req.query.version),requestId:req.query.requestId};
   await services.checkPhotoUpload(req.photoRequest);next();
  }catch(e){next(e);}
 },uploadSlot,upload,uploadAction(req=>services.uploadPhoto({...req.photoRequest,file:req.file})));
 app.post('/api/profile/photos/upload',uploadLimit,async(req,res,next)=>{
  try{
   if(Object.keys(req.query).some(key=>!['version','requestId'].includes(key))||typeof req.query.version!=='string'||!/^(0|[1-9]\d{0,15})$/.test(req.query.version)||typeof req.query.requestId!=='string')throw new ApiError('invalid-argument','Include a valid photo version and retry identifier.');
   req.profilePhotoRequest={auth:req.identity,version:Number(req.query.version),requestId:req.query.requestId};
   await services.checkProfilePhotoUpload(req.profilePhotoRequest);next();
  }catch(e){next(e);}
 },uploadSlot,upload,uploadAction(req=>services.uploadProfilePhoto({...req.profilePhotoRequest,file:req.file})));
 app.post('/api/posts/images',uploadLimit,uploadSlot,upload,uploadAction(req=>services.uploadPostImage({auth:req.identity,file:req.file})));
 app.use((req,res)=>res.status(404).json({error:{code:'not-found',message:'Endpoint not found.'}}));
 app.use((e,req,res,next)=>{
  let code=e instanceof ApiError?e.code:'internal',message=e instanceof ApiError?e.message:'The server could not complete this action. Refresh before retrying.';
  const restPosts=req.path==='/api/posts'||req.path.startsWith('/api/posts/');
  if(restPosts)code=({'invalid-argument':'validation_error','unauthenticated':'unauthorized','permission-denied':'forbidden','not-found':'not_found'})[code]||code;
  if(e instanceof multer.MulterError){code='invalid-argument';message='Upload one file up to 5 MB.';}
  if(e.type==='entity.parse.failed'){code='invalid-argument';message='Invalid JSON request.';}
  if(e.type==='entity.too.large'){code='invalid-argument';message='Request is too large.';}
  const status=STATUS[code]||500;
  if(code==='internal'){
   const redact=value=>String(value||'').replace(/([?&](?:token|signature|x-amz-signature|x-amz-credential)=)[^&\s]+/gi,'$1[redacted]');
   console.error(`API operation failed: method=${req.method} path=${req.path} status=${status} error.code=${redact(e.code||'unknown')} error.message=${redact(e.message||e)}\nerror.stack=${redact(e.stack||'(no stack available)')}`); // Never log request bodies or signed URL credentials.
  }
  res.status(status).json({error:{code,message,...(e instanceof ApiError&&e.fields?{fields:e.fields}:{}),...(e instanceof ApiError&&e.retryWithNewRequest===true?{retryWithNewRequest:true}:{})}});
 });
 return app;
}
module.exports={createApp};
