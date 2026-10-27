const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('supertest');
const {createAIStudio}=require('../ai-studio.cjs'),{createAIProvider}=require('../ai-provider.cjs'),{createApp}=require('../app.cjs');
const {ApiError}=require('../errors.cjs');
const {createAIStudioProvider}=require('../ai-studio-provider.cjs');
const plan={objective:'A subtle daily driver',observations:[],assumptions:['Wheel fitment needs verification.'],modifications:[{title:'Black wrap',scope:'Wrap the doors in matte black.',parts:['Automotive vinyl'],tradeOffs:'Confirm paint condition and professional installation.'}],considerations:['Preliminary concept; verify compatibility with a workshop.'],questions:['What finish would you prefer?']};
function fixture(provider){
 const rows={'vehicles/car':{ownerId:'owner',make:'Toyota',model:'Corolla',year:2020,colour:'White',registration:'PRIVATE'}};
 const profile={role:'owner',accountStatus:'active'},calls=[];
 const actor=async req=>{if(!req.auth)throw new ApiError('unauthenticated','Sign in.');return {uid:req.auth.uid,profile};};
 const db={doc:path=>({get:async()=>({data:()=>rows[path]})})};
 const adapter=provider||{enabled:true,suggest:async draft=>{calls.push(draft);return structuredClone(plan);}};
 const studio=createAIStudio({db,actor,provider:adapter,timeoutMs:20});
 const call=(data={},uid='owner')=>studio({auth:{uid},data:{vehicleId:'car',message:'Matte black wrap',...data}});
 return {rows,profile,calls,call,studio};
}
test('Studio is owner-only, checks vehicle ownership and sends only necessary vehicle facts without writes',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows);
 assert.deepEqual((await f.call()).plan,plan);
 assert.deepEqual(f.calls[0].vehicle,{make:'Toyota',model:'Corolla',year:2020,colour:'White'});
 assert.equal(f.calls[0].mode,'studio');assert.equal(JSON.stringify(f.rows),before);
 await assert.rejects(()=>f.call({},'other'),{code:'not-found'});
 for(const change of [{role:'shop'},{role:'admin'},{accountStatus:'suspended'},{statusOperation:'busy'},{reviewOperation:'busy'},{provisioningOperation:'busy'}]){
  const s=fixture();Object.assign(s.profile,change);await assert.rejects(()=>s.call(),{code:'permission-denied'});assert.equal(s.calls.length,0);
 }
 f.rows['vehicles/car'].archived=true;await assert.rejects(()=>f.call(),{code:'not-found'});
});
test('Studio rejects mode overrides, arbitrary URLs, invalid images, excess history and malformed plans',async()=>{
 for(const input of [{mode:'assistant'},{image:{url:'https://private.example/photo'}},{image:{mimeType:'image/jpeg',data:'AAAAAAA='}},{image:{mimeType:'image/png',data:'AAAAAAA='}},{history:Array(7).fill({message:'hi',plan})},{message:'x'.repeat(1501)}]){
  const f=fixture();await assert.rejects(()=>f.call(input));assert.equal(f.calls.length,0);
 }
 for(const bad of [{...plan,secret:'private'},{...plan,modifications:[{...plan.modifications[0],scope:'x'.repeat(121)}]},{...plan,observations:['https://private.example/image']}]){
  const f=fixture({enabled:true,suggest:async()=>bad});await assert.rejects(()=>f.call(),{code:'unavailable'});
 }
});
test('bounded refinement and transient images are passed to Studio only; observations require a current image',async()=>{
 const f=fixture(),image={mimeType:'image/jpeg',data:Buffer.from([255,216,255,224,0,16,255,217]).toString('base64')};
 const response=await f.call({image,history:[{message:'Black doors',plan}]});
 assert.equal(response.imageEditingAvailable,false);assert.deepEqual(f.calls[0].image,image);assert.equal(f.calls[0].history.length,1);
 const s=fixture({enabled:true,suggest:async()=>({...plan,observations:['White car.']})});assert.deepEqual((await s.call()).plan.observations,[]);
});
test('provider failures are sanitised, deadlines abort, leases release and late access changes fail closed',async()=>{
 const f=fixture({enabled:true,suggest:async()=>{throw new ApiError('permission-denied','SECRET');}});
 await assert.rejects(()=>f.call(),e=>e.code==='unavailable'&&!e.message.includes('SECRET'));
 let signal;const s=fixture({enabled:true,suggest:async(_,options)=>{signal=options.signal;return new Promise(()=>{});}});
 const running=s.call();await assert.rejects(()=>s.call(),{code:'resource-exhausted'});await assert.rejects(()=>running,{code:'unavailable'});assert.equal(signal.aborted,true);
 await assert.rejects(()=>s.call(),{code:'unavailable'});
 let resolve;const t=fixture({enabled:true,suggest:()=>new Promise(done=>resolve=done)});
 const pending=t.call();await new Promise(done=>setImmediate(done));t.profile.accountStatus='suspended';resolve(plan);await assert.rejects(()=>pending,{code:'permission-denied'});
});
test('Studio route keeps verified HTTP authentication',async()=>{
 const f=fixture(),auth={verifyIdToken:async()=>({uid:'owner'})},app=createApp({services:{aiStudio:f.studio},auth});
 await http(app).post('/api/ai/studio').send({vehicleId:'car',message:'Black wrap'}).expect(401);
 const response=await http(app).post('/api/ai/studio').set('Authorization','Bearer owner').send({vehicleId:'car',message:'Black wrap'}).expect(200);
 assert.equal(response.body.data.vehicleId,'car');
});
test('provider Studio opt-in is independent and sends inline reference photo with isolated schema and instructions',async()=>{
 const env={PMR_AI_STUDIO_ENABLED:'true',PMR_AI_PROVIDER:'gemini',PMR_AI_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'synthetic'};
 let sent;const provider=createAIStudioProvider({env,fetcher:async(_,options)=>{sent=JSON.parse(options.body);return {ok:true,status:200,text:async()=>JSON.stringify({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(plan)}]}}]})};}});
 assert.equal(createAIProvider({env}).enabled,false);assert.equal(provider.enabled,true);
 const image={mimeType:'image/jpeg',data:'test'};
 assert.deepEqual(await provider.suggest({vehicle:{make:'Toyota'},message:'Black wrap',history:[],image},{signal:new AbortController().signal}),plan);
 assert.deepEqual(sent.contents[0].parts[1],{inlineData:{mimeType:'image/jpeg',data:'test'}});
 assert.equal(JSON.parse(sent.contents[0].parts[0].text).image,undefined);
 assert.match(sent.systemInstruction.parts[0].text,/Studio mode only/);assert.ok(sent.generationConfig.responseJsonSchema.properties.modifications);
});
