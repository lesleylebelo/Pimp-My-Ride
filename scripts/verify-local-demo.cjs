const {spawnSync}=require('node:child_process');
require('./assert-emulators.cjs').assertEmulators({auth:true});
for(const args of [['--test','backend/test/local-demo-integration.test.cjs'],['scripts/test-emulators.cjs']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(result.status!==0)process.exit(result.status||1);
}
