const {test}=require('node:test'),assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createMarketplace,quoteId}=require('../marketplace.cjs');
const M=require('../marketplace-domain.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const B=require('../booking-domain.cjs');
const seed={
 'users/owner':{role:'owner',fullName:'Private customer name',phone:'private phone'},
 'users/other':{role:'owner'},
 'users/shop':{role:'shop',verificationStatus:'approved',shop:{shopName:'Trusted Motors',city:'Johannesburg',province:'Gauteng',services:'Paint',address:'private address',regNumber:'private registration'}},
 'users/competitor':{role:'shop',verificationStatus:'approved',shop:{shopName:'Other Shop'}},
 'users/admin':{role:'admin'},
 'vehicles/car':{ownerId:'owner',make:'Toyota',model:'Corolla',year:2020,colour:'Blue',registration:'PRIVATE-REG',version:1,archived:false},
 'serviceCategories/paint':{name:'Paint',description:'Painting services',archived:false},
};
function queryable(db){
 const original=db.collection;db.queries=[];
 db.collection=function collection(path){
  const base=original(path);
  function query(filters=[],cursor='',maximum=Infinity){return {
   ...base,where:(key,operator,value)=>{assert.equal(operator,'==');return query([...filters,[key,value]],cursor,maximum);},orderBy:()=>query(filters,cursor,maximum),startAfter:id=>query(filters,id,maximum),limit:n=>query(filters,cursor,n),
   get:async()=>{db.queries.push({path,filters,cursor,maximum});const docs=[...db.rows.entries()].filter(([p,value])=>p.startsWith(path+'/')&&p.slice(path.length+1).indexOf('/')===-1&&p.split('/').pop()>cursor&&filters.every(([key,expected])=>value[key]===expected)).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,maximum).map(([p])=>({id:p.split('/').pop(),exists:true,data:()=>db.rows.get(p)}));return {docs};},
  };}
  return query();
 };
 return db;
}
function fixture(extra={}){
 const db=queryable(memoryDb(structuredClone({...seed,...extra}))),users=new Map();let sequence=0;
 const auth={getUser:async uid=>users.get(uid)||{emailVerified:true,disabled:false}};
 const actor=async req=>({uid:req.auth.uid,profile:(await db.doc('users/'+req.auth.uid).get()).data()});
 const api=createMarketplace({db,auth,actor});
 const read=(uid,op,data={})=>api({auth:{uid},data:{op,...data}});
 const write=(uid,op,data={},key=`retry-${++sequence}`)=>read(uid,op,{requestId:key,...data});
 return {db,auth,users,api,read,write};
}
const vehicle={make:'Ford',model:'Fiesta',year:2022,colour:'Silver',registration:'abc 123 gp'};
const requestData={vehicleId:'car',title:'Respray doors',description:'Repair and repaint both doors.',categoryId:'paint',city:'Johannesburg',budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'};
const quoteData={scope:'Prepare and respray both doors',items:[{description:'Preparation',amountCents:10000},{description:'Paint and labour',amountCents:90000}],completionDays:3,warranty:'Six months',validForDays:14};
async function created(f,details={}){return (await f.write('owner','requestCreate',{...requestData,...details})).id;}
const audits=f=>[...f.db.rows.entries()].filter(([path])=>path.startsWith('auditLogs/'));

test('owner can update an open request transactionally and retries are idempotent',async()=>{
 const f=fixture(),id=await created(f),before=f.db.rows.get(`serviceRequests/${id}`);
 const input={id,version:before.version,title:'Updated title',description:'Updated description.',categoryId:'paint',city:'Pretoria',budgetMinCents:20000,budgetMaxCents:250000,preferredDate:'',visibility:'open'};
 const first=await f.write('owner','requestUpdate',input,'update-request'),second=await f.write('owner','requestUpdate',input,'update-request');
 assert.deepEqual(first,second);
 const saved=f.db.rows.get(`serviceRequests/${id}`);
 assert.equal(saved.title,'Updated title');assert.equal(saved.city,'Pretoria');assert.equal(saved.version,2);
 assert.equal(audits(f).filter(([,value])=>value.action==='marketplace.requestUpdate').length,1);
});

test('request updates reject stale versions and closed or booked requests',async()=>{
 const f=fixture(),id=await created(f),version=f.db.rows.get(`serviceRequests/${id}`).version;
 await f.write('owner','requestUpdate',{id,version,title:'First update',description:requestData.description,categoryId:'paint',city:requestData.city,budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'},'first-update');
 await assert.rejects(()=>f.write('owner','requestUpdate',{id,version,title:'Stale update',description:requestData.description,categoryId:'paint',city:requestData.city,budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'},'stale-update'),{code:'failed-precondition'});
 f.db.rows.get(`serviceRequests/${id}`).status='closed';
 await assert.rejects(()=>f.write('owner','requestUpdate',{id,version:2,title:'Closed update',description:requestData.description,categoryId:'paint',city:requestData.city,budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'},'closed-update'),{code:'failed-precondition'});
 f.db.rows.get(`serviceRequests/${id}`).status='booked';
 await assert.rejects(()=>f.write('owner','requestUpdate',{id,version:2,title:'Booked update',description:requestData.description,categoryId:'paint',city:requestData.city,budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'},'booked-update'),{code:'failed-precondition'});
});
test('vehicle creation and request creation are transactional, audited and safe on retry after a lost acknowledgement',async()=>{
 const f=fixture();let once=true;f.db.after=async()=>{if(once){once=false;throw Error('Synthetic lost response');}};
 await assert.rejects(()=>f.write('owner','vehicleSave',vehicle,'new-vehicle'),/lost response/);
 const first=await f.write('owner','vehicleSave',vehicle,'new-vehicle'),second=await f.write('owner','vehicleSave',vehicle,'new-vehicle');
 assert.deepEqual(first,second);assert.equal(f.db.rows.get('vehicles/'+first.id).registration,'ABC 123 GP');
 assert.equal([...f.db.rows.keys()].filter(p=>p.startsWith('vehicles/')).length,2);assert.equal(audits(f).length,1);
 const request=await f.write('owner','requestCreate',requestData,'new-request');assert.deepEqual(await f.write('owner','requestCreate',requestData,'new-request'),request);
 assert.equal([...f.db.rows.keys()].filter(p=>p.startsWith('serviceRequests/')).length,1);assert.equal(audits(f).length,2);
 await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,title:'Altered title'},'new-request'),{code:'already-exists'});
});
test('vehicle mutations enforce ownership, stale versions, archive rules and required retry keys',async()=>{
 const f=fixture();await assert.rejects(()=>f.read('owner','vehicleSave',vehicle),{code:'invalid-argument'});
 await assert.rejects(()=>f.write('other','vehicleSave',{...vehicle,id:'car',version:1}),{code:'not-found'});
 await f.write('owner','vehicleSave',{...vehicle,id:'car',version:1});assert.equal(f.db.rows.get('vehicles/car').version,2);
 await assert.rejects(()=>f.write('owner','vehicleSave',{...vehicle,id:'car',version:1}),{code:'failed-precondition'});
 await f.write('owner','vehicleArchive',{id:'car',version:2,archived:true});
 await assert.rejects(()=>f.write('owner','vehicleSave',{...vehicle,id:'car',version:3}),{code:'failed-precondition'});
 await assert.rejects(()=>created(f),{code:'failed-precondition'});
 await f.write('owner','vehicleArchive',{id:'car',version:3,archived:false});assert.equal(f.db.rows.get('vehicles/car').version,4);
});
test('roles, approval and restrictions are checked before reads and again inside mutations',async()=>{
 for(const uid of ['shop','admin'])await assert.rejects(()=>fixture().write(uid,'vehicleSave',vehicle),{code:'permission-denied'});
 for(const profile of [{role:'shop',verificationStatus:'pending'},{role:'shop',verificationStatus:'rejected'},{role:'shop',verificationStatus:'approved',accountStatus:'suspended'},{role:'shop',verificationStatus:'approved',accountStatus:'archived'},{role:'shop',verificationStatus:'approved',reviewOperation:'running'}]){
  const f=fixture({'users/shop':profile});await assert.rejects(()=>f.read('shop','requests',{feed:'open'}),{code:'permission-denied'});
 }
 const f=fixture();f.db.before=async()=>{f.db.rows.get('users/owner').accountStatus='suspended';};
 await assert.rejects(()=>f.write('owner','vehicleSave',vehicle),{code:'permission-denied'});assert.equal(audits(f).length,0);
});
test('unknown fields and malformed money, dates, vehicles and quotation items are rejected',async()=>{
 const f=fixture();await assert.rejects(()=>f.write('owner','vehicleSave',{...vehicle,ownerId:'other'}),{code:'invalid-argument'});
 for(const data of [{budgetMinCents:-1},{budgetMinCents:1.5},{budgetMaxCents:100000001},{budgetMinCents:200001},{preferredDate:'2027-02-30'},{preferredDate:'2000-01-01'},{visibility:'open',shopId:'shop'},{description:'x'.repeat(301)}])await assert.rejects(()=>created(f,data),{code:'invalid-argument'});
 for(const data of [{year:'2020'},{year:1885},{registration:'../../path'},{colour:''}])await assert.rejects(()=>f.write('owner','vehicleSave',{...vehicle,...data}),{code:'invalid-argument'});
 for(const data of [{items:[]},{items:[{description:'Paint',amountCents:0}]},{items:[{description:'Paint',amountCents:1.2}]},{items:[{description:'Paint',amountCents:100000000},{description:'Labour',amountCents:1}]},{items:[{description:'Paint',amountCents:1,totalCents:0}]},{validForDays:91},{completionDays:0}])assert.throws(()=>M.quotation({...quoteData,...data}),{code:'invalid-argument'});
 assert.equal(audits(f).length,0);
});
test('direct requests require an approved, active and verified target shop',async()=>{
 for(const profile of [{role:'owner'},{role:'shop',verificationStatus:'pending'},{role:'shop',verificationStatus:'approved',accountStatus:'suspended'}]){
  const f=fixture({'users/shop':profile});await assert.rejects(()=>created(f,{visibility:'direct',shopId:'shop'}),{code:'failed-precondition'});
 }
 for(const user of [{emailVerified:false,disabled:false},{emailVerified:true,disabled:true}]){const f=fixture();f.users.set('shop',user);await assert.rejects(()=>created(f,{visibility:'direct',shopId:'shop'}),{code:'failed-precondition'});}
 const f=fixture();f.db.rows.get('serviceCategories/paint').archived=true;await assert.rejects(()=>created(f),{code:'failed-precondition'});
});
test('request snapshots omit registration and customer details, and shop detail never exposes competitor quotations',async()=>{
 const f=fixture(),id=await created(f);await f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData});await f.write('competitor','quoteSubmit',{serviceRequestId:id,...quoteData});
 const owner=await f.read('owner','request',{id}),shop=await f.read('shop','request',{id});
 assert.equal(owner.quotes.length,2);assert.equal(shop.quotes.length,1);assert.equal(shop.quotes[0].shopId,'shop');
 assert.equal(shop.request.ownerId,undefined);assert.equal(shop.request.vehicleId,undefined);assert.deepEqual(shop.request.vehicle,{make:'Toyota',model:'Corolla',year:2020,colour:'Blue'});
 assert.ok(!JSON.stringify(shop).includes('PRIVATE-REG'));assert.ok(!JSON.stringify(shop).includes('Private customer name'));assert.equal(shop.quotes[0].totalCents,100000);assert.equal(shop.quotes[0].currency,'ZAR');
 await assert.rejects(()=>f.read('other','request',{id}),{code:'not-found'});
});
test('direct request privacy is enforced for detail, feeds and quotation submission',async()=>{
 const f=fixture(),id=await created(f,{visibility:'direct',shopId:'shop'});
 await assert.rejects(()=>f.read('competitor','request',{id}),{code:'not-found'});
 await assert.rejects(()=>f.write('competitor','quoteSubmit',{serviceRequestId:id,...quoteData}),{code:'not-found'});
 assert.equal((await f.read('competitor','requests',{feed:'direct'})).items.length,0);
 assert.equal((await f.read('shop','requests',{feed:'direct'})).items[0].id,id);
 assert.equal((await f.read('shop','requests',{feed:'open'})).items.length,0);
 await assert.rejects(()=>f.read('shop','requests',{feed:'mine'}),{code:'permission-denied'});
});
test('quotation retries return one quote; distinct keys cannot create duplicates or revive a withdrawal',async()=>{
 const f=fixture(),serviceRequestId=await created(f),data={serviceRequestId,...quoteData};
 const first=await f.write('shop','quoteSubmit',data,'quote-once');assert.equal(first.id,quoteId(serviceRequestId,'shop'));
 assert.deepEqual(await f.write('shop','quoteSubmit',data,'quote-once'),first);
 await assert.rejects(()=>f.write('shop','quoteSubmit',data,'another-key'),{code:'already-exists'});
 await assert.rejects(()=>f.write('competitor','quoteWithdraw',{id:first.id}),{code:'not-found'});
 await f.write('shop','quoteWithdraw',{id:first.id},'withdraw-once');await f.write('shop','quoteWithdraw',{id:first.id},'withdraw-once');
 assert.equal(f.db.rows.get('quotations/'+first.id).status,'withdrawn');
 await assert.rejects(()=>f.write('shop','quoteSubmit',data,'new-after-withdraw'),{code:'already-exists'});
 assert.equal(audits(f).filter(([,v])=>v.action==='marketplace.quoteSubmit').length,1);
});
test('closing a request denies new quotations and cannot be performed by another customer',async()=>{
 const f=fixture(),id=await created(f);await assert.rejects(()=>f.write('other','requestClose',{id}),{code:'not-found'});
 await f.write('owner','requestClose',{id},'close-once');await f.write('owner','requestClose',{id},'close-once');
 await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData}),{code:'failed-precondition'});
 assert.equal((await f.read('shop','requests',{feed:'open'})).items.length,0);
 assert.equal((await f.read('owner','requests',{feed:'mine'})).items[0].status,'closed');
});
test('quote submission rechecks customer, vehicle, category and current shop approval inside its transaction',async()=>{
 for(const alter of [f=>{f.db.rows.get('users/owner').accountStatus='suspended';},f=>{f.users.set('owner',{emailVerified:false,disabled:false});},f=>{f.db.rows.get('vehicles/car').archived=true;},f=>{f.db.rows.get('serviceCategories/paint').archived=true;}]){
  const f=fixture(),serviceRequestId=await created(f);alter(f);await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId,...quoteData}),{code:'failed-precondition'});
 }
 const f=fixture(),serviceRequestId=await created(f);f.db.before=async()=>{f.db.rows.get('users/shop').verificationStatus='pending';};
 await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId,...quoteData}),{code:'permission-denied'});
});
test('bounded shop discovery returns only redacted approved, active, verified enabled accounts',async()=>{
 const f=fixture({'users/suspended':{role:'shop',verificationStatus:'approved',accountStatus:'suspended'},'users/pending':{role:'shop',verificationStatus:'pending'},'users/unverified':{role:'shop',verificationStatus:'approved'},'users/disabled':{role:'shop',verificationStatus:'approved'}});
 f.users.set('unverified',{emailVerified:false,disabled:false});f.users.set('disabled',{emailVerified:true,disabled:true});
 const result=await f.read('owner','shops');assert.deepEqual(result.items.map(v=>v.id),['competitor','shop']);
 assert.deepEqual(Object.keys(result.items[1]).sort(),['city','id','province','services','shopName'].sort());
 assert.ok(f.db.queries.every(query=>query.maximum===21));
});
test('vehicle and owner quotation pages have stable document cursors with no truncation',async()=>{
 const f=fixture(),id=await created(f);
 for(let n=0;n<25;n++){const suffix=String(n).padStart(2,'0');f.db.rows.set('vehicles/v'+suffix,{...seed['vehicles/car'],ownerId:'owner'});f.db.rows.set('quotations/q'+suffix,{serviceRequestId:id,shopId:'s'+suffix,totalCents:n+1});}
 const first=await f.read('owner','vehicles'),second=await f.read('owner','vehicles',{cursor:first.cursor});assert.equal(first.items.length,20);assert.equal(second.items.length,6);assert.equal(second.cursor,null);
 const q1=await f.read('owner','request',{id}),q2=await f.read('owner','request',{id,quotesCursor:q1.quotesCursor});assert.equal(q1.quotes.length,20);assert.equal(q2.quotes.length,5);assert.equal(q2.quotesCursor,null);
 assert.equal(new Set([...q1.quotes,...q2.quotes].map(v=>v.id)).size,25);
});
test('suspended or unverified customer requests are hidden from shop discovery and detail',async()=>{
 for(const alter of [f=>{f.db.rows.get('users/owner').accountStatus='suspended';},f=>{f.users.set('owner',{emailVerified:false,disabled:false});}]){
  const f=fixture(),id=await created(f);alter(f);assert.equal((await f.read('shop','requests',{feed:'open'})).items.length,0);await assert.rejects(()=>f.read('shop','request',{id}),{code:'not-found'});
 }
});
test('an acknowledged request retry remains idempotent after its preferred date passes',async()=>{
 const original=Date.now,f=fixture();
 try{
  Date.now=()=>Date.parse('2030-01-01T10:00:00Z');
  const input={...requestData,preferredDate:'2030-01-01'},first=await f.write('owner','requestCreate',input,'date-retry');
  Date.now=()=>Date.parse('2030-01-02T10:00:00Z');
  assert.deepEqual(await f.write('owner','requestCreate',input,'date-retry'),first);
  await assert.rejects(()=>f.write('owner','requestCreate',input,'different-request'),{code:'invalid-argument'});
 }finally{Date.now=original;}
});
test('quotation line count matches the ten-item form limit',()=>{
 assert.throws(()=>M.quotation({...quoteData,items:Array.from({length:11},()=>({description:'Synthetic item',amountCents:1}))}),{code:'invalid-argument'});
});
test('archived vehicles or categories hide unquotable requests but preserve owner and quote history',async()=>{
 for(const path of ['vehicles/car','serviceCategories/paint']){
  const f=fixture(),id=await created(f);await f.write('shop','quoteSubmit',{...quoteData,serviceRequestId:id});
  f.db.rows.get(path).archived=true;
  assert.equal((await f.read('shop','requests',{feed:'open'})).items.length,0);
  await assert.rejects(()=>f.read('shop','request',{id}),{code:'not-found'});
  assert.equal((await f.read('owner','request',{id})).request.id,id);
  assert.equal((await f.read('shop','quotes')).items.length,1);
 }
});

