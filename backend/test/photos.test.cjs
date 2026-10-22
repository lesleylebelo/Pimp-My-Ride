const {test}=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createPhotos,LEASE_MS}=require('../photos.cjs');
const {createMarketplace}=require('../marketplace.cjs');
const {LOCAL_MOCK_ENV}=require('./helpers/mock-payments.cjs');
const P=require('../photo-domain.cjs');

// Generated one-pixel colour fixtures, with real image headers and image data.
// No customer photographs, image dependencies or live services are used here.
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNw6dj9HwAFIgKH/2N/LgAAAABJRU5ErkJggg==','base64');
const JPEG=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSgBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAAEAAQMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AK1fVHyh/9k=','base64');
const file=(buffer=PNG,mimetype='image/png',originalname='vehicle.png')=>({buffer,mimetype,originalname});
const seed={
 'users/owner':{role:'owner'},'users/other':{role:'owner'},'users/admin':{role:'admin'},
 'users/shop':{role:'shop',verificationStatus:'approved',shop:{shopName:'Test Shop'}},
 'users/competitor':{role:'shop',verificationStatus:'approved',shop:{shopName:'Other Shop'}},
 'vehicles/car':{ownerId:'owner',make:'Test',model:'Hatch',year:2020,colour:'Blue',registration:'PRIVATE',version:1,archived:false},
 'vehicles/othercar':{ownerId:'other',archived:false},'serviceCategories/paint':{name:'Paint',archived:false},
};
const requestData={vehicleId:'car',title:'Paint door',description:'Repaint the door.',categoryId:'paint',city:'Johannesburg',budgetMinCents:0,budgetMaxCents:100000,visibility:'open'};
const quoteData={scope:'Paint door',items:[{description:'Paint',amountCents:50000}],completionDays:2,warranty:'One year',validForDays:14};
function fixture(){
 const db=memoryDb(structuredClone(seed)),files=new Map(),users=new Map(),signed=[];let sequence=0;
 const auth={getUser:async uid=>users.get(uid)||{emailVerified:true,disabled:false}};
 const actor=async request=>({uid:request.auth.uid,profile:(await db.doc(`users/${request.auth.uid}`).get()).data()});
 const storage={upload:async(path,buffer)=>files.set(path,buffer),signedUrl:async(path,seconds)=>{signed.push({path,seconds});return `https://private.example.invalid/${signed.length}`;},remove:async()=>assert.fail('Photo operations must never delete source objects.')};
 db.projectId='demo-pmr-security';
 const api=createPhotos({db,auth,storage,actor}),market=createMarketplace({db,auth,actor,mockPaymentEnv:LOCAL_MOCK_ENV});
 const data=(extra={})=>({auth:{uid:'owner'},vehicleId:'car',slot:'1',version:db.rows.get('vehicles/car').photoRevision||0,requestId:`upload-${++sequence}`,file:file(),...extra});
 const upload=extra=>api.uploadPhoto(data(extra));
 const read=(uid,op,extra={})=>api.photosApi({auth:{uid},data:{op,target:'vehicle',id:'car',...extra}});
 const write=async(uid,op,extra={})=>{
  if(op==='quoteSubmit'&&extra.termsVersion===undefined){
   const request=(await db.doc(`serviceRequests/${extra.serviceRequestId}`).get()).data();
   extra={...extra,termsVersion:request?.termsVersion||request?.version||1};
  }
  return market({auth:{uid},data:{op,requestId:`market-${++sequence}`,...extra}});
 };
 const attempts=()=>[...db.rows].filter(([path])=>path.startsWith('storagePhotosUploadAttempts/')).map(([,value])=>value);
 const assets=()=>[...db.rows].filter(([path])=>path.startsWith('marketplacePhotos/')).map(([,value])=>value);
 return {db,files,users,signed,auth,actor,storage,api,market,data,upload,read,write,attempts,assets};
}
const safeKeys=['contentType','id','name','size','uploadedAt'];

