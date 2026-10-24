const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('supertest');
const {memoryDb}=require('./helpers/memory-db.cjs'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs'),{LEASE_MS}=require('../profile-photos.cjs'),{Timestamp}=require('firebase-admin/firestore');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNw6dj9HwAFIgKH/2N/LgAAAABJRU5ErkJggg==','base64');
function fixture(){
 const db=memoryDb({'users/owner':{role:'owner'},'users/other':{role:'owner'},'users/shop':{role:'shop',verificationStatus:'approved'},'users/pending':{role:'shop',verificationStatus:'pending'},'users/admin':{role:'admin'}}),files=new Map(),users=new Map();let sequence=0;
 const auth={getUser:async uid=>({metadata:{},emailVerified:true,disabled:false,...users.get(uid)}),verifyIdToken:async token=>{if(token==='expired')throw Error('revoked');return {uid:token,email_verified:true,auth_time:Math.floor(Date.now()/1000)+1};}};
 const storage={bucket:'vehicle-images',upload:async(path,buffer,type)=>{assert.ok(!files.has(path));files.set(path,{buffer,type});},inspect:async path=>({size:files.get(path).buffer.length,contentType:files.get(path).type}),signedUrl:async(path,ttl)=>{assert.equal(ttl,60);assert.ok(files.has(path));return 'https://private.example.invalid/photo';},remove:async()=>assert.fail('Retention forbids deletion')};
 const api=createServices({db,auth,photoStorage:storage,profileStorage:storage,storage:{}}),app=createApp({auth,services:api});
 const identity=uid=>({uid,token:{email_verified:true,auth_time:Math.floor(Date.now()/1000)+1}});
 const upload=(uid='owner',extra={})=>api.uploadProfilePhoto({auth:identity(uid),version:db.rows.get('users/'+uid).profilePhotoRevision||0,requestId:'photo-'+(++sequence),file:{buffer:PNG,mimetype:'image/png',originalname:'profile.png'},...extra});
 const call=(uid,op,extra={})=>api.profilePhotos({auth:identity(uid),data:{op,...extra}});
 return {db,files,users,storage,api,app,identity,upload,call};
}
for(const uid of ['owner','shop','pending'])test(uid+' uploads, persists and privately views only its own photo',async()=>{
 const f=fixture(),photo=await f.upload(uid);assert.equal(photo.version,1);assert.equal(f.db.rows.get('users/'+uid).profilePhoto.id,photo.photoId);
 assert.deepEqual(await f.call(uid,'status'),{photoId:photo.photoId,version:1});
 const view=await f.call(uid,'view',{context:'self'});assert.match(view.url,/private/);assert.equal(view.version,1);assert.ok(view.expiresAt>Date.now());assert.ok(!JSON.stringify(view).includes('profiles/'));
 const restarted=createServices({db:f.db,auth:{getUser:async()=>({metadata:{},emailVerified:true,disabled:false})},storage:{},profileStorage:f.storage});
 assert.equal((await restarted.profilePhotos({auth:f.identity(uid),data:{op:'status'}})).photoId,photo.photoId);
});
test('replacement and removal update one authoritative reference and retain every immutable object',async()=>{
 const f=fixture(),first=await f.upload(),second=await f.upload();assert.equal(f.files.size,2);assert.notEqual(first.photoId,second.photoId);
 assert.equal(f.db.rows.get('profilePhotoUploads/'+first.photoId).reason,'replaced');
 const removed=await f.call('owner','remove',{version:2,requestId:'remove'});assert.equal(removed.version,3);assert.equal(f.files.size,2);
 assert.equal(f.db.rows.get('profilePhotoUploads/'+second.photoId).reason,'removed');assert.equal((await f.call('owner','view',{context:'self'})).url,null);
 assert.deepEqual(await f.call('owner','remove',{version:2,requestId:'remove'}),removed);
});
test('cross-account IDs, object paths, administrator and revoked/disabled access fail closed',async()=>{
 const f=fixture();await f.upload();
 for(const extra of [{id:'owner'},{uid:'owner'},{path:[...f.files.keys()][0]}])await assert.rejects(()=>f.call('other','view',{context:'self',...extra}));
 await assert.rejects(()=>f.call('other','view',{context:'shop',id:'owner'}));
 await assert.rejects(()=>f.upload('admin'),{code:'permission-denied'});
 f.users.set('owner',{emailVerified:true,disabled:true});await assert.rejects(()=>f.call('owner','view',{context:'self'}),{code:'permission-denied'});
});
test('upload validation rejects forged MIME, unsupported, oversized, empty, malformed and huge-dimension files',async()=>{
 const f=fixture(),huge=Buffer.from(PNG);huge.writeUInt32BE(20000,16);
 for(const file of [{buffer:PNG,mimetype:'image/jpeg'}, {buffer:Buffer.from('<svg/>'),mimetype:'image/png'},{buffer:Buffer.alloc(5*1024*1024+1),mimetype:'image/png'},{buffer:Buffer.alloc(0),mimetype:'image/png'},{buffer:PNG.subarray(0,35),mimetype:'image/png'},{buffer:huge,mimetype:'image/png'}])await assert.rejects(()=>f.upload('owner',{file:{originalname:'photo.png',...file}}));
 assert.equal(f.files.size,0);
});
test('same upload intent is idempotent, keys cannot be repurposed, and superseded receipts do not reactivate old photos',async()=>{
 const f=fixture(),first=await f.upload('owner',{version:0,requestId:'stable'});
 assert.deepEqual(await f.upload('owner',{version:0,requestId:'stable'}),first);assert.equal(f.files.size,1);
 await assert.rejects(()=>f.upload('owner',{version:1,requestId:'stable'}),{code:'already-exists'});
 const second=await f.upload();assert.deepEqual(await f.upload('owner',{version:0,requestId:'stable'}),first);
 assert.equal(f.db.rows.get('users/owner').profilePhoto.id,second.photoId);
});
test('concurrent replacements allow one winner and track the loser without deleting referenced media',async()=>{
 const f=fixture();let release;const barrier=new Promise(r=>release=r),original=f.storage.upload;let count=0;
 f.storage.upload=async(...args)=>{await original(...args);if(++count===2)release();await barrier;};
 const outcomes=await Promise.allSettled([f.upload('owner',{version:0}),f.upload('owner',{version:0})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.files.size,2);
 const ledgers=[...f.db.rows.entries()].filter(([p])=>p.startsWith('profilePhotoUploads/')).map(([,r])=>r);
 assert.equal(ledgers.filter(r=>r.state==='referenced').length,1);assert.equal(ledgers.filter(r=>r.state==='cleanupPending').length,1);
});
test('lost reservation and commit acknowledgements are reconciled from durable receipts',async()=>{
 for(const failAt of [1,2]){
  const f=fixture();f.db.after=async n=>{if(n===failAt)throw Error('Synthetic lost acknowledgement');};
  const result=await f.upload('owner',{requestId:'lost'});assert.equal(result.version,1);assert.equal(f.files.size,1);
  assert.equal((await f.call('owner','status')).photoId,result.photoId);
 }
});
test('failed storage and inspection retain the previous active photo and give terminal retry guidance',async()=>{
 for(const stage of ['upload','inspect']){
  const f=fixture(),before=await f.upload();f.storage[stage]=async()=>{throw Error('Synthetic storage outage');};
  await assert.rejects(()=>f.upload(),e=>e.retryWithNewRequest===true);
  assert.equal((await f.call('owner','status')).photoId,before.photoId);
  assert.ok([...f.db.rows.values()].some(r=>r.state==='cleanupPending'&&r.reason==='failed'));
 }
});
test('account changes during upload and expired leases cannot publish a photo',async()=>{
 for(const expire of [false,true]){
  const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);if(expire){for(const [p,r] of f.db.rows)if(p.startsWith('profilePhotoUploads/'))f.db.rows.set(p,{...r,createdAt:Timestamp.fromMillis(Date.now()-LEASE_MS-1)});}else f.db.rows.set('users/owner',{role:'owner',accountStatus:'suspended'});};
  await assert.rejects(()=>f.upload(),e=>e.retryWithNewRequest);assert.ok(!f.db.rows.get('users/owner').profilePhoto);
 }
});
test('stale revision is durably closed and cannot later publish after a metadata refresh',async()=>{
 const f=fixture();await f.upload();for(let n=0;n<2;n++)await assert.rejects(()=>f.upload('owner',{version:0,requestId:'stale'}),e=>e.retryWithNewRequest===true);
 assert.equal(f.files.size,1);assert.equal((await f.call('owner','status')).version,1);
});
test('HTTP authenticates before parsing uploads and never accepts arbitrary target UIDs or paths',async()=>{
 const f=fixture();await http(f.app).post('/api/profile/photos/upload?version=0&requestId=x').attach('file',PNG,'photo.png').expect(401);
 await http(f.app).post('/api/profile/photos/upload?version=0&requestId=x&uid=other').set('Authorization','Bearer owner').attach('file',PNG,'photo.png').expect(400);
 const upload=await http(f.app).post('/api/profile/photos/upload?version=0&requestId=http').set('Authorization','Bearer owner').attach('file',PNG,'photo.png').expect(200);assert.ok(upload.body.data.photoId);
 await http(f.app).post('/api/profile/photos').set('Authorization','Bearer expired').send({op:'status'}).expect(401);
 await http(f.app).post('/api/profile/photos').set('Authorization','Bearer other').send({op:'remove',version:0,requestId:'bad',uid:'owner'}).expect(400);
});
test('only published post authors or approved workshops are visible through marketplace contexts',async()=>{
 const f=fixture();await f.upload();await f.upload('shop');
 f.db.rows.set('posts/build',{authorId:'owner',status:'published'});
 assert.ok((await f.call('shop','view',{context:'post',id:'build'})).url);
 assert.ok((await f.call('owner','view',{context:'shop',id:'shop'})).url);
 f.db.rows.set('posts/build',{authorId:'owner',status:'removed'});await assert.rejects(()=>f.call('shop','view',{context:'post',id:'build'}));
 await assert.rejects(()=>f.call('pending','view',{context:'shop',id:'shop'}));
});
test('conversation avatar access uses current participant authorization and respects rejection/revocation',async()=>{
 const f=fixture();await f.upload();await f.upload('shop');
 f.db.rows.set('conversations/chat',{ownerId:'owner',shopId:'shop',serviceRequestId:'request',consent:'approved',consentTermsVersion:1});
 f.db.rows.set('serviceRequests/request',{ownerId:'owner',status:'open',visibility:'open',vehicleId:'car',categoryId:'paint',termsVersion:1});
 f.db.rows.set('vehicles/car',{ownerId:'owner',archived:false});f.db.rows.set('serviceCategories/paint',{archived:false});
 assert.ok((await f.call('shop','view',{context:'conversation',id:'chat'})).url);
 await assert.rejects(()=>f.call('other','view',{context:'conversation',id:'chat'}),{code:'not-found'});
 for(const consent of ['pending','rejected','revoked']){f.db.rows.set('conversations/chat',{...f.db.rows.get('conversations/chat'),consent});await assert.rejects(()=>f.call('shop','view',{context:'conversation',id:'chat'}),{code:'permission-denied'});}
});

