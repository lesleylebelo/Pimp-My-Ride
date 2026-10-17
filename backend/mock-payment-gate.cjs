const D=require('./domain.cjs');
const PROJECT='demo-pmr-security';
function localHost(value){
 const match=typeof value==='string'&&/^(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/.exec(value);
 return !!match&&Number(match[1])>0&&Number(match[1])<=65535;
}
function assertMockPaymentsEnabled(env,db){
 if(env.PMR_MOCK_PAYMENTS_ENABLED!=='true'||!['test','development'].includes(env.NODE_ENV)
  ||env.FIREBASE_PROJECT_ID!==PROJECT||db.projectId!==PROJECT
  ||!localHost(env.FIRESTORE_EMULATOR_HOST)||!localHost(env.FIREBASE_AUTH_EMULATOR_HOST)
  ||['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'].some(key=>env[key]&&env[key]!==PROJECT)){
  D.fail('Mock payments are disabled. An explicitly enabled local demo environment is required.','failed-precondition');
 }
}
module.exports={assertMockPaymentsEnabled};
