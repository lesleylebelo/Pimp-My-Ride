throw Error('Retired experimental release generator. Use docs/PIMPPILOT_PRODUCTION.md and the reviewed current backend/frontend sources.');
// Backend-only review artifact. Never changes the checkout, real index or remote.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='9fa8c2731d5a4be81eeb53f43a6f781229b6d775';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
if(git(['branch','--show-current']).trim()!=='lesley')throw Error('Prepare only in the original lesley checkout.');
const tracked=['backend/ai-assist.cjs','backend/ai-errors.cjs','backend/ai-release-control.cjs','backend/package.json','backend/test/ai-production-compatibility.test.cjs','backend/test/ai-release-integration.test.cjs'];
const added=['backend/ai-grounding.cjs','backend/test/ai-grounding.test.cjs'];
let patch=git(['-c','core.safecrlf=false','diff','--no-ext-diff','--no-color',base,'--',...tracked]);
for(const file of added){
 const lines=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n').trimEnd().split('\n');
 patch+=`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(line=>'+'+line+'\n').join('');
}
const artifact='docs/releases/pimppilot-grounding-main.patch';
fs.mkdirSync(path.dirname(path.join(root,artifact)),{recursive:true});
fs.writeFileSync(path.join(root,artifact),patch);
console.log(JSON.stringify({base,files:[...tracked,...added],artifact,remoteChanges:0}));
