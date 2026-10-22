const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('supertest');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const {createAIAssist}=require('../ai-assist.cjs'),{createAIProvider}=require('../ai-provider.cjs');
const {ApiError}=require('../errors.cjs');
const input={kind:'request',title:'Black wrap',description:'Wrap doors in black.',categoryId:'paint'};
const output={title:'Black wrap request',description:'I would like black wrap for the doors.',categoryId:'paint',missingDetails:['What details would you like to provide?']};
const geminiEnv={PMR_AI_ASSIST_ENABLED:'true',PMR_AI_PROVIDER:'gemini',PMR_AI_MODEL:'gemini-2.5-flash-lite',GEMINI_API_KEY:'synthetic-server-key'};
const geminiResponse=value=>({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(value)}]}}]});
// Only deterministic tests bypass the separately tested durable release control.
const testReleaseControl={authorize(){},async reserve(){}};
function fixture(provider,releaseControl=testReleaseControl){
 const rows={
  'users/owner':{role:'owner',accountStatus:'active'},'users/other':{role:'owner',accountStatus:'active'},
  'users/shop':{role:'shop',accountStatus:'active',verificationStatus:'approved'},'users/admin':{role:'admin',accountStatus:'active'},
  'serviceCategories/paint':{name:'Wrap & Paint',archived:false},'serviceCategories/old':{name:'Archived',archived:true},
 },calls=[];
 const db={doc:path=>({get:async()=>({exists:!!rows[path],data:()=>rows[path]})}),collection:path=>{
  assert.equal(path,'serviceCategories','AI must never enumerate other collections');
  return {where:(field,op,value)=>{assert.deepEqual([field,op,value],['archived','==',false]);return {limit:maximum=>{assert.equal(maximum,101);return {get:async()=>({docs:Object.entries(rows).filter(([path,value])=>path.startsWith('serviceCategories/')&&!value.archived).map(([path,value])=>({id:path.split('/')[1],data:()=>value}))})};}};}};
 }};
 const users={},auth={getUser:async uid=>users[uid]||{emailVerified:true,disabled:false,metadata:{creationTime:'2020-01-01'},tokensValidAfterTime:'2020-01-01'},verifyIdToken:async token=>{if(token==='revoked')throw Error('Revoked');return {uid:token,email_verified:true,auth_time:Date.now()/1000};}};
 const adapter=provider||{enabled:true,suggest:async draft=>{calls.push(draft);return {...output,categoryId:draft.kind==='request'?'paint':'Wrap & Paint'};}};
 const services=createServices({db,auth,storage:{},aiProvider:adapter,aiReleaseControl:releaseControl});
 const request=(uid='owner',data=input)=>({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000}},data});
 const call=(uid='owner',data=input)=>services.aiAssist(request(uid,data));
 return {rows,users,calls,db,auth,adapter,services,request,call,app:createApp({services,auth})};
}

test('customer and approved shop receive structured suggestions from authoritative categories without mutations',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 const owner=await f.call();assert.equal(owner.title,output.title);assert.equal(owner.description,output.description);assert.deepEqual(owner.category,{id:'paint',name:'Wrap & Paint'});
 const shop=await f.call('shop',{...input,kind:'showcase',categoryId:'Wrap & Paint'});assert.equal(shop.category.id,'Wrap & Paint');
 assert.equal(f.calls[0].limits.description,300);assert.equal(f.calls[1].limits.description,2000);
 assert.deepEqual(f.calls[0].categories,[{id:'paint',name:'Wrap & Paint'}]);assert.equal(JSON.stringify(f.rows),before);
 assert.deepEqual(Object.keys(f.calls[0]).sort(),['categories','categoryId','description','editorialWords','kind','limits','title']);
});

test('AI HTTP uses existing verified authentication, rejects wrong roles and never publishes or writes media',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 await http(f.app).post('/api/ai/assist').send(input).expect(401);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer revoked').send(input).expect(401);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(200);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer shop').send(input).expect(403);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer admin').send(input).expect(403);
 f.users.owner={emailVerified:false};await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(403);
 assert.equal(JSON.stringify(f.rows),before);
});

