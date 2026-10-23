const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
// Verified against GitHub main on 2026-10-22; NOT a claim about Render's running SHA.
const BASE='10e3c0fc089aba7cdf1420c5441220b0b6956b44',root=path.resolve(__dirname,'../..');
const baseline=file=>execFileSync('git',['show',`${BASE}:${file}`],{cwd:root,encoding:'utf8',windowsHide:true}).replace(/\r\n/g,'\n');
const current=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
test('AI route is the only Express change relative to verified main',()=>{
 assert.equal(current('backend/app.cjs').replace(" app.post('/api/ai/assist',action(services.aiAssist));\n",''),baseline('backend/app.cjs'));
});
test('AI service wiring leaves authentication and all existing services identical to main',()=>{
 const stripped=current('backend/services.cjs')
  .replace("const {createAIAssist}=require('./ai-assist.cjs');\n",'')
  .replace(',aiProvider,aiReleaseControl','')
  .replace('const aiAssist=createAIAssist({db,actor,provider:aiProvider,releaseControl:aiReleaseControl});\n','')
  .replace(',messaging,aiAssist,photosApi',',messaging,photosApi');
 assert.equal(stripped,baseline('backend/services.cjs'));
});
test('non-AI backend modules remain identical to main except the tested CORS configuration',()=>{
 const files=execFileSync('git',['ls-tree','-r','--name-only',BASE,'backend'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split('\n');
 const protectedFiles=files.filter(file=>/^backend\/[^/]+\.cjs$/.test(file)&&!['backend/services.cjs','backend/app.cjs'].includes(file));
 for(const file of [...protectedFiles,'backend/package-lock.json','firestore.rules','render.yaml']){
  // The CORS repair intentionally changes corsOrigins; security.test.cjs covers
  // its browser allowlist. Keep every other configuration function protected.
  const unchanged=source=>file==='backend/config.cjs'?source.slice(source.indexOf('function storageConfig(')):source;
  assert.equal(unchanged(current(file)),unchanged(baseline(file)),file);
 }
 const deployed=JSON.parse(baseline('backend/package.json')),prepared=JSON.parse(current('backend/package.json'));
 delete deployed.scripts.test;delete prepared.scripts.test;assert.deepEqual(prepared,deployed);
});
