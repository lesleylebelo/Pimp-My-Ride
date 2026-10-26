const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
// Current production main verified read-only on 2026-10-23.
const BASE='1a98e86d7ce301a9f6fe396d2d0b6bbd7508fdd2',root=path.resolve(__dirname,'../..');
const baseline=file=>execFileSync('git',['show',BASE+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}).replace(/\r\n/g,'\n');
const current=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
test('format handling preserves grounding, non-AI runtime, dependencies, rules and UI',()=>{
 // Marketplace has a separately tested, explicitly labelled mock payment change in the original project.
 // Profile-photo routes, private storage scope and avatar metadata are separately
 // covered by profile-photos.test.cjs and emulator integration tests.
 // Keep the original AI boundary strict outside these explicitly authorised features.
 const allowed=['backend/app.cjs','backend/messaging.cjs','backend/posts.cjs','backend/services.cjs','backend/storage.cjs','backend/ai-provider.cjs','backend/ai-assist.cjs','backend/ai-errors.cjs','backend/ai-release-control.cjs','backend/marketplace.cjs','backend/server.cjs','backend/mock-payment-gate.cjs','backend/quote-recommendations.cjs','backend/quote-recommendation-read.cjs'];
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 for(const file of files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&!allowed.includes(file)))assert.equal(current(file),baseline(file),file);
 // AI presentation and its pending-request lock are deliberately changed by the
 // PimpPilot audit; their behavioural contracts live in tests/ai-assist.test.cjs.
 for(const file of ['backend/.env.example','backend/package-lock.json','firestore.rules','firestore.indexes.json','render.yaml'])assert.equal(current(file),baseline(file),file);
 // Local connection recovery now explicitly permits changes to health readiness
 // and connection diagnostics, covered by tests/api.test.cjs. Keep configuration,
 // fetch deadlines, authenticated operations and uploads byte-for-byte protected.
 const apiFile='src/shared/services/api.js',previousAPI=baseline(apiFile),nextAPI=current(apiFile);
 const section=(source,start,end)=>source.slice(source.indexOf(start),end?source.indexOf(end):undefined);
 for(const [start,end] of [['function baseURL()','function connectionError('],['async function fetchWithTimeout(','async function ready('],['export async function apiRequest(']]){
  assert.equal(section(nextAPI,start,end),section(previousAPI,start,end),`${apiFile}: ${start}`);
 }
 const old=JSON.parse(baseline('backend/package.json')),next=JSON.parse(current('backend/package.json'));delete old.scripts.test;delete next.scripts.test;assert.deepEqual(next,old);
});
test('daily quota and storage guards differ only by content-free diagnostic fields',()=>{
 const restored=current('backend/ai-release-control.cjs')
  .replace("{AIFailure,failure,rejection}","{AIFailure,failure}")
  .replace("rejection('permission-denied','tester_required',","new ApiError('permission-denied',")
  .replace("rejection('resource-exhausted','daily_allowance','The daily AI test allowance has been used. Your draft is unchanged.',Date.parse(day+'T00:00:00Z')+86400000)","new ApiError('resource-exhausted','The daily AI test allowance has been used. Your draft is unchanged.')")
  .replace('outputStage:null,outputRule:null,','')
  .replace('outputStage:safe?.outputStage??null,outputRule:safe?.outputRule??null,','');
 assert.equal(restored,baseline('backend/ai-release-control.cjs'));
});
test('request validation, quota values, timeout, provider request and post-provider access guards stay protected',()=>{
 const previous=baseline('backend/ai-assist.cjs'),next=current('backend/ai-assist.cjs');
 const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
 for(const [start,end] of [["  if(Buffer.byteLength",'  releaseControl.authorize'],['  let categories=','  const clock='],['  quota.pending=true;','  }catch(error){']])assert.equal(section(next,start,end),section(previous,start,end));
 const access=source=>source.split('\n').find(line=>line.includes('fresh.uid!==account.uid'));
 assert.equal(access(next),access(previous));
 assert.match(next,/quota\.minuteCount>=3\|\|quota\.hourCount>=10/);assert.match(next,/concurrent>=4/);assert.match(next,/usage\.size>=5000/);
 const nextProvider=current('backend/ai-provider.cjs'),oldProvider=baseline('backend/ai-provider.cjs');
 assert.equal(section(nextProvider,'function createAIProvider','  const instructions='),section(oldProvider,'function createAIProvider','  const instructions='),'provider selection and response schema unchanged');
 assert.equal(section(nextProvider,'  try{','   if(!response.ok)'),section(oldProvider,'  try{','   if(!response.ok)'),'provider request, token bounds and dispatch unchanged');
 // Only the additional preservation/question guidance changes the original prompt.
 const oldPrompt=section(oldProvider,'  const instructions=','  try{').trimEnd().slice(0,-1);
 assert.ok(section(nextProvider,'  const instructions=','  try{').startsWith(oldPrompt+'+'));
});