test('inactive, locked and unapproved accounts cannot use AI',async()=>{
 for(const change of [{accountStatus:'suspended'},{verificationStatus:'pending'},{statusOperation:'locked'},{reviewOperation:'locked'},{provisioningOperation:'locked'}]){
  const f=fixture();Object.assign(f.rows['users/shop'],change);await assert.rejects(()=>f.call('shop',{...input,kind:'showcase',categoryId:'Other'}),{code:'permission-denied'});assert.equal(f.calls.length,0);
 }
});

test('request size, unknown fields, empty content and existing category selection are validated',async()=>{
 for(const data of [{...input,title:'x'.repeat(101)},{...input,description:'x'.repeat(301)},{...input,title:'',description:''},{...input,categoryId:'old'},{...input,photoIds:['private']},{...input,serviceLocation:{}},{...input,role:'shop'},{...input,title:'bad\u0000text'}]){
  const f=fixture();await assert.rejects(()=>f.call('owner',data),{code:'invalid-argument'});assert.equal(f.calls.length,0);
 }
 const f=fixture();await http(f.app).post('/api/ai/assist').set('Authorization','Bearer shop').send({...input,kind:'showcase',categoryId:'Other',description:'😀'.repeat(3000)}).expect(400);
});

test('malformed, unsupported and fabricated provider suggestions are rejected without exposing provider content',async()=>{
 for(const bad of [{...output,categoryId:'invented'},{...output,extra:'private'},{...output,title:''},{...output,description:'x'.repeat(301)},{...output,missingDetails:['A claim without a question']},{...output,missingDetails:['Is there a turbo?']},
  {...output,description:'Turbo gains 500 horsepower.'},{...output,description:'Certified warranty included.'},{...output,description:'Black wrap completed on doors.'}]){
  const f=fixture({enabled:true,suggest:async()=>bad});await assert.rejects(()=>f.call(),error=>error.code==='unavailable'&&!error.message.includes('Turbo')&&!error.message.includes('private'));
 }
 const f=fixture({enabled:true,suggest:async()=>output});await assert.rejects(()=>f.call('owner',{...input,description:'No warranty for black wrap on doors.'}),{code:'unavailable'});
});

test('disabled AI performs no provider request and returns an optional-feature error',async()=>{
 const adapter=createAIProvider({env:{},fetcher:async()=>assert.fail('No real AI request is permitted')});
 const f=fixture(adapter);const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(503);
 assert.match(response.body.error.message,/draft is unchanged/);assert.equal(adapter.enabled,false);
});

test('provider errors are sanitised and a stalled provider is aborted at the deadline',async()=>{
 const failing=fixture({enabled:true,suggest:async()=>{throw new ApiError('permission-denied','secret provider content');}});
 await assert.rejects(()=>failing.call(),error=>error.code==='unavailable'&&!error.message.includes('secret'));
 const f=fixture();let signal;
 const assist=createAIAssist({db:f.db,actor:async()=>({uid:'owner',profile:f.rows['users/owner']}),releaseControl:testReleaseControl,provider:{enabled:true,suggest:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}},timeoutMs:5});
 await assert.rejects(()=>assist(f.request()),{code:'unavailable'});assert.equal(signal.aborted,true);
});

test('usage limits apply per verified user, including regenerate, and reset by minute and hour',async()=>{
 const f=fixture();let clock=1800000000000;
 const assist=createAIAssist({db:f.db,actor:async request=>({uid:request.auth.uid,profile:f.rows['users/'+request.auth.uid]}),releaseControl:testReleaseControl,provider:f.adapter,now:()=>clock});
 for(let index=0;index<3;index++)await assist(f.request());await assert.rejects(()=>assist(f.request()),{code:'resource-exhausted'});
 await assist(f.request('other'));
 for(let index=0;index<7;index++){clock+=60000;await assist(f.request());}
 clock+=60000;await assert.rejects(()=>assist(f.request()),{code:'resource-exhausted'});
 clock+=3600000;await assist(f.request());
});