test('request previews expose only the two ordered attachments and preserve direct-request and Garage privacy',async()=>{
 const f=fixture(),first=await f.upload(),second=await f.upload({slot:'2'}),privatePhoto=await f.upload({slot:'3'});
 const request=await f.write('owner','requestCreate',{...requestData,visibility:'direct',shopId:'shop',photoIds:[second.id,first.id]});
 const saved=f.db.rows.get('serviceRequests/'+request.id);assert.deepEqual(saved.photos.map(photo=>photo.id),[second.id,first.id]);
 const selected=await f.read('shop','list',{target:'request',id:request.id});assert.deepEqual(selected.items.map(photo=>photo.id),[second.id,first.id]);
 for(const photoId of [second.id,first.id])await f.read('shop','view',{target:'request',id:request.id,photoId});assert.equal(f.signed.length,2);
 await assert.rejects(()=>f.read('shop','view',{target:'request',id:request.id,photoId:privatePhoto.id}),{code:'not-found'});
 await assert.rejects(()=>f.read('competitor','view',{target:'request',id:request.id,photoId:first.id}),{code:'not-found'});
 await assert.rejects(()=>f.read('shop','view',{photoId:first.id}),{code:'not-found'});
 await f.write('owner','requestClose',{id:request.id});
 await assert.rejects(()=>f.read('shop','view',{target:'request',id:request.id,photoId:first.id}),{code:'not-found'});
});

test('photo validation accepts complete JPEG/PNG fixtures and never trusts a filename for content type',()=>{
 for(const [buffer,mimetype,name] of [[PNG,'image/png','vehicle.png'],[JPEG,'image/jpeg','vehicle.jpg']]){
  const value=P.validatePhoto(file(buffer,mimetype,name));assert.equal(value.contentType,mimetype);assert.equal(value.size,buffer.length);assert.equal(value.contentHash,P.hash(buffer));
 }
 assert.equal(P.validatePhoto(file(PNG,'image/png','../vehicle\\photo.png')).name,'.._vehicle_photo.png');
 for(const upload of [file(PNG,'image/jpeg','vehicle.jpg'),file(JPEG,'image/png'),file(Buffer.from('<svg/>'),'image/png'),file(Buffer.from('%PDF-1.7'),'image/png'),file(PNG,'image/gif')])assert.throws(()=>P.validatePhoto(upload),{code:'invalid-argument'});
});

test('photo validation rejects empty, oversized, header-only, truncated and missing-image-data files',()=>{
 const noData=Buffer.concat([PNG.subarray(0,33),PNG.subarray(PNG.length-12)]);
 for(const buffer of [Buffer.alloc(0),Buffer.alloc(P.MAX_BYTES+1),PNG.subarray(0,33),PNG.subarray(0,-1),noData,Buffer.concat([PNG,Buffer.from('trailing')])])assert.throws(()=>P.validatePhoto(file(buffer)),{code:'invalid-argument'});
 for(const buffer of [JPEG.subarray(0,40),JPEG.subarray(0,-2),Buffer.from([255,216,255,217])])assert.throws(()=>P.validatePhoto(file(buffer,'image/jpeg','vehicle.jpg')),{code:'invalid-argument'});
 const badChunk=Buffer.from(PNG);badChunk.writeUInt32BE(0xffffffff,33);assert.throws(()=>P.validatePhoto(file(badChunk)),{code:'invalid-argument'});
});

test('photo validation rejects excessive dimensions and pixel counts for PNG and JPEG',()=>{
 for(const [width,height] of [[0,1],[12001,1],[1,12001],[8000,8000]]){
  const png=Buffer.from(PNG);png.writeUInt32BE(width,16);png.writeUInt32BE(height,20);assert.throws(()=>P.validatePhoto(file(png)),{code:'invalid-argument'});
  const jpeg=Buffer.from(JPEG),sof=jpeg.indexOf(Buffer.from([255,192]));assert.ok(sof>0);jpeg.writeUInt16BE(height,sof+5);jpeg.writeUInt16BE(width,sof+7);assert.throws(()=>P.validatePhoto(file(jpeg,'image/jpeg','vehicle.jpg')),{code:'invalid-argument'});
 }
});

