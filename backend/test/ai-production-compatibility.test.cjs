const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
// Read-only remote main verified 2026-10-23. Render's actual running SHA needs owner confirmation.
const BASE='2fce64406d8a0d052b9ace7a9415755ce215b0ff',root=path.resolve(__dirname,'../..');
const baseline=file=>execFileSync('git',['show',BASE+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}).replace(/\r\n/g,'\n');
const current=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
test('daily AI changes leave all non-AI backend runtime, authentication, dependencies and rules identical to current main',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 for(const file of files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&!file.startsWith('backend/ai-')))assert.equal(current(file),baseline(file),file);
 for(const file of ['backend/package.json','backend/package-lock.json','firestore.rules','firestore.indexes.json','render.yaml'])assert.equal(current(file),baseline(file),file);
});
test('shared API client changes only suppress expected AI errors and retain marketplace behavior',()=>{
 const added="  const expectedAI=path==='ai/assist'&&((response.status===503&&payload.error?.code==='unavailable')||(response.status===429&&payload.error?.code==='resource-exhausted')||(response.status===403&&payload.error?.code==='permission-denied'));\n  if(!expectedAI)console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});";
 const original="  console.error('[PimpMyRide API request failed]',{status:response.status,responseBody:loggedBody,requestUrl});";
 assert.ok(current('src/shared/services/api.js').includes(added));
 assert.equal(current('src/shared/services/api.js').replace(added,original),baseline('src/shared/services/api.js'));
});
