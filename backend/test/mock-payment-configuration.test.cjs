const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertMockPaymentsEnabled,validateMockPaymentConfiguration}=require('../mock-payment-gate.cjs');
const {PROJECT,HOSTED_MOCK_ENV:env,LOCAL_MOCK_ENV}=require('./helpers/mock-payments.cjs');

test('one explicit flag enables simulation on the existing hosted Firebase project without extra infrastructure',()=>{
 assert.equal(assertMockPaymentsEnabled(env,{projectId:PROJECT}),'mock');
 assert.equal(assertMockPaymentsEnabled(LOCAL_MOCK_ENV,{projectId:LOCAL_MOCK_ENV.FIREBASE_PROJECT_ID}),'local-emulator');
 for(const flag of [undefined,'false'])assert.equal(validateMockPaymentConfiguration({...env,PMR_MOCK_PAYMENTS_ENABLED:flag}),false);
 for(const patch of [{PMR_MOCK_PAYMENTS_ENABLED:'TRUE'},{PMR_MOCK_PAYMENTS_ENABLED:''},{NODE_ENV:'invalid'},{FIREBASE_PROJECT_ID:undefined},{FIREBASE_PROJECT_ID:PROJECT+'\n'},{GOOGLE_CLOUD_PROJECT:'other'},{GCLOUD_PROJECT:''},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{FIREBASE_AUTH_EMULATOR_HOST:'remote.example:9099'}])assert.throws(()=>validateMockPaymentConfiguration({...env,...patch}),{code:'failed-precondition'});
 assert.throws(()=>assertMockPaymentsEnabled(env,{projectId:'other'}),{code:'failed-precondition'});
 for(const patch of [{FIREBASE_AUTH_EMULATOR_HOST:undefined},{FIRESTORE_EMULATOR_HOST:'remote.example:8080'}])assert.throws(()=>assertMockPaymentsEnabled({...LOCAL_MOCK_ENV,...patch},{projectId:LOCAL_MOCK_ENV.FIREBASE_PROJECT_ID}),{code:'failed-precondition'});
});

test('existing server startup supports enabled and disabled simulation and rejects invalid configuration before listening',async()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),baseConfig=require('../config.cjs');
 for(const variant of ['enabled','disabled','missing','invalid','project-mismatch','credential-mismatch']){
  const startupEnv={...env,SUPABASE_URL:'https://storage.example.invalid',SUPABASE_SECRET_KEY:'synthetic-test-key',CORS_ORIGINS:'https://client.example.invalid',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:variant==='credential-mismatch'?'other':PROJECT})};
  if(variant==='disabled')startupEnv.PMR_MOCK_PAYMENTS_ENABLED='false';
  if(variant==='missing')delete startupEnv.PMR_MOCK_PAYMENTS_ENABLED;
  if(variant==='invalid')startupEnv.PMR_MOCK_PAYMENTS_ENABLED='yes';
  const calls=[],db={projectId:variant==='project-mismatch'?'other':PROJECT,terminate:async()=>calls.push('terminate'),doc:()=>assert.fail('Startup must not require an activation document')};
  const modules={
   'firebase-admin/app':{cert:()=>({}),applicationDefault:()=>assert.fail('Configured credentials must be reused'),initializeApp:()=>calls.push('firebase')},
   'firebase-admin/auth':{getAuth:()=>({})},'firebase-admin/firestore':{getFirestore:()=>db},
   './services.cjs':{createServices:()=>({})},'./storage.cjs':{createStorage:()=>({}),createMediaStorage:()=>({})},
   './app.cjs':{createApp:()=>({listen:()=>{calls.push('listen');return {};}})},
   './config.cjs':{...baseConfig,storageConfig:()=>baseConfig.storageConfig(startupEnv),listenHost:()=>baseConfig.listenHost(startupEnv)},'./mock-payment-gate.cjs':require('../mock-payment-gate.cjs'),
   'node:fs':fs,'node:path':path,
  };
  const context={require:name=>modules[name]||assert.fail(name),process:{env:startupEnv,on(){},exitCode:0},console:{log(){},error(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.cjs'),'utf8').replace('void start();','globalThis.started=start();'),context);await context.started;
  const valid=['enabled','disabled','missing'].includes(variant);
  assert.equal(calls.includes('listen'),valid,variant);assert.equal(context.process.exitCode,valid?0:1,variant);
  if(variant==='project-mismatch')assert.deepEqual(calls,['firebase','terminate']);
 }
});

test('deployment preparation keeps the original service, Firebase and storage configuration',()=>{
 const fs=require('fs'),path=require('path'),yaml=require('yaml'),root=path.join(__dirname,'../..');
 const service=yaml.parse(fs.readFileSync(path.join(root,'render.yaml'),'utf8')).services[0];
 assert.equal(service.name,'pimpmyride-api');assert.equal(service.rootDir,'backend');assert.equal(service.startCommand,'npm start');
 assert.equal(service.envVars.find(v=>v.key==='FIREBASE_PROJECT_ID').value,PROJECT);
 assert.equal(fs.existsSync(path.join(root,'render.demo.yaml')),false);
 assert.equal(fs.existsSync(path.join(root,'backend/hosted-demo-config.cjs')),false);
});