test('upload ledger precedes storage I/O and successful retries preserve one object, asset and audit',async()=>{
 const f=fixture(),req=f.data(),original=f.storage.upload;
 f.storage.upload=async(path,buffer)=>{const intent=f.attempts().find(value=>value.path===path);assert.equal(intent.state,'uploading');assert.ok(intent.workerToken);await original(path,buffer);};
 const first=await f.api.uploadPhoto(req);assert.deepEqual(await f.api.uploadPhoto(req),first);
 assert.equal(f.files.size,1);assert.equal(f.assets().length,1);assert.equal(f.attempts()[0].state,'referenced');assert.equal(first.version,1);
 assert.equal([...f.db.rows].filter(([path,value])=>path.startsWith('auditLogs/')&&value.action==='photos.uploaded').length,1);
 const listed=await f.read('owner','list');assert.equal(listed.version,1);assert.equal(listed.canManage,true);assert.deepEqual(Object.keys(listed.items[0]).sort(),[...safeKeys,'slot'].sort());assert.ok(!JSON.stringify(listed).includes('photos/owner'));
 await assert.rejects(()=>f.api.uploadPhoto({...req,file:file(JPEG,'image/jpeg','different.jpg')}),{code:'already-exists'});
});

test('a stale upload revision closes its key durably before allowing a refreshed intent',async()=>{
 for(const lostAcknowledgement of [false,true]){
 const f=fixture();await f.upload();const stale=f.data({version:0,requestId:'stale-key'});
 if(lostAcknowledgement)f.db.after=async n=>{if(n===3)throw Error('Synthetic stale-receipt acknowledgement lost');};
 await assert.rejects(()=>f.api.uploadPhoto(stale),error=>error.code==='failed-precondition'&&error.retryWithNewRequest===true);
 const closed=f.attempts().find(value=>value.reason==='stale-version');assert.equal(closed.state,'cleanupPending');assert.equal(f.files.size,1);
 await assert.rejects(()=>f.api.uploadPhoto(stale),error=>error.retryWithNewRequest===true);
 assert.equal(f.attempts().length,2);assert.equal(f.files.size,1);
 const next=await f.upload({version:1,requestId:'refreshed-key'});assert.equal(next.version,2);assert.equal(f.files.size,2);
 }
});

test('five slots, strict versions, ownership and owner role restrict the private vehicle library',async()=>{
 const f=fixture();
 for(const uid of ['other','shop','admin'])await assert.rejects(()=>f.upload({auth:{uid}}),{code:uid==='other'?'not-found':'permission-denied'});
 for(const uid of ['other','shop','competitor'])await assert.rejects(()=>f.read(uid,'list'),{code:'not-found'});
 for(const slot of ['0','6',1,'__proto__'])await assert.rejects(()=>f.upload({slot}),{code:'invalid-argument'});
 for(const version of [-1,0.5,'0',null])await assert.rejects(()=>f.upload({version}),{code:'invalid-argument'});
 for(const slot of P.slots)await f.upload({slot});assert.equal((await f.read('owner','list')).items.length,5);
 await assert.rejects(()=>f.upload({version:0}),{code:'failed-precondition'});assert.equal(f.files.size,5);
 f.db.rows.get('vehicles/car').archived=true;assert.equal((await f.read('owner','list')).canManage,false);
 await assert.rejects(()=>f.upload(),{code:'failed-precondition'});
 await assert.rejects(()=>f.read('owner','remove',{slot:'1',version:5,requestId:'remove-archived'}),{code:'failed-precondition'});
});

test('blocked profiles, in-flight account operations and stale owner Auth fail closed',async()=>{
 for(const profile of [{role:'owner',accountStatus:'suspended'},{role:'owner',accountStatus:'archived'},{role:'owner',statusOperation:'pending'},{role:'owner',provisioningOperation:'pending'}]){
  const f=fixture();f.db.rows.set('users/owner',profile);await assert.rejects(()=>f.upload(),{code:'permission-denied'});assert.equal(f.files.size,0);
 }
 for(const user of [{emailVerified:false,disabled:false},{emailVerified:true,disabled:true}]){const f=fixture();f.users.set('owner',user);await assert.rejects(()=>f.upload(),{code:'permission-denied'});assert.equal(f.files.size,0);}
 const f=fixture();f.db.before=()=>{f.db.rows.get('users/owner').accountStatus='suspended';};await assert.rejects(()=>f.upload(),{code:'permission-denied'});assert.equal(f.files.size,0);
});