async function offered(f,{visibility='open',shopId}={}){
 const serviceRequestId=await created(f,{visibility,...(shopId?{shopId}:{})});
 const result=await f.write('shop','quoteSubmit',{serviceRequestId,...quoteData});
 return {serviceRequestId,id:result.id};
}
async function booked(f){const offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id});return {...offer,bookingId:booking.id};}
const appointment={appointmentDate:'2099-12-01',appointmentTime:'09:30'};
const bookingAudits=f=>audits(f).filter(([,v])=>['marketplace.quoteAccept','marketplace.bookingConfirm','marketplace.bookingCancel'].includes(v.action));

test('acceptance atomically selects one quote and creates private immutable booking terms',async()=>{
 const f=fixture(),offer=await offered(f),result=await f.write('owner','quoteAccept',{id:offer.id});
 assert.equal(result.id,offer.serviceRequestId);
 const request=f.db.rows.get('serviceRequests/'+offer.serviceRequestId),quote=f.db.rows.get('quotations/'+offer.id),saved=f.db.rows.get('bookings/'+result.id);
 assert.equal(request.status,'booked');assert.equal(request.acceptedQuoteId,offer.id);assert.equal(request.bookingId,result.id);
 assert.equal(quote.status,'accepted');assert.equal(quote.bookingId,result.id);assert.equal(saved.status,'pending_confirmation');
 assert.deepEqual(saved.items,quoteData.items);assert.equal(saved.totalCents,100000);assert.equal(saved.scope,quoteData.scope);assert.equal(saved.shopName,'Trusted Motors');assert.equal(saved.city,'Johannesburg');assert.equal(saved.categoryName,'Paint');
 assert.deepEqual(saved.vehicle,{make:'Toyota',model:'Corolla',year:2020,colour:'Blue'});
 quote.items[0].amountCents=1;request.title='Changed later';f.db.rows.get('vehicles/car').colour='Red';
 const owner=(await f.read('owner','booking',{id:result.id})).booking,shop=(await f.read('shop','booking',{id:result.id})).booking;
 assert.equal(owner.items[0].amountCents,10000);assert.equal(owner.requestTitle,requestData.title);assert.equal(owner.vehicle.colour,'Blue');
 assert.equal(shop.ownerId,undefined);assert.equal(shop.vehicleId,undefined);assert.ok(!JSON.stringify(shop).includes('PRIVATE-REG'));assert.ok(!JSON.stringify(shop).includes('private phone'));
 assert.equal(bookingAudits(f).length,1);
});