test('profile storage shares the existing private bucket with isolated immutable paths and refuses public buckets',async()=>{
 const {createStorage}=require('../storage.cjs'),path='profiles/owner/12345678-1234-4123-8123-123456789abc',calls=[];
 const client={storage:{getBucket:async bucket=>({data:{public:bucket==='public'}}),from:bucket=>({upload:async(...args)=>{calls.push(args);return {};},createSignedUrl:async(p,seconds)=>{assert.equal(seconds,60);return {data:{signedUrl:'https://private.example.invalid/test'}};}})}};
 const store=createStorage({client,scope:'profiles',bucket:'vehicle-images'});assert.equal(store.bucket,'vehicle-images');await store.upload(path,PNG,'image/png');assert.equal(calls[0][2].upsert,false);await store.signedUrl(path);
 for(const bad of ['profiles/other/../x','photos/owner/car/12345678-1234-4123-8123-123456789abc','profiles/owner/not-an-id'])await assert.rejects(()=>store.signedUrl(bad));
 await assert.rejects(()=>createStorage({client,scope:'profiles',bucket:'public'}).signedUrl(path),{code:'unavailable'});
});

test('request-scoped previews return only the accessible request author and fresh revision metadata',async()=>{
 const f=fixture();f.db.rows.set('users/owner',{role:'owner',fullName:'Visible Customer'});
 f.db.rows.set('vehicles/car',{ownerId:'owner',archived:false});f.db.rows.set('serviceCategories/paint',{archived:false});
 f.db.rows.set('serviceRequests/job',{ownerId:'owner',vehicleId:'car',categoryId:'paint',visibility:'open',status:'open'});
 const first=await f.upload(),other=await f.upload('other');
 const visible=()=>f.api.marketplace({auth:f.identity('shop'),data:{op:'request',id:'job'}});
 let details=await visible();assert.equal(details.customerName,'Visible Customer');assert.deepEqual(details.customerAvatar,{context:'request',id:'job',revision:1,hasPhoto:true});assert.equal(details.request.ownerId,undefined);
 const photo=await f.call('shop','view',{context:'request',id:'job'});assert.equal(photo.photoId,first.photoId);assert.notEqual(photo.photoId,other.photoId);assert.ok(!JSON.stringify(photo).includes('profiles/'));
 await assert.rejects(()=>f.call('other','view',{context:'request',id:'job'}),{code:'permission-denied'});
 await assert.rejects(()=>f.call('shop','view',{context:'request',id:'owner'}),{code:'not-found'});
 await assert.rejects(()=>f.call('shop','view',{context:'request',id:'job',uid:'other'}));
 await f.upload();details=await visible();assert.equal(details.customerAvatar.revision,2);
 await f.call('owner','remove',{version:2,requestId:'remove-request-photo'});details=await visible();assert.equal(details.customerAvatar.revision,3);assert.equal(details.customerAvatar.hasPhoto,false);assert.equal((await f.call('shop','view',{context:'request',id:'job'})).url,null);
});
test('request avatar scope denies other direct invitees, missing/hidden identity and current access restrictions',async()=>{
 const f=fixture();f.db.rows.set('users/owner',{role:'owner',fullName:'Visible Customer'});await f.upload();
 f.db.rows.set('vehicles/car',{ownerId:'owner',archived:false});f.db.rows.set('serviceCategories/paint',{archived:false});
 const request={ownerId:'owner',vehicleId:'car',categoryId:'paint',visibility:'direct',shopId:'pending',status:'open'};f.db.rows.set('serviceRequests/job',request);
 const preview=()=>f.call('shop','view',{context:'request',id:'job'});
 await assert.rejects(preview,{code:'not-found'});
 f.db.rows.set('serviceRequests/job',{...request,visibility:'open'});
 for(const fullName of ['', 'private@example.invalid','0821234567']){
  f.db.rows.set('users/owner',{...f.db.rows.get('users/owner'),fullName});
  const details=await f.api.marketplace({auth:f.identity('shop'),data:{op:'request',id:'job'}});assert.equal(details.customerName,'Customer');assert.equal(details.customerAvatar,null);await assert.rejects(preview,{code:'not-found'});
 }
 f.db.rows.set('users/owner',{role:'owner',fullName:'Visible Customer',accountStatus:'suspended'});await assert.rejects(preview,{code:'not-found'});
 f.db.rows.set('users/owner',{role:'owner',fullName:'Visible Customer'});f.db.rows.set('vehicles/car',{ownerId:'owner',archived:true});await assert.rejects(preview,{code:'not-found'});
 await assert.rejects(()=>f.call('pending','view',{context:'request',id:'job'}),{code:'permission-denied'});
});
test('request visibility is rechecked immediately before minting a private preview',async()=>{
 const f=fixture();f.db.rows.set('users/owner',{role:'owner',fullName:'Visible Customer'});await f.upload();
 f.db.rows.set('vehicles/car',{ownerId:'owner'});f.db.rows.set('serviceCategories/paint',{archived:false});
 const request={ownerId:'owner',vehicleId:'car',categoryId:'paint',visibility:'open'};f.db.rows.set('serviceRequests/job',request);
 const authorize=f.api.marketplace.authorizeRequestAvatar;let calls=0;
 f.api.marketplace.authorizeRequestAvatar=async(...args)=>{const result=await authorize(...args);if(++calls===1)f.db.rows.set('serviceRequests/job',{...request,visibility:'direct',shopId:'other'});return result;};
 f.storage.signedUrl=async()=>assert.fail('No URL after access changes');await assert.rejects(()=>f.call('shop','view',{context:'request',id:'job'}),{code:'not-found'});
});
