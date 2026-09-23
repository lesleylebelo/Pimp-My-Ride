const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
require('../../scripts/assert-emulators.cjs').assertEmulators({auth:true});
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
const http=require('supertest'),{createServices}=require('../services.cjs'),{createApp}=require('../app.cjs');
const firebase=initializeApp({projectId:'demo-pmr-security'},'marketplace-tests'),db=getFirestore(firebase),auth=getAuth(firebase);
const services=createServices({db,auth,storage:{}});let app,sequence=0;
const vehicle={make:'Test make',model:'Test model',year:2020,colour:'Blue',registration:'TEST 123 GP'};
const details={title:'Body kit installation',description:'Supply and fit a synthetic example body kit.',categoryId:'body',city:'Johannesburg',budgetMinCents:100000,budgetMaxCents:300000,preferredDate:'',visibility:'open'};
const quote={scope:'Fit and inspect the example kit.',items:[{description:'Fitment',amountCents:125000},{description:'Paint',amountCents:50000}],completionDays:5,warranty:'12 months workmanship',validForDays:14};
const identity=uid=>({uid,token:{email_verified:true,auth_time:Math.floor(Date.now()/1000)+1}});
const call=(uid,op,data={})=>services.marketplace({auth:identity(uid),data:{op,requestId:`emulator-${++sequence}`,...data}});
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
test('real authenticated HTTP workflow registers a vehicle, publishes a request, and returns the private quote to its owner',async()=>{
 const owner=await signIn('alice'),shop=await signIn('shop-one');
 const api=async(token,op,data={})=>(await http(app).post('/api/marketplace').set('Authorization',`Bearer ${token}`).send({op,requestId:`http-${++sequence}`,...data}).expect(200)).body.data;
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
