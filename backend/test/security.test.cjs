const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createApp}=require('../app.cjs'),{corsOrigins,storageConfig,validateEmulatorHost}=require('../config.cjs'),{createServices}=require('../services.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
test('CORS supports explicit origins, preflight without authentication, errors and native requests',async()=>{
 let verifies=0;const app=createApp({allowedOrigins:corsOrigins('https://demo.example,http://localhost:8082'),auth:{verifyIdToken:async()=>{verifies++;return {uid:'u'};}},services:{adminApi:async()=>({ok:true}),sessionEvent:async()=>({}),completeProfile:async()=>({})}});
 for(const origin of ['https://demo.example','http://localhost:8082']){const r=await request(app).options('/api/admin').set('Origin',origin).set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type');assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],origin);}
 assert.equal(verifies,0);const denied=await request(app).options('/api/admin').set('Origin','https://evil.example').set('Access-Control-Request-Method','POST');assert.equal(denied.headers['access-control-allow-origin'],undefined);
 const error=await request(app).post('/api/admin').set('Origin','https://demo.example').send({});assert.equal(error.status,401);assert.equal(error.headers['access-control-allow-origin'],'https://demo.example');
 await request(app).post('/api/admin').set('Authorization','Bearer native').send({}).expect(200);
 assert.throws(()=>corsOrigins('*'));assert.throws(()=>corsOrigins('https://demo.example/path'));assert.deepEqual(corsOrigins(undefined,true),[]);
});
test('storage credentials and endpoint are required and validated at startup',()=>{
 assert.throws(()=>storageConfig({}),/SUPABASE_URL/);
 assert.throws(()=>storageConfig({SUPABASE_URL:'https://storage.example'}),/SUPABASE_SECRET_KEY/);
 assert.throws(()=>storageConfig({SUPABASE_URL:'not a URL',SUPABASE_SECRET_KEY:'secret'}),/valid HTTPS URL/);
 assert.throws(()=>storageConfig({SUPABASE_URL:'http://storage.example',SUPABASE_SECRET_KEY:'secret'}),/HTTPS endpoint/);
 assert.throws(()=>storageConfig({SUPABASE_URL:'https://user:pass@storage.example',SUPABASE_SECRET_KEY:'secret'}),/HTTPS endpoint/);
 assert.throws(()=>storageConfig({SUPABASE_URL:'https://storage.example',SUPABASE_SECRET_KEY:'secret',SUPABASE_POSTS_BUCKET:'invalid/name'}),/Invalid postsBucket/);
 assert.deepEqual(storageConfig({SUPABASE_URL:'https://storage.example/',SUPABASE_SECRET_KEY:'secret'}),{url:'https://storage.example',key:'secret',bucket:'verification',photoBucket:'vehicle-images',requestBucket:'request-images',legacyPhotoBucket:'marketplace-photos',legacyPostsBucket:'public-posts',postsBucket:'showcase-images'});
 assert.doesNotThrow(()=>storageConfig({NODE_ENV:'development',SUPABASE_URL:'http://localhost:54321',SUPABASE_SECRET_KEY:'secret'}));
 assert.throws(()=>storageConfig({NODE_ENV:'production',SUPABASE_URL:'http://localhost:54321',SUPABASE_SECRET_KEY:'secret'}),/HTTPS endpoint/);
});
test('optional Firebase emulator endpoints reject invalid host and port values',()=>{
 assert.doesNotThrow(()=>validateEmulatorHost('FIRESTORE_EMULATOR_HOST','localhost:8080'));
 assert.doesNotThrow(()=>validateEmulatorHost('FIREBASE_AUTH_EMULATOR_HOST','[::1]:9099'));
 assert.doesNotThrow(()=>validateEmulatorHost('FIRESTORE_EMULATOR_HOST',undefined));
 assert.throws(()=>validateEmulatorHost('FIRESTORE_EMULATOR_HOST','http://localhost:8080'),/host and port/);
 assert.throws(()=>validateEmulatorHost('FIRESTORE_EMULATOR_HOST','localhost:65536'),/host and port/);
});
function fixture({role='admin',status='active',verified=true,claims=true,revoked=false}={}){
 const db=memoryDb({'users/u':{role,accountStatus:status,fullName:'Demo',verificationStatus:'pending'}});
 const auth={getUser:async()=>({emailVerified:verified,disabled:false,customClaims:{admin:claims},metadata:{creationTime:'2020-01-01T00:00:00Z'},tokensValidAfterTime:revoked?new Date(Date.now()+10000).toISOString():'2020-01-01T00:00:00Z'})};
 return createServices({db,auth,storage:{}});
}
const req=age=>({auth:{uid:'u',token:{admin:true,email_verified:true,auth_time:Date.now()/1000-age}},data:{op:'categorySave',name:'Paint',description:'Paint',requestId:'test-boundary'}});
test('recent authentication independently permits 899 seconds and rejects 901 seconds',async()=>{
 assert.ok((await fixture().adminApi(req(899))).id);
 await assert.rejects(()=>fixture().adminApi(req(901)),{code:'failed-precondition'});
});
test('admin mutation rejects other roles, unverified, restricted and revoked actors',async()=>{
 for(const settings of [{role:'owner'},{role:'shop'},{status:'suspended'},{status:'archived'},{verified:false},{claims:false}])await assert.rejects(()=>fixture(settings).adminApi(req(0)),{code:'permission-denied'});
 await assert.rejects(()=>fixture({revoked:true}).adminApi(req(0)),{code:'unauthenticated'});
});

test('media bucket configuration cannot alias verification, another media type, or a legacy bucket',()=>{
 const env={SUPABASE_URL:'https://synthetic.example',SUPABASE_SECRET_KEY:'synthetic-key'};
 for(const override of [{SUPABASE_REQUEST_BUCKET:'verification'},{SUPABASE_POSTS_BUCKET:'vehicle-images'},{SUPABASE_LEGACY_PHOTO_BUCKET:'verification'},{SUPABASE_PHOTO_BUCKET:'marketplace-photos'}])assert.throws(()=>storageConfig({...env,...override}),/distinct/);
});
