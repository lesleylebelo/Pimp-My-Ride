const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
// Read-only remote main verified 2026-10-23. Render's actual running SHA needs owner confirmation.
const BASE='0ef47b54a4083bf1a29deab96c383ddb08b98e6c',root=path.resolve(__dirname,'../..');
const baseline=file=>execFileSync('git',['show',BASE+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}).replace(/\r\n/g,'\n');
const current=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
test('model migration preserves daily quota, diagnostics, auth, validation and all non-provider runtime',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 for(const file of files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&file!=='backend/ai-provider.cjs'))assert.equal(current(file),baseline(file),file);
 for(const file of ['backend/package.json','backend/package-lock.json','firestore.rules','firestore.indexes.json','render.yaml'])assert.equal(current(file),baseline(file),file);
});
test('model migration leaves the application API client unchanged',()=>{
 assert.equal(current('src/shared/services/api.js'),baseline('src/shared/services/api.js'));
});
test('provider changes only add the selected model and adapt only documented Gemini 3 request/response metadata',()=>{
 const restored=current('backend/ai-provider.cjs')
  .replace("&&['gemini-2.5-flash-lite','gemini-3.5-flash-lite'].includes(model);","&&model==='gemini-2.5-flash-lite';")
  .replace("     // Gemini 3 does not support candidateCount; still require exactly one returned candidate.\n",'')
  .replace("generationConfig:{...(model==='gemini-2.5-flash-lite'?{candidateCount:1}:{}),maxOutputTokens:1800","generationConfig:{candidateCount:1,maxOutputTokens:1800");
 assert.equal(restored
  .replace("    // Stateless editing discards Gemini 3 transport signatures; never expose/store them.\n",'')
  .replace("key!=='text'&&!(model==='gemini-3.5-flash-lite'&&key==='thoughtSignature'&&typeof part.thoughtSignature==='string')","key!=='text'"),baseline('backend/ai-provider.cjs'));
});
