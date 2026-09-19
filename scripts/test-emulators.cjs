const {spawnSync}=require('node:child_process');
for(const args of [['--test','tests/rules/access.test.cjs'],['--test','functions/test/admin.test.cjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
