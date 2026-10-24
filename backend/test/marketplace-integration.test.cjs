const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const http=require('supertest'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const {quoteId}=require('../marketplace.cjs');
const firebase=initializeApp({projectId:'demo-pmr-security'},'marketplace-tests'),db=getFirestore(firebase),auth=getAuth(firebase);
const mockPaymentEnv={...process.env,NODE_ENV:'test',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:'demo-pmr-security'};
const services=createServices({db,auth,storage:{},mockPaymentEnv});let app,sequence=0;
const vehicle={make:'Test make',model:'Test model',year:2020,colour:'Blue',registration:'TEST 123 GP'};
const details={title:'Body kit installation',description:'Supply and fit a synthetic example body kit.',categoryId:'body',city:'Johannesburg',budgetMinCents:100000,budgetMaxCents:300000,preferredDate:'',visibility:'open'};
const quote={scope:'Fit and inspect the example kit.',items:[{description:'Fitment',amountCents:125000},{description:'Paint',amountCents:50000}],completionDays:5,warranty:'12 months workmanship',validForDays:14};
const identity=uid=>({uid,token:{email_verified:true,auth_time:Math.floor(Date.now()/1000)+1}});
const writes=new Set(['vehicleSave','vehicleArchive','requestCreate','requestUpdate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','paymentMockResult','paymentRetry','paymentStart','paymentRecordInStore','bookingComplete','bookingConfirm','bookingCancel','notificationRead']);
const body=(op,data={})=>({op,...(writes.has(op)?{requestId:`emulator-${++sequence}`} : {}),...(op==='quoteAccept'?{paymentMethod:'pay_in_store'}:{}),...data});
const call=async(uid,op,data={})=>{
 if(op==='quoteSubmit'&&data.termsVersion===undefined){
  const request=await db.doc(`serviceRequests/${data.serviceRequestId}`).get();
  data={...data,termsVersion:request.data()?.termsVersion||request.data()?.version||1};
 }
 if(op==='paymentMockResult'){const attempt=(await db.doc('bookings/'+data.id+'/paymentAttempts/'+data.paymentAttemptId).get()).data();data={expectedBookingId:data.id,expectedAmountCents:attempt?.amountCents,expectedCurrency:attempt?.currency,...data};}
 return services.marketplace({auth:identity(uid),data:body(op,data)});
};
async function seed(uid,role,extra={}){
 await auth.createUser({uid,email:`${uid}@example.invalid`,emailVerified:true,password:'SyntheticPassword1234'});
 await db.doc(`users/${uid}`).set({role,accountStatus:'active',fullName:'Fictional test user',email:`${uid}@example.invalid`,phone:'0821234567',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:`Workshop ${uid}`,city:'Johannesburg',province:'Gauteng',services:'Body kits'}}:{}),...extra});
}
beforeEach(async()=>{
 const cleared=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-pmr-security/databases/(default)/documents`,{method:'DELETE'});assert.ok(cleared.ok);
 const users=await auth.listUsers();if(users.users.length)await auth.deleteUsers(users.users.map(u=>u.uid));
 await Promise.all([seed('alice','owner'),seed('bob','owner'),seed('shop-one','shop'),seed('shop-two','shop'),seed('pending','shop',{verificationStatus:'pending'}),seed('admin','admin')]);
 await db.doc('serviceCategories/body').set({name:'Body kit',description:'Body customization',archived:false});
 app=createApp({auth,services});
});
after(async()=>{await db.terminate();await deleteApp(firebase);});
async function signIn(uid){
 const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.invalid`,password:'SyntheticPassword1234',returnSecureToken:true})});
 const result=await response.json();assert.ok(result.idToken);return result.idToken;
}

async function offers(){
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id});
 const first=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id}),second=await call('shop-two','quoteSubmit',{...quote,serviceRequestId:r.id});
 return {vehicleId:v.id,requestId:r.id,first:first.id,second:second.id};
}
const futureAppointment={appointmentDate:'2099-10-15',appointmentTime:'10:00'};

test('original-project mock transactions persist across service recreation and serialize concurrent balance confirmations in the emulator',async()=>{
 const {PROJECT,HOSTED_MOCK_ENV}=require('./helpers/mock-payments.cjs');const config={...HOSTED_MOCK_ENV};
 // Only the project identity/configuration is a test double. All data/Auth traffic stays in
 // demo-pmr-security on loopback; no hosted credential or cloud SDK is started.
 const hostedDb={projectId:PROJECT,doc:db.doc.bind(db),collection:db.collection.bind(db),runTransaction:db.runTransaction.bind(db)};
 const makeApp=()=>createApp({auth,services:createServices({db:hostedDb,auth,storage:{},mockPaymentEnv:config})});
 let hostedApp=makeApp();const token=await signIn('alice');
 const api=async(op,data={})=>(await http(hostedApp).post('/api/marketplace').set('Authorization','Bearer '+token).send(body(op,data)).expect(200)).body.data;
 assert.equal((await api('paymentSimulation')).mode,'mock');
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id}),q=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id,depositType:'percentage',depositValue:25});
 const b=await api('quoteAccept',{id:q.id,paymentMethod:'pay_deposit'});
 await api('paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:43750,expectedCurrency:'ZAR',outcome:'successful'});
 hostedApp=makeApp();let saved=(await api('booking',{id:b.id})).booking;assert.equal(saved.paidCents,43750);assert.equal(saved.balanceDueCents,131250);
 assert.equal(saved.paymentAccountingMode,'simulated');assert.ok(saved.simulatedPaymentVerifiedAt);assert.equal(saved.paymentVerifiedAt,undefined);
 const shopToken=await signIn('shop-one');
 const shopView=(await http(hostedApp).post('/api/marketplace').set('Authorization','Bearer '+shopToken).send(body('booking',{id:b.id})).expect(200)).body.data.booking;
 assert.equal(shopView.paidCents,43750);assert.equal(shopView.balanceDueCents,131250);assert.equal(shopView.simulated,true);
 const next=await api('paymentStart',{id:b.id});
 const confirm=()=>http(hostedApp).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('paymentMockResult',{id:b.id,paymentAttemptId:next.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:131250,expectedCurrency:'ZAR',outcome:'successful'}));
 const results=await Promise.all([confirm(),confirm()]);assert.deepEqual(results.map(value=>value.status).sort(),[200,409]);
 saved=(await api('booking',{id:b.id})).booking;assert.equal(saved.paidCents,175000);assert.equal(saved.balanceDueCents,0);
 config.PMR_MOCK_PAYMENTS_ENABLED='false';assert.equal((await api('paymentSimulation')).enabled,false);
});

test('Firestore simulation preserves unmarked booking settlement evidence without mutation receipts',async()=>{
 const offered=await offers(),b=await call('alice','quoteAccept',{id:offered.first,paymentMethod:'pay_now'}),ref=db.doc('bookings/'+b.id);
 await ref.update({simulated:false,paymentVerifiedAt:Timestamp.fromMillis(1234)});
 const before=(await ref.get()).data(),attemptRef=db.doc('bookings/'+b.id+'/paymentAttempts/'+b.paymentAttemptId),attemptBefore=(await attemptRef.get()).data();
 const receiptsBefore=(await db.collection('mutationReceipts').get()).size;
 await assert.rejects(()=>call('alice','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'}),{code:'failed-precondition'});
 await assert.rejects(()=>call('alice','paymentStart',{id:b.id}),{code:'failed-precondition'});
 await assert.rejects(()=>call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_cash'}),{code:'failed-precondition'});
 assert.deepEqual((await ref.get()).data(),before);assert.deepEqual((await attemptRef.get()).data(),attemptBefore);assert.equal((await db.collection('mutationReceipts').get()).size,receiptsBefore);
});