test('acceptance retries survive a lost response, changed availability and cancellation without creating another booking',async()=>{
 const f=fixture(),offer=await offered(f);let once=true;
 f.db.after=async()=>{if(once){once=false;throw Error('Synthetic lost acceptance response');}};
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id},'accept-once'),/lost acceptance response/);
 const result=await f.write('owner','quoteAccept',{id:offer.id},'accept-once');
 assert.deepEqual(await f.write('owner','quoteAccept',{id:offer.id},'accept-again-new-key'),result);
 f.db.rows.get('vehicles/car').archived=true;f.db.rows.get('serviceCategories/paint').archived=true;f.db.rows.get('users/shop').accountStatus='suspended';
 assert.deepEqual(await f.write('owner','quoteAccept',{id:offer.id},'lookup-existing'),result);
 await f.write('owner','bookingCancel',{id:result.id,reason:'Shop is unavailable'},'cancel-once');
 assert.deepEqual(await f.write('owner','quoteAccept',{id:offer.id},'after-cancellation'),result);
 assert.equal(f.db.rows.get('bookings/'+result.id).status,'cancelled');assert.equal(f.db.rows.get('serviceRequests/'+offer.serviceRequestId).status,'booked');assert.equal(f.db.rows.get('quotations/'+offer.id).status,'accepted');
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('bookings/')).length,1);assert.equal(bookingAudits(f).filter(([,v])=>v.action==='marketplace.quoteAccept').length,1);
});

