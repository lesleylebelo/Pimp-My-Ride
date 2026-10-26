const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('supertest');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const {createAIAssist}=require('../ai-assist.cjs'),{createAIProvider}=require('../ai-provider.cjs');
const {ApiError}=require('../errors.cjs');
const input={kind:'request',title:'Black wrap',description:'Wrap doors in black.',categoryId:'paint'};
const output={title:'Black wrap request',description:'I would like black wrap for the doors.',categoryId:'paint',missingDetails:['What details would you like to provide?']};
const geminiEnv={PMR_AI_ASSIST_ENABLED:'true',PMR_AI_PROVIDER:'gemini',PMR_AI_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'synthetic-server-key'};
const geminiResponse=(value,signature=false)=>({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(value),...(signature?{thoughtSignature:'synthetic-opaque-signature'}:{})}]}}]});
function fixture(provider){
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
 const services=createServices({db,auth,storage:{},aiProvider:adapter,aiDiagnostic:()=>{}});
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
 assert.deepEqual(Object.keys(f.calls[0]).sort(),['categories','categoryId','description','editorialWords','kind','limits','questionWords','title']);
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
 const assist=createAIAssist({db:f.db,actor:async()=>({uid:'owner',profile:f.rows['users/owner']}),provider:{enabled:true,suggest:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}},timeoutMs:5});
 await assert.rejects(()=>assist(f.request()),{code:'unavailable'});assert.equal(signal.aborted,true);
});

test('eligible users can generate repeatedly without minute/hour/day generation counters',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 for(let index=0;index<25;index++)assert.equal((await f.call(index%2?'owner':'other')).title,output.title);
 assert.equal(f.calls.length,25);assert.equal(JSON.stringify(f.rows),before);
});

test('concurrent requests for one user are rejected and access/category changes are rechecked',async()=>{
 let resolve;const f=fixture({enabled:true,suggest:()=>new Promise(done=>{resolve=done;})});const first=f.call();
 while(!resolve)await new Promise(done=>setImmediate(done));await assert.rejects(()=>f.call(),{code:'resource-exhausted'});
 f.rows['serviceCategories/paint'].archived=true;resolve(output);await assert.rejects(()=>first,{code:'unavailable'});
 const revoked=fixture({enabled:true,suggest:async()=>{revoked.rows['users/owner'].accountStatus='suspended';return output;}});
 await assert.rejects(()=>revoked.call(),{code:'permission-denied'});
});

test('OpenAI, omitted provider and alternate models cannot activate or fall back',async()=>{
 for(const change of [{PMR_AI_PROVIDER:'openai'},{PMR_AI_PROVIDER:undefined},{PMR_AI_MODEL:'another-model'},{PMR_AI_MODEL:'gemini-3.5-flash-lite-preview'},{PMR_AI_MODEL:'gemini-3.8-flash'}]){
  const adapter=createAIProvider({env:{...geminiEnv,OPENAI_API_KEY:'unused',...change},fetcher:async()=>assert.fail('No provider dispatch')});
  assert.equal(adapter.enabled,false);await assert.rejects(()=>adapter.suggest({},{}),{code:'unavailable'});
 }
});

