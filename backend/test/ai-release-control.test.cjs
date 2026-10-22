const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAIReleaseControl,CONTROL_PATH}=require('../ai-release-control.cjs');
const {createAIAssist}=require('../ai-assist.cjs');
function store(){
 let row,tail=Promise.resolve(),writes=0;
 return {get writes(){return writes;},seed(value){row=value;},doc(path){assert.equal(path,CONTROL_PATH);return {path};},
  runTransaction(fn){
   const result=tail.then(async()=>{
    let pending;
    const value=await fn({get:async()=>({exists:row!==undefined,data:()=>row}),create(ref,data){assert.equal(ref.path,CONTROL_PATH);assert.equal(row,undefined);pending=data;}});
    if(pending){row=pending;writes++;}return value;
   });tail=result.catch(()=>{});return result;
  }};
}
const env={PMR_AI_TEST_UID:'designated-test-account'};
const input={kind:'showcase',title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint'};
const output={title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint',missingDetails:[]};
const identity=uid=>({auth:{uid},data:input});
function assist(db,provider,options={}){
 return createAIAssist({db,provider,releaseControl:createAIReleaseControl({db,env}),actor:async request=>({uid:request.auth.uid,profile:{role:'shop',accountStatus:'active',verificationStatus:'approved'}}),...options});
}
test('release access fails closed without a designated UID and denies everyone else without quota writes',async()=>{
 const db=store();for(const config of [{},{PMR_AI_TEST_UID:' '},{PMR_AI_TEST_UID:'bad uid'}]){
  assert.throws(()=>createAIReleaseControl({db,env:config}).authorize('designated-test-account'),{code:'unavailable'});
 }
 const provider={enabled:true,suggest:async()=>assert.fail('An unrelated account must not call AI')};
 await assert.rejects(()=>assist(db,provider)(identity('other')),{code:'permission-denied'});assert.equal(db.writes,0);
});
test('initial release has one durable global attempt across concurrent instances, users and restarts',async()=>{
 const db=store();let calls=0;const provider={enabled:true,suggest:async()=>{calls++;return output;}};
 const results=await Promise.allSettled(Array.from({length:8},()=>assist(db,provider)(identity('designated-test-account'))));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='resource-exhausted').length,7);
 assert.equal(calls,1);assert.equal(db.writes,1);
 await assert.rejects(()=>assist(db,provider)(identity('designated-test-account')),{code:'resource-exhausted'});
 const changed=createAIReleaseControl({db,env:{PMR_AI_TEST_UID:'replacement-account'}});changed.authorize('replacement-account');
 await assert.rejects(()=>changed.reserve(),{code:'resource-exhausted'});assert.equal(calls,1);
});
test('provider failure or timeout consumes the allowance without a refund or a retry',async()=>{
 for(const timeout of [false,true]){
  const db=store();let calls=0;
  const provider={enabled:true,suggest:async()=>{calls++;if(timeout)return new Promise(()=>{});throw Error('Sensitive provider error');}};
  await assert.rejects(()=>assist(db,provider,{timeoutMs:5})(identity('designated-test-account')),{code:'unavailable'});
  await assert.rejects(()=>assist(db,provider)(identity('designated-test-account')),{code:'resource-exhausted'});
  assert.equal(calls,1);assert.equal(db.writes,1);
 }
});
test('disabled AI, invalid input, or unavailable/corrupt quota storage never calls the provider',async()=>{
 const db=store();let calls=0;const provider={enabled:true,suggest:async()=>{calls++;return output;}};
 await assert.rejects(()=>assist(db,{...provider,enabled:false})(identity('designated-test-account')),{code:'unavailable'});
 await assert.rejects(()=>assist(db,provider)({...identity('designated-test-account'),data:{...input,photos:[]}}),{code:'invalid-argument'});
 assert.equal(db.writes,0);
 for(const row of [{},{version:2,attempts:1},{version:1,attempts:0},{version:1,attempts:-1}]){
  db.seed(row);await assert.rejects(()=>assist(db,provider)(identity('designated-test-account')),{code:'unavailable'});
 }
 db.runTransaction=async()=>{throw Error('Database unavailable');};
 await assert.rejects(()=>assist(db,provider)(identity('designated-test-account')),{code:'unavailable'});assert.equal(calls,0);
});
