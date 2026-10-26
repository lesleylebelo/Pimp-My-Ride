const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAIAssist,MAX_CONCURRENT}=require('../ai-assist.cjs');
const {failure}=require('../ai-errors.cjs');
const input={kind:'showcase',title:'Black wrap',description:'Wrap doors in black.',categoryId:'Wrap & Paint'};
const output={title:input.title,description:input.description,categoryId:input.categoryId,missingDetails:[]};
function setup(provider,options={}){
 const diagnostics=[];
 // Any old counter access or new accounting write is a regression.
 const db={doc:()=>assert.fail('Showcase generation must not access accounting'),collection:()=>assert.fail('No historical quota queries'),runTransaction:()=>assert.fail('No quota transaction')};
 const actor=async request=>({uid:request.auth.uid,profile:{role:'shop',accountStatus:'active',verificationStatus:'approved'}});
 const run=createAIAssist({db,actor,provider:provider||{enabled:true,suggest:async()=>output},onDiagnostic:value=>diagnostics.push(value),...options});
 return {run,diagnostics,request:(uid='new-eligible-user',data=input)=>({auth:{uid},data})};
}

test('first, second, sixth, tenth and later generations never depend on allowance or tester configuration',async()=>{
 const previous=Object.fromEntries(['PMR_AI_TEST_UIDS','PMR_AI_TEST_UID'].map(key=>[key,process.env[key]]));
 try{
  for(const config of [undefined,'','someone-else','bad uid,']){
   if(config===undefined)delete process.env.PMR_AI_TEST_UIDS;else process.env.PMR_AI_TEST_UIDS=config;
   process.env.PMR_AI_TEST_UID='another-uid';let clock=Date.parse('2042-01-01T23:59:59Z');
   const f=setup(undefined,{now:()=>clock});
   for(let i=1;i<=30;i++){if(i===11)clock+=86400000;assert.equal((await f.run(f.request(i%2?'eligible-a':'eligible-b'))).title,output.title);}
   assert.equal(f.diagnostics.length,30);assert.ok(f.diagnostics.every(value=>value.state==='successful'));
  }
 }finally{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('concurrency is bounded only while work is pending and every slot recovers on completion',async()=>{
 const resolve=[];let calls=0;
 const f=setup({enabled:true,suggest:()=>{calls++;return new Promise(done=>resolve.push(done));}});
 const active=Array.from({length:MAX_CONCURRENT},(_,i)=>f.run(f.request('user-'+i)));
 while(resolve.length<MAX_CONCURRENT)await new Promise(done=>setImmediate(done));
 await assert.rejects(()=>f.run(f.request('user-extra')),{fields:{aiReason:'busy'}});
 await assert.rejects(()=>f.run(f.request('user-0')),{fields:{aiReason:'busy'}});assert.equal(calls,4);
 for(const done of resolve)done(output);await Promise.all(active);
 const next=f.run(f.request('user-extra'));while(resolve.length<5)await new Promise(done=>setImmediate(done));resolve[4](output);await next;
 assert.equal(calls,5);
});

test('matching in-flight identity and draft coalesce once; conflict, cross-account and subsequent generation remain isolated',async()=>{
 const resolve=[];let calls=0;
 const f=setup({enabled:true,suggest:()=>{calls++;return new Promise(done=>resolve.push(done));}});
 const data={...input,requestId:'ai_shared_123456'},first=f.run(f.request('a',data));
 while(!resolve.length)await new Promise(done=>setImmediate(done));
 const duplicate=f.run(f.request('a',data));
 await assert.rejects(()=>f.run(f.request('a',{...data,title:'Different draft'})),{code:'already-exists',fields:{aiReason:'request_conflict'}});
 const other=f.run(f.request('b',data));while(resolve.length<2)await new Promise(done=>setImmediate(done));assert.equal(calls,2);
 resolve[0](output);resolve[1](output);await Promise.all([first,duplicate,other]);
 const again=f.run(f.request('a',data));while(resolve.length<3)await new Promise(done=>setImmediate(done));resolve[2](output);await again;assert.equal(calls,3);
});

test('failure, timeout and dismissed clients do not consume future generation access; no provider retry',async()=>{
 for(const reason of ['provider_network','provider_quota','provider_billing','provider_http']){
  let calls=0;const f=setup({enabled:true,suggest:async()=>{if(++calls===1)throw failure(reason);return output;}});
  await assert.rejects(()=>f.run(f.request()),{reason});assert.equal((await f.run(f.request())).title,output.title);assert.equal(calls,2);
 }
 let calls=0,signal;const f=setup({enabled:true,suggest:async(_,options)=>{signal=options.signal;if(++calls===1)return new Promise(()=>{});return output;}},{timeoutMs:5});
 await assert.rejects(()=>f.run(f.request()),{reason:'provider_timeout'});assert.equal(signal.aborted,true);
 assert.equal((await f.run(f.request())).title,output.title);assert.equal(calls,2);
});

test('telemetry is content-free, best effort, and never a generation gate',async()=>{
 const f=setup();await f.run(f.request());const row=f.diagnostics[0];assert.match(row.correlationId,/^[a-f0-9-]{36}$/);
 for(const privateValue of ['new-eligible-user','Wrap doors','Black wrap','Wrap & Paint'])assert.ok(!JSON.stringify(row).includes(privateValue));
 const broken=setup(undefined,{onDiagnostic:()=>{throw Error('logging unavailable');}});for(let i=0;i<12;i++)await broken.run(broken.request());
});

test('historical module exports paths only and cannot authorise, reserve or restore quotas',()=>{
 const legacy=require('../ai-release-control.cjs');assert.deepEqual(Object.keys(legacy).sort(),['ATTEMPT_PREFIX','CONTROL_PATH','DAILY_PREFIX']);
 assert.equal(legacy.createAIReleaseControl,undefined);assert.equal(legacy.DAILY_LIMIT,undefined);
});