test('Gemini adapter integrates with authenticated customer/shop HTTP without writes or OpenAI requests',async()=>{
 const calls=[];let sent;
 const provider=createAIProvider({env:geminiEnv,fetcher:async(url,options)=>{
  calls.push({url,options});sent=JSON.parse(options.body);const draft=JSON.parse(sent.contents[0].parts[0].text);
  return {ok:true,text:async()=>JSON.stringify(geminiResponse({...output,categoryId:draft.kind==='request'?'paint':'Wrap & Paint'},true))};
 }});
 const f=fixture(provider),before=JSON.stringify(f.rows);
 await http(f.app).get('/health').expect(200,{ok:true});assert.equal(calls.length,0);
 await http(f.app).post('/api/ai/assist').send(input).expect(401);assert.equal(calls.length,0);
 const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(200);
 assert.equal(response.body.data.title,output.title);assert.equal(response.body.data.category.id,'paint');
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer shop').send({...input,kind:'showcase',categoryId:'Wrap & Paint'}).expect(200);
 assert.equal(calls.length,2);assert.equal(JSON.stringify(f.rows),before);
 for(const {url,options} of calls){
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(options.headers['x-goog-api-key'],'synthetic-server-key');assert.equal(options.headers.Authorization,undefined);
  assert.equal(options.signal instanceof AbortSignal,true);assert.ok(!options.body.includes('synthetic-server-key'));
  const body=JSON.parse(options.body);assert.equal(body.generationConfig.responseMimeType,'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema.required,['title','description','categoryId','missingDetails']);
  assert.equal(body.generationConfig.responseJsonSchema.additionalProperties,false);assert.equal(Object.hasOwn(body.generationConfig,'candidateCount'),false);
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
 const f=fixture(provider),assist=createAIAssist({db:f.db,actor:async()=>({uid:'owner',profile:f.rows['users/owner']}),provider,timeoutMs:5});
 await assert.rejects(()=>assist(f.request()),{code:'unavailable'});assert.equal(signal.aborted,true);
});

test('authenticated AI HTTP allows unlisted Customers and approved Workshops to generate ten times each',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 for(const uid of ['owner','other','shop'])for(let i=0;i<10;i++){
  const data=uid==='shop'?{...input,kind:'showcase',categoryId:'Wrap & Paint'}:input;
  await http(f.app).post('/api/ai/assist').set('Authorization','Bearer '+uid).send(data).expect(200);
 }
 assert.equal(f.calls.length,30);assert.equal(JSON.stringify(f.rows),before);
});

test('both explicit Gemini models retain the same schema and bounds without model/provider fallback',async()=>{
 const sent=[];
 for(const model of ['gemini-2.5-flash-lite','gemini-3.5-flash-lite']){
  let calls=0;
  const provider=createAIProvider({env:{...geminiEnv,PMR_AI_MODEL:model,OPENAI_API_KEY:'inactive'},fetcher:async(url,options)=>{
   calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent');
   const body=JSON.parse(options.body);sent.push(body);
   assert.equal(body.contents.at(-1).role,'user');assert.equal(body.tools,undefined);
   return {ok:true,status:200,text:async()=>JSON.stringify(geminiResponse(output,model==='gemini-3.5-flash-lite'))};
  }});
  assert.equal(provider.enabled,true);await fixture(provider).call();assert.equal(calls,1);
  const failing=createAIProvider({env:{...geminiEnv,PMR_AI_MODEL:model,OPENAI_API_KEY:'inactive'},fetcher:async(url)=>{
   calls++;assert.ok(url.endsWith('/'+model+':generateContent'));return {ok:false,status:404};
  }});
  await assert.rejects(()=>fixture(failing).call(),{reason:'model_unavailable'});assert.equal(calls,2,'404 must never retry or fall back');
  const config=sent.at(-1).generationConfig;assert.equal(config.maxOutputTokens,1800);assert.equal(config.responseMimeType,'application/json');
  assert.deepEqual(config.responseJsonSchema.properties.categoryId,{type:['string','null'],enum:[null,'paint']});
  assert.equal(config.responseJsonSchema.properties.title.maxLength,100);assert.equal(config.responseJsonSchema.properties.description.maxLength,300);
  assert.equal(config.responseJsonSchema.properties.missingDetails.maxItems,5);assert.equal(config.responseJsonSchema.properties.missingDetails.items.maxLength,180);
 }
 assert.equal(sent[0].generationConfig.candidateCount,1);assert.equal(Object.hasOwn(sent[1].generationConfig,'candidateCount'),false);
 delete sent[0].generationConfig.candidateCount;assert.deepEqual(sent[0],sent[1]);
});

test('Gemini discards string thought signatures and still rejects non-text/unknown metadata',async()=>{
 const signed=geminiResponse(output,true);
 const provider=result=>createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>JSON.stringify(result)})});
 const suggestion=await fixture(provider(signed)).call();assert.equal(suggestion.title,output.title);assert.equal(JSON.stringify(suggestion).includes('synthetic-opaque-signature'),false);
 for(const extra of [{thoughtSignature:{}},{thoughtSignature:null},{thought:true},{inlineData:{mimeType:'image/png',data:'synthetic'}},{functionCall:{name:'unexpected'}},{unknown:'private'}]){
  const result=geminiResponse(output);Object.assign(result.candidates[0].content.parts[0],extra);
  await assert.rejects(()=>fixture(provider(result)).call(),{reason:'malformed_output'});
 }
 const legacy=createAIProvider({env:{...geminiEnv,PMR_AI_MODEL:'gemini-2.5-flash-lite'},fetcher:async()=>({status:200,ok:true,text:async()=>JSON.stringify(signed)})});
 assert.equal((await fixture(legacy).call()).title,output.title);
});