test('authenticated HTTP simulation capability is read-only, local-only and available to eligible participants',async()=>{
 const closed=createApp({auth,services:createServices({db,auth,storage:{},mockPaymentEnv:{}})});
 await http(app).post('/api/marketplace').send(body('paymentSimulation')).expect(401);
 for(const uid of ['alice','shop-one']){
  const token=await signIn(uid);
  const enabled=await http(app).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('paymentSimulation')).expect(200);
  assert.deepEqual(enabled.body.data,{enabled:true,simulated:true,mode:'local-emulator'});
  const disabled=await http(closed).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('paymentSimulation')).expect(200);
  assert.deepEqual(disabled.body.data,{enabled:false,simulated:true,mode:'disabled'});
 }
 for(const name of ['bookings','paymentReceipts','auditLogs'])assert.equal((await db.collection(name).get()).size,0);
});
async function acceptanceAudits(id){return (await db.collection('auditLogs').where('target','==',id).get()).docs.filter(d=>d.data().action==='marketplace.quoteAccept');}

test('authenticated HTTP acceptance creates a booking that the selected shop confirms and customer cancels',async()=>{
 const offered=await offers(),owner=await signIn('alice'),shop=await signIn('shop-one'),other=await signIn('shop-two');
 const api=async(token,op,data={})=>(await http(app).post('/api/marketplace').set('Authorization',`Bearer ${token}`).send(body(op,data)).expect(200)).body.data;
 const accepted=await api(owner,'quoteAccept',{id:offered.first,requestId:'accept-http'});assert.equal(accepted.id,offered.requestId);
 assert.deepEqual(await api(owner,'quoteAccept',{id:offered.first,requestId:'accept-http'}),{id:accepted.id,paymentAttemptId:null,existingBooking:true});
 await http(app).post('/api/marketplace').set('Authorization',`Bearer ${other}`).send(body('booking',{id:accepted.id})).expect(404);
 const initial=(await api(shop,'booking',{id:accepted.id})).booking;assert.equal(initial.status,'pending_confirmation');assert.equal(initial.ownerId,undefined);assert.equal(initial.vehicleId,undefined);assert.equal(initial.vehicle.registration,undefined);
 assert.equal((await api(owner,'bookings')).items[0].id,accepted.id);
 assert.equal((await api(shop,'bookings')).items[0].id,accepted.id);
 await api(shop,'bookingConfirm',{id:accepted.id,...futureAppointment,requestId:'confirm-http'});
 const confirmed=(await api(owner,'booking',{id:accepted.id})).booking;assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.appointmentAt,Date.parse('2099-10-15T08:00:00Z'));assert.equal(confirmed.totalCents,175000);
 await api(owner,'bookingCancel',{id:accepted.id,reason:'Synthetic change of plans',requestId:'cancel-http'});
 const cancelled=(await api(shop,'booking',{id:accepted.id})).booking;assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.cancellationReason,'Synthetic change of plans');assert.equal(cancelled.cancelledByRole,'owner');
 assert.equal((await db.doc(`serviceRequests/${offered.requestId}`).get()).data().status,'booked');assert.equal((await db.doc(`quotations/${offered.first}`).get()).data().status,'accepted');
 assert.equal((await acceptanceAudits(accepted.id)).length,1);
});

test('Firestore resolves a request update racing quote acceptance without mismatched booking terms',async()=>{
 const offered=await offers(),requestRef=db.doc(`serviceRequests/${offered.requestId}`),before=(await requestRef.get()).data();
 const update=call('alice','requestUpdate',{id:offered.requestId,version:before.version,...details,title:'Updated body kit scope'});
 const accept=call('alice','quoteAccept',{id:offered.first,paymentMethod:'pay_in_store'});
 const [updated,accepted]=await Promise.allSettled([update,accept]);
 assert.equal(Number(updated.status==='fulfilled')+Number(accepted.status==='fulfilled'),1);
 const request=(await requestRef.get()).data(),quote=(await db.doc(`quotations/${offered.first}`).get()).data();
 if(accepted.status==='fulfilled'){
  const booking=(await db.doc(`bookings/${offered.requestId}`).get()).data();
  assert.equal(request.status,'booked');assert.equal(quote.status,'accepted');
  assert.equal(booking.scope,quote.scope);assert.equal(booking.totalCents,quote.totalCents);
  assert.equal(booking.requestTitle,details.title);
 }else{
  assert.equal(request.status,'open');assert.equal(request.termsVersion,before.termsVersion+1);
  assert.equal(quote.status,'submitted');assert.equal((await db.doc(`bookings/${offered.requestId}`).get()).exists,false);
 }
});

