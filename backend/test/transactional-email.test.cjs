const {test}=require('node:test'),assert=require('node:assert/strict');
const request=require('supertest');
const {createApp}=require('../app.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
const E=require('../transactional-email.cjs');
const config={enabled:true,from:'notifications@example.test',token:'a'.repeat(40)};
function fixture(overrides={}){
 let time=100000,calls=0;const sent=[];
 const db=memoryDb({'users/owner':{role:'owner'}}),auth={getUser:async()=>({emailVerified:true,disabled:false,email:'customer@example.test'})};
 const provider={send:async(payload,key)=>{calls++;sent.push({payload,key});return 'provider-1';},retrieve:async()=>({last_event:'delivered'}),...overrides};
 const dispatcher=E.createEmailDispatcher({db,auth,config,provider,now:()=>time});
 const queue=async()=>{await db.runTransaction(async tx=>E.enqueueEmail(tx,db,{kind:'booking_confirmed',id:'b',bookingId:'b',ownerId:'owner',snapshot:{status:'confirmed',shopName:'<script> & "shop"',requestTitle:'Paint',vehicle:{make:'Toyota'}}}));return db.doc(`${E.COLLECTION}/${E.eventKey('booking_confirmed','b')}`);};
 return {db,auth,provider,dispatcher,queue,sent,calls:()=>calls,tick:ms=>{time+=ms;}};
}
test('queued event is accepted once under concurrency and only provider evidence marks delivered',async()=>{
 const f=fixture(),ref=await f.queue();assert.equal((await ref.get()).data().status,'queued');
 await Promise.all([f.dispatcher.processJob(ref),f.dispatcher.processJob(ref)]);
 assert.equal(f.calls(),1);assert.equal((await ref.get()).data().status,'accepted');
 f.tick(60000);await f.dispatcher.processJob(ref);assert.equal((await ref.get()).data().status,'delivered');
 await f.dispatcher.processJob(ref);assert.equal(f.calls(),1);
});
test('transient failure retries the frozen request with the same key and never writes booking records',async()=>{
 let attempts=0;const payloads=[];
 const f=fixture({send:async(p,k)=>{payloads.push([p,k]);if(++attempts===1)throw Error('timeout');return 'provider-id';}}),ref=await f.queue();
 await f.dispatcher.processJob(ref);assert.equal((await ref.get()).data().status,'queued');
 f.tick(60000);await f.dispatcher.processJob(ref);
 assert.deepEqual(payloads[0],payloads[1]);assert.equal((await ref.get()).data().status,'accepted');
 assert.ok(![...f.db.rows.keys()].some(k=>/^(bookings|paymentReceipts)\//.test(k)));
});
test('unknown sends stop before provider idempotency expires, including after process death',async()=>{
 const f=fixture(),ref=await f.queue();await ref.update({status:'processing',firstAttemptAt:100000,attempts:1});
 f.tick(E.RETRY_WINDOW_MS);await f.dispatcher.processJob(ref);
 assert.equal((await ref.get()).data().status,'failed');assert.equal(f.calls(),0);
});
test('retry count is bounded and permanent provider rejection stops immediately',async()=>{
 for(const permanent of [true,false]){
  const f=fixture({send:async()=>{const e=Error('private provider data');if(permanent)e.retryable=false;throw e;}}),ref=await f.queue();
  for(let i=0;i<8;i++){await f.dispatcher.processJob(ref);f.tick(3600000);}
  const j=(await ref.get()).data();assert.equal(j.status,'failed');assert.equal(j.attempts,permanent?1:6);assert.ok(!JSON.stringify(j).includes('private provider data'));
 }
});
test('missing, invalid, unverified, disabled and suspended recipients cannot be sent',async()=>{
 for(const bad of [{email:undefined},{email:'bad\r\nBcc:evil@example.test'},{email:'a..b@example.test'},{emailVerified:false},{disabled:true}]){
  const f=fixture(),ref=await f.queue();f.auth.getUser=async()=>({email:'a@example.test',emailVerified:true,...bad});
  await f.dispatcher.processJob(ref);assert.equal(f.calls(),0);assert.equal((await ref.get()).data().failureCode,'recipient_unavailable');
 }
 const f=fixture(),ref=await f.queue();await f.db.doc('users/owner').update({accountStatus:'suspended'});await f.dispatcher.processJob(ref);assert.equal(f.calls(),0);
});
test('recipient changes after an uncertain send stop instead of altering the provider request',async()=>{
 const f=fixture({send:async()=>{throw Error('timeout');}}),ref=await f.queue();await f.dispatcher.processJob(ref);
 f.auth.getUser=async()=>({email:'new@example.test',emailVerified:true});f.tick(60000);await f.dispatcher.processJob(ref);
 assert.equal((await ref.get()).data().failureCode,'recipient_changed');
});
test('templates escape HTML, omit unavailable appointment and retain literal plain text',async()=>{
 const f=fixture(),ref=await f.queue(),rendered=E.renderEmail((await ref.get()).data());
 assert.ok(!rendered.html.includes('<script>'));assert.match(rendered.html,/&lt;script&gt; &amp; &quot;shop&quot;/);assert.match(rendered.text,/<script>/);
 assert.ok(!rendered.text.includes('Appointment:'));assert.ok(rendered.text.includes(E.NOTICE));
 const selection=E.renderEmail({kind:'pay_in_store_selected',bookingId:'b',snapshot:{paidCents:0,balanceDueCents:9000}});
 assert.match(selection.text,/selection only; payment is still due/);assert.ok(!selection.text.includes('Receipt reference'));
});
test('dispatch endpoint requires a separate secret, accepts no recipient input and masks failures',async()=>{
 let calls=0;const app=createApp({services:{},auth:{},emailDelivery:{config,dispatcher:{dispatch:async()=>{calls++;return {processed:0};}}},allowedOrigins:[]});
 await request(app).post('/internal/email/dispatch').expect(403);
 await request(app).post('/internal/email/dispatch').set('Authorization','Bearer firebase-user-token').expect(403);
 await request(app).post('/internal/email/dispatch').set('Authorization',`Bearer ${config.token}`).send({to:'evil@example.test'}).expect(200);
 assert.equal(calls,1);
});
test('disabled dispatcher does not query Firestore or call the provider',async()=>{
 const d=E.createEmailDispatcher({db:{},auth:{},config:{enabled:false},provider:{}});assert.deepEqual(await d.dispatch(),{enabled:false,processed:0});
 assert.deepEqual(E.emailConfig({}),{enabled:false});assert.throws(()=>E.emailConfig({PMR_TRANSACTIONAL_EMAIL_ENABLED:'true'}));
});
test('Resend adapter uses backend fetch, provider idempotency header, timeout and accurate failure classes',async()=>{
 const calls=[];const p=E.resendProvider({apiKey:'server-secret',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({id:'id'})};}});
 assert.equal(await p.send({to:['test@example.test']},'event-key'),'id');
 assert.equal(calls[0].options.headers['Idempotency-Key'],'event-key');assert.equal(calls[0].options.headers.Authorization,'Bearer server-secret');assert.ok(calls[0].options.signal);
 for(const status of [400,429,500]){
  const bad=E.resendProvider({apiKey:'x',fetchImpl:async()=>({ok:false,status,json:async()=>({})})});
  await assert.rejects(()=>bad.send({},'k'),e=>e.retryable===(status!==400));
 }
});
test('accepted polling records bounce as failed and unresolved acceptance stays accepted',async()=>{
 for(const last_event of ['bounced','sent']){
  const f=fixture({retrieve:async()=>({last_event})}),ref=await f.queue();await f.dispatcher.processJob(ref);
  for(let i=0;i<13;i++){f.tick(3600000);await f.dispatcher.processJob(ref);}
  const j=(await ref.get()).data();assert.equal(j.status,last_event==='bounced'?'failed':'accepted');assert.equal(f.calls(),1);
 }
});
