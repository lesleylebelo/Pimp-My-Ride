const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createPosts}=require('../posts.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'showcase-retry-integration'),db=getFirestore(app),auth=getAuth(app);
const path='posts/test-shop/00000000-0000-4000-8000-000000000001';
const data={requestId:'synthetic-showcase-retry',title:'Synthetic atomic showcase',serviceCategory:'Other',images:[path]};
const request=(payload=data,uid='test-shop')=>({auth:{uid},data:payload});
const actor=async req=>({uid:req.auth.uid,profile:(await db.doc('users/'+req.auth.uid).get()).data()});
let api,files;
function create(database=db){return createPosts({db:database,auth,actor,storage:{inspect:async key=>files.get(key),publicUrl:key=>'https://synthetic.example.invalid/'+key,remove:async()=>assert.fail('Showcase objects must be retained')}});}
beforeEach(async()=>{
 const cleared=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});assert.ok(cleared.ok);
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(user=>user.uid));
 for(const uid of ['test-shop','other-shop']){await auth.createUser({uid,emailVerified:true});await db.doc('users/'+uid).set({role:'shop',accountStatus:'active',verificationStatus:'approved',shop:{shopName:'Synthetic workshop'}});}
 files=new Map([[path,{contentType:'image/png',size:128}]]);api=create();
});
after(async()=>{await db.terminate();await deleteApp(app);});
test('real Firestore concurrent showcase retries create one post, receipt and audit',async()=>{
 const results=await Promise.all(Array.from({length:6},()=>api.createShowcase(request())));
 assert.equal(new Set(results.map(result=>result.post.id)).size,1);
 for(const name of ['posts','mutationReceipts','auditLogs'])assert.equal((await db.collection(name).get()).size,1);
 assert.equal(files.size,1);
});
test('real Firestore lost acknowledgement replays without duplicate posts or resurrecting removed media',async()=>{
 let fail=true;const fenced=create({doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:async change=>{const result=await db.runTransaction(change);if(fail){fail=false;throw Error('Synthetic lost acknowledgement');}return result;}});
 await assert.rejects(()=>fenced.createShowcase(request()),/lost acknowledgement/);
 const saved=await fenced.createShowcase(request());assert.equal((await db.collection('posts').get()).size,1);
 await assert.rejects(()=>fenced.createShowcase(request({...data,title:'Conflicting payload'})),{code:'already-exists'});
 await api.deleteShowcase({auth:{uid:'test-shop'},id:saved.post.id});
 await assert.rejects(()=>fenced.createShowcase(request()),{code:'failed-precondition'});
 assert.equal((await db.collection('posts').get()).size,1);assert.equal(files.size,1);
});
test('showcase receipt replay still enforces current shop eligibility and photo ownership',async()=>{
 await api.createShowcase(request());
 await assert.rejects(()=>api.createShowcase(request(data,'other-shop')));
 await db.doc('users/test-shop').update({accountStatus:'suspended'});
 await assert.rejects(()=>api.createShowcase(request()),{code:'forbidden'});
 assert.equal((await db.collection('posts').get()).size,1);assert.equal(files.size,1);
});

test('private showcase references survive Firestore persistence without signed URLs and stop signing removed posts',async()=>{
 let signed=0;const storage={bucket:'showcase-images',inspect:async key=>files.get(key),signedUrl:async key=>{signed++;assert.equal(key,path);return 'https://synthetic.invalid/private';}};
 storage.forReference=record=>{assert.equal(record.bucket,'showcase-images');return storage;};
 const privateApi=createPosts({db,auth,actor,storage});
 const result=await privateApi.createShowcase(request()),saved=(await db.doc('posts/'+result.post.id).get()).data();
 assert.equal(saved.images[0].bucket,'showcase-images');assert.equal(saved.images[0].url,undefined);
 const view=()=>privateApi.viewPostImage({auth:{uid:'other-shop'},id:result.post.id,data:{path}});
 assert.equal((await view()).url,'https://synthetic.invalid/private');assert.equal(signed,1);
 await privateApi.updateShowcase({auth:{uid:'test-shop'},id:result.post.id,data:{images:[path],title:'Edited private showcase'}});
 assert.equal((await db.doc('posts/'+result.post.id).get()).data().images[0].url,undefined);
 await privateApi.deleteShowcase({auth:{uid:'test-shop'},id:result.post.id});await assert.rejects(view,{code:'not_found'});
 assert.equal(signed,1);assert.equal(files.size,1);
});