test('expired, withdrawn and closed offers cannot be accepted and failures leave no partial booking',async()=>{
 for(const change of [
  (f,o)=>{f.db.rows.get('quotations/'+o.id).validUntil=Timestamp.fromMillis(Date.now()-1);},
  (f,o)=>{f.db.rows.get('quotations/'+o.id).validUntil='2099-01-01';},
  (f,o)=>{f.db.rows.get('quotations/'+o.id).status='withdrawn';},
  (f,o)=>{f.db.rows.get('serviceRequests/'+o.serviceRequestId).status='closed';},
 ]){
  const f=fixture(),offer=await offered(f);change(f,offer);
  await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),{code:'failed-precondition'});
  assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('bookings/')).length,0);assert.equal(bookingAudits(f).length,0);
 }
});

test('acceptance rechecks selected shop, owner Auth, vehicle and category availability inside its transaction',async()=>{
 const changes=[
  f=>{f.db.rows.get('users/shop').verificationStatus='pending';},
  f=>{f.db.rows.get('users/shop').accountStatus='suspended';},
  f=>{f.db.rows.get('users/shop').reviewOperation='review';},
  f=>{f.users.set('shop',{emailVerified:false,disabled:false});},
  f=>{f.users.set('shop',{emailVerified:true,disabled:true});},
  f=>{f.users.set('owner',{emailVerified:false,disabled:false});},
  f=>{f.db.rows.get('vehicles/car').archived=true;},
  f=>{f.db.rows.get('vehicles/car').ownerId='other';},
  f=>{f.db.rows.get('serviceCategories/paint').archived=true;},
 ];
 for(const change of changes){const f=fixture(),offer=await offered(f);f.db.before=()=>change(f);await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),{code:'failed-precondition'});assert.equal(f.db.rows.get('serviceRequests/'+offer.serviceRequestId).status,'open');assert.equal(f.db.rows.get('quotations/'+offer.id).status,'submitted');assert.equal(bookingAudits(f).length,0);}
 const f=fixture(),offer=await offered(f);f.db.before=()=>{f.db.rows.get('users/owner').accountStatus='archived';};await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),{code:'permission-denied'});
});