test('documented thought flags and multiple answer parts preserve structured JSON and grounding',async()=>{
 const json=JSON.stringify({...output,categoryId:null,missingDetails:[]});
 for(const parts of [
  [{text:json,thought:false}],
  [{text:'synthetic reasoning, never part of the answer',thought:true},{text:json,thought:false,thoughtSignature:'opaque'}],
  [{text:json.slice(0,25)},{text:json.slice(25)}],
 ]){
  const result=geminiResponse(output);result.candidates[0].content.parts=parts;
  const provider=createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>JSON.stringify(result)})});
  const suggestion=await fixture(provider).call();assert.equal(suggestion.title,output.title);assert.equal(suggestion.category,null);assert.deepEqual(suggestion.missingDetails,[]);
  assert.ok(!JSON.stringify(suggestion).includes('synthetic reasoning'));assert.ok(!JSON.stringify(suggestion).includes('opaque'));
 }
});

test('envelope, candidate, parts and JSON failures have exact content-free subcodes',async()=>{
 const candidate=geminiResponse(output).candidates[0];
 const cases=[
  ['not JSON','envelope','envelope_json'],[null,'envelope','envelope_type'],[[],'envelope','envelope_type'],
  [{},'candidate','candidates_missing'],[{candidates:[]},'candidate','candidates_empty'],
  [{candidates:[candidate,candidate]},'candidate','candidate_count'],[{candidates:[null]},'candidate','candidate_type'],
  [{candidates:[{...candidate,finishReason:'MAX_TOKENS'}]},'candidate','finish_max_tokens'],
  [{candidates:[{...candidate,finishReason:'CONTINUATION'}]},'candidate','finish_continuation'],
  [{candidates:[{...candidate,finishReason:undefined}]},'candidate','finish_not_stop'],
  [{candidates:[{...candidate,content:{...candidate.content,role:'user'}}]},'candidate','content_role'],
  [{candidates:[{...candidate,content:{role:'model',parts:[]}}]},'parts','parts_missing'],
  [{candidates:[{...candidate,content:{role:'model',parts:[null]}}]},'parts','part_type'],
  [{candidates:[{...candidate,content:{role:'model',parts:[{text:'synthetic',thought:'false'}]}}]},'parts','part_metadata'],
  [{candidates:[{...candidate,content:{role:'model',parts:[{text:'synthetic',thought:true}]}}]},'parts','answer_text_missing'],
  [{candidates:[{...candidate,content:{role:'model',parts:[{text:'not JSON'}]}}]},'json','answer_json'],
 ];
 for(const [body,outputStage,outputRule] of cases){
  const provider=createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>body==='not JSON'?body:JSON.stringify(body)})});
  await assert.rejects(()=>fixture(provider).call(),{reason:'malformed_output',outputStage,outputRule});
 }
 const oversized=createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>'x'.repeat(65537)})});
 await assert.rejects(()=>fixture(oversized).call(),{outputStage:'envelope',outputRule:'body_too_large'});
 for(const [result,outputStage,outputRule] of [[{promptFeedback:{blockReason:'SAFETY'}},'envelope','prompt_blocked'],[{candidates:[{finishReason:'SAFETY'}]},'candidate','candidate_blocked']]){
  const provider=createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>JSON.stringify(result)})});
  await assert.rejects(()=>fixture(provider).call(),{reason:'provider_blocked',outputStage,outputRule});
 }
});