test('replacement and removal retain immutable objects and successful original upload receipts',async()=>{
 const f=fixture(),req=f.data(),first=await f.api.uploadPhoto(req),second=await f.upload();
 assert.notEqual(first.id,second.id);assert.equal(f.files.size,2);assert.equal(f.assets().length,2);assert.equal(f.attempts().find(value=>value.assetId===first.id).reason,'replaced');
 assert.deepEqual(await f.api.uploadPhoto(req),first);assert.equal(f.files.size,2);
 const removal={slot:'1',version:2,requestId:'remove-once'};const result=await f.read('owner','remove',removal);assert.deepEqual(await f.read('owner','remove',removal),result);
 assert.equal((await f.read('owner','list')).items.length,0);assert.equal(f.attempts().find(value=>value.assetId===second.id).reason,'removed');assert.equal(f.files.size,2);
 assert.deepEqual(await f.api.uploadPhoto(req),first);assert.equal(f.files.size,2);
 await assert.rejects(()=>f.read('owner','view',{photoId:first.id}),{code:'not-found'});
});

test('removal rechecks revisions and profiles, and rejects extra authority or storage fields',async()=>{
 const f=fixture();await f.upload();
 await assert.rejects(()=>f.read('owner','remove',{slot:'1',version:0,requestId:'stale'}),{code:'failed-precondition'});
 for(const extra of [{ownerId:'other'},{path:'photos/other/car/id'},{status:'deleted'},{url:'https://example.invalid'}])await assert.rejects(()=>f.read('owner','list',extra),{code:'invalid-argument'});
 f.db.before=()=>{f.db.rows.get('users/owner').accountStatus='suspended';};
 await assert.rejects(()=>f.read('owner','remove',{slot:'1',version:1,requestId:'changed-profile'}),{code:'permission-denied'});assert.equal(f.assets().length,1);assert.equal(f.db.rows.get('vehicles/car').photoRevision,1);
});

test('request attachments are atomically snapshotted without paths and survive replacement and removal',async()=>{
 const f=fixture(),first=await f.upload(),created=await f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),request=f.db.rows.get(`serviceRequests/${created.id}`);
 assert.deepEqual(request.photoIds,[first.id]);assert.deepEqual(Object.keys(request.photos[0]).sort(),safeKeys.sort());
 await f.upload();await f.read('owner','remove',{slot:'1',version:2,requestId:'remove-replacement'});
 assert.deepEqual(request.photoIds,[first.id]);assert.equal((await f.read('shop','list',{target:'request',id:created.id})).items[0].id,first.id);
 const result=await f.read('shop','view',{target:'request',id:created.id,photoId:first.id});assert.ok(result.url);assert.equal(f.signed[0].path,`photos/owner/car/${first.id}`);assert.equal(f.signed[0].seconds,60);assert.ok(result.expiresAt>Date.now());
 assert.equal(f.files.size,2);assert.equal((await f.read('owner','list')).items.length,0);
 await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),{code:'failed-precondition'});
});

test('request photo selection rejects foreign, stale, duplicate, excessive and forged metadata',async()=>{
 const f=fixture(),first=await f.upload();
 for(const photoIds of [[first.id,first.id],Array.from({length:6},(_,i)=>`id${i}`),'asset',null])await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds}),{code:'invalid-argument'});
 for(const photoIds of [['absent'],['other-asset']])await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds}),{code:'failed-precondition'});
 for(const extra of [{photos:[{id:first.id,path:'forged'}]},{photoPaths:['private/path']}])await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,...extra}),{code:'invalid-argument'});
 const asset=f.db.rows.get(`marketplacePhotos/${first.id}`);asset.ownerId='other';await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),{code:'failed-precondition'});
 asset.ownerId='owner';asset.vehicleId='othercar';await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),{code:'failed-precondition'});
 asset.vehicleId='car';asset.path='photos/other/othercar/asset';await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),{code:'failed-precondition'});
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith('serviceRequests/')).length,0);
});

