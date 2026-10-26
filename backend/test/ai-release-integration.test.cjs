const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {CONTROL_PATH,DAILY_PREFIX,ATTEMPT_PREFIX}=require('../ai-release-control.cjs');
const app=initializeApp({projectId:'demo-pmr-security'},'ai-production-tests'),db=getFirestore(app);
const day='2040-01-02';
before(async()=>{
 await db.doc(CONTROL_PATH).set({version:1,attempts:1});
 await db.doc(DAILY_PREFIX+'/'+day).set({version:1,day,attempts:5});
 await db.doc(ATTEMPT_PREFIX+'/synthetic-history').set({version:1,state:'failed',reasonCode:'grounding_rejected'});
});
after(async()=>{for(const path of [CONTROL_PATH,DAILY_PREFIX+'/'+day,ATTEMPT_PREFIX+'/synthetic-history'])await db.doc(path).delete();await db.terminate();await deleteApp(app);});

test('existing rules deny direct-client history, daily quota and diagnostic access',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
 const {doc,getDoc,setDoc,deleteDoc}=require('firebase/firestore');
 const address=new URL('http://'+process.env.FIRESTORE_EMULATOR_HOST);
 const environment=await initializeTestEnvironment({projectId:'demo-pmr-security',firestore:{host:address.hostname,port:Number(address.port),rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
 try{
  for(const [uid,claims] of [['synthetic-owner',{}],['synthetic-shop',{}],['synthetic-admin',{admin:true}]]){
   for(const path of [CONTROL_PATH,DAILY_PREFIX+'/'+day,ATTEMPT_PREFIX+'/synthetic-attempt']){
    const ref=doc(environment.authenticatedContext(uid,claims).firestore(),path);
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,{version:1,attempts:0}));await assertFails(deleteDoc(ref));
   }
  }
 }finally{await environment.cleanup();}
});

test('real Auth and Firestore profiles enforce current eligibility, account separation and unlimited mocked generations',async()=>{
 const {getAuth}=require('firebase-admin/auth'),auth=getAuth(app);
 const {createServices}=require('../services.cjs'),{createApp}=require('../app.cjs'),http=require('supertest');
 const ids=['ai-audit-owner','ai-audit-shop','ai-audit-admin','ai-audit-unlisted'],tokens={};
 let calls=0;
 const provider={enabled:true,suggest:async draft=>{calls++;return {title:draft.title,description:draft.description,categoryId:null,missingDetails:[]};}};
 const services=createServices({db,auth,storage:{},aiProvider:provider,aiDiagnostic:()=>{}}),server=createApp({services,auth});
 const requestData={kind:'request',title:'Black wrap',description:'Wrap doors in black.',categoryId:''};
 const call=uid=>http(server).post('/api/ai/assist').set('Authorization','Bearer '+tokens[uid]).send({...requestData,kind:uid==='ai-audit-shop'?'showcase':'request'});
 try{
  await db.doc('serviceCategories/ai-audit-paint').set({name:'Paint',archived:false});
  for(const uid of ids){
   await auth.createUser({uid,email:uid+'@example.invalid',emailVerified:true});
   await db.doc('users/'+uid).set({role:uid.endsWith('shop')?'shop':uid.endsWith('admin')?'admin':'owner',accountStatus:'active',verificationStatus:'approved'});
   const customToken=await auth.createCustomToken(uid),reply=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic-key',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:customToken,returnSecureToken:true})});
   assert.equal(reply.status,200);tokens[uid]=(await reply.json()).idToken;
  }
  const historyPaths=[CONTROL_PATH,DAILY_PREFIX+'/'+day,ATTEMPT_PREFIX+'/synthetic-history'];
  const before=await Promise.all(historyPaths.map(path=>db.doc(path).get()));
  for(const uid of [ids[0],ids[1],ids[3]])for(let i=0;i<10;i++)await call(uid).expect(200);
  assert.equal(calls,30);
  for(let i=0;i<historyPaths.length;i++){const after=await db.doc(historyPaths[i]).get();assert.deepEqual(after.data(),before[i].data());assert.ok(after.updateTime.isEqual(before[i].updateTime));}
  assert.equal((await db.collection(ATTEMPT_PREFIX).get()).size,1);
  assert.equal((await call(ids[2]).expect(403)).body.error.fields.aiReason,'account_eligibility');
  const pieces=tokens[ids[3]].split('.'),expired={...JSON.parse(Buffer.from(pieces[1],'base64url').toString()),exp:1};
  const expiredToken=[pieces[0],Buffer.from(JSON.stringify(expired)).toString('base64url'),pieces[2]].join('.');
  await http(server).post('/api/ai/assist').set('Authorization','Bearer '+expiredToken).send(requestData).expect(401);
  for(const changes of [{verificationStatus:'pending'},{verificationStatus:'rejected'},{accountStatus:'suspended'},{accountStatus:'archived'},{role:'admin'}]){
   await db.doc('users/'+ids[1]).set({role:'shop',accountStatus:'active',verificationStatus:'approved',...changes});await call(ids[1]).expect(403);
  }
  await db.doc('users/'+ids[0]).update({role:'shop',verificationStatus:'approved'});await call(ids[0]).expect(403);
  await db.doc('users/'+ids[0]).delete();await call(ids[0]).expect(403);
  await auth.updateUser(ids[1],{disabled:true});await call(ids[1]).expect(401);
  const decoded=await auth.verifyIdToken(tokens[ids[3]]);
  await assert.rejects(()=>services.aiAssist({auth:{uid:ids[3],token:{...decoded,auth_time:1}},data:requestData}),{code:'unauthenticated'});
  assert.equal(calls,30);
 }finally{
  for(const uid of ids){await db.doc('users/'+uid).delete();await auth.deleteUser(uid).catch(()=>{});}
  await db.doc('serviceCategories/ai-audit-paint').delete();
 }
});
