const {test,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createAIReleaseControl,CONTROL_PATH,DAILY_PREFIX,ATTEMPT_PREFIX}=require('../ai-release-control.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'ai-release-tests'),db=getFirestore(app);
const day='2040-01-02';
after(async()=>{await db.doc(DAILY_PREFIX+'/'+day).delete();await db.doc(DAILY_PREFIX+'/2040-01-03').delete();const rows=await db.collection(ATTEMPT_PREFIX).get();for(const row of rows.docs)await row.ref.delete();await db.terminate();await deleteApp(app);});
test('real transactions allow five globally across instances and preserve historical allowance',async()=>{
 const history=db.doc(CONTROL_PATH);if(!(await history.get()).exists)await history.create({version:1,attempts:1});
 const before=await history.get();
 const reserve=async()=>{const control=createAIReleaseControl({db,env:{PMR_AI_TEST_UIDS:'synthetic-tester,another-tester'},now:()=>Date.parse(day+'T12:00:00Z')});control.authorize('synthetic-tester');return control.reserve();};
 const results=await Promise.allSettled(Array.from({length:12},reserve));
 assert.equal(results.filter(value=>value.status==='fulfilled').length,5);
 assert.equal(results.filter(value=>value.status==='rejected'&&value.reason.code==='resource-exhausted').length,7);
 await assert.rejects(reserve,{code:'resource-exhausted'});
 assert.deepEqual((await db.doc(DAILY_PREFIX+'/'+day).get()).data(),{version:1,day,attempts:5});
 const attempt=results.find(value=>value.status==='fulfilled').value;
 const ref=db.doc(ATTEMPT_PREFIX+'/'+attempt.correlationId);assert.equal((await ref.get()).data().state,'unknown');
 await attempt.dispatch();await attempt.response(200);await attempt.finish({outputValidated:true});
 const data=(await ref.get()).data();assert.equal(data.state,'successful');assert.ok(data.reservedAt.toDate() instanceof Date);assert.equal(data.providerHttpStatus,200);
 const after=await history.get();assert.deepEqual(after.data(),before.data());assert.ok(after.updateTime.isEqual(before.updateTime));
});
test('existing rules deny direct-client history, daily quota and diagnostic access',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const {doc,getDoc,setDoc,deleteDoc}=require('firebase/firestore');
 const address=new URL('http://'+process.env.FIRESTORE_EMULATOR_HOST);
 const environment=await initializeTestEnvironment({projectId:'demo-pmr-security',firestore:{host:address.hostname,port:Number(address.port),rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
 try{
  for(const [uid,claims] of [['synthetic-owner',{}],['synthetic-shop',{}],['synthetic-admin',{admin:true}]]){
   for(const path of [CONTROL_PATH,DAILY_PREFIX+'/'+day,ATTEMPT_PREFIX+'/synthetic-attempt']){
    const ref=doc(environment.authenticatedContext(uid,claims).firestore(),path);
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,{version:1,attempts:0}));await assertFails(deleteDoc(ref));
   }
  }
 }finally{await environment.cleanup();}
});

test('Gemini 3.5 mocked dispatch preserves real persistent quota and failure diagnostics',async()=>{
 const {createAIProvider}=require('../ai-provider.cjs'),{createAIAssist}=require('../ai-assist.cjs');
 const env={PMR_AI_ASSIST_ENABLED:'true',PMR_AI_PROVIDER:'gemini',PMR_AI_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'synthetic-key',PMR_AI_TEST_UIDS:'synthetic-tester,another-tester'};
 const control=createAIReleaseControl({db,env,now:()=>Date.parse('2040-01-03T12:00:00Z')});
 const input={kind:'showcase',title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint'};
 const output={title:input.title,description:input.description,categoryId:input.categoryId,missingDetails:[]};
 const response=value=>JSON.stringify({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:'synthetic reasoning',thought:true},{text:JSON.stringify(value),thought:false,thoughtSignature:'synthetic-opaque-signature'}]}}]});
 const replies=[{status:200,text:response({...output,description:'I would like my doors wrapped in black.',missingDetails:['What is your budget?']})},{status:404,text:''},{status:200,text:'not JSON'},
  {status:200,text:response({...output,description:'Invented turbo gains.'})},{status:200,text:response(output)}];let calls=0;
 const provider=createAIProvider({env,fetcher:async(url,options)=>{
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(Object.hasOwn(JSON.parse(options.body).generationConfig,'candidateCount'),false);
  const reply=replies[calls++];assert.ok(reply,'no sixth dispatch');return {status:reply.status,ok:reply.status===200,text:async()=>reply.text};
 }});
 const actor=async request=>({uid:request.auth.uid,profile:{role:'shop',accountStatus:'active',verificationStatus:'approved'}});
 const assist=createAIAssist({db,actor,provider,releaseControl:control});
 const request=uid=>({auth:{uid},data:input});
 await assert.rejects(()=>assist(request('unlisted')),{code:'permission-denied'});assert.equal(calls,0);
 for(const [index,reason] of [null,'model_unavailable','malformed_output','grounding_rejected',null].entries()){
  const run=()=>assist(request(index%2?'another-tester':'synthetic-tester'));
  if(reason)await assert.rejects(run,{reason});else assert.equal((await run()).title,input.title);
 }
 // Another process has fresh minute counters but shares the exhausted daily quota.
 const restarted=createAIAssist({db,actor,provider,releaseControl:createAIReleaseControl({db,env,now:()=>Date.parse('2040-01-03T12:00:00Z')})});
 await assert.rejects(()=>restarted(request('synthetic-tester')),{code:'resource-exhausted'});assert.equal(calls,5);
 const counter=(await db.doc(DAILY_PREFIX+'/2040-01-03').get()).data();assert.equal(counter.attempts,5);
 const rows=(await db.collection(ATTEMPT_PREFIX).where('day','==','2040-01-03').get()).docs.map(doc=>doc.data());
 assert.equal(rows.length,5);assert.equal(rows.filter(row=>row.state==='successful'&&row.outputValidated===true).length,2);
 assert.deepEqual(rows.filter(row=>row.state==='failed').map(row=>row.reasonCode).sort(),['grounding_rejected','malformed_output','model_unavailable']);
 const rejected=rows.find(row=>row.reasonCode==='grounding_rejected');assert.equal(rejected.rejectedField,'description');assert.equal(rejected.validationRule,'new_content_term');
 const malformed=rows.find(row=>row.reasonCode==='malformed_output');assert.equal(malformed.outputStage,'envelope');assert.equal(malformed.outputRule,'envelope_json');
 assert.ok(rows.every(row=>!JSON.stringify(row).includes('synthetic reasoning')));
 assert.ok(rows.every(row=>!JSON.stringify(row).includes('Invented turbo')&&!JSON.stringify(row).includes('What is your budget')));
 assert.ok(rows.every(row=>row.dispatchInitiatedAt&&row.responseReceivedAt));assert.equal(rows.find(row=>row.reasonCode==='model_unavailable').providerHttpStatus,404);
});
