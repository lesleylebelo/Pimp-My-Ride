// Local-only operator tool. Never imported by the app, server or scheduler.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const E=require('./transactional-email.cjs');
const PROJECT='demo-pmr-security',OWNER='email-e2e-owner',SHOP='email-e2e-shop';
const ROOT=path.resolve(__dirname,'..'),LOCAL=path.join(ROOT,'.local-checks');
const MANIFEST=path.join(LOCAL,'email-e2e-manifest.json'),LOCK=path.join(LOCAL,'email-first-live-attempt.lock');
// Fingerprint of the one mailbox explicitly designated for this test. The
// address itself is entered at runtime and is never written to this tool.
const AUTHORIZED_MAILBOX_HASH='9cc5efa01fbfc9f36896b14a415fc532e84987fcdba481fec3942650fd40c4ec';
function guard(env=process.env,authorizedHash=AUTHORIZED_MAILBOX_HASH){
 assert.equal(env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8187','Use isolated local Firestore port 8187');
 assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9197','Use isolated local Auth port 9197');
 for(const key of ['FIREBASE_PROJECT_ID','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'])assert.equal(env[key],PROJECT,`Set ${key} to the emulator project`);
 assert.notEqual(env.NODE_ENV,'production','Production mode is prohibited');
 assert.notEqual(env.PMR_TRANSACTIONAL_EMAIL_ENABLED,'true','Keep normal email transport disabled');
 for(const key of ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_SERVICE_ACCOUNT_JSON'])assert.ok(!env[key],'Remove production credential variables from this test shell');
 assert.ok(E.validEmail(env.PMR_EMAIL_TEST_MAILBOX),'Enter the designated Resend account mailbox locally');
 assert.equal(createHash('sha256').update(env.PMR_EMAIL_TEST_MAILBOX).digest('hex'),authorizedHash,'Mailbox does not match the explicitly designated account');
 return env.PMR_EMAIL_TEST_MAILBOX;
}
function verifyIndexes(){
 const indexes=JSON.parse(fs.readFileSync(path.join(ROOT,'firestore.indexes.json'),'utf8'));
 assert.ok(indexes.indexes.some(i=>i.collectionGroup===E.COLLECTION&&i.queryScope==='COLLECTION'&&JSON.stringify(i.fields)===JSON.stringify([{fieldPath:'status',order:'ASCENDING'},{fieldPath:'dueAt',order:'ASCENDING'}])),'Missing email queue composite index');
 for(const field of ['payload','snapshot'])assert.ok(indexes.fieldOverrides.some(i=>i.collectionGroup===E.COLLECTION&&i.fieldPath===field&&i.indexes.length===0),'Missing private content index exemption');
}
function claimLiveAttempt(file,jobId){
 // Deliberately survives emulator resets. Never remove automatically, including
 // when the process crashes, times out or cannot determine provider acceptance.
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify({jobId,attemptStartedAt:new Date().toISOString(),warning:'Do not retry or delete this lock without reviewing the provider outcome.'})+'\n',{flag:'wx',mode:0o600});
}
async function connect(){
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
 // The Admin SDK's emulator mode supplies emulator authentication. A custom
 // Credential object is rejected by its Firestore adapter; no real key is used.
 const app=initializeApp({projectId:PROJECT},`local-email-${randomUUID()}`);
 const db=getFirestore(app),auth=getAuth(app);
 return {db,auth,close:async()=>{await db.terminate();await deleteApp(app);}};
}
async function prepare({db,auth},mailbox,mode){
 assert.equal((await auth.listUsers(1)).users.length,0,'Auth emulator must be empty; restart without import');
 assert.equal((await db.listCollections()).length,0,'Firestore emulator must be empty; restart without import');
 const password=randomUUID()+'aA1!';
 await auth.createUser({uid:OWNER,email:mailbox,emailVerified:true,password});
 await auth.createUser({uid:SHOP,email:'synthetic-workshop@example.test',emailVerified:true,password});
 await db.doc(`users/${OWNER}`).set({role:'owner',fullName:'Synthetic email test customer',accountStatus:'active'});
 await db.doc(`users/${SHOP}`).set({role:'shop',verificationStatus:'approved',accountStatus:'active',shop:{shopName:'Synthetic Test Workshop',city:'Johannesburg'}});
 await db.doc('serviceCategories/email-test').set({name:'Synthetic paint service',archived:false});
 const {createServices}=require('./services.cjs');
 const services=createServices({db,auth,storage:{},aiProvider:{enabled:false},aiStudioProvider:{enabled:false},mockPaymentEnv:{NODE_ENV:'test',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:PROJECT,GCLOUD_PROJECT:PROJECT,GOOGLE_CLOUD_PROJECT:PROJECT,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8187',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9197'}});
 const identities={};
 for(const [uid,email] of [[OWNER,mailbox],[SHOP,'synthetic-workshop@example.test']]){
  const response=await fetch('http://127.0.0.1:9197/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true}),signal:AbortSignal.timeout(10000)});
  assert.ok(response.ok,'Emulator sign-in failed');const body=await response.json();
  const token=await auth.verifyIdToken(body.idToken,true);assert.equal(token.uid,uid);identities[uid]={uid,token};
 }
 const call=(uid,op,data,key=op)=>services.marketplace({auth:identities[uid],data:{op,...data,requestId:`email-e2e-${key}`}});
 const vehicle=await call(OWNER,'vehicleSave',{make:'Toyota',model:'Synthetic Corolla',year:2020,colour:'Blue',registration:'TEST ONLY'});
 const request=await call(OWNER,'requestCreate',{vehicleId:vehicle.id,title:'Synthetic email rehearsal',description:'Synthetic local emulator data only.',categoryId:'email-test',city:'Johannesburg',budgetMinCents:0,budgetMaxCents:100000,preferredDate:'',visibility:'open'});
 const quote=await call(SHOP,'quoteSubmit',{serviceRequestId:request.id,termsVersion:1,scope:'Synthetic paint service for email validation',items:[{description:'Synthetic service',amountCents:100000}],completionDays:1,warranty:'Test only',validForDays:7,depositType:'fixed',depositValue:25000,scopeConfirmed:true,allChargesIncluded:true});
 const booking=await call(OWNER,'quoteAccept',{id:quote.id,paymentMethod:'pay_deposit'});
 const payment={id:booking.id,paymentAttemptId:booking.paymentAttemptId,expectedBookingId:booking.id,expectedAmountCents:25000,expectedCurrency:'ZAR',outcome:'successful'};
 await call(OWNER,'paymentMockResult',payment);await call(OWNER,'paymentMockResult',payment);
 const appointment={id:booking.id,appointmentDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),appointmentTime:'10:00'};
 await call(SHOP,'bookingConfirm',appointment);await call(SHOP,'bookingConfirm',appointment);
 const manifest={project:PROJECT,mode,bookingId:booking.id,attemptId:booking.paymentAttemptId,jobs:{booking:E.eventKey('booking_confirmed',booking.id),receipt:E.eventKey('mock_payment_receipt',booking.paymentAttemptId)}};
 fs.mkdirSync(LOCAL,{recursive:true});fs.writeFileSync(MANIFEST,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 return manifest;
}
function loadManifest(){const m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));assert.equal(m.project,PROJECT);return m;}
async function verify({db,auth},mailbox,m){
 verifyIndexes();
 assert.equal(m.jobs.booking,E.eventKey('booking_confirmed',m.bookingId));assert.equal(m.jobs.receipt,E.eventKey('mock_payment_receipt',m.attemptId));
 const users=(await auth.listUsers(10));assert.equal(users.users.length,2);assert.ok(!users.pageToken);
 const user=await auth.getUser(OWNER);assert.equal(user.email,mailbox);assert.equal(user.emailVerified,true);assert.equal(user.disabled,false);
 const jobs=await db.collection(E.COLLECTION).get();assert.equal(jobs.size,2,'Unexpected jobs: refusing to dispatch');
 for(const doc of jobs.docs){
  assert.ok(Object.values(m.jobs).includes(doc.id));const j=doc.data();assert.equal(j.recipientUid,OWNER);assert.equal(j.bookingId,m.bookingId);
  if(j.payload){assert.deepEqual(j.payload.to,[mailbox]);assert.equal(j.payload.from,'onboarding@resend.dev');}
  assert.ok(E.renderEmail(j).text.includes(E.NOTICE));
 }
 const receipt=(await db.doc(`paymentReceipts/${m.attemptId}`).get()).data();
 const {issuedAt,...snapshot}=receipt;assert.deepEqual(jobs.docs.find(d=>d.id===m.jobs.receipt).data().snapshot.receipt,snapshot);
 assert.equal(receipt.amountCents,25000);assert.equal(receipt.balanceDueCentsAfter,75000);
 const booking=(await db.doc(`bookings/${m.bookingId}`).get()).data();assert.equal(booking.status,'confirmed');assert.equal(booking.simulated,true);assert.equal(booking.paidCents,25000);assert.equal(booking.balanceDueCents,75000);
 // Exercise the exact production query. The emulator does not enforce indexes;
 // verifyIndexes validates the manifest, not a deployed production index.
 await db.collection(E.COLLECTION).where('status','in',['queued','processing','accepted']).where('dueAt','<=',Date.now()).orderBy('dueAt').limit(3).get();
 return jobs;
}
function safeRows(jobs){return jobs.docs.map(d=>{const j=d.data();return {jobId:d.id,kind:j.kind,status:j.status,attempts:j.attempts,providerId:j.providerId||null,failureCode:j.failureCode||null};});}
async function main(args=process.argv.slice(2)){
 const action=args[0];assert.ok(['rehearse','prepare','verify','send-once','status','refresh-status'].includes(action),'Select a documented action');
 const mailbox=guard();verifyIndexes();
 if(action==='send-once')assert.ok(args.length===3&&['booking','receipt'].includes(args[1])&&args[2]==='--approve-one-live-email','Explicit one-email approval and job selection are required');
 else assert.equal(args.length,1,'Unexpected arguments');
 const context=await connect();
 try{
  const m=['rehearse','prepare'].includes(action)?await prepare(context,mailbox,action==='rehearse'?'rehearsal':'prepared'):loadManifest();
  await verify(context,mailbox,m);
  const config={enabled:true,from:'onboarding@resend.dev'};
  if(action==='rehearse'){
   let sends=0,clock=Date.now();
   const provider={send:async(p,key)=>{assert.deepEqual(p.to,[mailbox]);assert.equal(p.from,config.from);sends++;return `mock-${key}`;},retrieve:async()=>({last_event:'delivered'})};
   const dispatcher=E.createEmailDispatcher({...context,config,provider,now:()=>clock});
   await Promise.all([dispatcher.dispatch(),dispatcher.dispatch()]);assert.equal(sends,2);
   clock+=60001;await dispatcher.dispatch();assert.equal(sends,2);
   const jobs=await verify(context,mailbox,m);assert.ok(jobs.docs.every(d=>d.data().status==='delivered'));console.log('REHEARSAL ONLY: 2 mock sends; 0 Resend requests. Duplicate workflow calls and competing dispatchers did not duplicate jobs or sends.');
  }
  if(action==='send-once'){
   assert.equal(m.mode,'prepared','Mock rehearsal jobs cannot be sent live');assert.ok(process.env.RESEND_API_KEY,'Load the API key securely in this shell');
   const ref=context.db.doc(`${E.COLLECTION}/${m.jobs[args[1]]}`),j=(await ref.get()).data();
   assert.equal(j.status,'queued');assert.equal(j.attempts,0);assert.ok(!j.payload&&!j.providerId&&!j.firstAttemptAt,'Only a never-attempted prepared job is eligible');
   claimLiveAttempt(LOCK,ref.id);
   const real=E.resendProvider({apiKey:process.env.RESEND_API_KEY});let calls=0;
   const provider={send:async(p,key)=>{assert.equal(++calls,1);assert.equal(key,ref.id);assert.equal(p.from,config.from);assert.deepEqual(p.to,[mailbox]);return real.send(p,key);},retrieve:async()=>{throw Error('No automatic status request');}};
   await E.createEmailDispatcher({...context,config,provider}).processJob(ref);
   console.log('One live attempt consumed. No automatic repeat or queue drain. Review status and provider evidence even if acceptance is unknown.');
  }
  if(action==='refresh-status'){
   assert.equal(m.mode,'prepared');assert.ok(process.env.RESEND_API_KEY,'Load the API key securely');
   const real=E.resendProvider({apiKey:process.env.RESEND_API_KEY});
   const dispatcher=E.createEmailDispatcher({...context,config,provider:{send:async()=>{throw Error('Sending is prohibited during status checks');},retrieve:id=>real.retrieve(id)}});
   for(const id of Object.values(m.jobs)){const ref=context.db.doc(`${E.COLLECTION}/${id}`),j=(await ref.get()).data();if(j.status==='accepted'&&!j.providerId.startsWith('mock-'))await dispatcher.processJob(ref);}
  }
  console.log(JSON.stringify(safeRows(await verify(context,mailbox,m)),null,2));
 }finally{await context.close();}
}
if(require.main===module)main().catch(()=>{console.error('Local email test stopped. Check the documented prerequisites and local job status. Never automatically repeat an uncertain live attempt. Details and secrets are intentionally not logged.');process.exitCode=1;});
module.exports={guard,verifyIndexes,claimLiveAttempt,main};
