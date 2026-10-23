const {test,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {createAIReleaseControl,CONTROL_PATH,DAILY_PREFIX,ATTEMPT_PREFIX}=require('../ai-release-control.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'ai-release-tests'),db=getFirestore(app);
const day='2040-01-02';
after(async()=>{await db.doc(DAILY_PREFIX+'/'+day).delete();const rows=await db.collection(ATTEMPT_PREFIX).get();for(const row of rows.docs)await row.ref.delete();await db.terminate();await deleteApp(app);});
test('real transactions allow five globally across instances and preserve historical allowance',async()=>{
 const history=db.doc(CONTROL_PATH);if(!(await history.get()).exists)await history.create({version:1,attempts:1});
 const before=await history.get();
 const reserve=async()=>{const control=createAIReleaseControl({db,env:{PMR_AI_TEST_UIDS:'synthetic-tester,another-tester'},now:()=>Date.parse(day+'T12:00:00Z')});control.authorize('synthetic-tester');return control.reserve();};
 const results=await Promise.allSettled(Array.from({length:12},reserve));
 assert.equal(results.filter(value=>value.status==='fulfilled').length,5);
 assert.equal(results.filter(value=>value.status==='rejected'&&value.reason.code==='resource-exhausted').length,7);
 await assert.rejects(reserve,{code:'resource-exhausted'});
 assert.deepEqual((await db.doc(DAILY_PREFIX+'/'+day).get()).data(),{version:1,day,attempts:5});
 const attempt=results.find(value=>value.status==='fulfilled').value;
 const ref=db.doc(ATTEMPT_PREFIX+'/'+attempt.correlationId);assert.equal((await ref.get()).data().state,'unknown');
 await attempt.dispatch();await attempt.response(200);await attempt.finish({outputValidated:true});
 const data=(await ref.get()).data();assert.equal(data.state,'successful');assert.ok(data.reservedAt.toDate() instanceof Date);assert.equal(data.providerHttpStatus,200);
 const after=await history.get();assert.deepEqual(after.data(),before.data());assert.ok(after.updateTime.isEqual(before.updateTime));
});
test('existing rules deny direct-client history, daily quota and diagnostic access',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const {doc,getDoc,setDoc,deleteDoc}=require('firebase/firestore');
 const address=new URL('http://'+process.env.FIRESTORE_EMULATOR_HOST);
 const environment=await initializeTestEnvironment({projectId:'demo-pmr-security',firestore:{host:address.hostname,port:Number(address.port),rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
 try{
  for(const [uid,claims] of [['synthetic-owner',{}],['synthetic-shop',{}],['synthetic-admin',{admin:true}]]){
   for(const path of [CONTROL_PATH,DAILY_PREFIX+'/'+day,ATTEMPT_PREFIX+'/synthetic-attempt']){
    const ref=doc(environment.authenticatedContext(uid,claims).firestore(),path);
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,{version:1,attempts:0}));await assertFails(deleteDoc(ref));
   }
  }
 }finally{await environment.cleanup();}
});
