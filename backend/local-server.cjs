// Invoked from backend via npm run start:local, after separate live-test approval.
const {inspectLocalConfig}=require('./check-local-config.cjs');
const status=inspectLocalConfig();
if(!status.ready){console.error(JSON.stringify(status,null,2));process.exitCode=1;}
else require('./server.cjs');
