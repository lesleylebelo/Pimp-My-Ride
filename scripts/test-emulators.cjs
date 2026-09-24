const {spawnSync}=require('node:child_process');
require('./assert-emulators.cjs').assertEmulators({auth:true});
for(const args of [['--test','tests/rules/access.test.cjs'],['--test','backend/test/integration.test.cjs'],['--test','backend/test/marketplace-integration.test.cjs'],['--test','backend/test/photos-integration.test.cjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
