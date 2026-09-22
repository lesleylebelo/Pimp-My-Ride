const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createApp}=require('../app.cjs'),{corsOrigins}=require('../config.cjs'),{createServices}=require('../services.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
test('CORS supports explicit origins, preflight without authentication, errors and native requests',async()=>{
 let verifies=0;const app=createApp({allowedOrigins:corsOrigins('https://demo.example,http://localhost:8082'),auth:{verifyIdToken:async()=>{verifies++;return {uid:'u'};}},services:{adminApi:async()=>({ok:true}),sessionEvent:async()=>({}),completeProfile:async()=>({})}});
 for(const origin of ['https://demo.example','http://localhost:8082']){const r=await request(app).options('/api/admin').set('Origin',origin).set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','authorization,content-type');assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],origin);}
 assert.equal(verifies,0);const denied=await request(app).options('/api/admin').set('Origin','https://evil.example').set('Access-Control-Request-Method','POST');assert.equal(denied.headers['access-control-allow-origin'],undefined);
 const error=await request(app).post('/api/admin').set('Origin','https://demo.example').send({});assert.equal(error.status,401);assert.equal(error.headers['access-control-allow-origin'],'https://demo.example');
 await request(app).post('/api/admin').set('Authorization','Bearer native').send({}).expect(200);
 assert.throws(()=>corsOrigins('*'));assert.throws(()=>corsOrigins('https://demo.example/path'));assert.deepEqual(corsOrigins(undefined,true),[]);
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
