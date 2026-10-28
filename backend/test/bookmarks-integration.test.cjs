const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'bookmark-integration'),db=getFirestore(app),auth=getAuth(app);
let tokens,api,http;
beforeEach(async()=>{
 const cleared=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});assert.ok(cleared.ok);
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(user=>user.uid));tokens={};
 for(const [uid,role] of [['bookmark-owner','owner'],['bookmark-other','owner'],['bookmark-shop','shop']]){
  const email=uid+'@synthetic.invalid';await auth.createUser({uid,email,emailVerified:true,password:'Synthetic-bookmark-123!'});
  await db.doc('users/'+uid).set({role,accountStatus:'active',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:'Synthetic Workshop'}}:{})});
  const signed=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Synthetic-bookmark-123!',returnSecureToken:true})});
  const result=await signed.json();assert.ok(result.idToken);tokens[uid]=result.idToken;
 }
 await db.doc('posts/bookmark-post').set({authorId:'bookmark-shop',shopId:'bookmark-shop',authorRole:'shop',type:'showcase',status:'published',title:'Synthetic showcase',category:'Other',images:[],createdAt:Timestamp.now()});
 api=createServices({db,auth,storage:{},photoStorage:{}});http=createApp({auth,services:api});
});
after(async()=>{await db.terminate();await deleteApp(app);});
const call=(uid,data)=>request(http).post('/api/posts').set('Authorization','Bearer '+tokens[uid]).send(data);

test('real authenticated Firestore concurrent saves and unsaves retain exactly one deterministic bookmark',async()=>{
 await Promise.all(Array.from({length:6},()=>call('bookmark-owner',{op:'save',id:'bookmark-post',saved:true}).expect(200)));
 assert.equal((await db.collection('users/bookmark-owner/savedPosts').get()).size,1);
 const before=(await db.doc('users/bookmark-owner/savedPosts/bookmark-post').get()).data().createdAt;
 await call('bookmark-owner',{op:'save',id:'bookmark-post',saved:true}).expect(200);
 assert.ok((await db.doc('users/bookmark-owner/savedPosts/bookmark-post').get()).data().createdAt.isEqual(before));
 await Promise.all(Array.from({length:6},()=>call('bookmark-owner',{op:'save',id:'bookmark-post',saved:false}).expect(200)));
 assert.equal((await db.collection('users/bookmark-owner/savedPosts').get()).size,0);
});

test('bookmarks survive a fresh service session, remain private across users, and reject forged ownership',async()=>{
 await call('bookmark-owner',{op:'save',id:'bookmark-post',saved:true}).expect(200);
 http=createApp({auth,services:createServices({db,auth,storage:{},photoStorage:{}})});
 const signed=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bookmark-owner@synthetic.invalid',password:'Synthetic-bookmark-123!',returnSecureToken:true})});
 tokens['bookmark-owner']=(await signed.json()).idToken;assert.ok(tokens['bookmark-owner']);
 assert.equal((await call('bookmark-owner',{op:'saved'}).expect(200)).body.data.items[0].id,'bookmark-post');
 assert.equal((await call('bookmark-other',{op:'saved'}).expect(200)).body.data.items.length,0);
 await call('bookmark-other',{op:'saved',uid:'bookmark-owner'}).expect(400);
 await call('bookmark-other',{op:'save',id:'bookmark-post',saved:true,uid:'bookmark-owner'}).expect(400);
 await db.doc('users/bookmark-owner').update({accountStatus:'suspended'});
 await call('bookmark-owner',{op:'saved'}).expect(403);
});

test('bookmark access rechecks verified and disabled Firebase identities rather than trusting a previously issued token',async()=>{
 await auth.updateUser('bookmark-owner',{emailVerified:false});
 await call('bookmark-owner',{op:'save',id:'bookmark-post',saved:true}).expect(403);
 await auth.updateUser('bookmark-owner',{emailVerified:true,disabled:true});
 const response=await call('bookmark-owner',{op:'saved'});assert.ok([401,403].includes(response.status));
 assert.equal((await db.collection('users/bookmark-owner/savedPosts').get()).size,0);
});

test('real saved pagination survives a removed cursor and filters a suspended workshop without revealing its media',async()=>{
 const batch=db.batch();for(let i=0;i<23;i++){
  const id='page-'+String(i).padStart(3,'0');batch.set(db.doc('posts/'+id),{authorId:'bookmark-shop',authorRole:'shop',type:'showcase',status:'published',title:id,images:[],createdAt:Timestamp.now()});
  batch.set(db.doc('users/bookmark-owner/savedPosts/'+id),{postId:id,createdAt:Timestamp.now()});
 }await batch.commit();
 const page=(await call('bookmark-owner',{op:'saved'}).expect(200)).body.data;assert.equal(page.items.length,20);
 await call('bookmark-owner',{op:'save',id:page.cursor,saved:false}).expect(200);
 const next=(await call('bookmark-owner',{op:'saved',cursor:page.cursor}).expect(200)).body.data;assert.equal(next.items.length,3);
 await db.doc('users/bookmark-shop').update({accountStatus:'suspended'});
 const hidden=(await call('bookmark-owner',{op:'saved'}).expect(200)).body.data;assert.deepEqual(hidden.items,[]);
 await request(http).get('/api/posts/page-000').set('Authorization','Bearer '+tokens['bookmark-owner']).expect(404);
 await call('bookmark-owner',{op:'save',id:'page-000',saved:true}).expect(404);
 await call('bookmark-owner',{op:'save',id:'page-000',saved:false}).expect(200);
});
