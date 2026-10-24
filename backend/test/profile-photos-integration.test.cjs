const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const http=require('supertest'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const appInstance=initializeApp({projectId:'demo-pmr-security'},'profile-photos-integration'),db=getFirestore(appInstance),auth=getAuth(appInstance);
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWNw6dj9HwAFIgKH/2N/LgAAAABJRU5ErkJggg==','base64');
let app,api,files;
async function token(uid){const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.invalid`,password:'SyntheticPassword1234',returnSecureToken:true})});const result=await response.json();assert.ok(result.idToken);return result.idToken;}
beforeEach(async()=>{
 assert.ok((await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'})).ok);
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));
 for(const [uid,role] of [['customer','owner'],['shop','shop'],['other','owner']]){
  await auth.createUser({uid,email:`${uid}@example.invalid`,password:'SyntheticPassword1234',emailVerified:true});
  await db.doc('users/'+uid).set({role,...(role==='shop'?{verificationStatus:'approved'}:{})});
 }
 files=new Map();const storage={bucket:'vehicle-images',upload:async(path,bytes,type)=>{assert.ok(!files.has(path));files.set(path,{bytes,type});},inspect:async path=>({size:files.get(path).bytes.length,contentType:files.get(path).type}),signedUrl:async path=>{assert.ok(files.has(path));return 'https://private.example.invalid/profile';},remove:async()=>assert.fail('Retention must preserve objects')};
 api=createServices({db,auth,storage:{},profileStorage:storage});app=createApp({auth,services:api});
});
after(async()=>{await db.terminate();await deleteApp(appInstance);});
const call=(bearer,data)=>http(app).post('/api/profile/photos').set('Authorization','Bearer '+bearer).send(data);
const upload=(bearer,version,key)=>http(app).post(`/api/profile/photos/upload?version=${version}&requestId=${key}`).set('Authorization','Bearer '+bearer).attach('file',PNG,'profile.png');

test('real Auth and Firestore persist customer/shop photo lifecycle, receipts, cross-account denial and retained media',async()=>{
 for(const uid of ['customer','shop']){
  const bearer=await token(uid),first=await upload(bearer,0,'first').expect(200),second=await upload(bearer,1,'replace').expect(200);
  assert.notEqual(first.body.data.photoId,second.body.data.photoId);
  const replay=await upload(bearer,0,'first').expect(200);assert.equal(replay.body.data.photoId,first.body.data.photoId);
  const active=(await db.doc('users/'+uid).get()).data();assert.equal(active.profilePhoto.id,second.body.data.photoId);
  assert.ok((await call(bearer,{op:'view',context:'self'}).expect(200)).body.data.url);
  await call(await token('other'),{op:'view',context:'self',id:uid}).expect(400);
  await call(bearer,{op:'remove',version:2,requestId:'remove'}).expect(200);
  assert.equal((await call(bearer,{op:'view',context:'self'}).expect(200)).body.data.url,null);
  assert.equal((await db.doc('profilePhotoUploads/'+second.body.data.photoId).get()).data().state,'cleanupPending');
 }
 assert.equal(files.size,4);
});
test('Firestore transaction contention admits one photo per revision and rejects disabled accounts',async()=>{
 const bearer=await token('customer'),outcomes=await Promise.all([upload(bearer,0,'race-a'),upload(bearer,0,'race-b')]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 const profile=(await db.doc('users/customer').get()).data();assert.equal(profile.profilePhotoRevision,1);
 const ledger=(await db.collection('profilePhotoUploads').get()).docs.map(doc=>doc.data());assert.equal(ledger.filter(r=>r.state==='referenced').length,1);
 await auth.updateUser('customer',{disabled:true});await call(bearer,{op:'view',context:'self'}).expect(401);
});

async function seedRequest(id,extra={}){
 await db.doc('users/customer').update({fullName:'Visible Customer'});
 await db.doc('vehicles/car').set({ownerId:'customer',archived:false});await db.doc('serviceCategories/paint').set({archived:false});
 await db.doc('serviceRequests/'+id).set({ownerId:'customer',vehicleId:'car',categoryId:'paint',title:'Synthetic paint request',visibility:'open',status:'open',createdAt:Timestamp.now(),...extra});
}
const market=(bearer,data)=>http(app).post('/api/marketplace').set('Authorization','Bearer '+bearer).send(data);
test('Find Jobs pagination and refresh carry private customer-photo revisions through replacement and removal',async()=>{
 const customer=await token('customer'),shop=await token('shop');await upload(customer,0,'request-first').expect(200);
 for(let i=0;i<21;i++)await seedRequest('job-'+String(i).padStart(2,'0'),{createdAt:Timestamp.fromMillis(Date.now()+i*1000)});
 const first=(await market(shop,{op:'requests',feed:'open'}).expect(200)).body.data;assert.equal(first.items.length,20);assert.ok(first.cursor);
 assert.ok(first.items.every(item=>item.customerName==='Visible Customer'&&item.customerAvatar.revision===1&&item.customerAvatar.hasPhoto&&item.customerAvatar.id===item.id));
 const second=(await market(shop,{op:'requests',feed:'open',cursor:first.cursor}).expect(200)).body.data;assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,21);
 const job=first.items[0].id,view=await call(shop,{op:'view',context:'request',id:job}).expect(200);assert.ok(view.body.data.url);assert.ok(!JSON.stringify(first).includes('profiles/'));assert.ok(first.items.every(item=>!item.ownerId));
 await upload(customer,1,'request-replace').expect(200);let page=(await market(shop,{op:'requests',feed:'open'}).expect(200)).body.data;assert.ok(page.items.every(item=>item.customerAvatar.revision===2));
 await call(customer,{op:'remove',version:2,requestId:'request-remove'}).expect(200);page=(await market(shop,{op:'requests',feed:'open'}).expect(200)).body.data;assert.ok(page.items.every(item=>item.customerAvatar.revision===3&&!item.customerAvatar.hasPhoto));assert.equal((await call(shop,{op:'view',context:'request',id:job}).expect(200)).body.data.url,null);
});
test('request-photo access never reveals anonymous/direct identities or grants messaging permission',async()=>{
 const customer=await token('customer'),shop=await token('shop'),other=await token('other');await upload(customer,0,'private-author').expect(200);await seedRequest('job');
 await call(other,{op:'view',context:'request',id:'job'}).expect(403);
 await call(shop,{op:'view',context:'request',id:'job',uid:'other'}).expect(400);
 await http(app).post('/api/messaging').set('Authorization','Bearer '+shop).send({op:'open',serviceRequestId:'job',requestId:'avatar-is-not-consent'}).expect(403);
 assert.equal((await db.collection('conversations').get()).size,0);
 await db.doc('serviceRequests/job').update({visibility:'direct',shopId:'another-shop'});await call(shop,{op:'view',context:'request',id:'job'}).expect(404);
 await db.doc('serviceRequests/job').update({visibility:'open'});await db.doc('users/customer').update({fullName:''});
 const page=(await market(shop,{op:'requests',feed:'open'}).expect(200)).body.data;assert.equal(page.items[0].customerName,'Customer');assert.equal(page.items[0].customerAvatar,null);await call(shop,{op:'view',context:'request',id:'job'}).expect(404);
});

test('customer build feed, saved posts and details hydrate current photo revisions without persisting URLs',async()=>{
 const customer=await token('customer');await upload(customer,0,'build-avatar').expect(200);
 await db.doc('posts/build').set({authorId:'customer',authorRole:'customer',authorName:'Visible Customer',status:'published',category:'Other',createdAt:Timestamp.now(),title:'Synthetic build',images:[]});
 const posts=data=>http(app).post('/api/posts').set('Authorization','Bearer '+customer).send(data);
 let feed=(await posts({op:'feed',source:'customers'}).expect(200)).body.data;assert.equal(feed.items[0].authorPhotoRevision,1);
 await upload(customer,1,'build-avatar-replace').expect(200);feed=(await posts({op:'feed',source:'customers'}).expect(200)).body.data;assert.equal(feed.items[0].authorPhotoRevision,2);
 await posts({op:'save',id:'build',saved:true}).expect(200);assert.equal((await posts({op:'saved'}).expect(200)).body.data.items[0].authorPhotoRevision,2);
 await call(customer,{op:'remove',version:2,requestId:'build-avatar-remove'}).expect(200);assert.equal((await posts({op:'get',id:'build'}).expect(200)).body.data.post.authorPhotoRevision,3);
 const raw=(await db.doc('posts/build').get()).data();assert.equal(raw.authorPhotoRevision,undefined);assert.equal(raw.authorAvatar,undefined);
});
