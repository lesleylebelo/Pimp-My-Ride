const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {guard,verifyIndexes,claimLiveAttempt,main}=require('../email-test.cjs');
const mailbox='synthetic@example.test',hash=createHash('sha256').update(mailbox).digest('hex');
const env={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8187',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9197',FIREBASE_PROJECT_ID:'demo-pmr-security',GCLOUD_PROJECT:'demo-pmr-security',GOOGLE_CLOUD_PROJECT:'demo-pmr-security',NODE_ENV:'test',PMR_TRANSACTIONAL_EMAIL_ENABLED:'false',PMR_EMAIL_TEST_MAILBOX:mailbox};
test('operator tool rejects production projects, remote emulators, credentials, enabled transport and wrong recipients before connecting',()=>{
 assert.equal(guard(env,hash),mailbox);
 for(const patch of [{FIRESTORE_EMULATOR_HOST:'remote.example:8187'},{FIRESTORE_EMULATOR_HOST:undefined},{FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'},{FIREBASE_PROJECT_ID:'pimp-my-ride-a26fc'},{GCLOUD_PROJECT:undefined},{GOOGLE_CLOUD_PROJECT:'other'},{NODE_ENV:'production'},{GOOGLE_APPLICATION_CREDENTIALS:'private.json'},{FIREBASE_SERVICE_ACCOUNT_JSON:'{}'},{PMR_TRANSACTIONAL_EMAIL_ENABLED:'true'},{PMR_EMAIL_TEST_MAILBOX:'different@example.test'}])assert.throws(()=>guard({...env,...patch},hash));
 assert.throws(()=>guard(env),'Default runtime guard is pinned to the designated mailbox, not the test fixture');
});
test('repository queue index and snapshot/payload exemptions match the dispatcher',()=>verifyIndexes());
test('persistent live-attempt latch is exclusive and retains no address or API key',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pmr-email-once-')),file=path.join(dir,'attempt.lock');
 try{claimLiveAttempt(file,'job-1');assert.throws(()=>claimLiveAttempt(file,'job-2'),{code:'EEXIST'});const value=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(value.jobId,'job-1');assert.ok(!JSON.stringify(value).includes('@'));assert.ok(!JSON.stringify(value).includes('RESEND_API_KEY'));}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('unknown actions cannot accidentally dispatch',async()=>{await assert.rejects(()=>main(['dispatch-all']));});
