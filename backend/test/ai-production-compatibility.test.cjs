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
 const allowed=['backend/app.cjs','backend/messaging.cjs','backend/posts.cjs','backend/services.cjs','backend/storage.cjs','backend/ai-provider.cjs','backend/ai-assist.cjs','backend/ai-errors.cjs','backend/ai-release-control.cjs','backend/ai-grounding.cjs','backend/marketplace.cjs','backend/server.cjs','backend/mock-payment-gate.cjs','backend/quote-recommendations.cjs','backend/quote-recommendation-read.cjs'];
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 for(const file of files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&!allowed.includes(file)))assert.equal(current(file),baseline(file),file);
 // AI presentation and its pending-request lock are deliberately changed by the
 // PimpPilot audit; their behavioural contracts live in tests/ai-assist.test.cjs.
 for(const file of ['firestore.rules','render.yaml'])assert.equal(current(file),baseline(file),file);
 // Transactional emails add only their own queue index/exemptions; preserve
 // every pre-existing marketplace and AI index without relaxing the boundary.
 const indexes=JSON.parse(current('firestore.indexes.json'));
 indexes.indexes=indexes.indexes.filter(index=>index.collectionGroup!=='transactionalEmailJobs');
 indexes.fieldOverrides=indexes.fieldOverrides.filter(index=>index.collectionGroup!=='transactionalEmailJobs');
 assert.deepEqual(indexes,JSON.parse(baseline('firestore.indexes.json')));
 // The authorised Azure migration adds SDKs but does not upgrade any existing
 // resolved package. Shared transitive dependencies may lose their dev-only flag.
 const oldLock=JSON.parse(baseline('backend/package-lock.json')),newLock=JSON.parse(current('backend/package-lock.json'));
 for(const [name,value] of Object.entries(oldLock.packages).filter(([name])=>name)){
  for(const field of ['version','resolved','integrity'])assert.equal(newLock.packages[name]?.[field],value[field],`${name}: ${field}`);
 }
 for(const [name,version] of [['@azure/ai-projects','2.9.0'],['@azure/identity','4.14.0']]){
  assert.equal(newLock.packages[''].dependencies[name],version);assert.equal(newLock.packages['node_modules/'+name].version,version);
 }
 // Local connection recovery now explicitly permits changes to health readiness
 // and connection diagnostics, covered by tests/api.test.cjs. Keep configuration,
 // fetch deadlines, authenticated operations and uploads byte-for-byte protected.
 const apiFile='src/shared/services/api.js',previousAPI=baseline(apiFile),nextAPI=current(apiFile);
 const section=(source,start,end)=>source.slice(source.indexOf(start),end?source.indexOf(end):undefined);
 for(const [start,end] of [['function baseURL()','function connectionError('],['async function fetchWithTimeout(','async function ready('],['export async function apiRequest(']]){
  assert.equal(section(nextAPI,start,end),section(previousAPI,start,end),`${apiFile}: ${start}`);
 }
 const old=JSON.parse(baseline('backend/package.json')),next=JSON.parse(current('backend/package.json'));delete old.scripts.test;delete next.scripts.test;
 assert.equal(next.scripts['check:ai-config'],'node check-ai-config.cjs');delete next.scripts['check:ai-config'];
 assert.equal(next.scripts['test:email'],'node --test test/transactional-email.test.cjs test/marketplace.test.cjs');delete next.scripts['test:email'];
 // Existing Google sign-in dependency predates the email change. Keep its
 // declared version pinned to the current lock while comparing older runtime.
 assert.equal(next.dependencies['google-auth-library'],newLock.packages[''].dependencies['google-auth-library']);delete next.dependencies['google-auth-library'];
 for(const name of ['@azure/ai-projects','@azure/identity'])delete next.dependencies[name];assert.deepEqual(next,old);
});
test('no active experimental quota or allowlist dependencies remain',()=>{
 const service=current('backend/ai-assist.cjs'),services=current('backend/services.cjs');
 for(const obsolete of ['ai-release-control','PMR_AI_TEST_UID','hourCount','minuteCount','releaseControl','aiAssistDaily','aiAssistAttempts'])assert.ok(!service.includes(obsolete),obsolete);
 assert.ok(!services.includes('aiReleaseControl'));assert.ok(!current('backend/.env.example').includes('PMR_AI_TEST_UID'));
 assert.match(service,/inFlight.size>=MAX_CONCURRENT/);assert.match(service,/timeoutMs=15000/);
 assert.deepEqual(Object.keys(require('../ai-release-control.cjs')).sort(),['ATTEMPT_PREFIX','CONTROL_PATH','DAILY_PREFIX']);
});

test('real provider schema, authentication, bounded dispatch and post-generation access are protected',()=>{
 const section=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
 const next=current('backend/ai-provider.cjs'),previous=baseline('backend/ai-provider.cjs');
 assert.equal(section(next,' const model=','  const instructions='),section(previous,' const model=','  const instructions='));
 assert.equal(section(next,'  try{','   if(!response.ok)'),section(previous,'  try{','   if(!response.ok)'));
 const service=current('backend/ai-assist.cjs');
 for(const guard of ['fresh.uid!==account.uid','fresh.profile.role!==p.role','!D.active(fresh.profile)',"fresh.profile.verificationStatus!=='approved'",'Buffer.byteLength(JSON.stringify(input))>8192'])assert.ok(service.includes(guard),guard);
 const p=current('backend/services.cjs');for(const guard of ['auth.getUser(uid)','!user.emailVerified','!request.auth.token.email_verified','user.disabled','tokensValidAfterTime'])assert.ok(p.includes(guard));
});