test('Firestore preserves request and quotation-head consistency across quote races',async()=>{
 const updateTerms=async requestId=>{
  const ref=db.doc(`serviceRequests/${requestId}`),before=(await ref.get()).data();
  return call('alice','requestUpdate',{id:requestId,version:before.version,...details,title:'Updated body kit scope'});
 };
 const requestWithVehicle=async()=>{
  return call('alice','requestCreate',{...details,vehicleId:sharedVehicle});
 };
 const sharedVehicle=(await call('alice','vehicleSave',vehicle)).id;

 const submitRace=await requestWithVehicle(),submitTerms=(await db.doc(`serviceRequests/${submitRace.id}`).get()).data();
 const submitted=await Promise.allSettled([
  updateTerms(submitRace.id),
  call('shop-one','quoteSubmit',{...quote,serviceRequestId:submitRace.id,termsVersion:submitTerms.termsVersion}),
 ]);
 assert.ok(submitted.some(result=>result.status==='fulfilled'));
 const requestAfterRace=(await db.doc(`serviceRequests/${submitRace.id}`).get()).data();
 const headAfterRace=await db.doc(`quotationHeads/${quoteId(submitRace.id,'shop-one')}`).get();
 if(headAfterRace.exists){
  const pointed=await db.doc(`quotations/${headAfterRace.data().quoteId}`).get();
  assert.ok(pointed.exists);assert.equal(pointed.data().serviceRequestId,submitRace.id);assert.equal(pointed.data().shopId,'shop-one');
  if(pointed.data().termsVersion!==requestAfterRace.termsVersion){
   await assert.rejects(()=>call('alice','quoteAccept',{id:pointed.id,requestId:'race-stale-accept',paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
  }
 }

 const replacementRequest=await requestWithVehicle(),original=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:replacementRequest.id});
 await updateTerms(replacementRequest.id);
 const currentTerms=(await db.doc(`serviceRequests/${replacementRequest.id}`).get()).data().termsVersion;
 const replacements=await Promise.allSettled([
  call('shop-one','quoteSubmit',{...quote,scope:'Replacement A',serviceRequestId:replacementRequest.id,termsVersion:currentTerms}),
  call('shop-one','quoteSubmit',{...quote,scope:'Replacement B',serviceRequestId:replacementRequest.id,termsVersion:currentTerms}),
 ]);
 assert.equal(replacements.filter(result=>result.status==='fulfilled').length,1);
 const replacementHead=(await db.doc(`quotationHeads/${quoteId(replacementRequest.id,'shop-one')}`).get()).data();
 const currentQuote=(await db.doc(`quotations/${replacementHead.quoteId}`).get()).data();
 assert.equal(currentQuote.status,'submitted');assert.equal(currentQuote.termsVersion,currentTerms);
 assert.equal((await db.doc(`quotations/${original.id}`).get()).data().status,'superseded');
 const history=(await db.collection('quotations').where('serviceRequestId','==',replacementRequest.id).where('shopId','==','shop-one').get()).docs;
 assert.equal(history.filter(doc=>doc.data().status==='submitted').length,1);

 for(const competingAction of ['withdraw','accept']){
  const raceRequest=await requestWithVehicle(),old=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:raceRequest.id});
  await updateTerms(raceRequest.id);
  const terms=(await db.doc(`serviceRequests/${raceRequest.id}`).get()).data().termsVersion;
  const contenders=[
   call('shop-one','quoteSubmit',{...quote,scope:`Replacement ${competingAction}`,serviceRequestId:raceRequest.id,termsVersion:terms}),
   competingAction==='withdraw'?call('shop-one','quoteWithdraw',{id:old.id}):call('alice','quoteAccept',{id:old.id}),
  ];
  const results=await Promise.allSettled(contenders);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const head=(await db.doc(`quotationHeads/${quoteId(raceRequest.id,'shop-one')}`).get()).data();
  const headQuote=(await db.doc(`quotations/${head.quoteId}`).get()).data();
  assert.equal(headQuote.serviceRequestId,raceRequest.id);assert.equal(headQuote.shopId,'shop-one');
  if(competingAction==='withdraw'){
   const previousQuote=(await db.doc(`quotations/${old.id}`).get()).data();
   if(results[1].status==='fulfilled'){
    assert.equal(head.quoteId,old.id);assert.equal(headQuote.status,'withdrawn');
    assert.equal(previousQuote.status,'withdrawn');
   }else{
    assert.notEqual(head.quoteId,old.id);assert.equal(headQuote.status,'submitted');
    assert.equal(headQuote.termsVersion,terms);assert.equal(previousQuote.status,'superseded');
   }
  }else{
    const booking=await db.doc(`bookings/${raceRequest.id}`).get();
    if(results[1].status==='fulfilled'){
     assert.equal(head.quoteId,old.id);assert.equal(headQuote.status,'accepted');
     assert.equal(headQuote.termsVersion,terms-1);assert.equal(booking.exists,true);
     assert.equal(booking.data().quoteId,old.id);
    }else{
     assert.notEqual(head.quoteId,old.id);assert.equal(headQuote.status,'submitted');
     assert.equal(headQuote.termsVersion,terms);assert.equal(booking.exists,false);
     assert.equal((await db.doc(`quotations/${old.id}`).get()).data().status,'superseded');
    }
   }
  const quotes=(await db.collection('quotations').where('serviceRequestId','==',raceRequest.id).where('shopId','==','shop-one').get()).docs;
  assert.ok(quotes.every(doc=>doc.data().serviceRequestId===raceRequest.id&&doc.data().shopId==='shop-one'));
  assert.ok(quotes.filter(doc=>doc.data().status==='submitted').length<=1);
 }
});

test('Firestore serializes deposit and concurrent outstanding-balance settlement without overpayment',async()=>{
 const vehicleSaved=await call('alice','vehicleSave',vehicle),request=await call('alice','requestCreate',{...details,vehicleId:vehicleSaved.id});
 const submitted=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:request.id,depositType:'percentage',depositValue:25});
 const booking=await call('alice','quoteAccept',{id:submitted.id,paymentMethod:'pay_deposit'});
 const pending=(await db.doc(`bookings/${booking.id}`).get()).data();
 assert.equal(booking.id,request.id);assert.equal(pending.depositAmountCents,43750);assert.equal(pending.paidCents,0);
 const deposit=await db.doc(`bookings/${booking.id}/paymentAttempts/${booking.paymentAttemptId}`).get();
 assert.equal(deposit.data().amountCents,43750);assert.equal(deposit.data().status,'pending');
 await call('alice','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'});
 let balance=(await db.doc(`bookings/${booking.id}`).get()).data();
 assert.equal(balance.paymentStatus,'partially_paid');assert.equal(balance.paidCents,43750);assert.equal(balance.balanceDueCents,131250);

 const starts=await Promise.allSettled([
  call('alice','paymentStart',{id:booking.id}),
  call('alice','paymentStart',{id:booking.id}),
 ]);
 assert.equal(starts.filter(result=>result.status==='fulfilled').length,1);
 const started=starts.find(result=>result.status==='fulfilled').value;
 const attempt=(await db.doc(`bookings/${booking.id}/paymentAttempts/${started.paymentAttemptId}`).get()).data();
 assert.equal(attempt.amountCents,131250);assert.equal(attempt.status,'pending');
 await assert.rejects(()=>call('alice','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'}),{code:'failed-precondition'});
 const settlements=await Promise.allSettled([
  call('alice','paymentMockResult',{id:booking.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),
  call('alice','paymentMockResult',{id:booking.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),
 ]);
 assert.equal(settlements.filter(result=>result.status==='fulfilled').length,1);
 balance=(await db.doc(`bookings/${booking.id}`).get()).data();
 assert.equal(balance.paymentStatus,'paid');assert.equal(balance.paidCents,balance.totalCents);assert.equal(balance.balanceDueCents,0);
 assert.equal((await db.doc(`paymentReceipts/${started.paymentAttemptId}`).get()).exists,true);
});

