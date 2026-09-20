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
test('multipart upload accepts one file; authorization happens before file parsing',async()=>{
 const s=setup();await request(s.app).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.from('%PDF-1.7'),'sample.pdf').expect(200);
 assert.equal(s.calls.find(c=>c[0]==='upload')[1].file.buffer.length,8);
 await request(s.app).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.alloc(5242881),'big.pdf').expect(400);
 const denied=createApp({auth:{verifyIdToken:async()=>({uid:'u'})},services:{...s.services,checkUpload:async()=>{throw new ApiError('permission-denied','Denied');}}});
 await request(denied).post('/api/documents/ownerId').set('Authorization','Bearer good').attach('file',Buffer.from('small'),'x.pdf').expect(403);
});
