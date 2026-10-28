const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {createApp}=require('../app.cjs'),{category}=require('../request-policy.cjs'),{ApiError}=require('../errors.cjs');
const auth={verifyIdToken:async uid=>{if(uid==='bad')throw Error('private credential');return {uid};}};
function fixture(extra={}){return createApp({auth,metricsLogger:()=>{},services:{postsList:async()=>({items:[]}),profilePhotos:async()=>({url:null}),marketplace:async()=>({ok:true}),completeProfile:async()=>({ok:true}),sessionEvent:async()=>({ok:true}),checkUpload:async()=>{},uploadDocument:async()=>({ok:true}),...extra}});}
const post=(app,path,body={},uid='owner')=>request(app).post('/api/'+path).set('Authorization','Bearer '+uid).send(body);
test('route policies explicitly classify reads; forged and unknown operations use mutation protection',()=>{
 for(const [path,method,op,expected] of [['/marketplace','POST','vehicles','read'],['/marketplace/','POST','notificationSummary','read'],['/marketplace','POST','quoteAccept','mutation'],['/messaging','POST','send','mutation'],['/messaging','POST','summary','read'],['/profile/photos','POST','view','media'],['/profile/photos/upload','POST','view','mutation'],['/posts/id/images/view','POST',null,'media'],['/posts/id','GET',null,'read'],['/profile','POST',null,'identity'],['/session','POST',null,'session'],['/admin','POST','list','mutation'],['/unknown','POST','get','mutation'],['/__proto__','POST','get','mutation'],['/constructor','POST','get','mutation']])assert.equal(category({path,method,body:{op}}),expected);
});
test('read bursts reject at 61 without consuming mutations, media or another account budget',async()=>{
 const app=fixture();for(let i=0;i<60;i++)await post(app,'marketplace',{op:'vehicles'}).expect(200);
 const limited=await post(app,'marketplace',{op:'vehicles'}).expect(429);
 assert.equal(limited.body.error.policy,'read');assert.ok(+limited.headers['retry-after']>0);
 await post(app,'marketplace',{op:'vehicleSave'}).expect(200);await post(app,'profile/photos',{op:'view'}).expect(200);
 await post(app,'marketplace',{op:'vehicles'},'other').expect(200);
});
test('invalid authentication remains limited at 91/IP; identity changes remain limited at 13/UID',async()=>{
 const app=fixture();for(let i=0;i<90;i++)await post(app,'marketplace',{},'bad').expect(401);
 const blocked=await post(app,'marketplace',{},'bad').expect(429);assert.equal(blocked.body.error.policy,'authentication-ip');
 const other=fixture();for(let i=0;i<12;i++)await post(other,'profile',{}).expect(200);
 assert.equal((await post(other,'profile',{}).expect(429)).body.error.policy,'identity');
});
test('uploads retain their six/minute ceiling and service-generated 429 includes retry information',async()=>{
 const app=fixture();for(let i=0;i<6;i++)await request(app).post('/api/documents/ownerId').set('Authorization','Bearer owner').attach('file',Buffer.from('mock'),'mock.pdf').expect(200);
 const limited=await request(app).post('/api/documents/ownerId').set('Authorization','Bearer owner').attach('file',Buffer.from('mock'),'mock.pdf').expect(429);assert.ok(+limited.headers['retry-after']>0);
 const busy=fixture({marketplace:async()=>{throw new ApiError('resource-exhausted','Busy');}});
 assert.ok(+(await post(busy,'marketplace',{op:'vehicles'}).expect(429)).headers['retry-after']>0);
});
test('request metrics expose only bounded category/status keys and timing aggregates',async()=>{
 const app=fixture();await post(app,'marketplace',{op:'vehicles',privateName:'NEVER_LOG'}).expect(200);
 const snapshot=app.locals.requestMetrics();assert.equal(snapshot['read:200'].requests,1);assert.ok(snapshot['read:200'].maxMs>=0);
 assert.doesNotMatch(JSON.stringify(snapshot),/NEVER_LOG|owner|Bearer|vehicles/);
});
test('twenty concurrent accounts can browse behind one IP across repeated waves',async()=>{
 const app=fixture();
 for(let wave=0;wave<5;wave++)await Promise.all(Array.from({length:20},(_,id)=>post(app,'marketplace',{op:'vehicles'},'shared-'+id).expect(200)));
 assert.equal(app.locals.requestMetrics()['read:200'].requests,100);
});
test('case variants retain strict identity policy and malformed JSON consumes a mutation budget',async()=>{
 const app=fixture();
 for(let i=0;i<12;i++)await post(app,'PROFILE',{}).expect(200);
 assert.equal((await post(app,'PROFILE',{}).expect(429)).body.error.policy,'identity');
 const invalid=fixture();
 for(let i=0;i<60;i++)await request(invalid).post('/api/marketplace').set('Authorization','Bearer owner').set('Content-Type','application/json').send('{').expect(400);
 const limited=await request(invalid).post('/api/marketplace').set('Authorization','Bearer owner').set('Content-Type','application/json').send('{').expect(429);
 assert.equal(limited.body.error.policy,'mutation');
});