test('concurrent acceptance of different offers commits exactly one booking, selected quote and audit',async()=>{
 const offered=await offers();
 const outcomes=await Promise.allSettled([call('alice','quoteAccept',{id:offered.first}),call('alice','quoteAccept',{id:offered.second})]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 const booking=(await db.doc(`bookings/${offered.requestId}`).get()).data(),request=(await db.doc(`serviceRequests/${offered.requestId}`).get()).data();
 const quotes=await db.collection('quotations').where('serviceRequestId','==',offered.requestId).get();assert.equal(quotes.docs.filter(d=>d.data().status==='accepted').length,1);
 assert.equal(request.acceptedQuoteId,booking.quoteId);assert.equal((await db.collection('bookings').get()).size,1);assert.equal((await acceptanceAudits(offered.requestId)).length,1);
 const competitor=booking.shopId==='shop-one'?'shop-two':'shop-one',view=await call(competitor,'request',{id:offered.requestId});
 assert.equal(view.request.acceptedQuoteId,undefined);assert.equal(view.request.bookingId,undefined);assert.equal(view.quotes.length,1);assert.equal(view.quotes[0].status,'submitted');
});

test('concurrent acceptance of the same quote with distinct retry keys returns the one durable booking',async()=>{
 const offered=await offers(),results=await Promise.all([call('alice','quoteAccept',{id:offered.first,requestId:'device-one'}),call('alice','quoteAccept',{id:offered.first,requestId:'device-two'})]);
 assert.equal(results[0].id,results[1].id);assert.deepEqual(results.map(r=>r.existingBooking).sort(),[false,true]);assert.equal(results.find(r=>r.existingBooking).paymentAttemptId,null);assert.equal(results[0].id,offered.requestId);assert.equal((await db.collection('bookings').get()).size,1);assert.equal((await acceptanceAudits(offered.requestId)).length,1);
});

test('acceptance racing withdrawal or request closure never books an unavailable offer',async()=>{
 for(const action of ['withdraw','close']){
  const offered=await offers();
  const results=await Promise.allSettled([call('alice','quoteAccept',{id:offered.first}),action==='withdraw'?call('shop-one','quoteWithdraw',{id:offered.first}):call('alice','requestClose',{id:offered.requestId})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const booking=await db.doc(`bookings/${offered.requestId}`).get(),q=(await db.doc(`quotations/${offered.first}`).get()).data(),r=(await db.doc(`serviceRequests/${offered.requestId}`).get()).data();
  if(booking.exists){assert.equal(q.status,'accepted');assert.equal(r.status,'booked');assert.equal(results[0].status,'fulfilled');}
  else{assert.equal(results[0].status,'rejected');assert.equal(action==='withdraw'?q.status:r.status,action==='withdraw'?'withdrawn':'closed');}
 }
});

test('confirmation and competing cancellations serialize without reviving a cancelled booking',async()=>{
 const offered=await offers(),accepted=await call('alice','quoteAccept',{id:offered.first});
 const results=await Promise.allSettled([call('shop-one','bookingConfirm',{id:accepted.id,...futureAppointment}),call('alice','bookingCancel',{id:accepted.id,reason:'Customer changed plans'})]);
 assert.equal(results[1].status,'fulfilled');assert.equal((await db.doc(`bookings/${accepted.id}`).get()).data().status,'cancelled');
 await assert.rejects(()=>call('shop-one','bookingConfirm',{id:accepted.id,...futureAppointment}),{code:'failed-precondition'});
 const again=await offers(),next=await call('alice','quoteAccept',{id:again.first});
 const cancellations=await Promise.allSettled([call('alice','bookingCancel',{id:next.id,reason:'Customer reason'}),call('shop-one','bookingCancel',{id:next.id,reason:'Shop reason'})]);
 assert.equal(cancellations.filter(r=>r.status==='fulfilled').length,1);
 const audits=(await db.collection('auditLogs').where('target','==',next.id).get()).docs.filter(d=>d.data().action==='marketplace.bookingCancel');assert.equal(audits.length,1);
});

test('expired offers, ineligible parties and unrelated accounts cannot create or access bookings',async()=>{
 const offered=await offers();
 await db.doc(`quotations/${offered.first}`).update({validUntil:Timestamp.fromMillis(Date.now()-1)});
 await assert.rejects(()=>call('alice','quoteAccept',{id:offered.first}),{code:'failed-precondition'});
 await db.doc('users/shop-two').update({verificationStatus:'pending'});
 await assert.rejects(()=>call('alice','quoteAccept',{id:offered.second}),{code:'failed-precondition'});assert.equal((await db.collection('bookings').get()).size,0);
 await db.doc('users/shop-two').update({verificationStatus:'approved'});
 const accepted=await call('alice','quoteAccept',{id:offered.second});
 for(const uid of ['bob','shop-one']){await assert.rejects(()=>call(uid,'booking',{id:accepted.id}),{code:'not-found'});assert.equal((await call(uid,'bookings')).items.length,0);await assert.rejects(()=>call(uid,'bookingCancel',{id:accepted.id,reason:'Unauthorized'}),{code:'not-found'});}
 for(const uid of ['admin','pending'])await assert.rejects(()=>call(uid,'bookings'),{code:'permission-denied'});
 await db.doc('users/alice').update({accountStatus:'suspended'});await auth.updateUser('alice',{disabled:true});
 await assert.rejects(()=>call('shop-two','bookingConfirm',{id:accepted.id,...futureAppointment}),{code:'failed-precondition'});
 await call('shop-two','bookingCancel',{id:accepted.id,reason:'Customer is unavailable'});
 assert.equal((await call('shop-two','booking',{id:accepted.id})).booking.status,'cancelled');
});
test('real authenticated HTTP workflow registers a vehicle, publishes a request, and returns the private quote to its owner',async()=>{
 const owner=await signIn('alice'),shop=await signIn('shop-one');
 const api=async(token,op,data={})=>(await http(app).post('/api/marketplace').set('Authorization',`Bearer ${token}`).send(body(op,data)).expect(200)).body.data;
 await http(app).post('/api/marketplace').send({op:'vehicles'}).expect(401);
 const v=await api(owner,'vehicleSave',vehicle),r=await api(owner,'requestCreate',{...details,vehicleId:v.id});
 const jobs=await api(shop,'requests',{feed:'open'});assert.equal(jobs.items[0].id,r.id);assert.equal(jobs.items[0].vehicle.registration,undefined);assert.equal(jobs.items[0].ownerId,undefined);
 const requestTerms=(await db.doc(`serviceRequests/${r.id}`).get()).data();
 const q=await api(shop,'quoteSubmit',{...quote,serviceRequestId:r.id,termsVersion:requestTerms.termsVersion});
 const received=await api(owner,'request',{id:r.id});assert.equal(received.quotes.length,1);assert.equal(received.quotes[0].id,q.id);assert.equal(received.quotes[0].totalCents,175000);assert.equal(received.quotes[0].currency,'ZAR');
 await api(shop,'quoteWithdraw',{id:q.id});assert.equal((await api(owner,'request',{id:r.id})).quotes[0].status,'withdrawn');
 await api(owner,'requestClose',{id:r.id});assert.equal((await api(owner,'request',{id:r.id})).request.status,'closed');
});
test('owners and shops cannot cross vehicle, direct request or competing quotation boundaries',async()=>{
 const v=await call('alice','vehicleSave',vehicle);
 await assert.rejects(()=>call('bob','vehicleSave',{...vehicle,id:v.id,version:1}));
 await assert.rejects(()=>call('bob','requestCreate',{...details,vehicleId:v.id}));
 const direct=await call('alice','requestCreate',{...details,vehicleId:v.id,visibility:'direct',shopId:'shop-one'});
 await assert.rejects(()=>call('shop-two','request',{id:direct.id}));
 await assert.rejects(()=>call('shop-two','quoteSubmit',{...quote,serviceRequestId:direct.id}));
 assert.equal((await call('shop-two','requests',{feed:'direct'})).items.length,0);
 const open=await call('alice','requestCreate',{...details,vehicleId:v.id});
 await call('shop-one','quoteSubmit',{...quote,serviceRequestId:open.id});
 assert.equal((await call('shop-two','request',{id:open.id})).quotes.length,0);
 await assert.rejects(()=>call('bob','request',{id:open.id}));
 await assert.rejects(()=>call('bob','requestClose',{id:open.id}));
 assert.equal((await call('bob','vehicles')).items.length,0);
});
test('unapproved, restricted, unverified and revoked identities cannot operate the marketplace',async()=>{
 for(const uid of ['pending','admin'])await assert.rejects(()=>call(uid,'requests',{feed:'open'}),{code:'permission-denied'});
 for(const status of ['rejected','reviewing','pending']){await db.doc('users/shop-one').update({verificationStatus:status});await assert.rejects(()=>call('shop-one','requests',{feed:'open'}),{code:'permission-denied'});}
 for(const status of ['suspended','archived']){await db.doc('users/alice').update({accountStatus:status});await assert.rejects(()=>call('alice','vehicles'),{code:'permission-denied'});}
 await db.doc('users/alice').update({accountStatus:'active'});await auth.updateUser('alice',{emailVerified:false});await assert.rejects(()=>call('alice','vehicles'),{code:'permission-denied'});
 await auth.updateUser('alice',{emailVerified:true});await assert.rejects(()=>services.marketplace({auth:{uid:'alice',token:{email_verified:true,auth_time:1}},data:{op:'vehicles'}}),{code:'unauthenticated'});
});
test('idempotent creation, optimistic vehicle edits, closed requests and duplicate quotes are enforced by real transactions',async()=>{
 const [one,two]=await Promise.all([call('alice','vehicleSave',{...vehicle,requestId:'same-vehicle'}),call('alice','vehicleSave',{...vehicle,requestId:'same-vehicle'})]);assert.equal(one.id,two.id);
 await assert.rejects(()=>call('alice','vehicleSave',{...vehicle,model:'Different',requestId:'same-vehicle'}),{code:'already-exists'});
 const edits=await Promise.allSettled([call('alice','vehicleSave',{...vehicle,id:one.id,version:1,colour:'Red'}),call('alice','vehicleSave',{...vehicle,id:one.id,version:1,colour:'Silver'})]);assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);
 const r=await call('alice','requestCreate',{...details,vehicleId:one.id});
 const qs=await Promise.allSettled([call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id}),call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id})]);assert.equal(qs.filter(x=>x.status==='fulfilled').length,1);
 await call('alice','requestClose',{id:r.id});await assert.rejects(()=>call('shop-two','quoteSubmit',{...quote,serviceRequestId:r.id}));
});
test('request snapshots remain stable after vehicle edits and archived resources cannot start new work',async()=>{
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id});
 await call('alice','vehicleSave',{...vehicle,id:v.id,version:1,colour:'Red'});
 const published=(await call('alice','request',{id:r.id})).request;assert.equal(published.vehicle.colour,'Blue');assert.equal(published.vehicle.registration,undefined);
 await call('alice','vehicleArchive',{id:v.id,version:2,archived:true});await assert.rejects(()=>call('alice','requestCreate',{...details,vehicleId:v.id}));
 await call('alice','vehicleArchive',{id:v.id,version:3,archived:false});await db.doc('serviceCategories/body').update({archived:true});await assert.rejects(()=>call('alice','requestCreate',{...details,vehicleId:v.id}));
});
test('paginated vehicle reads stay owner-scoped and include every matching record once',async()=>{
 const batch=db.batch();for(let i=0;i<25;i++){batch.set(db.doc(`vehicles/alice-${i}`),{...vehicle,ownerId:'alice',archived:false,version:1});batch.set(db.doc(`vehicles/bob-${i}`),{...vehicle,ownerId:'bob',archived:false,version:1});}await batch.commit();
 let cursor=null,ids=[];do{const page=await call('alice','vehicles',{cursor});assert.ok(page.items.length<=20);ids.push(...page.items.map(v=>v.id));cursor=page.cursor;}while(cursor);
 assert.equal(ids.length,25);assert.equal(new Set(ids).size,25);assert.ok(ids.every(id=>id.startsWith('alice-')));
});


