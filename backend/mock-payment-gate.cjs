const D=require('./domain.cjs');
function localHost(value){
 const match=typeof value==='string'&&/^(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/.exec(value);
 return !!match&&Number(match[1])>0&&Number(match[1])<=65535;
}
const fail=()=>D.fail('Mock payment configuration is invalid. Use an explicit boolean flag and matching Firebase project configuration.','failed-precondition');
function validateMockPaymentConfiguration(env,db){
 const flag=env.PMR_MOCK_PAYMENTS_ENABLED;
 if(flag!==undefined&&flag!=='true'&&flag!=='false')fail();
 if(flag!=='true')return false;
 const project=env.FIREBASE_PROJECT_ID;
 if(typeof project!=='string'||project.trim()!==project||!project||!['test','development','production'].includes(env.NODE_ENV)
  ||db&&db.projectId!==project
  ||['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'].some(key=>env[key]!==undefined&&env[key]!==project))fail();
 const firestore=env.FIRESTORE_EMULATOR_HOST,auth=env.FIREBASE_AUTH_EMULATOR_HOST;
 if(firestore!==undefined||auth!==undefined){
  if(env.NODE_ENV==='production'||!localHost(firestore)||!localHost(auth))fail();
 }
 return true;
}
function assertMockPaymentsEnabled(env,db){
 if(!validateMockPaymentConfiguration(env,db))D.fail('Mock payments are disabled. Enable PMR_MOCK_PAYMENTS_ENABLED on the existing backend.','failed-precondition');
 return env.FIRESTORE_EMULATOR_HOST?'local-emulator':'mock';
}
module.exports={assertMockPaymentsEnabled,validateMockPaymentConfiguration};
