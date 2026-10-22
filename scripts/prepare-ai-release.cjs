// Produces a review artifact only: no checkout, index changes, commits or network.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='10e3c0fc089aba7cdf1420c5441220b0b6956b44';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
const existing=['backend/app.cjs','backend/services.cjs','backend/package.json','backend/.env.example'];
const added=['backend/ai-provider.cjs','backend/ai-assist.cjs','backend/ai-release-control.cjs','backend/test/ai-assist.test.cjs','backend/test/ai-release-control.test.cjs','backend/test/ai-production-compatibility.test.cjs','backend/test/ai-release-integration.test.cjs'];
if(git(['branch','--show-current']).trim()!=='lesley')throw Error('Prepare only in the original lesley checkout.');
let patch=git(['diff','--no-ext-diff','--no-color',base,'--',...existing]);
for(const file of added){
 const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
 if(!text.endsWith('\n'))throw Error('Release source requires a final newline.');
 const lines=text.slice(0,-1).split('\n');
 patch+=`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line=>'+'+line).join('\n')}\n`;
}
const directory=path.join(root,'docs/releases');fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'gemini-ai-assist-main.patch'),patch);
console.log(JSON.stringify({base,files:[...existing,...added],artifact:'docs/releases/gemini-ai-assist-main.patch',remoteChanges:0}));
