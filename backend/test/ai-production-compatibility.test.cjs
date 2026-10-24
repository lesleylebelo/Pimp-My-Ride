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
 for(const file of ['backend/.env.example','backend/package-lock.json','firestore.rules','firestore.indexes.json','render.yaml','src/shared/services/api.js','src/features/marketplace/services/aiAssistApi.js','src/features/marketplace/services/pimpPilotPresentation.js','src/features/marketplace/components/AIAssistButton.js'])assert.equal(current(file),baseline(file),file);
 const old=JSON.parse(baseline('backend/package.json')),next=JSON.parse(current('backend/package.json'));delete old.scripts.test;delete next.scripts.test;assert.deepEqual(next,old);
});
test('daily quota and storage guards differ only by content-free diagnostic fields',()=>{
 const restored=current('backend/ai-release-control.cjs')
  .replace('outputStage:null,outputRule:null,','')
  .replace('outputStage:safe?.outputStage??null,outputRule:safe?.outputRule??null,','');
 assert.equal(restored,baseline('backend/ai-release-control.cjs'));
});
test('authentication, request validation, rate limits, timeout and post-provider access checks stay unchanged',()=>{
 const previous=baseline('backend/ai-assist.cjs'),next=current('backend/ai-assist.cjs');
 const section=source=>source.slice(source.indexOf('function createAIAssist'));
 assert.equal(section(next),section(previous));
 assert.equal(current('backend/ai-provider.cjs').split('   const bad=')[0],baseline('backend/ai-provider.cjs').split('   const body=')[0],'provider request, model selection and HTTP errors remain unchanged');
});
