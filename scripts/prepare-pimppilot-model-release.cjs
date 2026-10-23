// Produces a backend-only review patch; no checkout, real-index changes or network.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='0ef47b54a4083bf1a29deab96c383ddb08b98e6c';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
if(git(['branch','--show-current']).trim()!=='lesley')throw Error('Prepare only in the original lesley checkout.');
const files=['backend/ai-provider.cjs','backend/.env.example','backend/test/ai-assist.test.cjs',
 'backend/test/ai-release-control.test.cjs','backend/test/ai-production-compatibility.test.cjs','backend/test/ai-release-integration.test.cjs'];
const artifact='docs/releases/pimppilot-gemini-35-main.patch';
fs.writeFileSync(path.join(root,artifact),git(['-c','core.safecrlf=false','diff','--no-ext-diff','--no-color',base,'--',...files]));
console.log(JSON.stringify({base,files,artifact,remoteChanges:0}));
