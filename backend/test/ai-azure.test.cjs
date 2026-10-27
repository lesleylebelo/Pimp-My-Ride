const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('supertest');
const {createAzureProvider,azureConfiguration,validateAzureStartup,prepareAzureStartup,extractOutput,loadAzureSDK}=require('../ai-azure-provider.cjs');
const {createAIProvider}=require('../ai-provider-selection.cjs');
const {createAIStudioProvider}=require('../ai-studio-provider.cjs');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const env={PMR_AI_PROVIDER:'azure',PMR_AI_ASSIST_ENABLED:'true',PMR_AI_STUDIO_ENABLED:'true',
 AZURE_TENANT_ID:'11111111-1111-1111-1111-111111111111',AZURE_CLIENT_ID:'22222222-2222-2222-2222-222222222222',AZURE_CLIENT_SECRET:'SYNTHETIC_TEST_SECRET',
 AZURE_FOUNDRY_PROJECT_ENDPOINT:'https://lebelolesley-6791-resource.services.ai.azure.com/api/projects/lebelolesley-6791',AZURE_FOUNDRY_AGENT_NAME:'PimpPilot'};
const draft={kind:'request',title:'Black wrap',description:'Wrap doors in black.',categoryId:'paint',categories:[{id:'paint',name:'Wrap & Paint'}],limits:{title:100,description:300},editorialWords:[],questionWords:[]};
const suggestion={title:'Black wrap',description:'Wrap doors in black.',categoryId:'paint',missingDetails:[]};
const plan={objective:'A subtle daily driver',observations:[],assumptions:[],modifications:[{title:'Wrap',scope:'Wrap doors in matte black.',parts:['Automotive vinyl'],tradeOffs:'Verify paint condition.'}],considerations:['Check with a professional installer.'],questions:[]};
const envelope=value=>({id:'resp_synthetic',object:'response',status:'completed',error:null,incomplete_details:null,output:[{type:'message',id:'msg_synthetic',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value),annotations:[]}]}]});
function fakeSDK(reply=async()=>envelope(suggestion)){
 const calls={credentials:[],projects:[],clients:[],responses:[]};
 class ClientSecretCredential{constructor(...args){calls.credentials.push(args);}}
 class AIProjectClient{
  constructor(...args){calls.projects.push(args);}
  getOpenAIClient(options){calls.clients.push(options);return {responses:{create:async(...args)=>{calls.responses.push(args);return reply(...args);}}};}
 }
 return {calls,loadSDK:async()=>({ClientSecretCredential,AIProjectClient})};
}
test('Azure configuration fails closed, validates the project endpoint and agent name, and never loads credentials while disabled',async()=>{
 assert.equal(azureConfiguration(env).agentName,'PimpPilot');
 for(const key of ['AZURE_TENANT_ID','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','AZURE_FOUNDRY_PROJECT_ENDPOINT','AZURE_FOUNDRY_AGENT_NAME']){
  const missing={...env,[key]:''};assert.throws(()=>validateAzureStartup(missing),error=>!error.message.includes(env.AZURE_CLIENT_SECRET));
  const provider=createAzureProvider({env:missing,loadSDK:async()=>assert.fail('No SDK initialization')});assert.equal(provider.enabled,false);await assert.rejects(()=>provider.suggest(draft),{reason:'configuration'});
 }
 for(const endpoint of ['http://localhost:3000/api/projects/x','https://evil.example/api/projects/x',env.AZURE_FOUNDRY_PROJECT_ENDPOINT+'?secret=1','https://user:pass@foo.services.ai.azure.com/api/projects/x',env.AZURE_FOUNDRY_PROJECT_ENDPOINT+'/openai'])assert.throws(()=>azureConfiguration({...env,AZURE_FOUNDRY_PROJECT_ENDPOINT:endpoint}));
 assert.throws(()=>azureConfiguration({...env,AZURE_FOUNDRY_AGENT_NAME:'pimppilot-gpt5-mini'}));
 assert.doesNotThrow(()=>validateAzureStartup({...env,PMR_AI_ASSIST_ENABLED:'false',PMR_AI_STUDIO_ENABLED:'false',AZURE_CLIENT_SECRET:''}));
 const disabled=createAzureProvider({env:{...env,PMR_AI_ASSIST_ENABLED:'false'},loadSDK:async()=>assert.fail('Disabled SDK')});assert.equal(disabled.enabled,false);
});
test('explicit Entra credentials and agent-bound client are initialized server-side, with no model or agent creation',async()=>{
 const f=fakeSDK(),p=createAIProvider({env,loadSDK:f.loadSDK});assert.equal(p.enabled,true);
 assert.deepEqual(await p.suggest(draft),suggestion);
 assert.deepEqual(f.calls.credentials[0],[env.AZURE_TENANT_ID,env.AZURE_CLIENT_ID,env.AZURE_CLIENT_SECRET]);
 assert.equal(f.calls.projects[0][0],env.AZURE_FOUNDRY_PROJECT_ENDPOINT);
 assert.deepEqual(f.calls.projects[0][2],{tracingOptions:{experimental:false,contentRecording:false,traceContextPropagation:false}});
 assert.deepEqual(f.calls.clients[0].azureConfig,{allowPreview:true,agentName:'PimpPilot'});
 assert.equal(f.calls.clients[0].maxRetries,0);assert.equal(f.calls.clients[0].logLevel,'off');
 const [body,options]=f.calls.responses[0];
 assert.equal(body.store,false);assert.equal(body.stream,false);assert.deepEqual(body.tools,[]);assert.equal(body.tool_choice,'none');
 assert.deepEqual(body.reasoning,{effort:'minimal'});
 for(const forbidden of ['model','conversation','previous_response_id','agent'])assert.equal(Object.hasOwn(body,forbidden),false,forbidden);
 assert.equal(body.text.format.strict,true);assert.equal(body.text.format.name,'pimppilot_draft');
 assert.deepEqual(body.text.format.schema.required,['title','description','categoryId','missingDetails']);assert.equal(options.maxRetries,0);assert.ok(options.signal instanceof AbortSignal);
});
test('installed ESM/CJS SDK loads and the real agent-bound Responses transport sends Entra bearer authentication to the exact endpoint',async()=>{
 const sdk=await loadAzureSDK();assert.equal(typeof sdk.ClientSecretCredential,'function');
 const credential=new sdk.ClientSecretCredential(env.AZURE_TENANT_ID,env.AZURE_CLIENT_ID,env.AZURE_CLIENT_SECRET);assert.equal(typeof credential.getToken,'function');
 const previous=globalThis.fetch,calls=[],scopes=[];
 class InterceptedCredential{async getToken(scope){scopes.push(scope);return {token:'synthetic-entra-access-token',expiresOnTimestamp:Date.now()+3600000};}}
 globalThis.fetch=async(resource,options)=>{
  const request=new Request(resource,options);calls.push({url:request.url,headers:request.headers,body:JSON.parse(await request.text())});
  return new Response(JSON.stringify(envelope(suggestion)),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const p=createAIProvider({env,loadSDK:async()=>({AIProjectClient:sdk.AIProjectClient,ClientSecretCredential:InterceptedCredential})});
  assert.deepEqual(await p.suggest(draft),suggestion);assert.equal(calls.length,1);
  const url=new URL(calls[0].url);
  assert.equal(url.origin+url.pathname,env.AZURE_FOUNDRY_PROJECT_ENDPOINT+'/agents/PimpPilot/endpoint/protocols/openai/responses');
  assert.ok(url.searchParams.has('api-version'));assert.equal(calls[0].headers.get('authorization'),'Bearer synthetic-entra-access-token');
  assert.ok(scopes.flat().includes('https://ai.azure.com/.default'));assert.equal(calls[0].body.store,false);
  assert.equal(JSON.stringify(calls[0].body).includes(env.AZURE_CLIENT_SECRET),false);
 }finally{globalThis.fetch=previous;}
});
test('Azure startup and offline readiness load the installed SDK without token acquisition or network calls',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>assert.fail('Offline preflight must not contact Azure');
 try{
  await prepareAzureStartup(env);
  const result=await require('../check-ai-config.cjs').check(env);
  assert.equal(result.sdkLoaded,true);assert.equal(result.liveAuthenticationVerified,false);
  assert.equal(JSON.stringify(result).includes(env.AZURE_CLIENT_SECRET),false);
  await assert.rejects(()=>prepareAzureStartup({...env,AZURE_CLIENT_SECRET:''}),/AZURE_CLIENT_SECRET/);
 }finally{globalThis.fetch=previous;}
});
test('Azure output extraction rejects refusals, tools, incomplete, missing, oversized and malformed output',()=>{
 const valid=envelope(suggestion);assert.deepEqual(extractOutput({...valid,output:[{type:'reasoning',summary:[]},...valid.output]}),suggestion);
 const bad=[null,{...valid,status:'incomplete'},{...valid,incomplete_details:{reason:'max_output_tokens'}},{...valid,output:[]},{...valid,output_text:'mismatch'},
  {...valid,output:[{type:'function_call',name:'publish',arguments:'{}'}]},
  {...valid,output:[{...valid.output[0],content:[{type:'refusal',refusal:'No'}]}]},
  {...valid,output:[{...valid.output[0],content:[{type:'output_text',text:'not JSON'}]}]},
  {...valid,output:[{...valid.output[0],content:[{type:'output_text',text:'x'.repeat(65536)}]}]}];
 for(const value of bad)assert.throws(()=>extractOutput(value),{code:'unavailable'});
});
test('Azure errors are safely classified without Gemini fallback or hidden retries; timeouts include SDK/token initialization',async()=>{
 for(const [status,reason] of [[401,'provider_auth'],[403,'provider_auth'],[404,'model_unavailable'],[429,'provider_quota'],[500,'provider_http'],[504,'provider_timeout']]){
  const f=fakeSDK(async()=>{throw Object.assign(Error('PRIVATE_SECRET_OR_URL'),{status});});
  const p=createAIProvider({env:{...env,GEMINI_API_KEY:'must-not-be-used'},loadSDK:f.loadSDK,fetcher:async()=>assert.fail('No Gemini fallback')});
  await assert.rejects(()=>p.suggest(draft),error=>error.reason===reason&&!JSON.stringify(error).includes('PRIVATE_SECRET'));assert.equal(f.calls.responses.length,1);
 }
 const slow=createAzureProvider({env,timeoutMs:10,loadSDK:()=>new Promise(()=>{})});await assert.rejects(()=>slow.suggest(draft),{reason:'provider_timeout'});
 const wrapped=fakeSDK(async()=>{throw Object.assign(Error('SDK wrapper with private content'),{cause:{name:'AuthenticationRequiredError',message:'PRIVATE'}});});
 await assert.rejects(()=>createAzureProvider({env,loadSDK:wrapped.loadSDK}).suggest(draft),{reason:'provider_auth'});
 let signal;const f=fakeSDK(async(_,options)=>{signal=options.signal;return new Promise(()=>{});});
 await assert.rejects(()=>createAzureProvider({env,timeoutMs:10,loadSDK:f.loadSDK}).suggest(draft),{reason:'provider_timeout'});assert.equal(signal.aborted,true);
 const controller=new AbortController(),g=fakeSDK();controller.abort();await assert.rejects(()=>createAzureProvider({env,loadSDK:g.loadSDK}).suggest(draft,{signal:controller.signal}),{reason:'provider_timeout'});assert.equal(g.calls.responses.length,0);
});
function servicesFixture(reply){
 const rows={'users/owner':{role:'owner',accountStatus:'active'},'users/other':{role:'owner',accountStatus:'active'},'users/shop':{role:'shop',accountStatus:'active',verificationStatus:'approved'},
  'users/admin':{role:'admin',accountStatus:'active'},'serviceCategories/paint':{name:'Wrap & Paint',archived:false},'vehicles/car':{ownerId:'owner',make:'Toyota',model:'Corolla',year:2020,colour:'White',registration:'PRIVATE',archived:false}};
 const db={doc:path=>({get:async()=>({exists:!!rows[path],data:()=>rows[path]})}),collection:path=>{assert.equal(path,'serviceCategories');return {where:()=>({limit:()=>({get:async()=>({docs:[{id:'paint',data:()=>rows['serviceCategories/paint']}]})})})};},runTransaction:()=>assert.fail('No marketplace or generation accounting writes')};
 const auth={getUser:async()=>({emailVerified:true,metadata:{creationTime:'2020-01-01'}}),verifyIdToken:async uid=>({uid,email_verified:true,auth_time:Date.now()/1000})};
 const f=fakeSDK(reply||(async(body)=>envelope(body.text.format.name==='pimppilot_studio'?plan:{...suggestion,categoryId:JSON.parse(body.input[0].content[0].text).kind==='showcase'?'Wrap & Paint':'paint'})));
 const diagnostics=[];
 const services=createServices({db,auth,storage:{},aiProvider:createAIProvider({env,loadSDK:f.loadSDK}),aiStudioProvider:createAIStudioProvider({env,loadSDK:f.loadSDK}),aiDiagnostic:value=>diagnostics.push(value)});
 return {rows,calls:f.calls,diagnostics,app:createApp({services,auth})};
}
test('actual authenticated Express routes serve customer and workshop drafting repeatedly through Azure and keep existing validation and no-write contracts',async()=>{
 const f=servicesFixture(),before=JSON.stringify(f.rows);
 await http(f.app).post('/api/ai/assist').send({}).expect(401);
 for(const [uid,kind,categoryId] of [['owner','request','paint'],['shop','showcase','Wrap & Paint']])for(let i=0;i<12;i++){
  const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer '+uid).send({kind,title:draft.title,description:draft.description,categoryId}).expect(200);
  assert.equal(response.body.data.category.id,categoryId);assert.deepEqual(response.body.data.missingDetails,[]);
 }
 assert.equal(f.calls.responses.length,24);assert.equal(JSON.stringify(f.rows),before);
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer admin').send({kind:'request',title:'Black wrap',description:draft.description}).expect(403);
 const hallucination=servicesFixture(async()=>envelope({...suggestion,description:'Install a turbo with 500 horsepower.'}));
 const rejected=await http(hallucination.app).post('/api/ai/assist').set('Authorization','Bearer owner').send({kind:'request',title:draft.title,description:draft.description}).expect(503);
 assert.equal(rejected.body.error.fields.aiReason,'suggestion_rejected');assert.equal(hallucination.calls.responses.length,1);
});
test('Azure Studio has independent instructions, schema and bounded user context, with transient inline images and no private media output',async()=>{
 const f=servicesFixture(),before=JSON.stringify(f.rows),image={mimeType:'image/jpeg',data:Buffer.from([255,216,255,224,0,16,255,217]).toString('base64')};
 for(const uid of ['shop','admin'])await http(f.app).post('/api/ai/studio').set('Authorization','Bearer '+uid).send({vehicleId:'car',message:'Wrap doors'}).expect(403);
 await http(f.app).post('/api/ai/studio').set('Authorization','Bearer other').send({vehicleId:'car',message:'Wrap doors'}).expect(404);
 await http(f.app).post('/api/ai/studio').set('Authorization','Bearer owner').send({vehicleId:'car',message:'Wrap doors',conversation:'foreign'}).expect(400);
 const response=await http(f.app).post('/api/ai/studio').set('Authorization','Bearer owner').send({vehicleId:'car',message:'Black wrap',history:[{message:'Subtle wrap',plan}],image}).expect(200);
 assert.equal(response.body.data.imageEditingAvailable,false);assert.equal(JSON.stringify(response.body).includes(image.data),false);assert.equal(JSON.stringify(f.rows),before);
 const [body]=f.calls.responses[0];assert.equal(body.text.format.name,'pimppilot_studio');assert.match(body.instructions,/Studio mode only/);
 const context=JSON.parse(body.input[0].content[0].text);assert.equal(context.history.length,1);assert.equal(context.vehicle.registration,undefined);assert.equal(context.image,undefined);
 assert.deepEqual(body.input[0].content[1],{type:'input_image',image_url:'data:image/jpeg;base64,'+image.data,detail:'auto'});
 await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send({kind:'request',title:draft.title,description:draft.description}).expect(200);
 const next=f.calls.responses[1][0];assert.equal(next.text.format.name,'pimppilot_draft');assert.doesNotMatch(next.instructions,/Studio mode only/);assert.equal(next.input[0].content.length,1);assert.equal(next.conversation,undefined);assert.equal(next.previous_response_id,undefined);
});