test('HTTP simulation gate defaults closed without disabling ordinary marketplace reads',async()=>{
 const closedServices=createServices({db,auth,storage:{},mockPaymentEnv:{}}),closed=createApp({auth,services:closedServices}),offered=await offers(),token=await signIn('alice');
 await http(closed).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('vehicles')).expect(200);
 for(const [op,data] of [['quoteAccept',{id:offered.first,paymentMethod:'pay_in_store'}],['paymentStart',{id:'none'}],['paymentRetry',{id:'none'}],['paymentMockResult',{id:'none',paymentAttemptId:'none',outcome:'successful'}],['paymentRecordInStore',{id:'none',method:'simulated_cash'}]]){
  const response=await http(closed).post('/api/marketplace').set('Authorization','Bearer '+token).send(body(op,data)).expect(409);
  assert.match(response.body.error.message,/Mock payments are disabled/);
 }
 assert.equal((await db.collection('bookings').get()).size,0);
});

async function depositBooking(){
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id}),q=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id,depositType:'percentage',depositValue:25}),b=await call('alice','quoteAccept',{id:q.id,paymentMethod:'pay_deposit'});
 await call('alice','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'});return b;
}
async function assertSettledOnce(b){
 const saved=(await db.doc('bookings/'+b.id).get()).data(),attempts=await db.collection('bookings/'+b.id+'/paymentAttempts').get();
 assert.equal(saved.paidCents,175000);assert.equal(saved.balanceDueCents,0);assert.equal(saved.paymentStatus,'paid');
 const paid=attempts.docs.filter(d=>d.data().status==='paid');assert.equal(paid.length,2);assert.equal(paid.reduce((sum,d)=>sum+d.data().amountCents,0),175000);
 for(const d of paid){const receipt=await db.doc('paymentReceipts/'+d.id).get();assert.equal(receipt.data().amountCents,d.data().amountCents);assert.equal(receipt.data().testTransaction,true);}
 assert.equal((await db.collection('paymentReceipts').where('bookingId','==',b.id).get()).size,2);
 return saved;
}