test('concurrent requests for one user are rejected and access/category changes are rechecked',async()=>{
 let resolve;const f=fixture({enabled:true,suggest:()=>new Promise(done=>{resolve=done;})});const first=f.call();
 while(!resolve)await new Promise(done=>setImmediate(done));await assert.rejects(()=>f.call(),{code:'resource-exhausted'});
 f.rows['serviceCategories/paint'].archived=true;resolve(output);await assert.rejects(()=>first,{code:'unavailable'});
 const revoked=fixture({enabled:true,suggest:async()=>{revoked.rows['users/owner'].accountStatus='suspended';return output;}});
 await assert.rejects(()=>revoked.call(),{code:'permission-denied'});
});

test('OpenAI adapter uses server credentials, strict JSON schema, no storage and only injected HTTP',async()=>{
 const requests=[];const provider=createAIProvider({env:{PMR_AI_ASSIST_ENABLED:'true',OPENAI_API_KEY:'server-test-key',PMR_AI_MODEL:'test-model'},fetcher:async(url,options)=>{
  requests.push({url,options});return {ok:true,text:async()=>JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(output)}]}]})};
 }});
 const result=await provider.suggest({kind:'request',...input,categories:[{id:'paint',name:'Paint'}],limits:{title:100,description:300}},{signal:new AbortController().signal});assert.deepEqual(result,output);
 const request=requests[0],body=JSON.parse(request.options.body);assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.options.headers.Authorization,'Bearer server-test-key');
 assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.deepEqual(body.text.format.schema.properties.categoryId.enum,[null,'paint']);assert.ok(!body.input.includes('server-test-key'));
 for(const response of [{ok:false,text:async()=>''},{ok:true,text:async()=>'{"status":"incomplete"}'},{ok:true,text:async()=>'{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"refusal"}]}]}'},{ok:true,text:async()=>'<html>error</html>'}]){
  const adapter=createAIProvider({env:{PMR_AI_ASSIST_ENABLED:'true',OPENAI_API_KEY:'test',PMR_AI_MODEL:'test'},fetcher:async()=>response});await assert.rejects(()=>adapter.suggest({categories:[],limits:{title:100,description:300}},{signal:new AbortController().signal}),{code:'unavailable'});
 }
});

test('Gemini adapter integrates with authenticated customer/shop HTTP without writes or OpenAI requests',async()=>{
 const calls=[];let sent;
 const provider=createAIProvider({env:geminiEnv,fetcher:async(url,options)=>{
  calls.push({url,options});sent=JSON.parse(options.body);const draft=JSON.parse(sent.contents[0].parts[0].text);
  return {ok:true,text:async()=>JSON.stringify(geminiResponse({...output,categoryId:draft.kind==='request'?'paint':'Wrap & Paint'}))};
 }});
 const f=fixture(provider),before=JSON.stringify(f.rows);
 await http(f.app).get('/health').expect(200,{ok:true});assert.equal(calls.length,0);
 await http(f.app).post('/api/ai/assist').send(input).expect(401);assert.equal(calls.length,0);
 const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(200);
 assert.equal(response.body.data.title,output.title);assert.equal(response.body.data.category.id,'paint');
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer shop').send({...input,kind:'showcase',categoryId:'Wrap & Paint'}).expect(200);
 assert.equal(calls.length,2);assert.equal(JSON.stringify(f.rows),before);
 for(const {url,options} of calls){
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
  assert.equal(options.headers['x-goog-api-key'],'synthetic-server-key');assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.signal instanceof AbortSignal,true);assert.ok(!options.body.includes('synthetic-server-key'));
  const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema.required,['title','description','categoryId','missingDetails']);
  assert.equal(body.generationConfig.responseJsonSchema.additionalProperties,false);assert.equal(body.generationConfig.candidateCount,1);
  assert.match(body.systemInstruction.parts[0].text,/Never invent/);assert.equal(body.tools,undefined);
 }
 assert.equal(sent.generationConfig.responseJsonSchema.properties.description.maxLength,2000);
});