test('legacy requests need no photos; booked requests copy immutable photo IDs and redact metadata paths',async()=>{
 const f=fixture(),legacy=await f.write('owner','requestCreate',requestData);assert.deepEqual(f.db.rows.get(`serviceRequests/${legacy.id}`).photoIds,[]);
 const photo=await f.upload(),created=await f.write('owner','requestCreate',{...requestData,photoIds:[photo.id]});
 // Even a malformed privileged/legacy metadata record is redacted at output.
 f.db.rows.get(`serviceRequests/${created.id}`).photos[0].path='private/unexpected/path';
 const detail=await f.market({auth:{uid:'shop'},data:{op:'request',id:created.id}});assert.ok(!JSON.stringify(detail).includes('private/unexpected/path'));
 const quote=await f.write('shop','quoteSubmit',{serviceRequestId:created.id,...quoteData}),booking=await f.write('owner','quoteAccept',{id:quote.id,paymentMethod:'pay_in_store'});assert.deepEqual(f.db.rows.get(`bookings/${booking.id}`).photoIds,[photo.id]);
 assert.equal((await f.read('shop','list',{target:'request',id:created.id})).items.length,1);
 await assert.rejects(()=>f.read('competitor','list',{target:'request',id:created.id}),{code:'not-found'});
 f.db.rows.get('vehicles/car').archived=true;assert.equal((await f.read('shop','list',{target:'request',id:created.id})).items.length,1);
});

test('signed galleries enforce direct audiences, current request availability and selected-shop history',async()=>{
 const f=fixture(),photo=await f.upload(),created=await f.write('owner','requestCreate',{...requestData,photoIds:[photo.id],visibility:'direct',shopId:'shop'}),target={target:'request',id:created.id,photoId:photo.id};
 await assert.rejects(()=>f.read('competitor','view',target),{code:'not-found'});await assert.rejects(()=>f.read('other','view',target),{code:'not-found'});assert.equal(f.signed.length,0);
 for(const profile of [{role:'shop',verificationStatus:'pending'},{role:'shop',verificationStatus:'rejected'},{role:'shop',verificationStatus:'approved',accountStatus:'suspended'},{role:'shop',verificationStatus:'approved',reviewOperation:'review'}]){
  f.db.rows.set('users/shop',profile);await assert.rejects(()=>f.read('shop','view',target),{code:'permission-denied'});
 }
 f.db.rows.set('users/shop',structuredClone(seed['users/shop']));f.db.rows.get('vehicles/car').archived=true;await assert.rejects(()=>f.read('shop','view',target),{code:'not-found'});
 f.db.rows.get('vehicles/car').archived=false;f.users.set('owner',{emailVerified:true,disabled:true});await assert.rejects(()=>f.read('shop','view',target),{code:'not-found'});
 f.users.clear();await f.write('owner','requestClose',{id:created.id});await assert.rejects(()=>f.read('shop','view',target),{code:'not-found'});
 await f.read('owner','view',target);assert.equal(f.signed.length,1);
});

test('signed URLs recheck current role and current attachment before storage is called',async()=>{
 for(const change of ['role','attachment']){
  const f=fixture(),photo=await f.upload();let calls=0;
  const api=createPhotos({...f,actor:async request=>{if(++calls===2){if(change==='role')f.db.rows.get('users/owner').accountStatus='suspended';else f.db.rows.get('vehicles/car').photoSlots={};}return f.actor(request);}});
  await assert.rejects(()=>api.photosApi({auth:{uid:'owner'},data:{op:'view',target:'vehicle',id:'car',photoId:photo.id}}),{code:change==='role'?'permission-denied':'not-found'});assert.equal(f.signed.length,0);
 }
});

test('storage failure closes its ledger without publishing metadata or deleting its retained object',async()=>{
 const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);throw Error('Synthetic storage acknowledgement lost');};
 const req=f.data();await assert.rejects(()=>f.api.uploadPhoto(req),error=>error.code==='failed-precondition'&&error.retryWithNewRequest===true);
 assert.equal(f.files.size,1);assert.equal(f.assets().length,0);assert.equal(f.attempts()[0].state,'cleanupPending');assert.equal(f.db.rows.get('vehicles/car').photoRevision,undefined);
 await assert.rejects(()=>f.api.uploadPhoto(req),error=>error.retryWithNewRequest===true);assert.equal(f.files.size,1);
});

