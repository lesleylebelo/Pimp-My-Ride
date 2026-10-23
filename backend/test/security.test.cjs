const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createApp}=require('../app.cjs'),{corsOrigins,storageConfig,validateEmulatorHost}=require('../config.cjs'),{createServices}=require('../services.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {ApiError}=require('../errors.cjs');
test('CORS supports explicit origins, preflight without authentication, errors and native requests',async()=>{
 let verifies=0;const app=createApp({allowedOrigins:corsOrigins('https://demo.example,http://localhost:8082'),auth:{verifyIdToken:async()=>{verifies++;return {uid:'u'};}},services:{adminApi:async()=>({ok:true}),sessionEvent:async()=>({}),completeProfile:async()=>({})}});
 for(const origin of ['https://demo.example','http://localhost:8082']){const r=await request(app).options('/api/admin').set('Origin',origin).set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type');assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],origin);}
 assert.equal(verifies,0);const denied=await request(app).options('/api/admin').set('Origin','https://evil.example').set('Access-Control-Request-Method','POST');assert.equal(denied.headers['access-control-allow-origin'],undefined);
 const error=await request(app).post('/api/admin').set('Origin','https://demo.example').send({});assert.equal(error.status,401);assert.equal(error.headers['access-control-allow-origin'],'https://demo.example');
 await request(app).post('/api/admin').set('Authorization','Bearer native').send({}).expect(200);
 assert.throws(()=>corsOrigins('*'));assert.throws(()=>corsOrigins('https://demo.example/path'));assert.deepEqual(corsOrigins(undefined,true),['http://localhost:8081']);
});
test('production Expo Web CORS preserves bearer authentication, permissions and error responses',async()=>{
 const origin='http://localhost:8081',verifications=[];
 const app=createApp({allowedOrigins:corsOrigins(undefined,true),
  auth:{verifyIdToken:async(token,revoked)=>{verifications.push([token,revoked]);if(token!=='good')throw Error('Invalid token');return {uid:'owner'};}},
  services:{marketplace:async({auth,data})=>{assert.equal(auth.uid,'owner');if(data.op==='restricted')throw new ApiError('permission-denied','Denied');return {ok:true};}}
 });
 const health=await request(app).get('/health').set('Origin',origin).expect(200);
 assert.equal(health.headers['access-control-allow-origin'],origin);
 assert.match(health.headers.vary,/Origin/);
 assert.equal(health.headers['access-control-allow-credentials'],undefined);
 for(const [path,method] of [['/api/marketplace','POST'],['/api/posts','GET'],['/api/posts/item','PATCH'],['/api/posts/item','DELETE'],['/api/posts/images','POST']]){
  const preflight=await request(app).options(path).set('Origin',origin).set('Access-Control-Request-Method',method).set('Access-Control-Request-Headers','authorization,content-type').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'],origin);
  assert.ok(preflight.headers['access-control-allow-methods'].split(',').includes(method));
  assert.deepEqual(preflight.headers['access-control-allow-headers'].toLowerCase().split(',').sort(),['authorization','content-type']);
 }
 assert.equal(verifications.length,0);
 const success=await request(app).post('/api/marketplace').set('Origin',origin).set('Authorization','Bearer good').send({op:'list'}).expect(200);
 assert.equal(success.headers['access-control-allow-origin'],origin);
 assert.deepEqual(verifications,[['good',true]]);
 for(const [token,body,status] of [[null,{},401],['bad',{},401],['good',{op:'restricted'},403],['good','{',400]]){
  let call=request(app).post('/api/marketplace').set('Origin',origin).set('Content-Type','application/json');
  if(token)call=call.set('Authorization','Bearer '+token);
  const response=await call.send(body).expect(status);
  assert.equal(response.headers['access-control-allow-origin'],origin);
 }
 const missing=await request(app).get('/missing').set('Origin',origin).expect(404);
 assert.equal(missing.headers['access-control-allow-origin'],origin);
 for(const unknown of ['https://evil.example','http://localhost:8082','http://localhost:8081.evil.example','null']){
  for(const method of ['get','options']){
   const response=await request(app)[method]('/health').set('Origin',unknown).set('Access-Control-Request-Method','GET');
   assert.equal(response.headers['access-control-allow-origin'],undefined);
  }
  const response=await request(app).post('/api/marketplace').set('Origin',unknown).send({}).expect(401);
  assert.equal(response.headers['access-control-allow-origin'],undefined);
 }
 // iOS/Android HTTP clients omit Origin; authentication still applies.
 await request(app).post('/api/marketplace').set('Authorization','Bearer good').send({}).expect(200);
 await request(app).post('/api/marketplace').send({}).expect(401);
});

test('explicit web allowlists replace defaults, reject wildcards and can disable browser access',async()=>{
 const origins=corsOrigins(' http://localhost:8081,https://web.example,https://web.example ',true);
 assert.deepEqual(origins,['http://localhost:8081','https://web.example']);
 assert.deepEqual(corsOrigins('https://web.example',true),['https://web.example']);
 assert.deepEqual(corsOrigins('',true),[]);
 assert.deepEqual(corsOrigins(undefined,false),['http://localhost:8081','http://127.0.0.1:8081']);
 for(const invalid of ['*','https://*.example','https://web.example/path','https://web.example/','null','https://user:pass@web.example'])assert.throws(()=>corsOrigins(invalid,true));
 for(const allowedOrigins of [origins,[]]){
  const app=createApp({allowedOrigins,auth:{},services:{}});
  const response=await request(app).get('/health').set('Origin','https://web.example').expect(200);
  assert.equal(response.headers['access-control-allow-origin'],allowedOrigins.length?'https://web.example':undefined);
 }
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

function shopLocationFixture() {
 const shop={shopName:'Saved workshop',regNumber:'REG-1',address:'1 Saved Road',city:'Pretoria',province:'Gauteng',services:'Paint',coordinates:null};
 const db=memoryDb({'users/shop':{role:'shop',accountStatus:'active',shop,fullName:'Owner',phone:'0821234567'},'users/other':{role:'shop',accountStatus:'active',shop:{...shop,shopName:'Other workshop'}},'users/owner':{role:'owner',accountStatus:'active'},'users/admin':{role:'admin',accountStatus:'active'}});
 const users=new Map(),auth={getUser:async uid=>users.get(uid)||{emailVerified:true,disabled:false,customClaims:{admin:true},metadata:{creationTime:'2020-01-01'},tokensValidAfterTime:'2020-01-01'}};
 const services=createServices({db,auth,storage:{}});
 const identity=uid=>({uid,token:{email_verified:true,admin:true,auth_time:Date.now()/1000}});
 const save=(uid,data={})=>services.completeProfile({auth:identity(uid),data:{op:'shopLocationSave',coordinates:{latitude:-25.7479,longitude:28.2293},expectedCoordinates:null,requestId:'location-one',...data}});
 return {db,auth,users,services,save,identity};
}

test('shop location saves only the authenticated shop, preserves business text and is idempotent',async()=>{
 const f=shopLocationFixture(),before={...f.db.rows.get('users/shop').shop};
 const saved=await f.save('shop');assert.deepEqual(saved.coordinates,{latitude:-25.7479,longitude:28.2293});
 const value=f.db.rows.get('users/shop').shop;assert.deepEqual({...value,coordinates:null},before);
 assert.equal(f.db.rows.get('users/other').shop.coordinates,null);
 assert.deepEqual(await f.save('shop'),saved);
 assert.equal([...f.db.rows.values()].filter(row=>row.action==='shop.locationUpdated').length,1);
 await assert.rejects(()=>f.save('shop',{uid:'other',requestId:'forged-target'}),{code:'invalid-argument'});
});

test('location updates reject invalid, non-numeric, absent and out-of-range coordinates',async()=>{
 for(const coordinates of [{latitude:'0',longitude:0},{latitude:91,longitude:0},{latitude:0,longitude:-181},{latitude:NaN,longitude:0},{latitude:Infinity,longitude:0},{latitude:null,longitude:0},{latitude:1},undefined]) {
  const f=shopLocationFixture();await assert.rejects(()=>f.save('shop',{coordinates}),{code:'invalid-argument'});assert.equal(f.db.rows.get('users/shop').shop.coordinates,null);
 }
 const f=shopLocationFixture();await f.save('shop',{coordinates:{latitude:0,longitude:0}});assert.deepEqual(f.db.rows.get('users/shop').shop.coordinates,{latitude:0,longitude:0});
 await f.save('shop',{coordinates:null,expectedCoordinates:{latitude:0,longitude:0},requestId:'remove-location'});assert.equal(f.db.rows.get('users/shop').shop.coordinates,null);
});

test('location writes enforce role, verification, account status, revocation and operation guards',async()=>{
 for(const uid of ['owner','admin']){const f=shopLocationFixture();await assert.rejects(()=>f.save(uid),{code:'permission-denied'});}
 for(const change of [{accountStatus:'suspended'},{accountStatus:'archived'},{reviewOperation:'review'},{statusOperation:'status'},{provisioningOperation:'provision'}]) {
  const f=shopLocationFixture();Object.assign(f.db.rows.get('users/shop'),change);await assert.rejects(()=>f.save('shop'));assert.equal(f.db.rows.get('users/shop').shop.coordinates,null);
 }
 for(const user of [{emailVerified:false},{emailVerified:true,disabled:true},{emailVerified:true,tokensValidAfterTime:new Date(Date.now()+60000).toISOString(),metadata:{}}]) {
  const f=shopLocationFixture();f.users.set('shop',user);await assert.rejects(()=>f.save('shop'));assert.equal(f.db.rows.get('users/shop').shop.coordinates,null);
 }
 const f=shopLocationFixture();await assert.rejects(()=>f.services.completeProfile({data:{op:'shopLocationSave',coordinates:null,expectedCoordinates:null,requestId:'anonymous'}}),{code:'unauthenticated'});
});

test('stale workshop edits cannot overwrite a newer saved location',async()=>{
 const f=shopLocationFixture();await f.save('shop');
 await assert.rejects(()=>f.save('shop',{coordinates:{latitude:-26.2,longitude:28.04},requestId:'stale-location'}),{code:'failed-precondition'});
 await f.save('shop',{coordinates:{latitude:-26.2,longitude:28.04},expectedCoordinates:{latitude:-25.7479,longitude:28.2293},requestId:'fresh-location'});
 assert.deepEqual(f.db.rows.get('users/shop').shop.coordinates,{latitude:-26.2,longitude:28.04});
});

test('administrator text-profile editing preserves previously saved shop coordinates',async()=>{
 const f=shopLocationFixture();await f.save('shop');const shop=f.db.rows.get('users/shop').shop;
 const {coordinates,...text}=shop;
 await f.services.adminApi({auth:f.identity('admin'),data:{op:'editAccount',uid:'shop',fullName:'Updated name',phone:'0821234567',shop:{...text,address:'2 New Road'},requestId:'admin-text-edit'}});
 assert.deepEqual(f.db.rows.get('users/shop').shop.coordinates,coordinates);assert.equal(f.db.rows.get('users/shop').shop.address,'2 New Road');
});