test('fast Azure rejection preserves the HTTP status and safe SDK evidence only in server telemetry',async()=>{
 const id='9f5c9234-4da4-48e4-b324-28c86b293c6a';
 const error=Object.assign(Error('PRIVATE prompt, secret and https://private.test/?token=PRIVATE'),{name:'BadRequestError',status:400,code:'unsupported_parameter',param:'store',requestID:id});
 const f=servicesFixture(async()=>{throw error;}),before=JSON.stringify(f.rows);
 const response=await http(f.app).post('/api/ai/assist').set('Authorization','Bearer owner').send({kind:'request',title:draft.title,description:draft.description}).expect(503);
 assert.equal(response.body.error.code,'unavailable');assert.equal(response.body.error.fields.aiReason,'service_unavailable');
 const row=f.diagnostics[0];assert.equal(row.reasonCode,'provider_http');assert.equal(row.providerHttpStatus,400);
 assert.equal(row.providerFailureStage,'responses_request');assert.equal(row.providerErrorType,'BadRequestError');
 assert.equal(row.providerErrorCode,'unsupported_parameter');assert.equal(row.providerErrorParam,'store');assert.equal(row.providerRequestId,id);
 assert.equal(row.providerFailureSubcode,'azure_unsupported_parameter');assert.equal(row.providerCredentialState,'not_observed');
 assert.equal(JSON.stringify(row).includes('PRIVATE'),false);assert.equal(JSON.stringify(response.body).includes(id),false);
 assert.equal(JSON.stringify(response.body).includes('providerError'),false);assert.equal(JSON.stringify(f.rows),before);assert.equal(f.calls.responses.length,1);
});

