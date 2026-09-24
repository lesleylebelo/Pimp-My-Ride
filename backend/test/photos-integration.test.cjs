const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const http=require('supertest'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const {LEASE_MS}=require('../photos.cjs');
const firebase=initializeApp({projectId:'demo-pmr-security'},'photo-tests'),db=getFirestore(firebase),auth=getAuth(firebase);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZkAAAAASUVORK5CYII=','base64');
const file={buffer:png,mimetype:'image/png',originalname:'synthetic.png'};
const vehicle={make:'Test make',model:'Test model',year:2020,colour:'Blue',registration:'TEST 123 GP'};
const details={title:'Body kit installation',description:'Supply and fit a synthetic example body kit.',categoryId:'body',city:'Johannesburg',budgetMinCents:100000,budgetMaxCents:300000,preferredDate:'',visibility:'open'};
const quote={scope:'Fit and inspect the example kit.',items:[{description:'Fitment',amountCents:125000}],completionDays:5,warranty:'12 months workmanship',validForDays:14};
let app,services,sequence=0,uploadHook,objects,links;
const identity=uid=>({uid,token:{email_verified:true,auth_time:Math.floor(Date.now()/1000)+1}});
const call=(uid,op,data={})=>services.marketplace({auth:identity(uid),data:{op,requestId:`photo-test-${++sequence}`,...data}});
const photos=(uid,op,target,id,data={})=>services.photosApi({auth:identity(uid),data:{op,target,id,...data}});
const upload=(vehicleId,slot='1',version=0,requestId=`upload-${++sequence}`,uid='alice')=>services.uploadPhoto({auth:identity(uid),vehicleId,slot,version,requestId,file});
async function seed(uid,role,extra={}){
 await auth.createUser({uid,email:`${uid}@example.invalid`,emailVerified:true,password:'SyntheticPassword1234'});
 await db.doc(`users/${uid}`).set({role,accountStatus:'active',fullName:'Fictional test user',email:`${uid}@example.invalid`,phone:'0821234567',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:`Workshop ${uid}`,city:'Johannesburg',province:'Gauteng',services:'Body kits'}}:{}),...extra});
}
beforeEach(async()=>{
 const cleared=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});assert.ok(cleared.ok);
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));
 await Promise.all([seed('alice','owner'),seed('bob','owner'),seed('shop-one','shop'),seed('shop-two','shop'),seed('pending','shop',{verificationStatus:'pending'}),seed('admin','admin')]);
 await db.doc('serviceCategories/body').set({name:'Body kit',description:'Body customization',archived:false});
 objects=new Map();links=[];uploadHook=null;
 const photoStorage={upload:async(path,bytes,contentType)=>{assert.equal(objects.has(path),false);objects.set(path,{bytes,contentType});if(uploadHook)await uploadHook(path);},signedUrl:async(path,seconds)=>{assert.ok(objects.has(path));assert.equal(seconds,60);links.push(path);return 'https://photos.example.invalid/temporary';}};
 services=createServices({db,auth,storage:{},photoStorage});app=createApp({auth,services});
});
after(async()=>{await db.terminate();await deleteApp(firebase);});
async function signIn(uid){
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.invalid`,password:'SyntheticPassword1234',returnSecureToken:true})});
 const result=await response.json();assert.ok(result.idToken);return result.idToken;
}
async function uploaded(){const v=await call('alice','vehicleSave',vehicle),photo=await upload(v.id);return {vehicleId:v.id,photo};}
const assertPrivate=value=>{const json=JSON.stringify(value);for(const field of ['"path"','"provider"','"uploadAttemptId"','"workerToken"','"fingerprint"'])assert.ok(!json.includes(field),field);};

test('authenticated photos survive replacement/removal and remain private request attachments through booking',async()=>{
 const owner=await signIn('alice'),shop=await signIn('shop-one'),otherShop=await signIn('shop-two');
 const v=await call('alice','vehicleSave',vehicle);
 const endpoint=`/api/photos/vehicles/${v.id}/1?version=0&requestId=http-photo`;
 await http(app).post(endpoint).attach('file',png,{filename:'synthetic.png',contentType:'image/png'}).expect(401);
 const first=(await http(app).post(endpoint).set('Authorization',`Bearer ${owner}`).attach('file',png,{filename:'synthetic.png',contentType:'image/png'}).expect(200)).body.data;
 const request=await call('alice','requestCreate',{...details,vehicleId:v.id,photoIds:[first.id]});
 const read=async(token,op,extra={})=>(await http(app).post('/api/photos').set('Authorization',`Bearer ${token}`).send({op,target:'request',id:request.id,...extra}).expect(200)).body.data;
 const initial=await read(shop,'list');assert.equal(initial.items[0].id,first.id);assert.equal(initial.canManage,false);assertPrivate(initial);
 const viewed=await read(shop,'view',{photoId:first.id});assert.ok(viewed.expiresAt>Date.now());assert.ok(viewed.expiresAt<=Date.now()+60000);
 const originalPath=links.at(-1),replacement=await upload(v.id,'1',1);
 await photos('alice','remove','vehicle',v.id,{slot:'1',version:2,requestId:'remove-replacement'});
 assert.equal((await photos('alice','list','vehicle',v.id)).items.length,0);assert.equal(objects.size,2);
 assert.equal((await read(owner,'list')).items[0].id,first.id);await read(shop,'view',{photoId:first.id});assert.equal(links.at(-1),originalPath);
 await assert.rejects(()=>photos('alice','view','vehicle',v.id,{photoId:replacement.id}),{code:'not-found'});
 const offer=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:request.id});
 await call('alice','quoteAccept',{id:offer.id});
 const booking=(await services.marketplace({auth:identity('shop-one'),data:{op:'booking',id:request.id}})).booking;
 assert.deepEqual(booking.photoIds,[first.id]);assertPrivate(booking);
 await call('alice','vehicleArchive',{id:v.id,version:1,archived:true});await db.doc('serviceCategories/body').update({archived:true});
 assert.equal((await read(shop,'list')).items[0].id,first.id);
 await http(app).post('/api/photos').set('Authorization',`Bearer ${otherShop}`).send({op:'view',target:'request',id:request.id,photoId:first.id}).expect(404);
 const saved=(await db.doc(`serviceRequests/${request.id}`).get()).data();assert.deepEqual(saved.photoIds,[first.id]);assert.equal(saved.photos[0].name,'synthetic.png');assertPrivate(saved.photos);
});

test('photo access enforces current role, direct audience, account status, verification and revoked sessions',async()=>{
 const {vehicleId,photo}=await uploaded(),r=await call('alice','requestCreate',{...details,vehicleId,photoIds:[photo.id],visibility:'direct',shopId:'shop-one'});
 for(const uid of ['bob','shop-one','shop-two'])await assert.rejects(()=>photos(uid,'list','vehicle',vehicleId),{code:'not-found'});
 for(const uid of ['bob','shop-two'])await assert.rejects(()=>photos(uid,'view','request',r.id,{photoId:photo.id}),{code:'not-found'});
 for(const uid of ['pending','admin'])await assert.rejects(()=>photos(uid,'list','request',r.id),{code:'permission-denied'});
 for(const status of ['pending','rejected','reviewing']){await db.doc('users/shop-one').update({verificationStatus:status});await assert.rejects(()=>photos('shop-one','list','request',r.id),{code:'permission-denied'});}
 await db.doc('users/shop-one').update({verificationStatus:'approved'});
 for(const status of ['suspended','archived']){await db.doc('users/alice').update({accountStatus:status});await assert.rejects(()=>photos('alice','list','vehicle',vehicleId),{code:'permission-denied'});await assert.rejects(()=>photos('shop-one','list','request',r.id),{code:'not-found'});}
 await db.doc('users/alice').update({accountStatus:'active'});
 const token=await signIn('alice');await auth.updateUser('alice',{emailVerified:false});
 await http(app).post('/api/photos').set('Authorization',`Bearer ${token}`).send({op:'list',target:'vehicle',id:vehicleId}).expect(403);
 await auth.updateUser('alice',{emailVerified:true});
 await assert.rejects(()=>services.photosApi({auth:{uid:'alice',token:{email_verified:true,auth_time:1}},data:{op:'list',target:'vehicle',id:vehicleId}}),{code:'unauthenticated'});
 await call('alice','requestClose',{id:r.id});await assert.rejects(()=>photos('shop-one','list','request',r.id),{code:'not-found'});
 assert.equal((await photos('alice','list','request',r.id)).items[0].id,photo.id);
});

test('two real upload transactions at one revision publish only one photo and fence the loser',async()=>{
 const v=await call('alice','vehicleSave',vehicle);let arrived=0,release;const gate=new Promise(resolve=>{release=resolve;});
 uploadHook=async()=>{if(++arrived===2)release();await gate;};
 const results=await Promise.allSettled([upload(v.id,'1',0,'concurrent-one'),upload(v.id,'2',0,'concurrent-two')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.retryWithNewRequest,true);
 const saved=(await db.doc(`vehicles/${v.id}`).get()).data();assert.equal(saved.photoRevision,1);assert.equal(saved.photoIds.length,1);assert.equal(Object.keys(saved.photoSlots).length,1);
 assert.equal((await db.collection('marketplacePhotos').get()).size,1);assert.equal(objects.size,2);
 const ledgers=(await db.collection('storagePhotosUploadAttempts').get()).docs.map(d=>d.data());assert.equal(ledgers.filter(x=>x.state==='referenced').length,1);assert.equal(ledgers.filter(x=>x.state==='cleanupPending').length,1);
 const audits=(await db.collection('auditLogs').get()).docs.filter(d=>d.data().action==='photos.uploaded');assert.equal(audits.length,1);
});

test('request publication racing photo removal either snapshots the attachment or rejects the stale selection',async()=>{
 const {vehicleId,photo}=await uploaded();
 const results=await Promise.allSettled([call('alice','requestCreate',{...details,vehicleId,photoIds:[photo.id]}),photos('alice','remove','vehicle',vehicleId,{slot:'1',version:1,requestId:'racing-remove'})]);
 assert.equal(results[1].status,'fulfilled');assert.equal((await photos('alice','list','vehicle',vehicleId)).items.length,0);
 if(results[0].status==='fulfilled'){
  const id=results[0].value.id;assert.equal((await photos('alice','list','request',id)).items[0].id,photo.id);
  await photos('shop-one','view','request',id,{photoId:photo.id});
 }else{assert.equal(results[0].reason.code,'failed-precondition');assert.equal((await db.collection('serviceRequests').get()).size,0);}
 assert.equal(objects.size,1);assert.equal((await db.collection('marketplacePhotos').get()).size,1);
});

test('successful upload retry replays its durable result after removal without republishing or another storage write',async()=>{
 const v=await call('alice','vehicleSave',vehicle),first=await upload(v.id,'1',0,'stable-upload');
 await photos('alice','remove','vehicle',v.id,{slot:'1',version:1,requestId:'remove-for-replay'});
 assert.deepEqual(await upload(v.id,'1',0,'stable-upload'),first);
 assert.equal((await photos('alice','list','vehicle',v.id)).items.length,0);assert.equal(objects.size,1);
 await assert.rejects(()=>upload(v.id,'1',2,'stable-upload'),{code:'already-exists'});
 const ledger=(await db.collection('storagePhotosUploadAttempts').get()).docs[0].data();assert.equal(ledger.state,'cleanupPending');assert.deepEqual(ledger.result,first);
});

test('a storage worker cannot publish after its lease expires or its owner is suspended',async()=>{
 for(const reason of ['expired','suspended']){
  const v=await call('alice','vehicleSave',vehicle);
  uploadHook=async path=>{
   if(reason==='suspended')await db.doc('users/alice').update({accountStatus:'suspended'});
   else{const ledger=(await db.collection('storagePhotosUploadAttempts').where('path','==',path).get()).docs[0];await ledger.ref.update({createdAt:Timestamp.fromMillis(Date.now()-LEASE_MS-1000)});}
  };
  await assert.rejects(()=>upload(v.id),error=>error.code==='failed-precondition'&&error.retryWithNewRequest===true);
  assert.equal((await db.doc(`vehicles/${v.id}`).get()).data().photoIds,undefined);
  await db.doc('users/alice').update({accountStatus:'active'});
 }
 assert.equal((await db.collection('marketplacePhotos').get()).size,0);
 assert.ok((await db.collection('storagePhotosUploadAttempts').get()).docs.every(d=>d.data().state==='cleanupPending'));assert.equal(objects.size,2);
});

test('malformed uploads and forged attachment selections fail before any photo metadata is published',async()=>{
 const v=await call('alice','vehicleSave',vehicle),token=await signIn('alice');
 const base=`/api/photos/vehicles/${v.id}`;
 for(const slot of ['0','6'])await http(app).post(`${base}/${slot}?version=0&requestId=bad-slot-${slot}`).set('Authorization',`Bearer ${token}`).attach('file',png,{filename:'x.png',contentType:'image/png'}).expect(400);
 await http(app).post(`${base}/1?version=0&requestId=bad-type`).set('Authorization',`Bearer ${token}`).attach('file',png,{filename:'x.jpg',contentType:'image/jpeg'}).expect(400);
 await http(app).post(`${base}/1?version=0&requestId=bad-content`).set('Authorization',`Bearer ${token}`).attach('file',Buffer.from('synthetic non-image'),{filename:'x.png',contentType:'image/png'}).expect(400);
 assert.equal(objects.size,0);assert.equal((await db.collection('storagePhotosUploadAttempts').get()).size,0);
 const first=await upload(v.id),other=await call('alice','vehicleSave',vehicle);
 await assert.rejects(()=>call('alice','requestCreate',{...details,vehicleId:other.id,photoIds:[first.id]}),{code:'failed-precondition'});
 await assert.rejects(()=>call('alice','requestCreate',{...details,vehicleId:v.id,photoIds:[first.id,first.id]}),{code:'invalid-argument'});
 await assert.rejects(()=>call('alice','requestCreate',{...details,vehicleId:v.id,photoIds:['missing-photo']}),{code:'failed-precondition'});
 assert.equal((await db.collection('serviceRequests').get()).size,0);
});
