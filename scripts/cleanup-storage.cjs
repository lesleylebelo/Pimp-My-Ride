// Operator-run, read-only report. No scheduler, Storage credentials, or deletes.
const {createCleanup,errorCode}=require('../backend/cleanup.cjs');
const USAGE='Usage: node scripts/cleanup-storage.cjs --project PROJECT_ID [--source cleanup|attempts] [--limit 100] [--after TASK_ID]';
function options(args){
 if(args.length===1&&args[0]==='--help')return null;
 const values={};for(let i=0;i<args.length;i+=2){
  if(args[i]==='--apply')throw Error('Deletion is not implemented. Retention policy approval is required.');
  if(!['--project','--source','--limit','--after'].includes(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw Error(USAGE);
  values[args[i]]=args[i+1];
 }
 if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(values['--project']||''))throw Error(USAGE);
 const source=values['--source']||'cleanup',limit=Number(values['--limit']||100),cursor=values['--after']||null;
 if(!['cleanup','attempts'].includes(source)||!Number.isInteger(limit)||limit<1||limit>500||(cursor&&!/^[A-Za-z0-9_-]{1,128}$/.test(cursor)))throw Error(USAGE);
 return {projectId:values['--project'],source,limit,cursor};
}
async function main(args){
 const input=options(args);if(!input){console.log(USAGE);return;}
 const {initializeApp,applicationDefault,cert}=require('firebase-admin/app');
 const {getFirestore}=require('firebase-admin/firestore');
 let credential;
 if(process.env.FIRESTORE_EMULATOR_HOST){if(!input.projectId.startsWith('demo-'))throw Error('Emulator reports require a demo- project ID.');}
 else if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
  let key;try{key=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw Error('Invalid server credential configuration.');}
  if(key.project_id!==input.projectId)throw Error('Credential project does not match requested project.');
  credential=cert(key);
 }else credential=applicationDefault();
 const app=initializeApp({projectId:input.projectId,...(credential?{credential}:{})});
 const db=getFirestore(app);
 try{
  const report=await createCleanup({db}).report(input);
  console.log(JSON.stringify(report,null,2));
  if(report.counts.failedChecks)process.exitCode=2;
 }finally{await db.terminate();}
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{
 // Only known local usage errors are printable. Service error messages can
 // contain private document paths or credential material.
 const safe=[USAGE,'Deletion is not implemented. Retention policy approval is required.','Emulator reports require a demo- project ID.','Invalid server credential configuration.','Credential project does not match requested project.'];
 console.error(safe.includes(error.message)?error.message:`Report failed (${errorCode(error)}). No changes made.`);process.exitCode=1;
});
module.exports={options};