test('acceptance enforces request ownership, direct audience and field allowlists',async()=>{
 const f=fixture(),offer=await offered(f,{visibility:'direct',shopId:'shop'});
 await assert.rejects(()=>f.write('other','quoteAccept',{id:offer.id}),{code:'not-found'});
 for(const uid of ['shop','competitor','admin'])await assert.rejects(()=>f.write(uid,'quoteAccept',{id:offer.id}),{code:'permission-denied'});
 await assert.rejects(()=>f.read('owner','quoteAccept',{id:offer.id}),{code:'invalid-argument'});
 for(const data of [{status:'confirmed'},{shopId:'competitor'},{totalCents:1},{ownerId:'other'}])await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,...data}),{code:'invalid-argument'});
 f.db.rows.get('serviceRequests/'+offer.serviceRequestId).shopId='competitor';await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),{code:'failed-precondition'});assert.equal(bookingAudits(f).length,0);
});

test('a selected quote blocks another selection, request closure and accepted-quote withdrawal even after cancellation',async()=>{
 const f=fixture(),offer=await offered(f),other=await f.write('competitor','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData});
 const result=await f.write('owner','quoteAccept',{id:offer.id},'chosen');
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:other.id},'chosen'),{code:'already-exists'});
 for(const beforeCancel of [true,false]){
  if(!beforeCancel)await f.write('owner','bookingCancel',{id:result.id,reason:'Plans changed'});
  await assert.rejects(()=>f.write('owner','quoteAccept',{id:other.id}),{code:'failed-precondition'});
  await assert.rejects(()=>f.write('owner','requestClose',{id:offer.serviceRequestId}),{code:'failed-precondition'});
  await assert.rejects(()=>f.write('shop','quoteWithdraw',{id:offer.id}),{code:'failed-precondition'});
 }
 assert.equal(f.db.rows.get('quotations/'+other.id).status,'submitted');assert.equal(bookingAudits(f).filter(([,v])=>v.action==='marketplace.quoteAccept').length,1);
});

