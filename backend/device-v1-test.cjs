// Explicitly approved V1 only. All real writes still use existing Express services.
const fs=require('node:fs'),http=require('node:http'),{createHash,randomUUID}=require('node:crypto'),multer=require('multer');
const CUSTOMER='aT6RWRl4AtQjtJKYIiD39eaR3x73',VEHICLE='78gG6bPHbGvCTOCuZAwR';
const HASH='7791330cf1138b83d7acee0022af9ecf7607bd7e25f38451c4f02f4e4c8dda09';
const NAME='pmr-synthetic-20261019-01.png',REQUEST='pmr_media_20261019_01_vehicle';
const UPLOAD=`/api/photos/vehicles/${VEHICLE}/1?version=0&requestId=${REQUEST}`;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function rpc(path,body,authorization,contentType='application/json'){
 return new Promise((resolve,reject)=>{
  const request=http.request({hostname:'127.0.0.1',port:3101,path,method:'POST',headers:{Authorization:authorization,'Content-Type':contentType,'Content-Length':Buffer.byteLength(body)}},response=>{
   const chunks=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>32768)request.destroy();else chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch{reject(Error('Local API response unavailable.'));}});
  });
  request.setTimeout(55000,()=>request.destroy(Error('Local API deadline exceeded.')));request.on('error',reject);request.end(body);
 });
}
function createV1Test({fixture,uploadStateFile,previewStateFile,verifyToken,validatePersisted,forward=rpc}){
 if(!Buffer.isBuffer(fixture)||fixture.length!==92||hash(fixture)!==HASH||!uploadStateFile||!previewStateFile||typeof verifyToken!=='function'||typeof validatePersisted!=='function')throw Error('Reviewed V1 fixture, durable budgets and identity checks are required.');
 const parser=multer({storage:multer.memoryStorage(),limits:{fileSize:93,files:1,fields:0,parts:2}}).single('file');
 const read=()=>{try{return JSON.parse(fs.readFileSync(uploadStateFile,'utf8'));}catch{return null;}};
 const reply=(res,status,body)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}};
 const fail=(res,message,status=409)=>reply(res,status,{error:{code:status===401?'unauthenticated':status===400?'invalid-argument':'failed-precondition',message}});
 async function customer(req){
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||'');if(!match)return false;
  try{const token=await verifyToken(match[1]);return token.uid===CUSTOMER&&token.email_verified===true&&token.admin!==true;}catch{return false;}
 }
 function claim(file,data){try{fs.writeFileSync(file,JSON.stringify(data,null,2),{flag:'wx'});return true;}catch{return false;}}
 const json=(path,body,authorization)=>forward(path,JSON.stringify(body),authorization);
 async function handle(req,res){
  if(req.method==='GET'&&req.url==='/__device/v1/fixture.png'){
   res.writeHead(200,{'Content-Type':'image/png','Content-Length':92,'Cache-Control':'no-store'});res.end(fixture);return true;
  }
  if(req.method!=='POST'||req.url!==UPLOAD)return false;
  if(!await customer(req)){fail(res,'Only the designated verified customer may run V1.',401);return true;}
  if(fs.existsSync(uploadStateFile)){fail(res,'The single approved upload was already attempted. Stop and inspect metadata; do not retry.');return true;}
  try{
   await new Promise((resolve,reject)=>parser(req,res,error=>error?reject(error):resolve()));
   if(req.file?.originalname!==NAME||req.file?.mimetype!=='image/png'||req.file?.buffer?.length!==92||hash(req.file.buffer)!==HASH){fail(res,'Only the exact reviewed 92-byte PNG is approved.',400);return true;}
   const before=await json('/api/photos',{op:'list',target:'vehicle',id:VEHICLE},req.headers.authorization);
   if(before.status!==200||before.body.data?.version!==0||before.body.data?.canManage!==true||before.body.data?.items?.length!==0){fail(res,'Vehicle ownership, empty slot or revision changed. No upload sent.');return true;}
   if(!claim(uploadStateFile,{state:'attempted',requestId:REQUEST,customer:CUSTOMER,vehicle:VEHICLE,createdAt:new Date().toISOString()})){fail(res,'V1 budget could not be reserved. No upload sent.');return true;}
   const boundary='pmr-v1-'+randomUUID();
   const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${NAME}"\r\nContent-Type: image/png\r\n\r\n`),fixture,Buffer.from(`\r\n--${boundary}--\r\n`)]);
   const response=await forward(UPLOAD,body,req.headers.authorization,'multipart/form-data; boundary='+boundary);
   if(response.status!==200||response.body.data?.ok!==true||response.body.data?.version!==1||response.body.data?.slot!=='1'||typeof response.body.data?.id!=='string'){
    fs.writeFileSync(uploadStateFile,JSON.stringify({state:'failed-or-uncertain',requestId:REQUEST,httpStatus:response.status},null,2));
    fail(res,'The one upload attempt did not return a verified acknowledgement. Stop; do not retry.');return true;
   }
   const result=response.body.data;
   fs.writeFileSync(uploadStateFile,JSON.stringify({state:'saved-awaiting-verification',requestId:REQUEST,result},null,2));
   if(!await validatePersisted(result.id)){fail(res,'Upload acknowledged, but persisted references need inspection. Stop; do not retry.');return true;}
   fs.writeFileSync(uploadStateFile,JSON.stringify({state:'succeeded',requestId:REQUEST,result,persistedReferencesVerified:true},null,2));
   reply(res,200,response.body);
  }catch{
   fail(res,fs.existsSync(uploadStateFile)?'Upload outcome needs inspection. The budget is closed; do not retry.':'Fixture validation or preflight failed. No upload was sent.');
  }
  return true;
 }
 async function preview(req,res,data){
  if(data?.op!=='view')return false;
  const saved=read(),asset=saved?.result?.id;
  if(Object.keys(data).sort().join(',')!=='id,op,photoId,target'||saved?.state!=='succeeded'||data.target!=='vehicle'||data.id!==VEHICLE||data.photoId!==asset){fail(res,'Only the newly created V1 asset may be previewed.');return true;}
  if(!await customer(req)){fail(res,'Only the designated customer may preview V1.',401);return true;}
  if(!claim(previewStateFile,{assetId:asset,state:'attempted',createdAt:new Date().toISOString()})){fail(res,'The single approved preview was already requested.');return true;}
  try{const response=await json('/api/photos',data,req.headers.authorization);reply(res,response.status,response.body);}catch{fail(res,'Preview acknowledgement unavailable. Do not request another signed URL.');}
  return true;
 }
 return {handle,preview};
}
function loadApprovedV1(){
 const path=require('node:path'),{parseEnv}=require('node:util');
 const root=path.resolve(__dirname,'..'),env={...parseEnv(fs.readFileSync(path.join(__dirname,'.env.local'),'utf8')),...process.env};
 const readCredential=file=>JSON.parse(fs.readFileSync(path.resolve(__dirname,file),'utf8'));
 if(!require('./check-local-config.cjs').assessLocalConfig(env,{readCredential}).ready)throw Error('Local configuration is not safe.');
 const folder=path.join(root,'.local-checks/iphone-lan-20261021'),approval=JSON.parse(fs.readFileSync(path.join(folder,'v1-approval.json'),'utf8'));
 if(approval.approved!==true||approval.firebaseProject!=='pimp-my-ride-a26fc'||approval.supabaseProject!=='nymiyrzdpjctyembixbe'||approval.customer!==CUSTOMER||approval.vehicle!==VEHICLE||approval.fixtureHash!==HASH||approval.uploads!==1||approval.previews!==1)throw Error('Explicit V1 approval required.');
 const {initializeApp,cert}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
 const credential=env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON):readCredential(env.GOOGLE_APPLICATION_CREDENTIALS);
 const app=initializeApp({projectId:'pimp-my-ride-a26fc',credential:cert(credential)},'device-v1-gateway'),auth=getAuth(app),db=getFirestore(app);
 return createV1Test({fixture:fs.readFileSync(path.join(root,'.local-checks/existing-infra-20261018-01/synthetic-media.png')),uploadStateFile:path.join(folder,'v1-upload-state.json'),previewStateFile:path.join(folder,'v1-preview-state.json'),verifyToken:token=>auth.verifyIdToken(token,true),validatePersisted:async id=>{
  if(!/^[a-f0-9-]{36}$/.test(id))return false;
  const [assetDoc,vehicleDoc]=await Promise.all([db.doc('marketplacePhotos/'+id).get(),db.doc('vehicles/'+VEHICLE).get()]);
  const asset=assetDoc.data(),vehicle=vehicleDoc.data();
  if(!asset||asset.bucket!=='vehicle-images'||asset.ownerId!==CUSTOMER||asset.vehicleId!==VEHICLE||asset.path!==`photos/${CUSTOMER}/${VEHICLE}/${id}`||asset.size!==92||asset.contentType!=='image/png'||vehicle?.ownerId!==CUSTOMER||vehicle?.photoSlots?.['1']!==id||vehicle?.photoRevision!==1||!/^[a-f0-9]{64}$/.test(asset.uploadAttemptId||''))return false;
  const ledger=(await db.doc('storagePhotosUploadAttempts/'+asset.uploadAttemptId).get()).data();
  return ledger?.state==='referenced'&&ledger.assetId===id&&ledger.bucket==='vehicle-images'&&ledger.path===asset.path;
 }});
}
module.exports={createV1Test,loadApprovedV1,UPLOAD,NAME,HASH,CUSTOMER,VEHICLE};
