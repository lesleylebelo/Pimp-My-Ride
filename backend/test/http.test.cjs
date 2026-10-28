const {test}=require('node:test');const assert=require('node:assert/strict');const request=require('supertest');
const http=require('node:http');
const {createApp}=require('../app.cjs');const {ApiError}=require('../errors.cjs');
function setup(){
 const calls=[];const auth={verifyIdToken:async(token,revoked)=>{calls.push(['verify',token,revoked]);if(token!=='good')throw Error('invalid');return {uid:'real-user',email_verified:true};}};
 const services={adminApi:async r=>{calls.push(['admin',r]);return {ok:true};},postsList:async()=>({items:[],cursor:null}),postDetail:async()=>({post:{}}),sessionEvent:async()=>({ok:true}),completeProfile:async()=>({ok:true}),checkUpload:async()=>{},uploadDocument:async r=>{calls.push(['upload',r]);return {ok:true};}};
 return {app:createApp({auth,services}),calls,services};
}
test('health is public; all API routes require a valid, nonrevoked Firebase token',async()=>{
 const s=setup();await request(s.app).get('/health').expect(200);
 await request(s.app).get('/api/posts').set('Authorization','Bearer good').expect(200);
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
test('unexpected posts failures log the original message and stack but return only the generic error',async()=>{
 const failure=Object.assign(Error('Firestore unavailable'),{code:9});
 const s=setup(),app=createApp({auth:{verifyIdToken:async()=>({uid:'real-user'})},services:{...s.services,postsApi:async()=>{throw failure;}}});
 const errors=[],original=console.error;console.error=(...args)=>errors.push(args);
 let response;
 try{response=await request(app).post('/api/posts').set('Authorization','Bearer good').send({op:'feed',source:'all'});}
 finally{console.error=original;}
 assert.equal(response.status,500);
 assert.deepEqual(response.body,{error:{code:'internal',message:'The server could not complete this action. Refresh before retrying.'}});
 assert.equal(errors.length,1);
 const log=errors[0].join(' ');
 assert.match(log,/error\.code=9/);
 assert.match(log,/error\.message=Firestore unavailable/);
 assert.match(log,/error\.stack=Error: Firestore unavailable/);
 assert.match(log,/http\.test\.cjs/);
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

test('photo routes validate identity and query fields before accepting a bounded file-only upload',async()=>{
 const checked=[],uploaded=[];const base=setup();
 const app=createApp({auth:{verifyIdToken:async()=>({uid:'owner'})},services:{...base.services,photosApi:async r=>({uid:r.auth.uid,items:[]}),checkPhotoUpload:async r=>checked.push(r),uploadPhoto:async r=>{uploaded.push(r);return {ok:true};}}});
 const endpoint='/api/photos/vehicles/car/1?version=0&requestId=photo-retry';
 await request(app).post('/api/photos').send({op:'list',target:'vehicle',id:'car'}).expect(401);
 const list=await request(app).post('/api/photos').set('Authorization','Bearer good').send({op:'list',target:'vehicle',id:'car'}).expect(200);assert.equal(list.body.data.uid,'owner');
 await request(app).post(endpoint).set('Authorization','Bearer good').attach('file',Buffer.from('synthetic photo'),'image.jpg').expect(200);
 assert.equal(checked[0].version,0);assert.equal(uploaded[0].auth.uid,'owner');assert.equal(uploaded[0].vehicleId,'car');assert.equal(uploaded[0].requestId,'photo-retry');
 for(const query of ['version=-1&requestId=x','version=1.5&requestId=x','version=0&requestId=x&path=forged'])await request(app).post('/api/photos/vehicles/car/1?'+query).set('Authorization','Bearer good').attach('file',Buffer.from('x'),'x.jpg').expect(400);
 await request(app).post(endpoint).set('Authorization','Bearer good').field('ownerId','forged').attach('file',Buffer.from('x'),'x.jpg').expect(400);
 const denied=createApp({auth:{verifyIdToken:async()=>({uid:'shop'})},services:{...base.services,checkPhotoUpload:async()=>{throw new ApiError('permission-denied','Owner access required.');}}});
 // Test permission rejection with a small fixture. Streaming 5 MB into an
 // intentionally rejected request can reset the Windows socket before 403 is read.
 await request(denied).post(endpoint).set('Authorization','Bearer good').attach('file',Buffer.from('synthetic photo'),'denied.jpg').expect(403);
});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const eventTurn=()=>new Promise(resolve=>setImmediate(resolve));
const photoEndpoint='/api/photos/vehicles/car/1?version=0&requestId=disconnect-test';
const documentEndpoint='/api/documents/ownerId';
async function localUploads(t,services){
 const app=createApp({auth:{verifyIdToken:async()=>({uid:'local-owner'})},services:{checkUpload:async()=>{},checkPhotoUpload:async()=>{},...services}});
 const connections=[];
 const server=http.createServer(app);
 server.on('request',(req,res)=>{const closed=deferred();res.once('close',closed.resolve);connections.push({req,closed:closed.promise});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const body=Buffer.from('--local-photo-test\r\nContent-Disposition: form-data; name="file"; filename="synthetic.jpg"\r\nContent-Type: image/jpeg\r\n\r\nsynthetic\r\n--local-photo-test--\r\n');
 function send(path,partial=false){
  const client=http.request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{Authorization:'Bearer local','Content-Type':'multipart/form-data; boundary=local-photo-test','Content-Length':body.length}});
  client.on('error',()=>{}); // These clients deliberately close before a response.
  if(partial)client.write(body.subarray(0,body.length-8));else client.end(body);
  return client;
 }
 return {server,connections,send};
}

test('disconnected photo and document uploads retain their shared slots until service work settles',{timeout:10000},async t=>{
 const gates=[deferred(),deferred()],entered=[deferred(),deferred()];let calls=0;
 const upload=async()=>{const index=calls++;entered[index]?.resolve();if(gates[index])await gates[index].promise;return {ok:true};};
 t.after(()=>gates.forEach(gate=>gate.resolve()));
 const local=await localUploads(t,{uploadDocument:upload,uploadPhoto:upload});
 for(const [index,path] of [photoEndpoint,documentEndpoint].entries()){
  const client=local.send(path);await entered[index].promise;client.destroy();await local.connections[index].closed;
 }
 const blocked=await request(local.server).post(photoEndpoint).set('Authorization','Bearer local').attach('file',Buffer.from('synthetic'),'x.jpg').expect(429);
 assert.equal(blocked.body.error.code,'resource-exhausted');assert.equal(calls,2);
 gates[0].resolve();await eventTurn();
 await request(local.server).post(photoEndpoint).set('Authorization','Bearer local').attach('file',Buffer.from('synthetic'),'x.jpg').expect(200);
 assert.equal(calls,3);
 gates[1].reject(new ApiError('unavailable','Synthetic storage failure.'));await eventTurn();
 await request(local.server).post(documentEndpoint).set('Authorization','Bearer local').attach('file',Buffer.from('synthetic'),'x.jpg').expect(200);
 assert.equal(calls,4);
});

test('aborted multipart parsers release both slots without starting photo or document service work',{timeout:10000},async t=>{
 const checked=[deferred(),deferred()],entered=[deferred(),deferred()],gates=[deferred(),deferred()];let checks=0,calls=0;
 const check=async()=>checked[checks++]?.resolve();
 const upload=async()=>{const index=calls++;entered[index].resolve();await gates[index].promise;return {ok:true};};
 t.after(()=>gates.forEach(gate=>gate.resolve()));
 const local=await localUploads(t,{checkUpload:check,checkPhotoUpload:check,uploadDocument:upload,uploadPhoto:upload});
 const partial=[];
 for(const [index,path] of [photoEndpoint,documentEndpoint].entries()){
  partial.push(local.send(path,true));await checked[index].promise;await eventTurn();
 }
 await request(local.server).post(photoEndpoint).set('Authorization','Bearer local').attach('file',Buffer.from('synthetic'),'x.jpg').expect(429);
 assert.equal(calls,0);
 partial.forEach(client=>client.destroy());await Promise.all(local.connections.slice(0,2).map(connection=>connection.closed));
 for(const [index,path] of [photoEndpoint,documentEndpoint].entries()){
  const client=local.send(path);await entered[index].promise;client.destroy();await local.connections[index+3].closed;
 }
 assert.equal(calls,2);
 gates.forEach(gate=>gate.resolve());await eventTurn();
});

test('an upload disconnected during authorization never starts either service when the check completes',{timeout:10000},async t=>{
 const checked=[deferred(),deferred()],gates=[deferred(),deferred()];let checks=0,calls=0;
 const check=async()=>{const index=checks++;checked[index]?.resolve();if(gates[index])await gates[index].promise;};
 const upload=async()=>{calls++;return {ok:true};};
 t.after(()=>gates.forEach(gate=>gate.resolve()));
 const local=await localUploads(t,{checkUpload:check,checkPhotoUpload:check,uploadDocument:upload,uploadPhoto:upload});
 for(const [index,path] of [photoEndpoint,documentEndpoint].entries()){
  const client=local.send(path);await checked[index].promise;client.destroy();await local.connections[index].closed;
  gates[index].resolve();await eventTurn();
 }
 assert.equal(calls,0);
 await request(local.server).post(photoEndpoint).set('Authorization','Bearer local').attach('file',Buffer.from('synthetic'),'x.jpg').expect(200);
 assert.equal(calls,1);
});

test('profile photos share the existing 60/account budget; 429 exposes Retry-After across origins',async()=>{
 let calls=0;const app=createApp({auth:{verifyIdToken:async uid=>({uid})},allowedOrigins:['https://frontend.example.test'],services:{profilePhotos:async()=>{calls++;return {url:null};},marketplace:async()=>({ok:true})}});
 for(let i=0;i<60;i++)await request(app).post('/api/profile/photos').set('Authorization','Bearer owner').send({op:'view',context:'post',id:`post${i%31}`}).expect(200);
 const limited=await request(app).post('/api/profile/photos').set('Authorization','Bearer owner').set('Origin','https://frontend.example.test').send({op:'view',context:'self'}).expect(429);
 assert.equal(limited.body.error.message,'Too many requests. Wait a minute.');assert.equal(calls,60);
 assert.ok(Number(limited.headers['retry-after'])>0);assert.match(limited.headers['access-control-expose-headers'],/Retry-After/);
 assert.match(limited.headers['ratelimit-policy'],/60/);
 await request(app).post('/api/marketplace').set('Authorization','Bearer owner').send({op:'dashboard'}).expect(429);
 await request(app).post('/api/marketplace').set('Authorization','Bearer other').send({op:'dashboard'}).expect(200);
});

test('the unchanged 90/IP limiter also protects profile photos across accounts',async()=>{
 let verified=0;const app=createApp({auth:{verifyIdToken:async uid=>{verified++;return {uid};}},services:{profilePhotos:async()=>({url:null})}});
 for(let i=0;i<90;i++)await request(app).post('/api/profile/photos').set('Authorization',`Bearer viewer${i}`).send({op:'view',context:'self'}).expect(200);
 const limited=await request(app).post('/api/profile/photos').set('Authorization','Bearer another').send({op:'status'}).expect(429);
 assert.equal(verified,90,'the IP limiter rejects before token verification');assert.ok(Number(limited.headers['retry-after'])>0);assert.match(limited.headers['ratelimit-policy'],/90/);
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