test('booking reads, confirmation and cancellation are scoped to the two eligible participants',async()=>{
 const f=fixture(),b=await booked(f);
 for(const uid of ['other','competitor']){await assert.rejects(()=>f.read(uid,'booking',{id:b.bookingId}),{code:'not-found'});assert.equal((await f.read(uid,'bookings')).items.length,0);await assert.rejects(()=>f.write(uid,'bookingCancel',{id:b.bookingId,reason:'Forged cancellation'}),{code:'not-found'});}
 await assert.rejects(()=>f.write('competitor','bookingConfirm',{id:b.bookingId,...appointment}),{code:'not-found'});
 await assert.rejects(()=>f.write('owner','bookingConfirm',{id:b.bookingId,...appointment}),{code:'permission-denied'});
 for(const op of ['booking','bookings','bookingConfirm','bookingCancel'])await assert.rejects(()=>f.write('admin',op,{id:b.bookingId}),{code:/permission-denied|invalid-argument/});
 f.db.rows.get('users/shop').verificationStatus='pending';await assert.rejects(()=>f.read('shop','booking',{id:b.bookingId}),{code:'permission-denied'});
 f.db.rows.get('users/owner').accountStatus='suspended';await assert.rejects(()=>f.read('owner','bookings'),{code:'permission-denied'});
});

