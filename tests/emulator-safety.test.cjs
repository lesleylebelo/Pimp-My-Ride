const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertEmulators}=require('../scripts/assert-emulators.cjs');
test('writing test suites require loopback emulators and the demo project',()=>{
 for(const host of [undefined,'firestore.googleapis.com:443','192.168.1.2:8080','localhost:0','localhost:65536','http://127.0.0.1:8080','localhost.evil:8080'])assert.throws(()=>assertEmulators({env:{FIRESTORE_EMULATOR_HOST:host}}));
 for(const host of ['localhost:8080','127.0.0.1:8080','[::1]:8080'])assert.equal(assertEmulators({env:{FIRESTORE_EMULATOR_HOST:host}}),'demo-pmr-security');
 const env={FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'};
 assert.equal(assertEmulators({auth:true,env}),'demo-pmr-security');
 assert.throws(()=>assertEmulators({auth:true,env:{...env,FIREBASE_AUTH_EMULATOR_HOST:undefined}}));
 assert.throws(()=>assertEmulators({env:{...env,GCLOUD_PROJECT:'production-project'}}));
});
