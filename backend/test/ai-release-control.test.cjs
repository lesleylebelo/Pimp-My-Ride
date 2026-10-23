const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAIReleaseControl,CONTROL_PATH,DAILY_PREFIX}=require('../ai-release-control.cjs');
const {createAIAssist}=require('../ai-assist.cjs');
const {createAIProvider}=require('../ai-provider.cjs');
const {store}=require('./helpers/ai-store.cjs');
const env={PMR_AI_TEST_UIDS:'tester-a,tester-b'};
const input={kind:'showcase',title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint'};
const output={title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint',missingDetails:[]};
const identity=uid=>({auth:{uid},data:input});
function assist(db,provider,options={}){
 return createAIAssist({db,provider,releaseControl:createAIReleaseControl({db,env}),actor:async request=>({uid:request.auth.uid,profile:{role:'shop',accountStatus:'active',verificationStatus:'approved'}}),...options});
}
test('allowlist is explicit, supports multiple testers and fails closed without storage or dispatch',async()=>{
 const db=store();for(const config of [{},{PMR_AI_TEST_UIDS:''},{PMR_AI_TEST_UIDS:'bad uid'},{PMR_AI_TEST_UIDS:'a,'}])assert.throws(()=>createAIReleaseControl({db,env:config}).authorize('tester-a'),{reason:'configuration'});
 const control=createAIReleaseControl({db,env});control.authorize('tester-a');control.authorize('tester-b');
 await assert.rejects(()=>assist(db,{enabled:true,suggest:async()=>assert.fail('not authorised')})(identity('other')),{code:'permission-denied'});assert.equal(db.attempts().length,0);
});
test('five global reservations survive concurrent instances/restarts and UTC midnight selects a new day',async()=>{
 const db=store();let clock=Date.parse('2026-10-22T23:59:59Z');
 const reserve=()=>createAIReleaseControl({db,env,now:()=>clock}).reserve();
 const results=await Promise.allSettled(Array.from({length:20},reserve));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.filter(r=>r.reason?.code==='resource-exhausted').length,15);
 await assert.rejects(reserve,{code:'resource-exhausted'});assert.equal(db.attempts().length,5);
 assert.deepEqual(db.rows.get(CONTROL_PATH),{version:1,attempts:1});
 clock=Date.parse('2026-10-23T00:00:00Z');await reserve();assert.equal(db.attempts().length,6);
 assert.equal(db.rows.get(DAILY_PREFIX+'/2026-10-22').attempts,5);assert.equal(db.rows.get(DAILY_PREFIX+'/2026-10-23').attempts,1);
 assert.ok(db.attempts().every(row=>row.state==='unknown'&&row.dispatchInitiatedAt===null));
});
test('sixth request is rejected before provider dispatch; failed and timed-out requests still count',async()=>{
 for(const timeout of [false,true]){
  const db=store();let calls=0;
  const provider={enabled:true,suggest:async()=>{calls++;if(timeout)return new Promise(()=>{});throw Error('private provider detail');}};
  for(let i=0;i<5;i++)await assert.rejects(()=>assist(db,provider,{timeoutMs:5})(identity(i%2?'tester-a':'tester-b')),{code:'unavailable'});
  await assert.rejects(()=>assist(db,provider)(identity('tester-a')),{code:'resource-exhausted'});
  assert.equal(calls,5);assert.equal(db.attempts().length,5);assert.ok(db.attempts().every(row=>row.state==='failed'&&row.dispatchInitiatedAt&&row.outputValidated===false));
  if(timeout)assert.ok(db.attempts().every(row=>row.reasonCode==='provider_timeout'));
 }
});
test('storage failures and uncertain commits fail closed, with no dispatch or refund',async()=>{
 for(const mode of ['fail','uncertain','failUpdates']){
  const db=store();db[mode]=true;
  await assert.rejects(()=>assist(db,{enabled:true,suggest:async()=>assert.fail('must not dispatch')})(identity('tester-a')),{code:'unavailable'});
  assert.equal(db.attempts().length,mode==='fail'?0:1);
  assert.ok(db.attempts().every(row=>row.state==='unknown'));
 }
 const db=store(),day=new Date().toISOString().slice(0,10);db.rows.set(DAILY_PREFIX+'/'+day,{version:1,day,attempts:-1});
 await assert.rejects(()=>createAIReleaseControl({db,env}).reserve(),{reason:'quota_storage'});
});
test('content-free diagnostics distinguish provider HTTP, parsing, grounding and completion',async()=>{
 const config={PMR_AI_ASSIST_ENABLED:'true',PMR_AI_PROVIDER:'gemini',PMR_AI_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'secret-never-persist'};
 const response=value=>JSON.stringify({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(value),thoughtSignature:'synthetic-opaque-signature'}]}}]});
 for(const [status,body,reason] of [[400,JSON.stringify({error:{status:'INVALID_ARGUMENT',message:'secret-never-persist',details:[{reason:'API_KEY_INVALID'}]}}),'provider_auth'],[401,'private','provider_auth'],[403,'private','provider_auth'],[404,'private','model_unavailable'],[429,'private','provider_quota'],[500,'private','provider_http'],[200,'not JSON','malformed_output'],[200,response({...output,description:'Invented turbo gains.'}),'grounding_rejected'],[200,response(output),null]]){
  const db=store(),provider=createAIProvider({env:config,fetcher:async()=>({status,ok:status===200,text:async()=>body})});
  const run=()=>assist(db,provider)(identity('tester-a'));
  if(reason)await assert.rejects(run,{reason});else assert.equal((await run()).title,output.title);
  const row=db.attempts()[0];assert.equal(row.reasonCode,reason);assert.equal(row.providerHttpStatus,status);assert.ok(row.responseReceivedAt);assert.ok(row.dispatchInitiatedAt);assert.equal(row.state,reason?'failed':'successful');assert.equal(row.outputValidated,!reason);
  assert.match(row.correlationId,/^[a-f0-9-]{36}$/);const serial=JSON.stringify(row);for(const privateValue of ['secret-never-persist','Black wrap','tester-a','private','turbo','synthetic-opaque-signature'])assert.ok(!serial.includes(privateValue));
 }
});
test('completion storage failure never returns output, and crashes remain unknown',async()=>{
 const db=store();
 await assert.rejects(()=>assist(db,{enabled:true,suggest:async()=>{db.failUpdates=true;return output;}})(identity('tester-a')),{reason:'diagnostic_storage'});
 assert.equal(db.attempts()[0].state,'unknown');
 const other=store(),attempt=await createAIReleaseControl({db:other,env}).reserve();await attempt.dispatch();assert.equal(other.attempts()[0].state,'unknown');
});

test('a reservation crossing UTC midnight cannot dispatch using the previous day allowance',async()=>{
 const db=store();let clock=Date.parse('2026-10-22T23:59:59Z');
 const control=createAIReleaseControl({db,env,now:()=>clock}),attempt=await control.reserve();
 clock=Date.parse('2026-10-23T00:00:00Z');await assert.rejects(()=>attempt.dispatch(),{reason:'reservation_expired'});
 assert.equal(db.attempts()[0].dispatchInitiatedAt,null);assert.equal(db.attempts()[0].state,'unknown');assert.equal(db.rows.get(DAILY_PREFIX+'/2026-10-22').attempts,1);
});
