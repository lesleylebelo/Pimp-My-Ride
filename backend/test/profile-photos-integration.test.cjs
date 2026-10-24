const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
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