test('Firestore serializes online balance initiation against in-store settlement with exactly one winning settlement',async()=>{
 for(let run=0;run<3;run++){
  const b=await depositBooking();await call('shop-one','bookingConfirm',{id:b.id,...futureAppointment});
  const before=(await db.doc('bookings/'+b.id).get()).data();
  const results=await Promise.allSettled([call('alice','paymentStart',{id:b.id}),call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_cash'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  if(results[0].status==='fulfilled')await call('alice','paymentMockResult',{id:b.id,paymentAttemptId:results[0].value.paymentAttemptId,outcome:'successful'});
  const saved=await assertSettledOnce(b);assert.equal(saved.status,'confirmed');assert.equal(saved.appointmentAt.toMillis(),before.appointmentAt.toMillis());assert.equal(saved.confirmedAt.toMillis(),before.confirmedAt.toMillis());
 }
});

test('Firestore serializes a pending online result against in-store recording without duplicate receipts',async()=>{
 for(let run=0;run<3;run++){
  const b=await depositBooking(),started=await call('alice','paymentStart',{id:b.id});
  const results=await Promise.allSettled([call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_eft'})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.code,'failed-precondition');
  await assertSettledOnce(b);
 }
});

test('Firestore cancellation racing a payment result retains only payments committed before cancellation',async()=>{
 for(let run=0;run<3;run++){
  const b=await depositBooking(),started=await call('alice','paymentStart',{id:b.id});
  const results=await Promise.allSettled([call('alice','bookingCancel',{id:b.id,reason:'Synthetic cancellation race'}),call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'})]);
  assert.equal(results[0].status,'fulfilled');
  const saved=(await db.doc('bookings/'+b.id).get()).data(),receipt=await db.doc('paymentReceipts/'+started.paymentAttemptId).get();
  assert.equal(saved.status,'cancelled');assert.equal(saved.paymentReconciliationStatus,'simulated_reconciliation_required');assert.equal(saved.paidCents+saved.balanceDueCents,175000);
  if(results[1].status==='fulfilled'){assert.equal(saved.paidCents,175000);assert.equal(receipt.exists,true);}else{assert.equal(results[1].reason.code,'failed-precondition');assert.equal(saved.paidCents,43750);assert.equal(receipt.exists,false);assert.equal(saved.balanceDueCents,131250);}
  const before=JSON.stringify((await call('alice','booking',{id:b.id})));
  await assert.rejects(()=>call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),{code:'failed-precondition'});
  await assert.rejects(()=>call('alice','paymentStart',{id:b.id}),{code:'failed-precondition'});
  await assert.rejects(()=>call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_cash'}),{code:'failed-precondition'});
  assert.equal(JSON.stringify(await call('alice','booking',{id:b.id})),before);
 }
});

test('Firestore cancellation committed first rejects all later payment results without new accounting or receipts',async()=>{
 const b=await depositBooking(),started=await call('alice','paymentStart',{id:b.id});await call('alice','bookingCancel',{id:b.id,reason:'Cancel before result'});
 const before=JSON.stringify(await call('alice','booking',{id:b.id}));
 await assert.rejects(()=>call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),{code:'failed-precondition'});
 assert.equal(JSON.stringify(await call('alice','booking',{id:b.id})),before);assert.equal((await db.doc('paymentReceipts/'+started.paymentAttemptId).get()).exists,false);
});


test('Firestore renews an expired offer once under concurrent submissions and preserves deposit history',async()=>{
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id}),q=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id,depositType:'percentage',depositValue:25});
 await db.doc('quotations/'+q.id).update({validUntil:Timestamp.fromMillis(Date.now()-1)});const old=(await db.doc('quotations/'+q.id).get()).data();
 const input={...quote,serviceRequestId:r.id,termsVersion:1,items:[{description:'Renewal work',amountCents:200000}],depositType:'fixed',depositValue:50000};
 const outcomes=await Promise.allSettled([call('shop-one','quoteSubmit',{...input,requestId:'renew-device-a'}),call('shop-one','quoteSubmit',{...input,requestId:'renew-device-b'})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'already-exists');
 const winner=outcomes.find(r=>r.status==='fulfilled').value,head=(await db.doc('quotationHeads/'+quoteId(r.id,'shop-one')).get()).data(),prior=(await db.doc('quotations/'+q.id).get()).data(),fresh=(await db.doc('quotations/'+winner.id).get()).data();
 assert.notEqual(winner.id,q.id);assert.equal(head.quoteId,winner.id);assert.equal(prior.status,'superseded');assert.equal(prior.totalCents,old.totalCents);assert.equal(prior.depositAmountCents,old.depositAmountCents);assert.equal(prior.validUntil.toMillis(),old.validUntil.toMillis());assert.equal(fresh.depositAmountCents,50000);assert.equal(fresh.totalCents,200000);assert.equal(fresh.termsVersion,1);assert.ok(fresh.validUntil.toMillis()>Date.now());
 const records=await db.collection('quotations').where('serviceRequestId','==',r.id).get();assert.equal(records.size,2);assert.equal(records.docs.filter(d=>d.data().status==='submitted').length,1);
 await assert.rejects(()=>call('alice','quoteAccept',{id:q.id,paymentMethod:'pay_now'}),{code:'failed-precondition'});await call('alice','quoteAccept',{id:winner.id,paymentMethod:'pay_deposit'});
 await assert.rejects(()=>call('shop-one','quoteSubmit',{...input,requestId:'renew-booked'}),{code:'failed-precondition'});
});

test('Firestore expired acceptance racing renewal never books the expired offer',async()=>{
 const offered=await offers();await db.doc('quotations/'+offered.first).update({validUntil:Timestamp.fromMillis(Date.now()-1)});
 const outcomes=await Promise.allSettled([call('alice','quoteAccept',{id:offered.first}),call('shop-one','quoteSubmit',{...quote,serviceRequestId:offered.requestId,termsVersion:1})]);assert.equal(outcomes[0].status,'rejected');assert.equal(outcomes[0].reason.code,'failed-precondition');assert.equal(outcomes[1].status,'fulfilled');assert.equal((await db.doc('bookings/'+offered.requestId).get()).exists,false);
 assert.equal((await db.doc('quotationHeads/'+quoteId(offered.requestId,'shop-one')).get()).data().quoteId,outcomes[1].value.id);
});

test('Firestore checkout replay and concurrent R250/R750 confirmations preserve exact payment consent',async()=>{
 const v=await call('alice','vehicleSave',vehicle),request=await call('alice','requestCreate',{...details,vehicleId:v.id}),offer=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:request.id,items:[{description:'Exact R1000 total',amountCents:100000}],depositType:'fixed',depositValue:25000});
 const b=await call('alice','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit',requestId:'exact-checkout'});await call('alice','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'});const started=await call('alice','paymentStart',{id:b.id}),saved=(await db.doc('bookings/'+b.id).get()).data();
 assert.equal(saved.depositAmountCents,25000);assert.equal(saved.balanceDueCents,75000);
 const replay=await call('alice','quoteAccept',{id:saved.quoteId,paymentMethod:'pay_deposit'});assert.deepEqual(replay,{id:b.id,paymentAttemptId:null,existingBooking:true});
 const results=await Promise.allSettled([
  call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:saved.depositAmountCents,expectedCurrency:'ZAR',outcome:'successful'}),
  call('alice','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:saved.balanceDueCents,expectedCurrency:'ZAR',outcome:'successful'}),
 ]);assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'failed-precondition');assert.equal(results[1].status,'fulfilled');assert.equal(results[1].value.paymentStatus,'paid');const final=(await db.doc('bookings/'+b.id).get()).data();assert.equal(final.paidCents,100000);assert.equal(final.balanceDueCents,0);assert.equal((await db.doc('paymentReceipts/'+started.paymentAttemptId).get()).data().amountCents,75000);assert.equal((await db.collection('paymentReceipts').where('bookingId','==',b.id).get()).size,2);
 const replayOriginal=await call('alice','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit',requestId:'exact-checkout'});assert.deepEqual(replayOriginal,{id:b.id,paymentAttemptId:null,existingBooking:true});
});

test('authenticated HTTP results reject missing or mismatched confirmation context without a receipt',async()=>{
 const offered=await offers(),accepted=await call('alice','quoteAccept',{id:offered.first,paymentMethod:'pay_now'}),token=await signIn('alice');
 for(const expected of [{},{expectedBookingId:'other',expectedAmountCents:175000,expectedCurrency:'ZAR'},{expectedBookingId:accepted.id,expectedAmountCents:1,expectedCurrency:'ZAR'},{expectedBookingId:accepted.id,expectedAmountCents:175000,expectedCurrency:'USD'}]){
  const response=await http(app).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('paymentMockResult',{id:accepted.id,paymentAttemptId:accepted.paymentAttemptId,outcome:'successful',...expected})).expect(409);assert.match(response.body.error.message,/Refresh the booking/);
 }
 const booking=(await db.doc('bookings/'+accepted.id).get()).data();assert.equal(booking.paidCents,0);assert.equal(booking.balanceDueCents,175000);assert.equal((await db.doc('paymentReceipts/'+accepted.paymentAttemptId).get()).exists,false);
 const replay=await call('alice','quoteAccept',{id:offered.first,paymentMethod:'pay_now'});assert.equal(replay.existingBooking,true);assert.equal(replay.paymentAttemptId,null);
});