test('changed photo revision or owner access after I/O fences publication while retaining the candidate',async()=>{
 for(const change of ['revision','suspension','disabled','archived']){
  const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);if(change==='revision')f.db.rows.get('vehicles/car').photoRevision=1;else if(change==='suspension')f.db.rows.get('users/owner').accountStatus='suspended';else if(change==='disabled')f.users.set('owner',{emailVerified:true,disabled:true});else f.db.rows.get('vehicles/car').archived=true;};
  await assert.rejects(()=>f.upload(),error=>error.retryWithNewRequest===true);assert.equal(f.assets().length,0);assert.equal(f.files.size,1);assert.equal(f.attempts()[0].state,'cleanupPending');assert.equal(f.db.rows.get('vehicles/car').photoSlots,undefined);
 }
});

test('an expired worker cannot publish even when no retry has closed its lease',async t=>{
 let now=Date.parse('2030-01-01T10:00:00Z');t.mock.method(Date,'now',()=>now);
 const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);now+=LEASE_MS;};
 await assert.rejects(()=>f.upload(),error=>error.retryWithNewRequest===true&&/lease/.test(error.message));assert.equal(f.attempts()[0].state,'cleanupPending');assert.equal(f.assets().length,0);assert.equal(f.files.size,1);
});

test('a pending duplicate cannot upload, and an expired retry closes the lease before the old worker resumes',async t=>{
 let now=Date.parse('2030-01-01T10:00:00Z');t.mock.method(Date,'now',()=>now);
 const f=fixture(),req=f.data(),upload=f.storage.upload;let calls=0;
 f.storage.upload=async(...args)=>{calls++;await upload(...args);await assert.rejects(()=>f.api.uploadPhoto(req),{code:'unavailable'});now+=LEASE_MS;await assert.rejects(()=>f.api.uploadPhoto(req),error=>error.retryWithNewRequest===true);};
 await assert.rejects(()=>f.api.uploadPhoto(req),error=>error.retryWithNewRequest===true);assert.equal(calls,1);assert.equal(f.assets().length,0);assert.equal(f.attempts()[0].reason,'expired');
});

test('lost reservation, metadata and settlement acknowledgements recover only from exact authoritative receipts',async()=>{
 for(const lost of [[1],[2],[1,2,3]]){
  const f=fixture();f.db.after=async n=>{if(lost.includes(n))throw Error('Synthetic acknowledgement lost');};
  const result=await f.upload();assert.equal(result.version,1);assert.equal(f.assets().length,1);assert.equal(f.files.size,1);assert.equal(f.attempts()[0].state,'referenced');
 }
 const f=fixture();f.db.before=async n=>{if(n===2)throw Error('Synthetic metadata failure');};f.db.after=async n=>{if(n===3)throw Error('Synthetic settlement acknowledgement lost');};
 await assert.rejects(()=>f.upload(),error=>error.retryWithNewRequest===true);assert.equal(f.attempts()[0].state,'cleanupPending');assert.equal(f.assets().length,0);
});

test('unconfirmed reservation never uploads; unknown metadata outcomes keep the same retry key',async()=>{
 const unavailable=fixture();unavailable.db.before=async()=>{throw Error('Synthetic Firestore unavailable');};
 await assert.rejects(()=>unavailable.upload(),error=>error.code==='unavailable'&&!error.retryWithNewRequest);assert.equal(unavailable.files.size,0);assert.equal(unavailable.attempts().length,0);
 const f=fixture(),req=f.data();f.db.before=async n=>{if(n>=2)throw Error('Synthetic Firestore unavailable');};
 await assert.rejects(()=>f.api.uploadPhoto(req),error=>error.code==='unavailable'&&!error.retryWithNewRequest);assert.equal(f.attempts()[0].state,'uploading');assert.equal(f.files.size,1);assert.equal(f.assets().length,0);
 f.db.before=null;await assert.rejects(()=>f.api.uploadPhoto(req),{code:'unavailable'});assert.equal(f.files.size,1);
});

test('malformed lease timestamps and changed worker tokens never authorize metadata publication',async()=>{
 for(const change of [record=>{record.createdAt='old';},record=>{record.workerToken='different-worker';}]){
  const f=fixture(),upload=f.storage.upload;f.storage.upload=async(...args)=>{await upload(...args);change(f.attempts()[0]);};
  await assert.rejects(()=>f.upload());assert.equal(f.assets().length,0);assert.equal(f.files.size,1);assert.equal(f.db.rows.get('vehicles/car').photoSlots,undefined);
 }
});

