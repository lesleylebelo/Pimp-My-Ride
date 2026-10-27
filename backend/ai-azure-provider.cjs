const {AIFailure,failure}=require('./ai-errors.cjs');
const {draftContract}=require('./ai-draft-contract.cjs');
const studioContract=require('./ai-studio-contract.cjs');
const {AsyncLocalStorage}=require('node:async_hooks');
const {azureDiagnostic}=require('./ai-azure-diagnostics.cjs');
function azureConfiguration(env=process.env){
 const required=['AZURE_TENANT_ID','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','AZURE_FOUNDRY_PROJECT_ENDPOINT','AZURE_FOUNDRY_AGENT_NAME'];
 for(const name of required)if(typeof env[name]!=='string'||!env[name].trim())throw Error(`Set ${name} before enabling Azure AI.`);
 const endpoint=env.AZURE_FOUNDRY_PROJECT_ENDPOINT.trim().replace(/\/$/,''),agentName=env.AZURE_FOUNDRY_AGENT_NAME.trim();
 let url;try{url=new URL(endpoint);}catch{throw Error('Invalid AZURE_FOUNDRY_PROJECT_ENDPOINT.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!/^[-a-z0-9]+\.services\.ai\.azure\.com$/i.test(url.hostname)||!/^\/api\/projects\/[A-Za-z0-9_-]+$/.test(url.pathname))throw Error('AZURE_FOUNDRY_PROJECT_ENDPOINT must be an HTTPS Foundry project endpoint.');
 if(agentName!=='PimpPilot')throw Error('AZURE_FOUNDRY_AGENT_NAME must be the existing PimpPilot agent, not the model deployment.');
 const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!guid.test(env.AZURE_TENANT_ID.trim())||!guid.test(env.AZURE_CLIENT_ID.trim()))throw Error('AZURE_TENANT_ID and AZURE_CLIENT_ID must be application directory identifiers.');
 return {endpoint,agentName,tenantId:env.AZURE_TENANT_ID.trim(),clientId:env.AZURE_CLIENT_ID.trim(),clientSecret:env.AZURE_CLIENT_SECRET};
}
function validateAzureStartup(env=process.env){
 if(env.PMR_AI_PROVIDER?.trim()==='azure'&&(env.PMR_AI_ASSIST_ENABLED==='true'||env.PMR_AI_STUDIO_ENABLED==='true'))azureConfiguration(env);
}
function providerFailure(error,signal,diagnostic){
 if(error instanceof AIFailure)return error;
 if(signal?.aborted||diagnostic.providerFailureSubcode==='azure_timeout')return failure('provider_timeout');
 if(diagnostic.providerFailureStage==='sdk_initialization'||diagnostic.providerFailureStage==='request_serialization')return failure('configuration');
 if(diagnostic.providerFailureStage==='token_acquisition')return failure(['azure_dns','azure_tls','azure_connection'].includes(diagnostic.providerFailureSubcode)?'provider_network':'provider_auth');
 // The SDK wraps credential callback failures in OpenAIError.cause. Classify
 // only machine fields; never retain, log, or expose the wrapped message.
 for(let source=error,depth=0;source&&depth<3;source=source.cause,depth++){
  if(source.status===401||source.status===403||source.statusCode===401||source.statusCode===403||['AuthenticationError','AuthenticationRequiredError','CredentialUnavailableError','AggregateAuthenticationError','ClientAuthError','ClientConfigurationError'].includes(source.name))return failure('provider_auth');
 }
 const status=diagnostic.providerHttpStatus;
 if(status===401||status===403||['AuthenticationError','AuthenticationRequiredError','CredentialUnavailableError','AggregateAuthenticationError'].includes(error?.name))return failure('provider_auth');
 if(status===429)return failure('provider_quota');
 if(status===404)return failure('model_unavailable');
 if(status===402)return failure('provider_billing');
 if(status===408||status===504)return failure('provider_timeout');
 return failure(Number.isInteger(status)?'provider_http':'provider_network');
}
function extractOutput(response){
 const bad=()=>failure('malformed_output');
 if(!response||typeof response!=='object'||Buffer.byteLength(JSON.stringify(response))>65536||response.status!=='completed'||response.error||response.incomplete_details||!Array.isArray(response.output))throw bad();
 const answer=[];
 for(const item of response.output){
  if(item?.type==='reasoning')continue;
  if(item?.type!=='message'||item.role!=='assistant'||item.status!=='completed'||!Array.isArray(item.content)||!item.content.length)throw bad();
  for(const part of item.content){
   if(part?.type==='refusal')throw failure('provider_blocked');
   if(part?.type!=='output_text'||typeof part.text!=='string')throw bad();
   answer.push(part.text);
  }
 }
 const text=answer.join('');
 if(!text.trim()||response.output_text!==undefined&&response.output_text!==text)throw bad();
 try{return JSON.parse(text);}catch{throw bad();}
}
async function loadAzureSDK(){
 const [projects,identity]=await Promise.all([import('@azure/ai-projects'),import('@azure/identity')]);
 return {AIProjectClient:projects.AIProjectClient,ClientSecretCredential:identity.ClientSecretCredential};
}
async function prepareAzureStartup(env=process.env){
 validateAzureStartup(env);
 if(env.PMR_AI_PROVIDER?.trim()==='azure'&&(env.PMR_AI_ASSIST_ENABLED==='true'||env.PMR_AI_STUDIO_ENABLED==='true')){
  try{const sdk=await loadAzureSDK();if(typeof sdk.AIProjectClient!=='function'||typeof sdk.ClientSecretCredential!=='function')throw Error();}
  catch{throw Error('Azure SDK initialization failed. Install the locked backend dependencies using Node.js 22.');}
 }
}
function createAzureProvider({env=process.env,studio=false,loadSDK=loadAzureSDK,timeoutMs=studio?28000:13000}={}){
 let config;try{config=azureConfiguration(env);}catch{/* Configuration is reported without values. */}
 const enabled=env.PMR_AI_PROVIDER?.trim()==='azure'&&env[studio?'PMR_AI_STUDIO_ENABLED':'PMR_AI_ASSIST_ENABLED']==='true'&&!!config;
 let clientPromise;
 const operations=new AsyncLocalStorage();
 const tokenFailures=new WeakSet();
 function client(){
  if(!clientPromise)clientPromise=Promise.resolve().then(async()=>{
   const {AIProjectClient,ClientSecretCredential}=await loadSDK();
   // Explicit Entra application credentials; no interactive or CLI fallback.
   const credential=new ClientSecretCredential(config.tenantId,config.clientId,config.clientSecret);
   const tokenCredential={async getToken(...args){
    const operation=operations.getStore();if(operation)operation.stage='token_acquisition';
    try{const token=await credential.getToken(...args);if(operation){operation.credentialState='acquired';operation.stage='responses_request';}return token;}
    catch(error){if(error&&typeof error==='object')tokenFailures.add(error);if(operation)operation.credentialState='failed';throw error;}
   }};
   const project=new AIProjectClient(config.endpoint,tokenCredential,{tracingOptions:{experimental:false,contentRecording:false,traceContextPropagation:false}});
   return project.getOpenAIClient({azureConfig:{allowPreview:true,agentName:config.agentName},maxRetries:0,timeout:timeoutMs,logLevel:'off'});
  }).catch(error=>{clientPromise=undefined;throw error;});
  return clientPromise;
 }
 return {enabled,async suggest(draft,{signal,onResponse=()=>{},onProviderDiagnostic=()=>{}}={}){
  if(!enabled)throw failure('configuration');
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
  let timer;
  const context={stage:'sdk_initialization',credentialState:'not_observed',httpStatus:null};
  const observe=(callback,value)=>{try{Promise.resolve(callback(value)).catch(()=>{});}catch{}};
  try{
   const work=async()=>{
    const openai=await client();if(controller.signal.aborted)throw failure('provider_timeout');
    context.stage='request_serialization';
    const {schema,instructions}=studio?studioContract:draftContract(draft);
    const content=[{type:'input_text',text:JSON.stringify(studio?{...draft,image:undefined}:draft)}];
    if(studio&&draft.image)content.push({type:'input_image',image_url:`data:${draft.image.mimeType};base64,${draft.image.data}`,detail:'auto'});
    // Stateless non-stored Responses: no Conversations, Files, previous-response
    // IDs, agent mutations or executable tools. Refinement is bounded input data.
    context.stage='responses_request';
    const response=await openai.responses.create({
     instructions,input:[{role:'user',content}],store:false,stream:false,
     tools:[],tool_choice:'none',max_output_tokens:studio?6000:4000,
     reasoning:{effort:'minimal'},
     text:{format:{type:'json_schema',name:studio?'pimppilot_studio':'pimppilot_draft',strict:true,schema}},
    },{signal:controller.signal,maxRetries:0,timeout:timeoutMs});
    context.httpStatus=200;observe(onResponse,200);context.stage='output_extraction';
    return extractOutput(response);
   };
   return await Promise.race([operations.run(context,work),new Promise((_,reject)=>{
    const stop=()=>reject(failure('provider_timeout'));
    controller.signal.addEventListener('abort',stop,{once:true});
    if(controller.signal.aborted)stop();
    timer=setTimeout(()=>controller.abort(),timeoutMs);
   })]);
  }catch(error){
   // The SDK may share one token-refresh promise between simultaneous calls.
   // Attribute its failure to every waiter without sharing request contexts.
   for(let source=error,depth=0;source&&depth<4;source=source.cause,depth++)if(tokenFailures.has(source)){context.stage='token_acquisition';context.credentialState='failed';break;}
   const diagnostic=azureDiagnostic(error,{...context,aborted:controller.signal.aborted});
   if(diagnostic.providerHttpStatus!==null)observe(onResponse,diagnostic.providerHttpStatus);
   observe(onProviderDiagnostic,diagnostic);
   throw providerFailure(error,controller.signal,diagnostic);
  }
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
 }};
}
module.exports={createAzureProvider,azureConfiguration,validateAzureStartup,prepareAzureStartup,extractOutput,loadAzureSDK};