test('Phase 3 Firestore deposit and balance receipts are immutable snapshots, private, and idempotent under concurrent replay',async()=>{
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id,visibility:'direct',shopId:'shop-one'});
 const q=await call('shop-one','quoteSubmit',{...quote,serviceRequestId:r.id,depositType:'percentage',depositValue:25});
 const b=await call('alice','quoteAccept',{id:q.id,paymentMethod:'pay_deposit',requestId:'phase3-accept'});
 const payment={id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful',requestId:'phase3-payment'};
 const results=await Promise.all([call('alice','paymentMockResult',payment),call('alice','paymentMockResult',payment)]);assert.deepEqual(results[0],results[1]);
 const first=(await call('alice','receipt',{id:b.paymentAttemptId})).receipt;
 assert.equal(first.amountCents,43750);assert.equal(first.totalCents,175000);assert.equal(first.paidCentsAfter,43750);assert.equal(first.balanceDueCentsAfter,131250);assert.ok(Number.isFinite(first.issuedAt));assert.equal(first.method,'simulated_online');assert.equal(first.customer.id,'alice');assert.equal(first.shop.id,'shop-one');assert.equal(first.scope,quote.scope);
 await call('shop-one','bookingConfirm',{id:b.id,...futureAppointment});
 const final=await call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_card',requestId:'phase3-store'});await call('shop-one','paymentRecordInStore',{id:b.id,method:'simulated_card',requestId:'phase3-store'});
 const second=(await call('shop-one','receipt',{id:final.paymentAttemptId})).receipt;
 assert.equal(second.amountCents,131250);assert.equal(second.paidCentsAfter,175000);assert.equal(second.balanceDueCentsAfter,0);
 assert.equal((await call('alice','booking',{id:b.id})).booking.status,'confirmed');
 await call('alice','bookingCancel',{id:b.id,reason:'Synthetic cancellation'});
 assert.deepEqual((await call('shop-one','receipt',{id:b.paymentAttemptId})).receipt,first);
 for(const uid of ['bob','shop-two'])await assert.rejects(()=>call(uid,'receipt',{id:b.paymentAttemptId}),{code:'not-found'});
 const receipts=await db.collection('paymentReceipts').get();assert.equal(receipts.size,2);
 const paidNotices=(await db.collection('notifications').where('event','==','simulated_payment_paid').get()).docs;assert.equal(paidNotices.length,2);
 assert.deepEqual(paidNotices[0].data().target,{type:'receipt',id:b.paymentAttemptId,bookingId:b.id});assert.equal(paidNotices[0].data().amountCents,43750);
 const paidEmails=(await db.collection('emailOutbox').where('event','==','simulated_payment_paid').get()).docs;assert.equal(paidEmails.length,2);
 for(const doc of paidEmails){const value=doc.data();assert.equal(value.transport,'test_outbox');assert.equal(value.deliveryStatus,'test_sink_only');assert.match(value.body,/SIMULATED \/ TEST/);assert.match(value.body,/ZAR 437.50/);assert.ok(!JSON.stringify(value).includes('@'));}
 const token=await signIn('bob');await http(app).post('/api/marketplace').set('Authorization','Bearer '+token).send(body('receipt',{id:b.paymentAttemptId})).expect(404);
 await http(app).post('/api/marketplace').send(body('receipt',{id:b.paymentAttemptId})).expect(401);
});

test('Phase 3 Firestore notifications paginate timestamp ties chronologically and preserve recipient-only read history',async()=>{
 const batch=db.batch();
 for(let i=0;i<45;i++)batch.create(db.doc('notifications/n'+String(i).padStart(2,'0')),{recipientUid:'alice',event:'booking_created',bookingId:'test-booking',readAt:null,createdAt:new Timestamp(100+Math.floor(i/3),123456789)});
 batch.create(db.doc('notifications/foreign'),{recipientUid:'bob',readAt:null,createdAt:Timestamp.now()});await batch.commit();
 const first=await call('alice','notifications'),second=await call('alice','notifications',{cursor:first.cursor}),third=await call('alice','notifications',{cursor:second.cursor});
 assert.deepEqual([...first.items,...second.items,...third.items].map(n=>n.id),Array.from({length:45},(_,i)=>'n'+String(44-i).padStart(2,'0')));assert.equal(third.cursor,null);
 assert.equal((await call('bob','notifications')).items.length,1);
 await assert.rejects(()=>call('bob','notifications',{cursor:first.cursor}),{code:'not-found'});
 await assert.rejects(()=>call('shop-one','notificationRead',{id:'n44'}),{code:'not-found'});
 await Promise.all([call('alice','notificationRead',{id:'n44',requestId:'read-once'}),call('alice','notificationRead',{id:'n44',requestId:'read-once'})]);
 const timestamp=(await db.doc('notifications/n44').get()).data().readAt;assert.ok(timestamp instanceof Timestamp);
 await call('alice','notificationRead',{id:'n44'});assert.ok((await db.doc('notifications/n44').get()).data().readAt.isEqual(timestamp));
 assert.equal((await call('alice','notifications')).items[0].readAt,timestamp.toMillis());assert.equal((await db.collection('notifications').get()).size,46);
});

test('Phase 3 Firestore historical receipts never reconstruct missing balances and failed payments have no receipts',async()=>{
 const offered=await offers(),b=await call('alice','quoteAccept',{id:offered.first,paymentMethod:'pay_now'});
 await call('alice','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'failed'});
 assert.equal((await db.doc('paymentReceipts/'+b.paymentAttemptId).get()).exists,false);
 await db.doc('paymentReceipts/old-receipt').create({bookingId:b.id,paymentAttemptId:'old-receipt',amountCents:123,currency:'ZAR',simulated:true,testTransaction:true,issuedAt:Timestamp.fromMillis(1000)});
 const value=(await call('alice','receipt',{id:'old-receipt'})).receipt;
 assert.equal(value.amountCents,123);assert.equal(value.balanceDueCentsAfter,null);assert.equal(value.paidCentsAfter,null);assert.equal(value.totalCents,null);assert.equal(value.method,null);assert.equal(value.historicalSnapshotUnavailable,true);
});

test('Find Jobs lists newest requests first across tied timestamps and keeps direct requests private',async()=>{
 const v=await call('alice','vehicleSave',vehicle);
 const batch=db.batch();
 for(let i=0;i<25;i++)batch.set(db.doc('serviceRequests/job-'+String(i).padStart(2,'0')),{...details,ownerId:'alice',vehicleId:v.id,vehicle,categoryName:'Body kit',status:'open',createdAt:Timestamp.fromMillis(1000+Math.floor(i/2)),photoIds:[]});
 batch.set(db.doc('serviceRequests/private-newest'),{...details,visibility:'direct',shopId:'shop-one',ownerId:'alice',vehicleId:v.id,vehicle,status:'open',createdAt:Timestamp.fromMillis(999999)});
 await batch.commit();
 const first=await call('shop-two','requests',{feed:'open'});assert.equal(first.items[0].id,'job-24');assert.equal(first.items.length,20);
 const second=await call('shop-two','requests',{feed:'open',cursor:first.cursor});assert.equal(second.items.length,5);assert.equal(second.cursor,null);
 assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,25);
 const fresh=await call('alice','requestCreate',{...details,vehicleId:v.id});
 assert.equal((await call('shop-two','requests',{feed:'open'})).items[0].id,fresh.id);
 assert.equal((await call('shop-two','requests',{feed:'direct'})).items.length,0);
 assert.equal((await call('shop-one','requests',{feed:'direct'})).items[0].id,'private-newest');
});

