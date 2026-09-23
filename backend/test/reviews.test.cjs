const {test}=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createReviews}=require('../reviews.cjs');
const {Timestamp}=require('firebase-admin/firestore');
function setup(){
 let time=Date.now();const db=memoryDb({'users/shop':{role:'shop',verificationStatus:'pending'}});
 for(const kind of ['cipcCert','proofOfAddress','ownerId'])db.rows.set(`users/shop/documents/${kind}`,{provider:'supabase',path:`verification/shop/${kind}/abc`,size:8,contentType:'application/pdf'});
 const auth={getUser:async()=>({emailVerified:true,disabled:false})};
 const storage={inspect:async()=>({size:8,contentType:'application/pdf'})};
 const api=createReviews({db,auth,storage,now:()=>time});
 return {db,api,storage,auth,advance:()=>{time+=120001;},profile:()=>db.rows.get('users/shop'),call:()=>api.review({actor:'admin',uid:'shop',status:'approved',reason:'Checked fictional documents'})};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('approval records its operation and audits completion',async()=>{const s=setup(),r=await s.call();assert.equal(s.profile().verificationStatus,'approved');assert.equal(s.db.rows.get(`adminOperations/${r.operationId}`).status,'completed');assert.equal(s.profile().reviewOperation,undefined);});
test('previous state is captured inside transaction; failed review restores rejected state',async()=>{const s=setup();s.db.before=async n=>{if(n===1)s.profile().verificationStatus='rejected';};s.storage.inspect=async()=>{throw Error('missing');};await assert.rejects(s.call,{code:'unavailable',retryWithNewRequest:true});assert.equal(s.profile().verificationStatus,'rejected');assert.equal([...s.db.rows.values()].find(v=>v.type==='shopReview').previousStatus,'rejected');});
test('rollback failure is recoverable and repeated recovery is idempotent',async()=>{const s=setup();s.storage.inspect=async()=>{throw Error('storage down');};s.db.before=async n=>{if(n===2)throw Error('database down');};await assert.rejects(s.call,/interrupted/);const id=s.profile().reviewOperation;s.db.before=null;await assert.rejects(()=>s.api.recover({actor:'admin',operationId:id,reason:'Operator recovery'}),/two minutes/);s.advance();const first=await s.api.recover({actor:'admin',operationId:id,reason:'Operator recovery'});const count=s.db.rows.size;assert.equal(s.profile().verificationStatus,'pending');assert.deepEqual(await s.api.recover({actor:'admin',operationId:id,reason:'Retry'}),first);assert.equal(s.db.rows.size,count);});
test('interrupted worker cannot complete after recovery and cannot overwrite suspension',async()=>{const s=setup();let release;s.storage.inspect=()=>new Promise(r=>{release=()=>r({size:8,contentType:'application/pdf'});});const running=s.call();await tick();const id=s.profile().reviewOperation;s.profile().accountStatus='suspended';s.advance();await s.api.recover({actor:'admin',operationId:id,reason:'Interrupted worker'});s.storage.inspect=async()=>({size:8,contentType:'application/pdf'});release();await assert.rejects(()=>running,/Account changed/);assert.equal(s.profile().accountStatus,'suspended');assert.equal(s.profile().verificationStatus,'pending');});
test('changed document metadata invalidates approval',async()=>{const s=setup();let changed=false;s.storage.inspect=async()=>{if(!changed){changed=true;s.db.rows.get('users/shop/documents/ownerId').path='changed';}return {size:8,contentType:'application/pdf'};};await assert.rejects(s.call,/Documents changed/);assert.equal(s.profile().verificationStatus,'pending');});
test('another operation owns the profile: rollback does not overwrite it',async()=>{const s=setup();s.storage.inspect=async()=>{s.profile().reviewOperation='newer';s.profile().verificationStatus='rejected';throw Error('interrupted');};await assert.rejects(s.call);assert.equal(s.profile().reviewOperation,'newer');assert.equal(s.profile().verificationStatus,'rejected');});
test('lost completion acknowledgement returns recorded success',async()=>{const s=setup();s.db.after=async n=>{if(n===2)throw Error('ack lost');};const r=await s.call();assert.equal(r.ok,true);assert.equal(s.profile().verificationStatus,'approved');});
test('concurrent reviews are refused and disabled Auth user cannot be approved',async()=>{const s=setup();s.profile().reviewOperation='other';await assert.rejects(s.call,/in progress/);delete s.profile().reviewOperation;s.auth.getUser=async()=>({emailVerified:true,disabled:true});await assert.rejects(s.call,/active, verified/);assert.equal(s.profile().verificationStatus,'pending');});
test('equivalent document maps compare equally after Firestore key reordering',async()=>{
 const s=setup(),path='users/shop/documents/ownerId',date=new Timestamp(1700000000,123456789);
 s.db.rows.get(path).uploadedAt=date;
 s.db.rows.get(path).details={first:'one',nested:{a:1,b:2}};
 let changed=false;
 s.storage.inspect=async()=>{
  if(!changed){changed=true;const original=s.db.rows.get(path);s.db.rows.set(path,{details:{nested:{b:2,a:1},first:'one'},uploadedAt:new Timestamp(date.seconds,date.nanoseconds),...Object.fromEntries(Object.entries(original).filter(([key])=>!['details','uploadedAt'].includes(key)).reverse())});}
  return {size:8,contentType:'application/pdf'};
 };
 assert.equal((await s.call()).ok,true);
 assert.equal(s.profile().verificationStatus,'approved');
});
test('document timestamp changes below millisecond precision invalidate approval',async()=>{
 const s=setup(),record=s.db.rows.get('users/shop/documents/ownerId');record.uploadedAt=new Timestamp(1700000000,1);
 let changed=false;s.storage.inspect=async()=>{if(!changed){changed=true;record.uploadedAt=new Timestamp(1700000000,2);}return {size:8,contentType:'application/pdf'};};
 await assert.rejects(s.call,/Documents changed/);
 assert.equal(s.profile().verificationStatus,'pending');
});
test('a completed review retry returns the same result without inspecting storage again',async()=>{
 const s=setup(),input={actor:'admin',uid:'shop',status:'approved',reason:'Reviewed records',operationId:'stable-review',payloadFingerprint:'approved-payload'};
 let inspections=0;s.storage.inspect=async()=>{inspections++;return {size:8,contentType:'application/pdf'};};
 const first=await s.api.review(input),rows=s.db.rows.size;
 assert.deepEqual(await s.api.review(input),first);
 assert.equal(inspections,3);assert.equal(s.db.rows.size,rows);
 await assert.rejects(()=>s.api.review({...input,payloadFingerprint:'different-payload'}),{code:'already-exists'});
 await assert.rejects(()=>s.api.review({...input,actor:'another-admin'}),{code:'already-exists'});
});
test('a definitively failed review retires its key, whereas an interrupted pending review keeps it',async()=>{
 const s=setup(),input={actor:'admin',uid:'shop',status:'approved',reason:'Inspected files',operationId:'failed-review',payloadFingerprint:'payload'};
 s.storage.inspect=async()=>{throw Error('Synthetic provider failure');};
 await assert.rejects(()=>s.api.review(input),e=>e.retryWithNewRequest===true);
 assert.equal(s.db.rows.get('adminOperations/failed-review').status,'failed');
 await assert.rejects(()=>s.api.review(input),e=>e.retryWithNewRequest===true);
 s.storage.inspect=async()=>({size:8,contentType:'application/pdf'});
 assert.equal((await s.api.review({...input,operationId:'new-review'})).ok,true);
 const pending=setup();pending.storage.inspect=async()=>{throw Error('Synthetic provider failure');};pending.db.before=async n=>{if(n===2)throw Error('Rollback unavailable');};
 await assert.rejects(()=>pending.api.review(input),e=>e.code==='unavailable'&&e.retryWithNewRequest!==true);
 await assert.rejects(()=>pending.api.review(input),e=>e.code==='failed-precondition'&&e.retryWithNewRequest!==true);
});