test('installed Azure/OpenAI SDK HTTP errors report response status, request ID and acquired credential state without raw bodies',async()=>{
 const sdk=await loadAzureSDK(),previous=globalThis.fetch,id='74737c5f-30d7-4c2b-a706-abf79fa54c28';
 class InterceptedCredential{async getToken(){return {token:'PRIVATE_TEST_TOKEN',expiresOnTimestamp:Date.now()+3600000};}}
 let calls=0;
 try{
  for(const status of [400,401,403,404,422,429,500,503]){
   globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{code:'invalid_request_error',param:'text.format.schema',message:'PRIVATE_RAW_AZURE_BODY'}}),{status,headers:{'content-type':'application/json','apim-request-id':id}});};
   const records=[],statuses=[],p=createAzureProvider({env,loadSDK:async()=>({AIProjectClient:sdk.AIProjectClient,ClientSecretCredential:InterceptedCredential})});
   await assert.rejects(()=>p.suggest(draft,{onResponse:value=>statuses.push(value),onProviderDiagnostic:value=>records.push(value)}),{code:'unavailable'});
   assert.deepEqual(statuses,[status]);assert.equal(records[0].providerHttpStatus,status);assert.equal(records[0].providerRequestId,id);
   assert.equal(records[0].providerCredentialState,'acquired');assert.equal(records[0].providerFailureStage,'responses_request');
   assert.equal(JSON.stringify(records).includes('PRIVATE'),false);
  }
  assert.equal(calls,8,'SDK errors must never trigger retries or a fallback');
 }finally{globalThis.fetch=previous;}
});

