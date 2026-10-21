// Offline only: no SDK clients, authentication, network calls or secret output.
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util');
const {storageConfig,listenHost}=require('./config.cjs');
const PROJECT='pimp-my-ride-a26fc',SUPABASE='nymiyrzdpjctyembixbe';
function assessLocalConfig(env,{readCredential,envFilePresent=true,nodeMajor=Number(process.versions.node.split('.')[0])}={}){
 // Validate routing independently of credential presence; the real key is checked below.
 // This placeholder is used only by the pure config parser, never by an SDK client.
 let config=null;try{config=storageConfig({...env,SUPABASE_SECRET_KEY:'offline-config-validation'});}catch{}
 let serverKeyType='missing-or-invalid';
 const key=env.SUPABASE_SECRET_KEY||'';
 if(/^sb_secret_[A-Za-z0-9_-]+$/.test(key))serverKeyType='secret';
 else try{
  const parts=key.split('.'),claims=JSON.parse(Buffer.from(parts[1]||'','base64url').toString());
  if(parts.length===3&&claims.role==='service_role'&&(!claims.ref||claims.ref===SUPABASE))serverKeyType='legacy-service-role';
 }catch{}
 let credential=null;
 try{credential=env.FIREBASE_SERVICE_ACCOUNT_JSON?JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON):env.GOOGLE_APPLICATION_CREDENTIALS&&readCredential?readCredential(env.GOOGLE_APPLICATION_CREDENTIALS):null;}catch{}
 let host=null;try{host=listenHost(env);}catch{}
 const checks={
  ignoredEnvFilePresent:envFilePresent,node22:nodeMajor===22,
  developmentMode:env.NODE_ENV==='development',loopbackBinding:host==='127.0.0.1',
  firebaseProject:env.FIREBASE_PROJECT_ID===PROJECT,
  supabaseProject:config?.url===`https://${SUPABASE}.supabase.co`,
  privateMediaBucketNames:!!config&&config.bucket==='verification'&&config.photoBucket==='vehicle-images'&&config.postsBucket==='showcase-images'&&config.requestBucket==='request-images',
  serverSideStorageKey:['secret','legacy-service-role'].includes(serverKeyType),
  firebaseServiceAccount:credential?.type==='service_account'&&credential.project_id===PROJECT&&typeof credential.private_key==='string'&&credential.private_key.includes('BEGIN PRIVATE KEY')&&typeof credential.client_email==='string'&&credential.client_email.endsWith('.gserviceaccount.com'),
  noEmulators:env.FIRESTORE_EMULATOR_HOST===undefined&&env.FIREBASE_AUTH_EMULATOR_HOST===undefined,
  noDemoOrMockPayments:env.PMR_LOCAL_DEMO!=='true'&&env.PMR_MOCK_PAYMENTS_ENABLED!=='true',
  portValid:Number.isInteger(Number(env.PORT))&&Number(env.PORT)>0&&Number(env.PORT)<=65535,
 };
 return {ready:Object.values(checks).every(value=>value===true),checks,serverKeyType,remoteCredentialAuthentication:'NOT_TESTED_OFFLINE',remoteWrites:0};
}
function inspectLocalConfig({processEnv=process.env}={}){
 const file=path.join(__dirname,'.env.local'),exists=fs.existsSync(file);
 let local={};try{if(exists)local=parseEnv(fs.readFileSync(file,'utf8'));}catch{return {ready:false,reason:'Local environment file could not be parsed; values omitted.',remoteWrites:0};}
 // Match node --env-file: an existing process variable takes precedence.
 return assessLocalConfig({...local,...processEnv},{envFilePresent:exists,readCredential:file=>JSON.parse(fs.readFileSync(path.resolve(__dirname,file),'utf8'))});
}
if(require.main===module){const result=inspectLocalConfig();console.log(JSON.stringify(result,null,2));process.exitCode=result.ready?0:1;}
module.exports={assessLocalConfig,inspectLocalConfig};
