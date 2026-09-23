// Operator-run Firestore reads only. No Supabase client or deletion capability.
const {createPhotoCleanup,APPLY_ERROR}=require('../backend/photo-cleanup.cjs');
const {errorCode}=require('../backend/cleanup.cjs');
const USAGE='Usage: node scripts/cleanup-photos.cjs --project PROJECT_ID [--limit 100] [--after ATTEMPT_HASH]';
const EMULATOR_ERROR='Photo reports require a loopback Firestore emulator and a demo- project ID when using an emulator.';
const DEMO_ERROR='A demo- project requires a local Firestore emulator.';
function options(args){
 if(args.some(arg=>arg==='--apply'||arg.startsWith('--apply=')))throw Error(APPLY_ERROR);
 if(args.length===1&&args[0]==='--help')return null;
 const values={};for(let i=0;i<args.length;i+=2){
  if(!['--project','--limit','--after'].includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw Error(USAGE);
  values[args[i]]=args[i+1];
 }
 if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(values['--project']||''))throw Error(USAGE);
 const limit=Number(values['--limit']||100),cursor=values['--after']||null;
 if(!Number.isInteger(limit)||limit<1||limit>500||(cursor&&!/^[a-f0-9]{64}$/.test(cursor)))throw Error(USAGE);
 return {projectId:values['--project'],limit,cursor};
}
function validateEnvironment(input,env=process.env){
 const host=env.FIRESTORE_EMULATOR_HOST;
 if(host){
  if(!/^(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(host)||!input.projectId.startsWith('demo-'))throw Error(EMULATOR_ERROR);
  const port=Number(host.slice(host.lastIndexOf(':')+1));if(port<1||port>65535)throw Error(EMULATOR_ERROR);
 }else if(input.projectId.startsWith('demo-'))throw Error(DEMO_ERROR);
}
async function main(args){
 const input=options(args);if(!input){console.log(USAGE);return;}
 validateEnvironment(input);
 // Load credentials only after rejecting apply and checking project/emulator.
 const {initializeApp,applicationDefault,cert,deleteApp}=require('firebase-admin/app');
 const {getFirestore}=require('firebase-admin/firestore');
 let credential;
 if(!process.env.FIRESTORE_EMULATOR_HOST){
  if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
   let key;try{key=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw Error('Invalid server credential configuration.');}
   if(key.project_id!==input.projectId)throw Error('Credential project does not match requested project.');
   credential=cert(key);
  }else credential=applicationDefault();
 }
 const app=initializeApp({projectId:input.projectId,...(credential?{credential}:{})}),db=getFirestore(app);
 try{
  const report=await createPhotoCleanup({db}).report(input);
  console.log(JSON.stringify(report,null,2));
  if(report.counts.failedChecks||report.paginationBlocked)process.exitCode=2;
 }finally{await db.terminate();await deleteApp(app);}
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{
 const safe=[USAGE,APPLY_ERROR,EMULATOR_ERROR,DEMO_ERROR,'Invalid server credential configuration.','Credential project does not match requested project.'];
 console.error(safe.includes(error.message)?error.message:`Photo report failed (${errorCode(error)}). No changes made.`);process.exitCode=1;
});
module.exports={options,validateEnvironment};
