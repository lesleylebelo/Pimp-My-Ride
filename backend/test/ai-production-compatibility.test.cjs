const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
// Current production main verified read-only on 2026-10-23.
const BASE='9fa8c2731d5a4be81eeb53f43a6f781229b6d775',root=path.resolve(__dirname,'../..');
const baseline=file=>execFileSync('git',['show',BASE+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}).replace(/\r\n/g,'\n');
const current=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
test('grounding changes preserve provider/model config, non-AI runtime, dependencies, rules and UI',()=>{
 const allowed=['backend/ai-assist.cjs','backend/ai-errors.cjs','backend/ai-release-control.cjs'];
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 for(const file of files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&!allowed.includes(file)))assert.equal(current(file),baseline(file),file);
 for(const file of ['backend/.env.example','backend/package-lock.json','firestore.rules','firestore.indexes.json','render.yaml','src/shared/services/api.js','src/features/marketplace/services/aiAssistApi.js','src/features/marketplace/services/pimpPilotPresentation.js','src/features/marketplace/components/AIAssistButton.js'])assert.equal(current(file),baseline(file),file);
 const old=JSON.parse(baseline('backend/package.json')),next=JSON.parse(current('backend/package.json'));delete old.scripts.test;delete next.scripts.test;assert.deepEqual(next,old);
});
test('daily quota and storage guards differ only by content-free diagnostic fields',()=>{
 const restored=current('backend/ai-release-control.cjs')
  .replace('reasonCode:null,rejectedField:null,validationRule:null,state:','reasonCode:null,state:')
  .replace('reasonCode:safe?.reason??null,rejectedField:safe?.rejectedField??null,validationRule:safe?.validationRule??null,finishedAt:','reasonCode:safe?.reason??null,finishedAt:');
 assert.equal(restored,baseline('backend/ai-release-control.cjs'));
});
test('authentication, request validation, rate limits, timeout and post-provider access checks stay unchanged',()=>{
 const previous=baseline('backend/ai-assist.cjs'),next=current('backend/ai-assist.cjs');
 const section=source=>source.slice(source.indexOf('function createAIAssist'));
 const restored=section(next).replace("editorialWords:editorialWords(title+'\\n'+description)",'editorialWords:[...neutral]');
 assert.equal(restored,section(previous));
});
