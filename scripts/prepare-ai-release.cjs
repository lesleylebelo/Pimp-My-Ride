// Review artifact only. No checkout, actual-index changes, commits or network.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='2fce64406d8a0d052b9ace7a9415755ce215b0ff';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
const files=['backend/.env.example','backend/ai-assist.cjs','backend/ai-provider.cjs','backend/ai-release-control.cjs','backend/ai-errors.cjs',
 'backend/test/ai-assist.test.cjs','backend/test/ai-release-control.test.cjs','backend/test/ai-production-compatibility.test.cjs','backend/test/ai-release-integration.test.cjs','backend/test/helpers/ai-store.cjs',
 'src/shared/services/api.js','tests/api.test.cjs'];
if(git(['branch','--show-current']).trim()!=='lesley')throw Error('Prepare only in the original lesley checkout.');
const tracked=files.filter(file=>!['backend/ai-errors.cjs','backend/test/helpers/ai-store.cjs'].includes(file));
let patch=git(['diff','--no-ext-diff','--no-color',base,'--',...tracked]);
for(const file of files.filter(file=>!tracked.includes(file))){
 const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
 if(!text.endsWith('\n'))throw Error('Release source requires a final newline.');
 const lines=text.slice(0,-1).split('\n');
 patch+='diff --git a/'+file+' b/'+file+'\nnew file mode 100644\n--- /dev/null\n+++ b/'+file+'\n@@ -0,0 +1,'+lines.length+' @@\n'+lines.map(line=>'+'+line).join('\n')+'\n';
}
const artifact='docs/releases/gemini-daily-testing-main.patch';fs.writeFileSync(path.join(root,artifact),patch);
console.log(JSON.stringify({base,files,artifact,remoteChanges:0}));