test('shop location ownership and request coordinate versioning work with real emulator Auth and Firestore',async()=>{
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id,serviceLocation:{latitude:0,longitude:0}});
 const full={...quote,serviceRequestId:r.id,scopeConfirmed:true,allChargesIncluded:true};
 const a=await call('shop-one','quoteSubmit',full),b=await call('shop-two','quoteSubmit',full);
 const locate=(uid,coordinates,expectedCoordinates,key)=>services.completeProfile({auth:identity(uid),data:{op:'shopLocationSave',coordinates,expectedCoordinates,requestId:key}});
 await locate('shop-one',{latitude:0,longitude:1},null,'emulator-first-location');await locate('shop-two',{latitude:0,longitude:2},null,'emulator-second-location');
 let ranked=(await call('alice','request',{id:r.id})).recommendations;
 assert.equal(ranked.recommendedId,a.id);assert.ok(Math.abs(ranked.entries.find(q=>q.id===a.id).distanceKm-111.195)<0.01);
 await locate('shop-one',{latitude:0,longitude:3},{latitude:0,longitude:1},'emulator-move-location');
 ranked=(await call('alice','request',{id:r.id})).recommendations;assert.equal(ranked.recommendedId,b.id);
 await assert.rejects(()=>locate('alice',{latitude:1,longitude:1},null,'emulator-owner-location'),{code:'permission-denied'});
 await assert.rejects(()=>services.completeProfile({auth:identity('shop-one'),data:{op:'shopLocationSave',uid:'shop-two',coordinates:null,expectedCoordinates:null,requestId:'forged-location-target'}}),{code:'invalid-argument'});
 assert.equal((await db.doc('users/shop-one').get()).data().shop.city,'Johannesburg');
 const before=(await db.doc('serviceRequests/'+r.id).get()).data();
 await call('alice','requestUpdate',{...details,id:r.id,version:before.version,serviceLocation:{latitude:1,longitude:0}});
 assert.equal((await db.doc('serviceRequests/'+r.id).get()).data().termsVersion,before.termsVersion+1);
 assert.equal((await call('alice','request',{id:r.id})).recommendations.recommendedId,null);
 await assert.rejects(()=>call('alice','quoteAccept',{id:b.id}),{code:'failed-precondition'});
});

const chatCall=(uid,op,data={})=>services.messaging({auth:identity(uid),data:{op,...(['open','enquire','consent','send','read'].includes(op)?{requestId:`chat-emulator-${++sequence}`} : {}),...data}});

test('authenticated messaging HTTP denies visibility-only initiation and requires customer approval for enquiries',async()=>{
 const v=await call('alice','vehicleSave',vehicle),r=await call('alice','requestCreate',{...details,vehicleId:v.id});
 const shop=await signIn('shop-one'),owner=await signIn('alice'),other=await signIn('shop-two');
 const api=(token,data)=>http(app).post('/api/messaging').set('Authorization',`Bearer ${token}`).send(data);
 await api(shop,{op:'open',serviceRequestId:r.id,requestId:'no-relationship'}).expect(403);
 const requested=(await api(shop,{op:'enquire',serviceRequestId:r.id,reason:'Please approve discussing the service scope.',requestId:'ask-owner'}).expect(200)).body.data;
 await api(shop,{op:'send',id:requested.id,text:'Unapproved chat',requestId:'pending-chat'}).expect(403);
 await api(other,{op:'get',id:requested.id}).expect(404);
 await api(owner,{op:'consent',id:requested.id,decision:'approved',requestId:'approve-chat'}).expect(200);
 await api(shop,{op:'send',id:requested.id,text:'Approved discussion',requestId:'approved-send'}).expect(200);
 await api(shop,{op:'send',id:requested.id,text:'Approved discussion',requestId:'approved-send'}).expect(200);
 const received=(await api(owner,{op:'get',id:requested.id}).expect(200)).body.data;
 assert.equal(received.messages.length,1);assert.equal(received.conversation.unreadCount,1);
 assert.equal((await db.collection('notifications').where('event','==','message_received').get()).docs.length,1);
 await api(owner,{op:'consent',id:requested.id,decision:'revoked',requestId:'revoke-chat'}).expect(200);
 await api(shop,{op:'send',id:requested.id,text:'After revocation',requestId:'revoked-send'}).expect(403);
 const history=(await api(owner,{op:'get',id:requested.id}).expect(200)).body.data;assert.equal(history.messages.length,1);assert.equal(history.conversation.canSend,false);
 await api(shop,{op:'send',id:requested.id,text:'Spoof',senderId:'alice',requestId:'spoofed-sender'}).expect(400);
});

test('Firestore creates one canonical conversation and serialises messages, unread acknowledgements and paging',async()=>{
 const offered=await offers();
 const opened=await Promise.all([chatCall('shop-one','open',{serviceRequestId:offered.requestId}),chatCall('shop-one','open',{serviceRequestId:offered.requestId}),chatCall('shop-one','open',{serviceRequestId:offered.requestId})]);
 const id=opened[0].id;assert.ok(opened.every(row=>row.id===id));assert.equal((await db.collection('conversations').get()).size,1);
 await Promise.all([chatCall('shop-one','send',{id,text:'Concurrent first',requestId:'send-a'}),chatCall('shop-one','send',{id,text:'Concurrent second',requestId:'send-b'})]);
 let received=await chatCall('alice','get',{id});assert.deepEqual(received.messages.map(row=>row.sequence),[1,2]);assert.equal(received.conversation.unreadCount,2);
 await chatCall('alice','read',{id,through:1});assert.equal((await chatCall('alice','get',{id})).conversation.unreadCount,1);
 for(let i=0;i<21;i++){
  if(i%5===0)await db.doc('conversations/'+id).update({shopSendWindow:{start:Date.now()-61000,count:0}});
  await chatCall('shop-one','send',{id,text:'Paginated '+i});
 }
 received=await chatCall('alice','get',{id});assert.equal(received.messages.length,20);assert.ok(received.cursor);
 const older=await chatCall('alice','get',{id,cursor:received.cursor});assert.deepEqual(older.messages.map(row=>row.sequence),[1,2,3]);assert.equal(older.cursor,null);
 assert.equal((await chatCall('bob','list')).items.length,0);assert.equal((await chatCall('shop-two','list')).items.length,0);
 assert.equal((await db.doc('serviceRequests/'+offered.requestId).get()).data().status,'open');assert.equal((await db.collection('bookings').get()).size,0);
});

test('Firestore messaging checks current quotations, direct invitations and continuing booking authority without changing business terms',async()=>{
 const offered=await offers(),c=await chatCall('shop-one','open',{serviceRequestId:offered.requestId});
 await chatCall('shop-one','send',{id:c.id,text:'Before expiry'});
 await db.doc('quotations/'+offered.first).update({validUntil:Timestamp.fromMillis(Date.now()-1)});
 await assert.rejects(()=>chatCall('shop-one','send',{id:c.id,text:'Expired quote'}),{code:'permission-denied'});
 assert.equal((await chatCall('alice','get',{id:c.id})).messages.length,1);
 await db.doc('quotations/'+offered.first).update({validUntil:Timestamp.fromMillis(Date.now()+86400000)});
 await call('alice','quoteAccept',{id:offered.first});await db.doc('quotations/'+offered.first).update({validUntil:Timestamp.fromMillis(Date.now()-1)});
 await chatCall('shop-one','send',{id:c.id,text:'Booked appointment question'});
 assert.equal((await chatCall('alice','get',{id:c.id})).conversation.bookingId,offered.requestId);
 await call('alice','bookingCancel',{id:offered.requestId,reason:'Synthetic cancellation'});
 await assert.rejects(()=>chatCall('shop-one','send',{id:c.id,text:'Cancelled booking'}),{code:'permission-denied'});
 const direct=await call('alice','requestCreate',{...details,vehicleId:offered.vehicleId,visibility:'direct',shopId:'shop-one'});
 await assert.rejects(()=>chatCall('shop-two','open',{serviceRequestId:direct.id}),{code:'not-found'});
 const invited=await chatCall('shop-one','open',{serviceRequestId:direct.id});await chatCall('shop-one','send',{id:invited.id,text:'Invited discussion'});
 await call('alice','requestClose',{id:direct.id});assert.equal((await chatCall('shop-one','get',{id:invited.id})).conversation.canSend,false);
});