test('token failure is distinguished from Responses rejection and concurrent cached-client operations retain independent stages',async()=>{
 const sdk=await loadAzureSDK(),previous=globalThis.fetch;let rejectToken,started;
 const waiting=new Promise(resolve=>started=resolve);let tokens=0,requests=0;
 class InterceptedCredential{async getToken(){
  if(++tokens===1){started();return new Promise((_,reject)=>{rejectToken=reject;});}
  return {token:'PRIVATE_TEST_TOKEN',expiresOnTimestamp:Date.now()+3600000};
 }}
 globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({error:{code:'invalid_request_error',param:'reasoning.effort',message:'PRIVATE'}}),{status:400,headers:{'content-type':'application/json'}});};
 try{
  const p=createAzureProvider({env,loadSDK:async()=>({AIProjectClient:sdk.AIProjectClient,ClientSecretCredential:InterceptedCredential})}),a=[],b=[];
  const first=assert.rejects(()=>p.suggest(draft,{onProviderDiagnostic:value=>a.push(value)}),{reason:'provider_auth'});
  await waiting;
  const second=assert.rejects(()=>p.suggest(draft,{onProviderDiagnostic:value=>b.push(value)}),{reason:'provider_auth'});
  await new Promise(resolve=>setImmediate(resolve));
  rejectToken(Object.assign(Error('PRIVATE credential failure'),{name:'AuthenticationRequiredError',statusCode:400,code:'invalid_client'}));await Promise.all([first,second]);
  assert.equal(a[0].providerFailureStage,'token_acquisition');assert.equal(a[0].providerCredentialState,'failed');assert.equal(a[0].providerHttpStatus,400);assert.equal(a[0].providerFailureSubcode,'azure_client_credentials');
  assert.equal(b[0].providerFailureStage,'token_acquisition');assert.equal(b[0].providerCredentialState,'failed');
  assert.equal(requests,0,'A failed token acquisition must not reach Responses');
  const c=[];await assert.rejects(()=>p.suggest(draft,{onProviderDiagnostic:value=>c.push(value)}),{reason:'provider_http'});
  assert.equal(c[0].providerFailureStage,'responses_request');assert.equal(c[0].providerCredentialState,'acquired');assert.equal(c[0].providerErrorParam,'reasoning.effort');
  assert.equal(requests,1);assert.equal(JSON.stringify([a,b,c]).includes('PRIVATE'),false);
 }finally{globalThis.fetch=previous;}
});