test('required fields, nulls, types, bounds and question format remain strict with subcodes',()=>{
 const {validateSuggestion}=require('../ai-assist.cjs'),draft={...input,limits:{title:100,description:300},categories:[{id:'paint',name:'Wrap & Paint'}]};
 for(const field of ['title','description','categoryId','missingDetails']){
  const value={...output};delete value[field];assert.throws(()=>validateSuggestion(value,draft),{outputStage:'suggestion',outputRule:'required_field'});
 }
 for(const [value,outputRule] of [[null,'object_type'],[[],'object_type'],[{...output,extra:true},'unknown_field'],
  [{...output,title:null},'title_type'],[{...output,title:' '},'title_empty'],[{...output,title:'x'.repeat(101)},'title_length'],
  [{...output,description:5},'description_type'],[{...output,description:''},'description_empty'],[{...output,description:'x'.repeat(301)},'description_length'],
  [{...output,categoryId:[]},'category_type'],[{...output,categoryId:'unknown'},'category_unsupported'],
  [{...output,missingDetails:null},'questions_type'],[{...output,missingDetails:Array(6).fill('What details?')},'questions_count'],
  [{...output,missingDetails:[null]},'question_type'],[{...output,missingDetails:[' ']},'question_empty'],
  [{...output,missingDetails:['x'.repeat(181)]},'question_length'],[{...output,missingDetails:['What details.']},'question_format']]){
  assert.throws(()=>validateSuggestion(value,draft),{reason:'malformed_output',outputStage:'suggestion',outputRule});
 }
 assert.deepEqual(validateSuggestion({...output,categoryId:null,missingDetails:[]},draft).missingDetails,[]);
 assert.throws(()=>validateSuggestion({...output,description:'Invented turbo gains.'},draft),{reason:'grounding_rejected',outputStage:null,outputRule:null});
});

test('format subcodes remain allowlisted and are returned without private provider content',async()=>{
 const {failure}=require('../ai-errors.cjs');
 const forged=failure('malformed_output',{outputStage:'private content',outputRule:'private content'});assert.equal(forged.outputStage,null);assert.equal(forged.outputRule,null);
 const provider=createAIProvider({env:geminiEnv,fetcher:async()=>({status:200,ok:true,text:async()=>JSON.stringify(geminiResponse({...output,title:null}))})});
 await assert.rejects(()=>fixture(provider).call(),error=>error.outputStage==='suggestion'&&error.outputRule==='title_type'&&!JSON.stringify(error).includes(output.description));
});

test('authorisation classifications distinguish live account state and draft type',async()=>{
 for(const [uid,changes,reason] of [
  ['shop',{verificationStatus:'pending'},'account_eligibility'],['shop',{verificationStatus:'rejected'},'account_eligibility'],
  ['shop',{accountStatus:'suspended'},'account_access'],['shop',{accountStatus:'archived'},'account_access'],
  ['owner',{role:'admin'},'account_eligibility'],['owner',{role:'shop',verificationStatus:'approved'},'draft_type'],
 ]){
  const f=fixture();Object.assign(f.rows['users/'+uid],changes);
  const data=uid==='shop'?{...input,kind:'showcase',categoryId:'Other'}:input;
  const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer '+uid).send(data).expect(403);
  assert.equal(response.body.error.fields.aiReason,reason);assert.equal(f.calls.length,0);
 }
 const f=fixture();delete f.rows['users/owner'];await assert.rejects(()=>f.call(),{fields:{aiReason:'account_access'}});
 const stale=fixture();await assert.rejects(()=>stale.services.aiAssist({...stale.request(),auth:{uid:'owner',token:{email_verified:true,auth_time:1}}}),{code:'unauthenticated'});
 const unverified=fixture();await assert.rejects(()=>unverified.services.aiAssist({...unverified.request(),auth:{uid:'owner',token:{email_verified:false,auth_time:Date.now()/1000}}}),{fields:{aiReason:'account_access'}});
 const disabled=fixture();disabled.users.owner={emailVerified:true,disabled:true};await assert.rejects(()=>disabled.call(),{fields:{aiReason:'account_access'}});

});

test('fresh role and UID checks reject late output after account changes',async()=>{
 for(const change of ['role','uid']){
  const f=fixture();let checks=0;
  const assist=createAIAssist({db:f.db,provider:f.adapter,actor:async()=>({uid:++checks===2&&change==='uid'?'other':'owner',profile:{role:checks===2&&change==='role'?'shop':'owner',accountStatus:'active',verificationStatus:'approved'}})});
  await assert.rejects(()=>assist(f.request()),{fields:{aiReason:'account_changed'}});
 }
});

test('provider HTTP failures have safe distinct public classifications and never masquerade as account or app quota errors',async()=>{
 for(const [status,aiReason] of [[400,'service_unavailable'],[401,'configuration'],[402,'provider_billing'],[403,'configuration'],[404,'configuration'],[429,'provider_limit'],[500,'service_unavailable'],[503,'service_unavailable']]){
  let calls=0;const provider=createAIProvider({env:geminiEnv,fetcher:async()=>{calls++;return {status,ok:false,text:async()=>'{"secret":"do not expose"}'};}});
  const f=fixture(provider),response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(503);
  assert.equal(calls,1);assert.equal(response.body.error.fields.aiReason,aiReason);assert.doesNotMatch(JSON.stringify(response.body),/do not expose|synthetic-server-key/);
 }
});

