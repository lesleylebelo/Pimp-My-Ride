const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {createDemo}=require('../local-demo.cjs');
test('real emulators: demo gateway, verified synthetic login, isolated media and unavailable dependencies',async()=>{
 const env=process.env;Object.assign(env,{NODE_ENV:'test',PMR_LOCAL_DEMO:'true',PMR_DEMO_STORAGE:'memory-fixtures',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:'demo-pmr-security',PMR_DEMO_ALLOWED_CLIENT_IPS:'127.0.0.1'});
 const demo=await createDemo({seed:true});
 try{
  await demo.start();
  const ready=await fetch('http://127.0.0.1:3000/__demo/ready');assert.equal(ready.status,200);assert.equal((await ready.json()).mockPayments,true);
  const custom=await demo.auth.createCustomToken('demo-shop');
  const clientApp=require('firebase/app'),clientAuth=require('firebase/auth'),clientDb=require('firebase/firestore');
  const client=clientApp.initializeApp({projectId:'demo-pmr-security',apiKey:'demo-only-key',appId:'demo-local-app'},'gateway-client');
  const auth=clientAuth.getAuth(client);clientAuth.connectAuthEmulator(auth,'http://127.0.0.1:19099');
  const db=clientDb.getFirestore(client);clientDb.connectFirestoreEmulator(db,'127.0.0.1',18080);
  try{await clientAuth.signInWithCustomToken(auth,custom);assert.equal((await clientDb.getDocFromServer(clientDb.doc(db,'users/demo-shop'))).data().role,'shop');}
  finally{await clientAuth.signOut(auth);await clientDb.terminate(db);await clientApp.deleteApp(client);}
  const login=await fetch('http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-only-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});const identity=await login.json();assert.ok(identity.idToken,JSON.stringify(identity));
  const response=await request(demo.app).post('/api/posts/images').set('Authorization','Bearer '+identity.idToken).attach('file',demo.media.fixture,'synthetic.png').expect(200);
  assert.equal(response.body.data.contentType,'image/png');const image=response.body.data.path;
  const create=await request(demo.app).post('/api/posts').set('Authorization','Bearer '+identity.idToken).send({title:'Synthetic demo post',serviceCategory:'Other',images:[image]}).expect(201);
  await request(demo.app).delete('/api/posts/'+create.body.data.post.id).set('Authorization','Bearer '+identity.idToken).expect(200);
  assert.equal((await fetch(response.body.data.url)).status,200);
  await request(demo.app).post('/api/posts').set('Authorization','Bearer '+identity.idToken).send({op:'removeImage',path:image}).expect(409);
  const doc=await fetch('http://127.0.0.1:18080/v1/projects/demo-pmr-security/databases/(default)/documents/__demo/health');assert.equal(doc.status,403);assert.equal((await doc.json()).error.status,'PERMISSION_DENIED');
 }finally{await demo.close();}
});