test('diagnostics bound cause traversal, sanitise string/nested statuses, and reject arbitrary private fields',async()=>{
 const {azureDiagnostic,sanitizeDiagnostic}=require('../ai-azure-diagnostics.cjs');
 const inner={statusCode:'404',headers:new Headers({'x-ms-request-id':'71c109c4-102e-45e3-b05e-0872123b39b3'}),code:'AgentNotFound'};
 const wrapped=Object.assign(Error('PRIVATE'),{cause:inner});inner.cause=wrapped;
 const record=azureDiagnostic(wrapped,{stage:'responses_request',credentialState:'acquired'});
 assert.equal(record.providerHttpStatus,404);assert.equal(record.providerErrorCode,'AgentNotFound');assert.equal(record.providerFailureSubcode,'azure_http_404');
 const invalid=sanitizeDiagnostic(Object.fromEntries(Object.keys(record).map(key=>[key,'PRIVATE'])));
 assert.ok(Object.values(invalid).every(value=>value===null));
 for(const value of [0,600,-1,'400 PRIVATE',Infinity])assert.equal(azureDiagnostic({status:value},{stage:'responses_request'}).providerHttpStatus,null);
 for(const [code,subcode] of [['ENOTFOUND','azure_dns'],['ERR_TLS_CERT_ALTNAME_INVALID','azure_tls'],['ECONNRESET','azure_connection']]){
  assert.equal(azureDiagnostic({cause:{code}},{stage:'responses_request'}).providerFailureSubcode,subcode);
 }
 const f=fakeSDK(async()=>{throw {cause:{response:{status:404}},message:'PRIVATE'};});
 await assert.rejects(()=>createAzureProvider({env,loadSDK:f.loadSDK}).suggest(draft),{reason:'model_unavailable'});
 const g=fakeSDK();assert.deepEqual(await createAzureProvider({env,loadSDK:g.loadSDK}).suggest(draft,{onResponse:()=>{throw Error('telemetry');}}),suggestion);
});