test('appointments validate strict calendar/time syntax and use South African UTC+02:00',()=>{
 for(const values of [{appointmentDate:'2030-02-30'},{appointmentDate:'2030-2-01'},{appointmentDate:''},{appointmentDate:2030},{appointmentTime:'24:00'},{appointmentTime:'09:60'},{appointmentTime:'9:00'},{appointmentTime:'09:00Z'}])assert.throws(()=>B.appointment({...appointment,...values}),{code:'invalid-argument'});
 const parsed=B.appointment({appointmentDate:'2030-01-02',appointmentTime:'00:30'});assert.equal(parsed.appointmentMillis,Date.parse('2030-01-01T22:30:00Z'));
 const original=Date.now;try{Date.now=()=>parsed.appointmentMillis;assert.throws(()=>B.requireFutureAppointment(parsed),{code:'invalid-argument'});Date.now=()=>parsed.appointmentMillis-1;assert.doesNotThrow(()=>B.requireFutureAppointment(parsed));}finally{Date.now=original;}
});

test('confirmation preserves historical terms after archive, and a retry still succeeds after appointment time passes',async()=>{
 const original=Date.now;try{
  Date.now=()=>Date.parse('2030-01-01T10:00:00Z');const f=fixture(),b=await booked(f),data={id:b.bookingId,appointmentDate:'2030-01-02',appointmentTime:'00:30'};
  f.db.rows.get('vehicles/car').archived=true;f.db.rows.get('serviceCategories/paint').archived=true;
  await assert.rejects(()=>f.write('shop','bookingConfirm',{...data,appointmentDate:'2030-01-01',appointmentTime:'12:00'}),{code:'invalid-argument'});
  let once=true;f.db.after=()=>{if(once){once=false;throw Error('Synthetic confirmation response lost');}};
  await assert.rejects(()=>f.write('shop','bookingConfirm',data,'confirm-once'),/response lost/);
  Date.now=()=>Date.parse('2030-01-03T10:00:00Z');const result=await f.write('shop','bookingConfirm',data,'confirm-once');assert.equal(result.id,b.bookingId);
  const saved=(await f.read('owner','booking',{id:b.bookingId})).booking;assert.equal(saved.status,'confirmed');assert.equal(saved.appointmentAt,Date.parse('2030-01-01T22:30:00Z'));assert.equal(saved.appointmentDate,'2030-01-02');assert.equal(saved.appointmentTime,'00:30');assert.equal(saved.totalCents,100000);
  await assert.rejects(()=>f.write('shop','bookingConfirm',data),{code:'failed-precondition'});await assert.rejects(()=>f.write('shop','bookingConfirm',{...data,appointmentTime:'01:30'},'confirm-once'),{code:'already-exists'});
  assert.equal(bookingAudits(f).filter(([,v])=>v.action==='marketplace.bookingConfirm').length,1);
 }finally{Date.now=original;}
});

