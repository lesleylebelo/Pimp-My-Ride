const {test}=require('node:test'),assert=require('node:assert/strict');
const {assessLocalConfig}=require('../backend/check-local-config.cjs');
const {listenHost}=require('../backend/config.cjs');
const credential={type:'service_account',project_id:'pimp-my-ride-a26fc',private_key:'-----BEGIN PRIVATE KEY-----\nSYNTHETIC_ONLY\n-----END PRIVATE KEY-----',client_email:'synthetic@pimp-my-ride-a26fc.iam.gserviceaccount.com'};
const base={NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3101',FIREBASE_PROJECT_ID:'pimp-my-ride-a26fc',SUPABASE_URL:'https://nymiyrzdpjctyembixbe.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC_ONLY',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(credential)};
const assess=env=>assessLocalConfig(env,{nodeMajor:22});

test('routing checks remain informative without credentials and empty emulator settings block live startup',()=>{
 const result=assess({...base,SUPABASE_SECRET_KEY:''});
 assert.equal(result.ready,false);assert.equal(result.checks.serverSideStorageKey,false);
 assert.equal(result.checks.supabaseProject,true);assert.equal(result.checks.privateMediaBucketNames,true);
 for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST']){
  const empty=assess({...base,[name]:''});
  assert.equal(empty.ready,false);assert.equal(empty.checks.noEmulators,false);
 }
});

test('offline local credential checks accept privileged key forms and never return secret values',()=>{
 const result=assess(base);assert.equal(result.ready,true);assert.equal(result.remoteWrites,0);
 assert.ok(!JSON.stringify(result).includes(base.SUPABASE_SECRET_KEY));assert.ok(!JSON.stringify(result).includes('SYNTHETIC_ONLY'));
 const jwt='e30.'+Buffer.from(JSON.stringify({role:'service_role',ref:'nymiyrzdpjctyembixbe'})).toString('base64url')+'.synthetic';
 assert.equal(assess({...base,SUPABASE_SECRET_KEY:jwt}).serverKeyType,'legacy-service-role');
});

test('local launch rejects public keys, wrong projects, missing credentials and unsafe live settings',()=>{
 const anon='e30.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.synthetic';
 for(const override of [{SUPABASE_SECRET_KEY:'sb_publishable_synthetic'},{SUPABASE_SECRET_KEY:anon},{SUPABASE_SECRET_KEY:''},{FIREBASE_PROJECT_ID:'other'},{SUPABASE_URL:'https://other.supabase.co'},{FIREBASE_SERVICE_ACCOUNT_JSON:''},{FIREBASE_SERVICE_ACCOUNT_JSON:'malformed synthetic input'},{FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({...credential,project_id:'other'})},{HOST:'0.0.0.0'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},{PMR_MOCK_PAYMENTS_ENABLED:'true'},{PMR_LOCAL_DEMO:'true'}])assert.equal(assess({...base,...override}).ready,false,JSON.stringify(Object.keys(override)));
 assert.equal(assessLocalConfig(base,{nodeMajor:22,envFilePresent:false}).ready,false);
 assert.equal(listenHost({}),'0.0.0.0');assert.equal(listenHost({HOST:'127.0.0.1'}),'127.0.0.1');assert.throws(()=>listenHost({HOST:'https://invalid'}));
});
