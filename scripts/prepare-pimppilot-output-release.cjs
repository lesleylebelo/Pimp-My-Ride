// Review artifact only: no network, checkout/index mutation or deployment.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='1a98e86d7ce301a9f6fe396d2d0b6bbd7508fdd2';
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});
if(git(['branch','--show-current']).trim()!=='lesley')throw Error('Prepare only in the original lesley checkout.');
const files=['backend/ai-provider.cjs','backend/ai-assist.cjs','backend/ai-errors.cjs','backend/ai-release-control.cjs',
 'backend/test/ai-assist.test.cjs','backend/test/ai-production-compatibility.test.cjs','backend/test/ai-release-integration.test.cjs'];
const artifact='docs/releases/pimppilot-output-main.patch';
fs.mkdirSync(path.dirname(path.join(root,artifact)),{recursive:true});
fs.writeFileSync(path.join(root,artifact),git(['-c','core.safecrlf=false','diff','--no-ext-diff','--no-color',base,'--',...files]));
console.log(JSON.stringify({base,files,artifact,remoteChanges:0}));
