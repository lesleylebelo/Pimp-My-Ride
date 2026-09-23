const {test}=require('node:test');const assert=require('node:assert/strict');const request=require('supertest');
const {createApp}=require('../app.cjs');const {ApiError}=require('../errors.cjs');
function setup(){
 const calls=[];const auth={verifyIdToken:async(token,revoked)=>{calls.push(['verify',token,revoked]);if(token!=='good')throw Error('invalid');return {uid:'real-user',email_verified:true};}};
 const services={adminApi:async r=>{calls.push(['admin',r]);return {ok:true};},sessionEvent:async()=>({ok:true}),completeProfile:async()=>({ok:true}),checkUpload:async()=>{},uploadDocument:async r=>{calls.push(['upload',r]);return {ok:true};}};
 return {app:createApp({auth,services}),calls,services};
}
test('health is public; all API routes require a valid, nonrevoked Firebase token',async()=>{
 const s=setup();await request(s.app).get('/health').expect(200);
 await request(s.app).post('/api/admin').send({op:'dashboard'}).expect(401);
 await request(s.app).post('/api/admin').set('Authorization','Bearer bad').send({}).expect(401);
 await request(s.app).post('/api/admin').set('Authorization','Bearer good').send({op:'dashboard',auth:{uid:'forged'}}).expect(200);
 assert.equal(s.calls.find(c=>c[0]==='admin')[1].auth.uid,'real-user');assert.ok(s.calls.filter(c=>c[0]==='verify').every(c=>c[2]===true));
});
test('malformed JSON and unexpected errors do not expose credentials',async()=>{
 const s=setup();await request(s.app).post('/api/admin').set('Authorization','Bearer good').set('Content-Type','application/json').send('{').expect(400);
 s.services.adminApi=async()=>{throw Error('private secret');};const other=createApp({auth:{verifyIdToken:async()=>({uid:'u'})},services:s.services});
 const result=await request(other).post('/api/admin').set('Authorization','Bearer good').send({}).expect(500);assert.ok(!result.text.includes('private secret'));
});
test('only a trusted API error can mark a definitively finished review for a new explicit request',async()=>{
 const s=setup();const error=Object.assign(new ApiError('failed-precondition','Review finished.'),{retryWithNewRequest:true});
 const app=createApp({auth:{verifyIdToken:async()=>({uid:'u'})},services:{...s.services,adminApi:async()=>{throw error;}}});
 const result=await request(app).post('/api/admin').set('Authorization','Bearer good').send({op:'review'}).expect(409);
 assert.equal(result.body.error.retryWithNewRequest,true);
 const unexpected=createApp({auth:{verifyIdToken:async()=>({uid:'u'})},services:{...s.services,adminApi:async()=>{throw Object.assign(Error('private provider details'),{retryWithNewRequest:true});}}});
 const hidden=await request(unexpected).post('/api/admin').set('Authorization','Bearer good').send({op:'review'}).expect(500);
 assert.equal(hidden.body.error.retryWithNewRequest,undefined);assert.ok(!hidden.text.includes('private provider details'));
});
test('multipart upload accepts one file; authorization happens before file parsing',async()=>{
 const s=setup();await request(s.app).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.from('%PDF-1.7'),'sample.pdf').expect(200);
 assert.equal(s.calls.find(c=>c[0]==='upload')[1].file.buffer.length,8);
 await request(s.app).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.alloc(5242881),'big.pdf').expect(400);
 const denied=createApp({auth:{verifyIdToken:async()=>({uid:'u'})},services:{...s.services,checkUpload:async()=>{throw new ApiError('permission-denied','Denied');}}});
 await request(denied).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.from('small'),'x.pdf').expect(403);
});
test('document status uses authenticated JSON route before the dynamic upload route',async()=>{
 const s=setup();let uploads=0;
 const app=createApp({auth:{verifyIdToken:async()=>({uid:'shop'})},services:{...s.services,listDocuments:async r=>({items:[{id:'ownerId',name:'sample.pdf'}],uid:r.auth.uid}),checkUpload:async()=>{uploads++;}}});
 await request(app).post('/api/documents/list').send({}).expect(401);
 const result=await request(app).post('/api/documents/list').set('Authorization','Bearer good').send({}).expect(200);
 assert.equal(result.body.data.uid,'shop');assert.equal(result.body.data.items[0].id,'ownerId');assert.equal(uploads,0);
});
test('shared-network heartbeats have independent per-account limits and preserve the normal API budget',async()=>{
 const s=setup(),app=createApp({auth:{verifyIdToken:async uid=>({uid})},services:s.services});
 for(let i=0;i<100;i++)await request(app).post('/api/session').set('Authorization',`Bearer user${i}`).send({state:'heartbeat'}).expect(200);
 for(let i=0;i<11;i++)await request(app).post('/api/session').set('Authorization','Bearer user0').send({state:'heartbeat'}).expect(200);
 const limited=await request(app).post('/api/session').set('Authorization','Bearer user0').send({state:'heartbeat'}).expect(429);
 assert.equal(limited.body.error.code,'resource-exhausted');
 await request(app).post('/api/session').set('Authorization','Bearer user101').send({state:'heartbeat'}).expect(200);
 await request(app).post('/api/admin').set('Authorization','Bearer user0').send({op:'dashboard'}).expect(200);
});