test('editing a request retains its authorised immutable attachments after garage replacement',async()=>{
 const f=fixture(),first=await f.upload(),created=await f.write('owner','requestCreate',{...requestData,photoIds:[first.id]});
 await f.upload();
 await f.write('owner','requestUpdate',{...requestData,id:created.id,version:1,title:'Updated title',photoIds:[first.id]});
 assert.deepEqual(f.db.rows.get('serviceRequests/'+created.id).photoIds,[first.id]);
 assert.equal((await f.read('shop','list',{target:'request',id:created.id})).items[0].id,first.id);
 await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,photoIds:[first.id]}),{code:'failed-precondition'});
 assert.equal(f.files.size,2);
});

test('request-only photos do not alter Garage slots and remain private through request and booking audiences',async()=>{
 const f=fixture();f.storage.bucket='vehicle-images';
 const requestFiles=new Map(),requestSigns=[];
 const requestStorage={bucket:'request-images',upload:async(path,buffer)=>requestFiles.set(path,buffer),signedUrl:async path=>{requestSigns.push(path);return 'https://request.example.invalid/signed';}};
 const api=createPhotos({db:f.db,auth:f.auth,actor:f.actor,storage:f.storage,requestStorage});
 const input=f.data({target:'request'}),uploaded=await api.uploadPhoto(input);
 assert.deepEqual(await api.uploadPhoto(input),uploaded);assert.equal(requestFiles.size,1);assert.equal(f.files.size,0);
 const asset=f.db.rows.get('marketplacePhotos/'+uploaded.id);assert.equal(asset.bucket,'request-images');assert.equal(asset.purpose,'request');assert.match(asset.path,/^requests\/owner\/car\//);
 assert.equal(f.db.rows.get('vehicles/car').photoSlots,undefined);assert.equal(f.db.rows.get('vehicles/car').photoRevision,undefined);
 const draft={op:'view',target:'attachment',id:uploaded.id,photoId:uploaded.id};
 await api.photosApi({auth:{uid:'owner'},data:draft});
 for(const uid of ['other','shop'])await assert.rejects(()=>api.photosApi({auth:{uid},data:draft}));
 const result=await f.write('owner','requestCreate',{...requestData,photoIds:[uploaded.id]});
 const read=uid=>api.photosApi({auth:{uid},data:{op:'view',target:'request',id:result.id,photoId:uploaded.id}});
 await read('owner');await read('shop');await assert.rejects(()=>read('other'));
 assert.equal(requestSigns.length,3);
 await f.write('owner','requestUpdate',{id:result.id,version:1,...requestData,photoIds:[uploaded.id]});
 // A foreign owner cannot attach it to another vehicle.
 await assert.rejects(()=>f.write('other','requestCreate',{...requestData,vehicleId:'othercar',photoIds:[uploaded.id]}));
 const req=f.db.rows.get('serviceRequests/'+result.id);f.db.rows.set('serviceRequests/'+result.id,{...req,visibility:'direct',shopId:'shop'});
 await assert.rejects(()=>read('competitor'));await read('shop');
 f.db.rows.set('serviceRequests/'+result.id,{...req,status:'accepted',bookingId:'booking'});
 f.db.rows.set('bookings/booking',{serviceRequestId:result.id,ownerId:'owner',shopId:'shop'});
 await read('shop');await assert.rejects(()=>read('competitor'));
 assert.equal(requestFiles.size,1);
});

test('request upload errors never attach or publish a successful asset',async()=>{
 const f=fixture(),requestStorage={bucket:'request-images',upload:async()=>{throw Error('Synthetic storage outage');}};
 const api=createPhotos({db:f.db,auth:f.auth,actor:f.actor,storage:f.storage,requestStorage});
 await assert.rejects(()=>api.uploadPhoto(f.data({target:'request'})),{code:'failed-precondition'});
 assert.equal(f.assets().length,0);assert.equal(f.db.rows.get('vehicles/car').photoSlots,undefined);
 assert.equal(f.attempts()[0].state,'cleanupPending');
});
