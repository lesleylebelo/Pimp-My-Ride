const {test,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createAIReleaseControl,CONTROL_PATH}=require('../ai-release-control.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'ai-release-tests'),db=getFirestore(app);
after(async()=>{await db.doc(CONTROL_PATH).delete();await db.terminate();await deleteApp(app);});
test('real Firestore transactions permit one reservation across concurrent instances and restarts',async()=>{
 await db.doc(CONTROL_PATH).delete();
 const reserve=async()=>{const control=createAIReleaseControl({db,env:{PMR_AI_TEST_UID:'synthetic-tester'}});control.authorize('synthetic-tester');return control.reserve();};
 const results=await Promise.allSettled(Array.from({length:12},reserve));
 assert.equal(results.filter(value=>value.status==='fulfilled').length,1);
 assert.equal(results.filter(value=>value.status==='rejected'&&value.reason.code==='resource-exhausted').length,11);
 assert.deepEqual((await db.doc(CONTROL_PATH).get()).data(),{version:1,attempts:1});
 await assert.rejects(reserve,{code:'resource-exhausted'});
 const snapshot=await db.doc(CONTROL_PATH).get();assert.deepEqual(Object.keys(snapshot.data()).sort(),['attempts','version']);
});
test('existing rules deny direct-client quota access and reset for owners, shops and administrators',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const {doc,getDoc,setDoc,deleteDoc}=require('firebase/firestore');
 const address=new URL('http://'+process.env.FIRESTORE_EMULATOR_HOST);
 const environment=await initializeTestEnvironment({projectId:'demo-pmr-security',firestore:{host:address.hostname,port:Number(address.port),rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
 try{
  for(const [uid,claims] of [['synthetic-owner',{}],['synthetic-shop',{}],['synthetic-admin',{admin:true}]]){
   const ref=doc(environment.authenticatedContext(uid,claims).firestore(),CONTROL_PATH);
   await assertFails(getDoc(ref));await assertFails(setDoc(ref,{version:1,attempts:0}));await assertFails(deleteDoc(ref));
  }
 }finally{await environment.cleanup();}
});