test('Gemini never activates while disabled, missing its key, or configured for an unsupported provider/model',async()=>{
 for(const change of [{PMR_AI_ASSIST_ENABLED:'false'},{GEMINI_API_KEY:''},{PMR_AI_MODEL:''},{PMR_AI_MODEL:'another-model'},{PMR_AI_PROVIDER:'unknown'}]){
  const adapter=createAIProvider({env:{...geminiEnv,OPENAI_API_KEY:'unused-openai-test-key',...change},fetcher:async()=>assert.fail('Must not fall back or call a provider')});
  assert.equal(adapter.enabled,false);await assert.rejects(()=>adapter.suggest({},{}),{code:'unavailable'});
 }
 const f=fixture(createAIProvider({env:{...geminiEnv,PMR_AI_ASSIST_ENABLED:'false'},fetcher:async()=>assert.fail('Disabled means no HTTP')}));
 await http(f.app).get('/health').expect(200,{ok:true});
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(503);
});

test('Gemini rejects blocked, truncated, malformed, oversized and non-text responses safely',async()=>{
 for(const result of [{},{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'MAX_TOKENS'}]},
  {candidates:[{finishReason:'SAFETY'}]}, {candidates:[...geminiResponse(output).candidates,...geminiResponse(output).candidates]},
  {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'doWork'}}]}}]},
  {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:'not JSON'}]}}]},null]){
  const provider=createAIProvider({env:geminiEnv,fetcher:async()=>({ok:true,text:async()=>JSON.stringify(result)})});
  await assert.rejects(()=>fixture(provider).call(),error=>error.code==='unavailable'&&!error.message.includes('synthetic'));
 }
 for(const response of [{ok:false,text:async()=>assert.fail('Do not read provider errors')},{ok:true,text:async()=>'<html>'},{ok:true,text:async()=>'x'.repeat(65537)}]){
  await assert.rejects(()=>fixture(createAIProvider({env:geminiEnv,fetcher:async()=>response})).call(),{code:'unavailable'});
 }
});

test('Gemini output still passes existing category/grounding validation and deadline cancellation',async()=>{
 for(const bad of [{...output,categoryId:'invented'},{...output,description:'Turbo gains 500 horsepower.'}]){
  const adapter=createAIProvider({env:geminiEnv,fetcher:async()=>({ok:true,text:async()=>JSON.stringify(geminiResponse(bad))})});
  await assert.rejects(()=>fixture(adapter).call(),{code:'unavailable'});
 }
 let signal;const provider=createAIProvider({env:geminiEnv,fetcher:async(_,options)=>{signal=options.signal;return {ok:true,text:()=>new Promise(()=>{})};}});
 const f=fixture(provider),assist=createAIAssist({db:f.db,actor:async()=>({uid:'owner',profile:f.rows['users/owner']}),releaseControl:testReleaseControl,provider,timeoutMs:5});
 await assert.rejects(()=>assist(f.request()),{code:'unavailable'});assert.equal(signal.aborted,true);
});

test('authenticated AI route restricts the initial release UID and enforces the durable allowance',async()=>{
 const {createAIReleaseControl}=require('../ai-release-control.cjs');let row,calls=0,writes=0;
 const control=createAIReleaseControl({env:{PMR_AI_TEST_UID:'owner'},db:{doc:()=>({}),runTransaction:async fn=>fn({get:async()=>({exists:!!row,data:()=>row}),create:(_,value)=>{row=value;writes++;}})}});
 const provider=createAIProvider({env:geminiEnv,fetcher:async()=>{calls++;return {ok:true,text:async()=>JSON.stringify(geminiResponse(output))};}});
 const f=fixture(provider,control),before=JSON.stringify(f.rows);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer other').send(input).expect(403);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer shop').send({...input,kind:'showcase',categoryId:'Wrap & Paint'}).expect(403);
 assert.equal(calls,0);assert.equal(writes,0);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(200);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(429);
 assert.equal(calls,1);assert.equal(writes,1);assert.equal(JSON.stringify(f.rows),before);
});
