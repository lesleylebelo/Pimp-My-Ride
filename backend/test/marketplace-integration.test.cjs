const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const http=require('supertest'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const firebase=initializeApp({projectId:'demo-pmr-security'},'marketplace-tests'),db=getFirestore(firebase),auth=getAuth(firebase);
const services=createServices({db,auth,storage:{}});let app,sequence=0;
const vehicle={make:'Test make',model:'Test model',year:2020,colour:'Blue',registration:'TEST 123 GP'};
const details={title:'Body kit installation',description:'Supply and fit a synthetic example body kit.',categoryId:'body',city:'Johannesburg',budgetMinCents:100000,budgetMaxCents:300000,preferredDate:'',visibility:'open'};
const quote={scope:'Fit and inspect the example kit.',items:[{description:'Fitment',amountCents:125000},{description:'Paint',amountCents:50000}],completionDays:5,warranty:'12 months workmanship',validForDays:14};
const identity=uid=>({uid,token:{email_verified:true,auth_time:Math.floor(Date.now()/1000)+1}});
const writes=new Set(['vehicleSave','vehicleArchive','requestCreate','requestClose','quoteSubmit','quoteWithdraw','quoteAccept','bookingConfirm','bookingCancel']);
const body=(op,data={})=>({op,...(writes.has(op)?{requestId:`emulator-${++sequence}`} : {}),...data});
const call=(uid,op,data={})=>services.marketplace({auth:identity(uid),data:body(op,data)});
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
async function acceptanceAudits(id){return (await db.collection('auditLogs').where('target','==',id).get()).docs.filter(d=>d.data().action==='marketplace.quoteAccept');}

test('authenticated HTTP acceptance creates a booking that the selected shop confirms and customer cancels',async()=>{
 const offered=await offers(),owner=await signIn('alice'),shop=await signIn('shop-one'),other=await signIn('shop-two');
 const api=async(token,op,data={})=>(await http(app).post('/api/marketplace').set('Authorization',`Bearer ${token}`).send(body(op,data)).expect(200)).body.data;
 const accepted=await api(owner,'quoteAccept',{id:offered.first,requestId:'accept-http'});assert.equal(accepted.id,offered.requestId);
 assert.deepEqual(await api(owner,'quoteAccept',{id:offered.first,requestId:'accept-http'}),accepted);
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
 assert.deepEqual(results[0],results[1]);assert.equal(results[0].id,offered.requestId);assert.equal((await db.collection('bookings').get()).size,1);assert.equal((await acceptanceAudits(offered.requestId)).length,1);
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
 const q=await api(shop,'quoteSubmit',{...quote,serviceRequestId:r.id});
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