test('confirmation rechecks both current accounts; cancellation remains available to an eligible counterpart',async()=>{
 for(const change of [f=>{f.db.rows.get('users/owner').accountStatus='suspended';},f=>{f.users.set('owner',{emailVerified:true,disabled:true});},f=>{f.users.set('shop',{emailVerified:false,disabled:false});}]){
  const f=fixture(),b=await booked(f);f.db.before=()=>change(f);await assert.rejects(()=>f.write('shop','bookingConfirm',{id:b.bookingId,...appointment}),{code:'failed-precondition'});assert.equal(f.db.rows.get('bookings/'+b.bookingId).status,'pending_confirmation');
 }
 for(const uid of ['owner','shop']){
  const f=fixture(),b=await booked(f),counterpart=uid==='owner'?'shop':'owner';f.db.rows.get('users/'+counterpart).accountStatus='suspended';f.users.set(counterpart,{emailVerified:true,disabled:true});
  const result=await f.write(uid,'bookingCancel',{id:b.bookingId,reason:'  The other account is unavailable.  '},'cancel-once');assert.deepEqual(await f.write(uid,'bookingCancel',{id:b.bookingId,reason:'  The other account is unavailable.  '},'cancel-once'),result);
  const saved=(await f.read(uid,'booking',{id:b.bookingId})).booking;assert.equal(saved.status,'cancelled');assert.equal(saved.cancelledByRole,uid);assert.equal(saved.cancellationReason,'The other account is unavailable.');assert.equal(bookingAudits(f).filter(([,v])=>v.action==='marketplace.bookingCancel').length,1);
 }
});

test('cancellation requires a useful reason and cannot reopen or overwrite a terminal booking',async()=>{
 const f=fixture(),b=await booked(f);
 for(const reason of ['',null,'  ','x'.repeat(501)])await assert.rejects(()=>f.write('owner','bookingCancel',{id:b.bookingId,reason}),{code:'invalid-argument'});
 for(const extra of [{status:'confirmed'},{cancelledByRole:'shop'},{appointmentAt:0}])await assert.rejects(()=>f.write('owner','bookingCancel',{id:b.bookingId,reason:'Changed plans',...extra}),{code:'invalid-argument'});
 await f.write('shop','bookingConfirm',{id:b.bookingId,...appointment});await f.write('owner','bookingCancel',{id:b.bookingId,reason:'Changed plans'});
 await assert.rejects(()=>f.write('shop','bookingCancel',{id:b.bookingId,reason:'Overwrite'}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('shop','bookingConfirm',{id:b.bookingId,...appointment}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get('bookings/'+b.bookingId).cancellationReason,'Changed plans');assert.equal(f.db.rows.get('bookings/'+b.bookingId).status,'cancelled');
});

test('booking pages are bounded, participant-scoped and redact customer identifiers for shops',async()=>{
 const f=fixture(),b=await booked(f),template=f.db.rows.get('bookings/'+b.bookingId);
 for(let n=0;n<25;n++){const id=String(n).padStart(2,'0');f.db.rows.set('bookings/b'+id,{...template});f.db.rows.set('bookings/other'+id,{...template,ownerId:'other',shopId:'competitor'});}
 for(const uid of ['owner','shop']){const first=await f.read(uid,'bookings'),second=await f.read(uid,'bookings',{cursor:first.cursor});assert.equal(first.items.length,20);assert.equal(second.items.length,6);assert.equal(second.cursor,null);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,26);assert.ok([...first.items,...second.items].every(item=>uid==='owner'?item.ownerId==='owner':item.ownerId===undefined&&item.vehicleId===undefined));}
 assert.ok(f.db.queries.filter(q=>q.path==='bookings').every(q=>q.maximum===21));
});

test('deadlines that pass while Auth is being checked cannot commit acceptance or confirmation',async t=>{
 let now=Date.parse('2030-01-01T08:00:00Z');t.mock.method(Date,'now',()=>now);
 const f=fixture(),offer=await offered(f);f.db.rows.get('quotations/'+offer.id).validUntil=Timestamp.fromMillis(now+1000);
 f.auth.getUser=async()=>{now+=2000;return {emailVerified:true,disabled:false};};
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),{code:'failed-precondition'});
 assert.equal(f.db.rows.has('bookings/'+offer.serviceRequestId),false);
 const g=fixture(),b=await booked(g);now=Date.parse('2030-01-02T07:59:59Z');
 g.auth.getUser=async()=>{now+=2000;return {emailVerified:true,disabled:false};};
 await assert.rejects(()=>g.write('shop','bookingConfirm',{id:b.bookingId,appointmentDate:'2030-01-02',appointmentTime:'10:00'}),{code:'invalid-argument'});
 assert.equal(g.db.rows.get('bookings/'+b.bookingId).status,'pending_confirmation');
});