test('shared HTTP IP and user throttles classify AI rate limits without changing other endpoint envelopes',async()=>{
 const services={aiAssist:async()=>({}),marketplace:async()=>({})};
 const auth={verifyIdToken:async token=>({uid:token})};
 for(const mode of ['ip','uid']){
  const app=createApp({services,auth});let response;
  const count=mode==='ip'?91:61;
  for(let i=0;i<count;i++)response=await http(app).post('/api/ai/assist').set('Authorization','Bearer '+(mode==='ip'?'uid-'+i:'same')).send({});
  assert.equal(response.status,429);assert.equal(response.body.error.fields.aiReason,'rate_limit');
  const other=await http(app).post('/api/marketplace').set('Authorization','Bearer same').send({});
  assert.equal(other.status,429);assert.equal(other.body.error.fields,undefined);
 }
});

test('provider prompt and validator support neutral context questions and safe paraphrases',async()=>{
 let payload;const provider=createAIProvider({env:geminiEnv,fetcher:async(_,options)=>{payload=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify(geminiResponse(output))};}});
 await fixture(provider).call();const prompt=payload.systemInstruction.parts[0].text,draft=JSON.parse(payload.contents[0].parts[0].text);
 assert.match(prompt,/Never invent/);assert.match(prompt,/not fixed question templates/);assert.ok(draft.questionWords.includes('timeframe'));
 const {validateSuggestion}=require('../ai-assist.cjs');
 for(const missingDetails of [[],['Could you share your preferred timeframe?'],['Do you have any reference photos?']])assert.deepEqual(validateSuggestion({...output,missingDetails},draft).missingDetails,missingDetails);
 assert.throws(()=>validateSuggestion({...output,description:'Invented turbo gains.'},draft),{reason:'grounding_rejected'});
});

test('a fully wrapped JSON fence is repaired once, while trailing prose, truncation and unsafe JSON remain rejected',async()=>{
 const {createAIProvider}=require('../ai-provider.cjs');
 const backtick=String.fromCharCode(96).repeat(3);
 for(const [answer,valid] of [
  [backtick+'json\n'+JSON.stringify(output)+'\n'+backtick,true],
  [backtick+'json\n'+JSON.stringify(output)+'\n'+backtick+' trailing prose',false],
  ['Here is JSON: '+JSON.stringify(output),false],
  [backtick+'json\n'+JSON.stringify(output).slice(0,-1)+'\n'+backtick,false],
  [backtick+'json\n'+JSON.stringify({...output,description:'Invented turbo gains.'})+'\n'+backtick,false],
 ]){
  let calls=0;const reply=geminiResponse(output);reply.candidates[0].content.parts[0].text=answer;
  const provider=createAIProvider({env:geminiEnv,fetcher:async()=>{calls++;return {status:200,ok:true,text:async()=>JSON.stringify(reply)};}});
  if(valid)assert.equal((await fixture(provider).call()).title,output.title);else await assert.rejects(()=>fixture(provider).call(),{code:'unavailable'});
  assert.equal(calls,1);
 }
});

test('invalid roles and malformed generation identifiers are rejected before dispatch',async()=>{
 const f=fixture();f.rows['users/owner'].role='unsupported';await assert.rejects(()=>f.call(),{code:'permission-denied'});assert.equal(f.calls.length,0);
 const valid=fixture();for(const requestId of ['short','../../sensitive','x'.repeat(101),123])await assert.rejects(()=>valid.call('owner',{...input,requestId}),{code:'invalid-argument'});
 assert.equal(valid.calls.length,0);
});

test('account/category infrastructure failures remain service errors with no private exception text or account blame',async()=>{
 for(const mode of ['account','category','bad-category']){
  const f=fixture();
  if(mode==='account')f.auth.getUser=async()=>{throw Error('private-account-id and secret credential');};
  else if(mode==='category')f.db.collection=()=>{throw Error('private database path and secret credential');};
  else f.rows['serviceCategories/paint'].name='';
  const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send(input).expect(503);
  assert.equal(response.body.error.fields.aiReason,'service_unavailable');assert.doesNotMatch(JSON.stringify(response.body),/private-|credential|database path/);assert.equal(f.calls.length,0);
 }
});
