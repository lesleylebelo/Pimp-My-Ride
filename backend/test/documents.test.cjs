const {test}=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createDocuments}=require('../documents.cjs');
const file={buffer:Buffer.from('%PDF-1.7 synthetic fixture'),originalname:'sample.pdf',mimetype:'application/pdf'};
const req={kind:'ownerId',file};

test('a stale upload actor cannot reserve private media after account restriction',async()=>{
 const db=memoryDb({'users/shop':{role:'shop',verificationStatus:'pending',accountStatus:'deleting'}});
 const api=createDocuments({db,storage:{upload:async()=>assert.fail('Restricted upload must never reach storage')},actor:async()=>({uid:'shop',profile:{role:'shop',verificationStatus:'pending'}})});
 await assert.rejects(()=>api.uploadDocument(req),{code:'permission-denied'});assert.equal([...db.rows.keys()].filter(path=>path.startsWith('storageUploadAttempts/')).length,0);
});
function fixture(){
 const db=memoryDb({'users/shop':{role:'shop',verificationStatus:'pending'}}),files=new Map();
 const storage={upload:async(path,buffer)=>files.set(path,buffer),remove:async()=>assert.fail('Uploads must retain files until deletion policy is approved.')};
 const api=createDocuments({db,storage,actor:async()=>({uid:'shop',profile:db.rows.get('users/shop')})});
 return {db,files,storage,api,record:()=>db.rows.get('users/shop/documents/ownerId'),attempts:()=>[...db.rows].filter(([p])=>p.startsWith('storageUploadAttempts/')).map(([,v])=>v)};
}
test('upload intent precedes storage I/O; replacement keeps both objects and queues only the old attempt',async()=>{
 const f=fixture(),upload=f.storage.upload;
 f.storage.upload=async(path,buffer)=>{assert.ok(f.attempts().some(v=>v.path===path&&v.state==='uploading'));return upload(path,buffer);};
 await f.api.uploadDocument(req);const old=f.record().path;
 await f.api.uploadDocument(req);
 assert.equal(f.files.size,2);assert.notEqual(f.record().path,old);
 assert.equal(f.attempts().find(v=>v.path===old).state,'cleanupPending');
 assert.equal(f.attempts().find(v=>v.path===f.record().path).state,'referenced');
 const {items}=await f.api.listDocuments({});
 assert.equal(items.length,1);assert.equal(items[0].id,'ownerId');assert.equal(items[0].name,'sample.pdf');
 assert.deepEqual(Object.keys(items[0]).sort(),['contentType','id','name','size','uploadedAt']);
});
test('legacy replacement queues its former path without deleting either file',async()=>{
 const f=fixture();f.db.rows.set('users/shop/documents/ownerId',{provider:'supabase',path:'verification/shop/ownerId/11111111-1111-4111-8111-111111111111'});
 await f.api.uploadDocument(req);
 assert.equal([...f.db.rows].filter(([p])=>p.startsWith('storageCleanup/')).length,1);
});
test('upload failures and access changes leave retained cleanup candidates without replacing metadata',async()=>{
 for(const mode of ['storage-failure','review','suspension']){
  const f=fixture(),upload=f.storage.upload;
  f.storage.upload=async(...args)=>{await upload(...args);if(mode==='storage-failure')throw Error('Synthetic interrupted response');Object.assign(f.db.rows.get('users/shop'),mode==='review'?{verificationStatus:'reviewing'}:{accountStatus:'suspended'});};
  await assert.rejects(()=>f.api.uploadDocument(req));assert.equal(f.record(),undefined);assert.equal(f.files.size,1);assert.equal(f.attempts()[0].state,'cleanupPending');
 }
});
test('lost metadata and settlement acknowledgements return success when the exact file is referenced',async()=>{
 const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);f.db.after=async()=>{throw Error('Synthetic lost acknowledgement');};};
 assert.deepEqual(await f.api.uploadDocument(req),{ok:true,kind:'ownerId'});
 assert.ok(f.files.has(f.record().path));assert.equal(f.attempts()[0].state,'referenced');
});
test('unresolved transaction failure retains the uploading attempt and reports an uncertain result',async()=>{
 const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);f.db.before=async()=>{throw Error('Synthetic database unavailable');};};
 await assert.rejects(()=>f.api.uploadDocument(req),{code:'unavailable'});
 assert.equal(f.files.size,1);assert.equal(f.record(),undefined);assert.equal(f.attempts()[0].state,'uploading');
});

test('a lost reservation acknowledgement cannot start an untracked upload',async()=>{
 const f=fixture();f.db.after=async()=>{throw Error('Synthetic lost reservation response');};
 await assert.rejects(()=>f.api.uploadDocument(req));assert.equal(f.files.size,0);assert.equal(f.attempts()[0].state,'uploading');assert.equal(f.record(),undefined);
});
test('a closed attempt cannot later become a metadata reference',async()=>{
 const f=fixture(),upload=f.storage.upload;
 f.storage.upload=async(...args)=>{await upload(...args);f.attempts()[0].state='cleanupPending';};
 await assert.rejects(()=>f.api.uploadDocument(req),{code:'failed-precondition'});
 assert.equal(f.record(),undefined);assert.equal(f.attempts()[0].state,'cleanupPending');assert.equal(f.files.size,1);
});
