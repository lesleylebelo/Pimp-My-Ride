const {test}=require('node:test'),assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createMarketplace,quoteId}=require('../marketplace.cjs');
const M=require('../marketplace-domain.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const B=require('../booking-domain.cjs');
const {LOCAL_MOCK_ENV}=require('./helpers/mock-payments.cjs');
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
  function query(filters=[],cursor=null,maximum=Infinity,orders=[]){
   const keyValue=(entry,key)=>typeof key==='string'?entry[1][key]:entry[0].split('/').pop();
   const compareValue=(a,b)=>{if(a instanceof Timestamp&&b instanceof Timestamp)return a.seconds-b.seconds||a.nanoseconds-b.nanoseconds;return a<b?-1:a>b?1:0;};
   const compare=(a,b)=>(orders.length?orders:[[null,'asc']]).reduce((result,[key,direction])=>result||compareValue(keyValue(a,key),keyValue(b,key))*(direction==='desc'?-1:1),0);
   return {...base,
    where:(key,operator,value)=>{assert.ok(operator==='=='||operator==='in');return query([...filters,[key,operator,value]],cursor,maximum,orders);},
    orderBy:(key,direction='asc')=>query(filters,cursor,maximum,[...orders,[key,direction]]),startAfter:value=>query(filters,value,maximum,orders),limit:n=>query(filters,cursor,n,orders),
    get:async()=>{db.queries.push({path,filters,cursor,maximum});const cursorEntry=cursor?[path+'/'+(typeof cursor==='string'?cursor:cursor.id),typeof cursor==='string'?{}:cursor.data()]:null;
     const docs=[...db.rows.entries()].filter(([p,value])=>p.startsWith(path+'/')&&!p.slice(path.length+1).includes('/')&&filters.every(([key,operator,expected])=>operator==='in'?expected.includes(value[key]):value[key]===expected)&&(!cursorEntry||compare([p,value],cursorEntry)>0)).sort(compare).slice(0,maximum).map(([p])=>({id:p.split('/').pop(),exists:true,data:()=>db.rows.get(p)}));return {docs};},
   };
  }
  return query();
 };
 return db;
}
function fixture(extra={},options={}){
 const db=queryable(memoryDb(structuredClone({...seed,...extra}))),users=new Map();let sequence=0;
 const auth={getUser:async uid=>users.get(uid)||{emailVerified:true,disabled:false}};
 const actor=async req=>({uid:req.auth.uid,profile:(await db.doc('users/'+req.auth.uid).get()).data()});
 db.projectId='demo-pmr-security';
 const api=createMarketplace({db,auth,actor,mockPaymentEnv:options.mockPaymentEnv===undefined?LOCAL_MOCK_ENV:options.mockPaymentEnv});
 const read=(uid,op,data={})=>api({auth:{uid},data:{op,...data}});
 const write=(uid,op,data={},key=`retry-${++sequence}`)=>{
  const request=data.serviceRequestId&&db.rows.get(`serviceRequests/${data.serviceRequestId}`);
  const attempt=op==='paymentMockResult'?db.rows.get('bookings/'+data.id+'/paymentAttempts/'+data.paymentAttemptId):null;
  return read(uid,op,{requestId:key,...(op==='paymentMockResult'?{expectedBookingId:data.id,expectedAmountCents:attempt?.amountCents,expectedCurrency:attempt?.currency}:{}),...(op==='quoteAccept'&&!Object.hasOwn(data,'paymentMethod')?{paymentMethod:'pay_in_store'}:{}),...(op==='quoteSubmit'&&!Object.hasOwn(data,'termsVersion')?{termsVersion:request?.termsVersion||request?.version||1}:{}),...data});
 };
 return {db,auth,users,api,read,write};
}
const vehicle={make:'Ford',model:'Fiesta',year:2022,colour:'Silver',registration:'abc 123 gp'};
const requestData={vehicleId:'car',title:'Respray doors',description:'Repair and repaint both doors.',categoryId:'paint',city:'Johannesburg',budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'};
const quoteData={scope:'Prepare and respray both doors',items:[{description:'Preparation',amountCents:10000},{description:'Paint and labour',amountCents:90000}],completionDays:3,warranty:'Six months',validForDays:14};
async function created(f,details={}){return (await f.write('owner','requestCreate',{...requestData,...details})).id;}
const audits=f=>[...f.db.rows.entries()].filter(([path])=>path.startsWith('auditLogs/'));

test('shop request feed preserves immutable attachment IDs and order through pagination and refresh without exposing Garage media',async()=>{
 const f=fixture();
 f.db.rows.get('vehicles/car').photoSlots={'1':'attached-a','2':'attached-b','3':'garage-only'};
 for(const id of ['attached-a','attached-b','garage-only'])f.db.rows.set('marketplacePhotos/'+id,{ownerId:'owner',vehicleId:'car',path:'photos/owner/car/'+id,name:id+'.jpg',size:100,contentType:'image/jpeg',bucket:'vehicle-images'});
 const selected=['attached-b','attached-a'];
 for(let index=0;index<21;index++){
  const id=await created(f,{photoIds:selected});f.db.rows.get('serviceRequests/'+id).createdAt=Timestamp.fromMillis(1800000000000+index);
 }
 const first=await f.read('shop','requests',{feed:'open'}),second=await f.read('shop','requests',{feed:'open',cursor:first.cursor});
 assert.equal(first.items.length,20);assert.equal(second.items.length,1);assert.equal(second.cursor,null);
 for(const item of [...first.items,...second.items]){
  assert.deepEqual(item.photoIds,selected);assert.deepEqual(item.photos.map(photo=>photo.id),selected);
  for(const photo of item.photos)assert.deepEqual(Object.keys(photo).sort(),['contentType','id','name','size','uploadedAt']);
 }
 assert.ok(!JSON.stringify([first,second]).includes('garage-only'));assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,21);
 f.db.rows.get('vehicles/car').photoSlots={};
 const refreshed=await f.read('shop','requests',{feed:'open'});assert.deepEqual(refreshed.items[0].photoIds,selected);
 assert.deepEqual((await f.read('shop','request',{id:refreshed.items[0].id})).request.photoIds,selected);
});

test('owner can update an open request transactionally and retries are idempotent',async()=>{
 const f=fixture(),id=await created(f),before=f.db.rows.get(`serviceRequests/${id}`);
 const input={id,version:before.version,title:'Updated title',description:'Updated description.',categoryId:'paint',city:'Pretoria',budgetMinCents:20000,budgetMaxCents:250000,preferredDate:'',visibility:'open'};
 const first=await f.write('owner','requestUpdate',input,'update-request'),second=await f.write('owner','requestUpdate',input,'update-request');
 assert.deepEqual(first,second);
 const saved=f.db.rows.get(`serviceRequests/${id}`);
 assert.equal(saved.title,'Updated title');assert.equal(saved.city,'Pretoria');assert.equal(saved.version,2);assert.equal(saved.termsVersion,2);
 assert.equal(audits(f).filter(([,value])=>value.action==='marketplace.requestUpdate').length,1);
});

test('an unchanged request save does not advance either revision or invalidate its quotation',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData},'unchanged-request');
 const saved=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 assert.equal(saved.version,before.version);assert.equal(saved.termsVersion,before.termsVersion);
 assert.equal(audits(f).filter(([,value])=>value.action==='marketplace.requestUpdate').length,0);
 const accepted=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'});
 assert.equal(accepted.id,offer.serviceRequestId);
});

test('a preferred-date-only edit advances the record revision but keeps the quotation terms revision',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,preferredDate:'2099-05-20'},'date-preference');
 const saved=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 assert.equal(saved.version,before.version+1);assert.equal(saved.termsVersion,before.termsVersion);
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).termsVersion,before.termsVersion);
 assert.equal((await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'})).id,offer.serviceRequestId);
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
test('quotes are bound to their request revision and cannot be accepted after a material request update',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,title:'Changed scope',description:requestData.description,categoryId:'paint',city:requestData.city,budgetMinCents:10000,budgetMaxCents:200000,preferredDate:'',visibility:'open'});
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).termsVersion,1);
 assert.equal(f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`).termsVersion,2);
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`).status,'open');
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith('bookings/')).length,0);
});

test('vehicle and category changes advance material terms and invalidate prior offers',async()=>{
 for(const change of [
  async(f,id,before)=>f.write('owner','requestUpdate',{id,version:before.version,...requestData,title:'Install a body kit',categoryId:'body'},'category-change'),
  async(f,id,before)=>{
   await f.write('owner','vehicleSave',{...vehicle,id:'car',version:1,make:'Honda'},'vehicle-change');
   await f.write('owner','requestUpdate',{id,version:before.version,...requestData},'vehicle-snapshot-change');
  },
 ]){
  const f=fixture({'serviceCategories/body':{name:'Body',description:'Body kits',archived:false}}),offer=await offered(f),id=offer.serviceRequestId,before=f.db.rows.get(`serviceRequests/${id}`);
  await change(f,id,before);
  assert.equal(f.db.rows.get(`serviceRequests/${id}`).termsVersion,2);
  await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 }
});

test('a shop can replace an outdated offer without overwriting quotation history',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Repair and repaint both doors'});
 const old=f.db.rows.get(`quotations/${offer.id}`);
 const result=await f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,scope:'Repair and repaint both doors',termsVersion:2});
 assert.notEqual(result.id,offer.id);
 const history=[...f.db.rows.entries()].filter(([path,value])=>path.startsWith('quotations/')&&value.serviceRequestId===offer.serviceRequestId);
 assert.equal(history.length,2);
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'superseded');
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).totalCents,old.totalCents);
 assert.equal(f.db.rows.get(`quotations/${result.id}`).termsVersion,2);
 assert.equal(f.db.rows.get(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`).quoteId,result.id);
 const current=(await f.read('owner','request',{id:offer.serviceRequestId})).quotes;
 assert.deepEqual(new Set(current.map(quote=>quote.id)),new Set([offer.id,result.id]));
 assert.equal((await f.write('owner','quoteAccept',{id:result.id,paymentMethod:'pay_in_store'})).id,offer.serviceRequestId);
});

test('legacy quotations without revision metadata are rejected until the shop submits a current replacement',async()=>{
 const f=fixture(),offer=await offered(f),legacy=f.db.rows.get(`quotations/${offer.id}`);
 delete legacy.requestVersion;delete legacy.termsVersion;
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`).status,'open');
 const result=await f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:1});
 assert.notEqual(result.id,offer.id);
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'superseded');
 assert.equal(f.db.rows.get(`quotations/${result.id}`).termsVersion,1);
 assert.equal((await f.write('owner','quoteAccept',{id:result.id,paymentMethod:'pay_in_store'})).id,offer.serviceRequestId);
});

test('valid deterministic legacy quotations remain acceptable without a head',async()=>{
 const f=fixture(),offer=await offered(f);
 f.db.rows.delete(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`);
 assert.equal((await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'})).id,offer.serviceRequestId);
});

test('mismatched legacy quotation without a head fails closed',async()=>{
 const f=fixture(),offer=await offered(f);
 f.db.rows.delete(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`);
 f.db.rows.get(`quotations/${offer.id}`).shopId='competitor';
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.has(`bookings/${offer.serviceRequestId}`),false);
});

test('malformed, dangling and mismatched quotation heads block replacement and acceptance',async()=>{
 const cases=[
  head=>({...head,quoteId:''}),
  head=>({...head,quoteId:'missing-quotation'}),
  head=>({...head,serviceRequestId:'another-request'}),
  head=>({...head,shopId:'competitor'}),
 ];
 for(const corrupt of cases){
  const f=fixture(),offer=await offered(f),path=`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`;
  f.db.rows.set(path,corrupt({quoteId:offer.id,serviceRequestId:offer.serviceRequestId,shopId:'shop'}));
  await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:1}),{code:'failed-precondition'});
  await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
  assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'submitted');
  assert.equal(f.db.rows.has(`bookings/${offer.serviceRequestId}`),false);
 }
});

test('a quotation head cannot point to another shop offer',async()=>{
 const f=fixture(),offer=await offered(f),competitor=await f.write('competitor','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData});
 f.db.rows.set(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`,{quoteId:competitor.id,serviceRequestId:offer.serviceRequestId,shopId:'shop'});
 await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:1}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'submitted');
 assert.equal(f.db.rows.get(`quotations/${competitor.id}`).status,'submitted');
});

test('stale current-head quotations require a replacement and superseded non-head offers cannot be accepted',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Changed material scope'});
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 const replacement=await f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:2});
 f.db.rows.get(`quotations/${offer.id}`).status='submitted';
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal((await f.write('owner','quoteAccept',{id:replacement.id,paymentMethod:'pay_in_store'})).id,offer.serviceRequestId);
});

test('a superseded quotation-head pointer is rejected without repairing or overwriting history',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Changed material scope'});
 const replacement=await f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:2});
 f.db.rows.set(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`,{quoteId:offer.id,serviceRequestId:offer.serviceRequestId,shopId:'shop'});
 await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:2}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:replacement.id,paymentMethod:'pay_in_store'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'superseded');
 assert.equal(f.db.rows.get(`quotations/${replacement.id}`).status,'submitted');
});

test('concurrent acceptance and replacement cannot create an accepted non-head quotation',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Changed material scope'});
 const results=await Promise.allSettled([
  f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:2},'racing-replacement'),
  f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'},'racing-acceptance'),
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const head=f.db.rows.get(`quotationHeads/${quoteId(offer.serviceRequestId,'shop')}`);
 assert.notEqual(head.quoteId,offer.id);
 assert.equal(f.db.rows.get(`quotations/${head.quoteId}`).status,'submitted');
 assert.equal(f.db.rows.has(`bookings/${offer.serviceRequestId}`),false);
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'superseded');
});

test('quote submissions require an explicit current material-terms revision',async()=>{
 const f=fixture(),serviceRequestId=await created(f);
 await assert.rejects(()=>f.read('shop','quoteSubmit',{serviceRequestId,...quoteData,requestId:'missing-terms-version'}),{code:'invalid-argument'});
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith('quotations/')).length,0);
});

test('accepted quotation price and scope remain immutable in its booking and history',async()=>{
 const f=fixture(),offer=await offered(f),savedQuote=f.db.rows.get(`quotations/${offer.id}`);
 const accepted=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'});
 const booking=f.db.rows.get(`bookings/${accepted.id}`);
 await assert.rejects(()=>f.write('shop','quoteWithdraw',{id:offer.id}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,...quoteData}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:1,...requestData,title:'Post-acceptance edit'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).totalCents,savedQuote.totalCents);
 assert.equal(f.db.rows.get(`quotations/${offer.id}`).scope,savedQuote.scope);
 assert.equal(f.db.rows.get(`bookings/${accepted.id}`).totalCents,savedQuote.totalCents);
 assert.equal(f.db.rows.get(`bookings/${accepted.id}`).scope,savedQuote.scope);
 assert.equal(booking.quoteId,offer.id);
});

test('concurrent request update and quote acceptance cannot commit incompatible terms',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 const update=f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Updated scope'},'race-update');
 const accept=f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'},'race-accept');
 const [updated,accepted]=await Promise.allSettled([update,accept]);
 assert.equal(Number(updated.status==='fulfilled')+Number(accepted.status==='fulfilled'),1);
 const request=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`),quote=f.db.rows.get(`quotations/${offer.id}`);
 if(accepted.status==='fulfilled'){
  const booking=f.db.rows.get(`bookings/${offer.serviceRequestId}`);
  assert.equal(request.status,'booked');assert.equal(quote.status,'accepted');
  assert.equal(booking.scope,quote.scope);assert.equal(booking.totalCents,quote.totalCents);
  assert.equal(booking.requestTitle,requestData.title);
 }else{
  assert.equal(request.status,'open');assert.equal(request.termsVersion,2);assert.equal(quote.status,'submitted');
  assert.equal(f.db.rows.has(`bookings/${offer.serviceRequestId}`),false);
 }
});

test('lost acknowledgement during replacement retries the same new quotation idempotently',async()=>{
 const f=fixture(),offer=await offered(f),before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Changed scope'});
 let once=true;f.db.after=async()=>{if(once){once=false;throw Error('Synthetic lost replacement response');}};
 const replacement={serviceRequestId:offer.serviceRequestId,...quoteData,termsVersion:2};
 await assert.rejects(()=>f.write('shop','quoteSubmit',replacement,'replacement-once'),/lost replacement response/);
 const first=await f.write('shop','quoteSubmit',replacement,'replacement-once');
 const second=await f.write('shop','quoteSubmit',replacement,'replacement-once');
 assert.deepEqual(first,second);assert.equal(f.db.rows.get(`quotations/${offer.id}`).status,'superseded');
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith('quotations/')).length,2);
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
 assert.equal(owner.quotes.length,2);assert.equal(shop.quotes.length,1);assert.equal(shop.quotes[0].shopId,'shop');assert.equal(shop.customerName,'Private customer name');
 assert.equal(shop.request.ownerId,undefined);assert.equal(shop.request.vehicleId,undefined);assert.deepEqual(shop.request.vehicle,{make:'Toyota',model:'Corolla',year:2020,colour:'Blue'});
 assert.ok(!JSON.stringify(shop).includes('PRIVATE-REG'));assert.equal(shop.quotes[0].totalCents,100000);assert.equal(shop.quotes[0].currency,'ZAR');
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
test('open request feed exposes safe customer names, accurate quote counts and current-shop quote state in one batch',async()=>{
 const f=fixture({'users/owner':{role:'owner',fullName:'  Lesley Lebelo. ',phone:'private phone',email:'lesley@example.invalid'},'users/competitor':{role:'shop',verificationStatus:'approved',shop:{shopName:'Other Shop'}}});
 const first=await created(f),second=await created(f,{title:'Second request'}),third=await created(f,{title:'Competitor-only quote'});
 const submitted=await f.write('shop','quoteSubmit',{serviceRequestId:first,...quoteData});
 await f.write('competitor','quoteSubmit',{serviceRequestId:first,...quoteData});
 await f.write('shop','quoteSubmit',{serviceRequestId:second,...quoteData});
 await f.write('competitor','quoteSubmit',{serviceRequestId:third,...quoteData});
 const feed=await f.read('shop','requests',{feed:'open'});
 const one=feed.items.find(item=>item.id===first),two=feed.items.find(item=>item.id===second),three=feed.items.find(item=>item.id===third);
 assert.equal(one.customerName,'Lesley Lebelo.');assert.equal(one.quotationCount,2);assert.equal(one.quotedByMe,true);
 assert.equal(two.quotationCount,1);assert.equal(two.quotedByMe,true);
 assert.equal(three.quotationCount,1);assert.equal(three.quotedByMe,false);
 assert.ok(!JSON.stringify(feed).includes('private phone'));assert.ok(!JSON.stringify(feed).includes('lesley@example.invalid'));
 assert.ok(!JSON.stringify(feed).includes('Other Shop'));assert.ok(!JSON.stringify(feed).includes('Trusted Motors'));assert.ok(!JSON.stringify(feed).includes('100000'));
 assert.equal(f.db.queries.filter(query=>query.path==='quotations').length,1);
 assert.deepEqual(feed.items.map(item=>item.id),[third,second,first]);
 assert.deepEqual(f.db.queries.find(query=>query.path==='quotations').filters,[['shopId','==','shop'],['serviceRequestId','in',[third,second,first]]]);
 await f.write('shop','quoteWithdraw',{id:submitted.id});
 const withdrawn=await f.read('shop','requests',{feed:'open'});
 assert.equal(withdrawn.items.find(item=>item.id===first).quotationCount,1);
 assert.equal(withdrawn.items.find(item=>item.id===first).quotedByMe,true);
});
test('missing customer profile names and contact-like strings are redacted from shop request cards',async()=>{
 const f=fixture({'users/owner':{role:'owner',fullName:'owner@example.invalid 0821234567'}});
 await created(f);
 const item=(await f.read('shop','requests',{feed:'open'})).items[0];
 assert.equal(item.customerName,'Customer');assert.ok(!JSON.stringify(item).includes('owner@example.invalid'));assert.ok(!JSON.stringify(item).includes('0821234567'));
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
 assert.deepEqual(Object.keys(result.items[1]).sort(),['city','id','province','services','shopName','verified'].sort());
 assert.equal(result.items[1].verified,true);
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

async function offered(f,{visibility='open',shopId,quote=quoteData}={}){
 const serviceRequestId=await created(f,{visibility,...(shopId?{shopId}:{})});
 const result=await f.write('shop','quoteSubmit',{serviceRequestId,...quote});
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
 assert.equal(saved.paymentMethod,'pay_in_store');assert.equal(saved.paymentStatus,'due');assert.equal(saved.serviceStatus,'not_started');
 assert.deepEqual(saved.items,quoteData.items);assert.equal(saved.totalCents,100000);assert.equal(saved.scope,quoteData.scope);assert.equal(saved.shopName,'Trusted Motors');assert.equal(saved.city,'Johannesburg');assert.equal(saved.categoryName,'Paint');
 assert.deepEqual(saved.vehicle,{make:'Toyota',model:'Corolla',year:2020,colour:'Blue'});
 quote.items[0].amountCents=1;request.title='Changed later';f.db.rows.get('vehicles/car').colour='Red';
 const owner=(await f.read('owner','booking',{id:result.id})).booking,shop=(await f.read('shop','booking',{id:result.id})).booking;
 assert.equal(owner.items[0].amountCents,10000);assert.equal(owner.requestTitle,requestData.title);assert.equal(owner.vehicle.colour,'Blue');
 assert.equal(shop.ownerId,undefined);assert.equal(shop.vehicleId,undefined);assert.ok(!JSON.stringify(shop).includes('PRIVATE-REG'));assert.ok(!JSON.stringify(shop).includes('private phone'));
 assert.equal(bookingAudits(f).length,1);
});

test('simulated online payments use the accepted quotation total and separate payment, booking and service states',async()=>{
 for(const outcome of ['successful','failed','cancelled','pending']){
  const f=fixture(),offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
  const saved=f.db.rows.get(`bookings/${booking.id}`),attempt=f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${saved.currentPaymentAttemptId}`);
  assert.equal(booking.paymentAttemptId,saved.currentPaymentAttemptId);assert.equal(saved.totalCents,100000);assert.equal(saved.paidCents,0);assert.equal(saved.balanceDueCents,100000);assert.equal(attempt.amountCents,100000);assert.equal(attempt.currency,'ZAR');
  assert.equal(saved.paymentStatus,'pending');assert.equal(saved.status,'pending_payment');assert.equal(saved.serviceStatus,'not_started');
  await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:saved.currentPaymentAttemptId,outcome,amountCents:1}),{code:'invalid-argument'});
  await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:saved.currentPaymentAttemptId,outcome},`resolve-${outcome}`);
  const after=f.db.rows.get(`bookings/${booking.id}`);
  assert.equal(after.paymentStatus,outcome==='successful'?'paid':outcome);
  assert.equal(f.db.rows.get(`bookings/${booking.id}`).status,outcome==='successful'?'pending_confirmation':'pending_payment');
  assert.equal(f.db.rows.get(`bookings/${booking.id}`).serviceStatus,'not_started');
  assert.equal(after.paidCents,outcome==='successful'?100000:0);assert.equal(after.balanceDueCents,outcome==='successful'?0:100000);
  assert.equal(f.db.rows.get(`paymentReceipts/${saved.currentPaymentAttemptId}`)?.testTransaction,outcome==='successful'?true:undefined);
  const emails=[...f.db.rows.entries()].filter(([path,value])=>path.startsWith('emailOutbox/')&&value.bookingId===booking.id);
  assert.ok(emails.every(([,value])=>value.deliveryStatus==='test_sink_only'&&value.simulated===true));
 }
});

test('quotation deposits use integer-cent rounding, preserve the specified value, and reject invalid terms',async()=>{
 const base={scope:'Test work',items:[{description:'Work',amountCents:101}],completionDays:1,warranty:'',validForDays:1};
 const percentage=M.quotation({...base,depositType:'percentage',depositValue:50});
 assert.equal(percentage.depositValue,50);assert.equal(percentage.depositAmountCents,51);
 const fixed=M.quotation({...base,depositType:'fixed',depositValue:50});
 assert.equal(fixed.depositValue,50);assert.equal(fixed.depositAmountCents,50);
 const legacy=M.quotation(base);
 assert.equal(legacy.depositType,'none');assert.equal(legacy.depositValue,null);assert.equal(legacy.depositAmountCents,null);
 for(const terms of [
  {depositType:'percentage',depositValue:0},
  {depositType:'percentage',depositValue:100},
  {depositType:'percentage',depositValue:1,items:[{description:'One cent',amountCents:1}]},
  {depositType:'fixed',depositValue:0},
  {depositType:'fixed',depositValue:101},
  {depositType:'unexpected',depositValue:1},
 ])assert.throws(()=>M.quotation({...base,...terms}),{code:'invalid-argument'});
});

test('accepted deposit terms remain immutable and a percentage deposit settles only its server-derived portion',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:25}});
 const quote=f.db.rows.get(`quotations/${offer.id}`);assert.equal(quote.depositAmountCents,25000);
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
 const saved=f.db.rows.get(`bookings/${booking.id}`),initial=f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${booking.paymentAttemptId}`);
 assert.deepEqual([saved.depositType,saved.depositValue,saved.depositAmountCents],['percentage',25,25000]);
 assert.equal(initial.amountCents,25000);assert.equal(saved.paidCents,0);assert.equal(saved.balanceDueCents,100000);
 quote.depositValue=80;quote.depositAmountCents=80000;
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'deposit-success');
 let current=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(current.paidCents,25000);assert.equal(current.balanceDueCents,75000);assert.equal(current.paymentStatus,'partially_paid');
 assert.equal(current.status,'pending_confirmation');assert.equal(current.depositAmountCents,25000);
 const paid=await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'deposit-success');
 assert.equal(paid.paymentStatus,'partially_paid');assert.equal(f.db.rows.get(`bookings/${booking.id}`).paidCents,25000);
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'deposit-replay'),{code:'failed-precondition'});
});

test('replacement quotations retain separate deposit terms and acceptance snapshots the replacement',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:25}});
 const before=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 await f.write('owner','requestUpdate',{id:offer.serviceRequestId,version:before.version,...requestData,title:'Updated work scope'},'deposit-terms-update');
 const current=f.db.rows.get(`serviceRequests/${offer.serviceRequestId}`);
 const replacement=await f.write('shop','quoteSubmit',{serviceRequestId:offer.serviceRequestId,termsVersion:current.termsVersion,...quoteData,depositType:'fixed',depositValue:30000});
 const old=f.db.rows.get(`quotations/${offer.id}`),next=f.db.rows.get(`quotations/${replacement.id}`);
 assert.equal(old.status,'superseded');assert.equal(old.depositType,'percentage');assert.equal(old.depositValue,25);assert.equal(old.depositAmountCents,25000);
 assert.equal(next.depositType,'fixed');assert.equal(next.depositValue,30000);assert.equal(next.depositAmountCents,30000);
 const booking=await f.write('owner','quoteAccept',{id:replacement.id,paymentMethod:'pay_deposit'});
 const saved=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(saved.depositType,'fixed');assert.equal(saved.depositValue,30000);assert.equal(saved.depositAmountCents,30000);
 assert.equal(f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${booking.paymentAttemptId}`).amountCents,30000);
});

test('balance payment attempts are server-priced, stale results fail, and concurrent settlement cannot double-count',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'fixed',depositValue:27500}});
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'first-deposit');
 const starts=await Promise.allSettled([f.write('owner','paymentStart',{id:booking.id},'start-balance-a'),f.write('owner','paymentStart',{id:booking.id},'start-balance-b')]);
 assert.equal(starts.filter(result=>result.status==='fulfilled').length,1);
 const started=starts.find(result=>result.status==='fulfilled').value,attempt=f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${started.paymentAttemptId}`);
 assert.equal(attempt.amountCents,72500);assert.equal(attempt.kind,'balance');assert.equal(attempt.status,'pending');
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'stale-deposit-result'),{code:'failed-precondition'});
 const results=await Promise.allSettled([
  f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'},'balance-result-a'),
  f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'},'balance-result-b'),
 ]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 const saved=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(saved.paidCents,100000);assert.equal(saved.balanceDueCents,0);assert.equal(saved.paymentStatus,'paid');
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith(`paymentReceipts/${started.paymentAttemptId}`)).length,1);
 await assert.rejects(()=>f.write('owner','paymentStart',{id:booking.id}),{code:'failed-precondition'});
});

test('shop may record only the server-calculated remaining balance once, without overpayment',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'fixed',depositValue:30000}});
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'deposit-paid');
 await assert.rejects(()=>f.write('owner','paymentRecordInStore',{id:booking.id,method:'simulated_cash'}),{code:'permission-denied'});
 await f.write('shop','paymentRecordInStore',{id:booking.id,method:'simulated_eft'});
 const saved=f.db.rows.get(`bookings/${booking.id}`),attempt=f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${saved.currentPaymentAttemptId}`);
 assert.equal(attempt.amountCents,70000);assert.equal(attempt.method,'simulated_eft');
 assert.equal(saved.paidCents,100000);assert.equal(saved.balanceDueCents,0);assert.equal(saved.paymentStatus,'paid');
 await assert.rejects(()=>f.write('shop','paymentRecordInStore',{id:booking.id,method:'simulated_cash'}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`bookings/${booking.id}`).paidCents,100000);
});

test('a corrupted attempt above the current balance fails closed without changing the ledger',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:25}});
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome:'successful'},'pay-before-corruption');
 const started=await f.write('owner','paymentStart',{id:booking.id});
 f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${started.paymentAttemptId}`).amountCents=75001;
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:started.paymentAttemptId,outcome:'successful'}),{code:'failed-precondition'});
 const saved=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(saved.paidCents,25000);assert.equal(saved.balanceDueCents,75000);
 assert.equal(f.db.rows.has(`paymentReceipts/${started.paymentAttemptId}`),false);
});

test('payment actions reject a paid status when the saved balance is still outstanding',async()=>{
 const f=fixture(),offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'});
 f.db.rows.get(`bookings/${booking.id}`).paymentStatus='paid';
 await assert.rejects(()=>f.write('owner','paymentStart',{id:booking.id}),{code:'failed-precondition'});
 assert.equal(f.db.rows.get(`bookings/${booking.id}`).balanceDueCents,100000);
 assert.equal(f.db.rows.get(`bookings/${booking.id}`).paidCents,0);
});

test('failed deposit retry preserves the original attempt and cancellation blocks settlement for review',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:20}});
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
 const oldAttemptId=booking.paymentAttemptId;
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:oldAttemptId,outcome:'failed'},'deposit-failure');
 const retry=await f.write('owner','paymentRetry',{id:booking.id});
 assert.equal(f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${oldAttemptId}`).status,'failed');
 assert.equal(f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${retry.paymentAttemptId}`).amountCents,20000);
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:oldAttemptId,outcome:'successful'},'stale-deposit'),{code:'failed-precondition'});
 await f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:retry.paymentAttemptId,outcome:'successful'},'retry-success');
 await f.write('owner','bookingCancel',{id:booking.id,reason:'Academic cancellation test'});
 const cancelled=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.paidCents,20000);assert.equal(cancelled.balanceDueCents,80000);
 assert.equal(cancelled.paymentReconciliationStatus,'refund_review_required');
 await assert.rejects(()=>f.write('owner','paymentStart',{id:booking.id}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('shop','paymentRecordInStore',{id:booking.id,method:'simulated_cash'}),{code:'failed-precondition'});
});

test('legacy quotations without deposits remain full-pay or in-store only',async()=>{
 const f=fixture(),offer=await offered(f),quote=f.db.rows.get(`quotations/${offer.id}`);
 delete quote.depositType;delete quote.depositValue;delete quote.depositAmountCents;
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'}),{code:'failed-precondition'});
 const booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
 const saved=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(saved.depositType,'none');assert.equal(saved.depositAmountCents,null);
 assert.equal(f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${booking.paymentAttemptId}`).amountCents,saved.totalCents);
});

test('failed simulated payments can be retried and pay-in-store payments are recorded only by the selected shop',async()=>{
 const f=fixture(),online=await offered(f),pending=await f.write('owner','quoteAccept',{id:online.id,paymentMethod:'pay_now'});
 await f.write('owner','paymentMockResult',{id:pending.id,paymentAttemptId:pending.paymentAttemptId,outcome:'failed'});
 const retry=await f.write('owner','paymentRetry',{id:pending.id});
 assert.equal(retry.paymentStatus,'pending');assert.ok(retry.paymentAttemptId);assert.equal(f.db.rows.get(`bookings/${pending.id}`).totalCents,100000);
 await assert.rejects(()=>f.write('competitor','paymentMockResult',{id:pending.id,paymentAttemptId:retry.paymentAttemptId,outcome:'successful'}),{code:'permission-denied'});
 const store=await offered(f),booking=await f.write('owner','quoteAccept',{id:store.id,paymentMethod:'pay_in_store'});
 assert.equal(f.db.rows.get(`bookings/${booking.id}`).paymentStatus,'due');assert.equal(f.db.rows.get(`bookings/${booking.id}`).balanceDueCents,100000);
 await assert.rejects(()=>f.write('owner','paymentRecordInStore',{id:booking.id,method:'simulated_cash'}),{code:'permission-denied'});
 await assert.rejects(()=>f.write('competitor','paymentRecordInStore',{id:booking.id,method:'simulated_cash'}),{code:'not-found'});
 await f.write('shop','paymentRecordInStore',{id:booking.id,method:'simulated_cash'});
 const saved=f.db.rows.get(`bookings/${booking.id}`),attempt=f.db.rows.get(`bookings/${booking.id}/paymentAttempts/${saved.currentPaymentAttemptId}`);
 assert.equal(saved.paymentStatus,'paid');assert.equal(saved.paidCents,100000);assert.equal(saved.balanceDueCents,0);assert.equal(saved.status,'pending_confirmation');assert.equal(attempt.testTransaction,true);
 assert.equal(f.db.rows.get(`paymentReceipts/${saved.currentPaymentAttemptId}`).receiptType,'SIMULATED_PAYMENT_RECEIPT');
});

test('service completion remains separate from booking confirmation and payment',async()=>{
 const f=fixture(),offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'});
 await f.write('shop','bookingConfirm',{id:booking.id,...appointment});
 await f.write('shop','bookingComplete',{id:booking.id});
 const saved=f.db.rows.get(`bookings/${booking.id}`);
 assert.equal(saved.status,'confirmed');assert.equal(saved.paymentStatus,'due');assert.equal(saved.serviceStatus,'completed');
});

test('a late simulated result after cancellation is rejected without changing payment history or accounting',async()=>{
 const f=fixture(),offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
 await f.write('owner','bookingCancel',{id:booking.id,reason:'Cancelled before simulated payment completed'});
 const before=JSON.stringify([...f.db.rows]);
 for(const outcome of ['successful','failed','cancelled','pending'])await assert.rejects(()=>f.write('owner','paymentMockResult',{id:booking.id,paymentAttemptId:booking.paymentAttemptId,outcome}),{code:'failed-precondition'});
 assert.equal(JSON.stringify([...f.db.rows]),before);
 assert.equal(f.db.rows.has(`paymentReceipts/${booking.paymentAttemptId}`),false);
});

test('booking reads expose only the participant email test-sink events and mark them undelivered',async()=>{
 const f=fixture(),offer=await offered(f),booking=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'});
 const owner=(await f.read('owner','booking',{id:booking.id})).testEmailEvents;
 const shop=(await f.read('shop','booking',{id:booking.id})).testEmailEvents;
 assert.equal(owner.length,1);assert.equal(shop.length,1);
 assert.ok(owner.every(item=>item.deliveryStatus==='test_sink_only'&&item.simulated===true));
 assert.ok(shop.every(item=>item.recipientUid==='shop'));
 assert.ok(!JSON.stringify(owner).includes('@'));
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
 assert.equal([...f.db.rows.keys()].filter(k=>k.startsWith('bookings/')&&k.slice('bookings/'.length).indexOf('/')===-1).length,1);assert.equal(bookingAudits(f).filter(([,v])=>v.action==='marketplace.quoteAccept').length,1);
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


test('online balance settlement preserves a confirmed appointment and completed service',async()=>{
 for(const serviceStatus of ['not_started','completed']){
  const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'fixed',depositValue:25000}}),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
  await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'});
  await f.write('shop','bookingConfirm',{id:b.id,...appointment});
  if(serviceStatus==='completed')await f.write('shop','bookingComplete',{id:b.id});
  const before=f.db.rows.get('bookings/'+b.id),agreed={date:before.appointmentDate,time:before.appointmentTime,at:before.appointmentAt.toMillis(),confirmed:before.confirmedAt.toMillis()};
  const attempt=await f.write('owner','paymentStart',{id:b.id});
  await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:attempt.paymentAttemptId,outcome:'successful'});
  const after=f.db.rows.get('bookings/'+b.id);
  assert.equal(after.status,'confirmed');assert.equal(after.serviceStatus,serviceStatus);assert.equal(after.paymentStatus,'paid');
  assert.deepEqual({date:after.appointmentDate,time:after.appointmentTime,at:after.appointmentAt.toMillis(),confirmed:after.confirmedAt.toMillis()},agreed);
  assert.equal(after.paidCents,100000);assert.equal(after.balanceDueCents,0);
 }
});

test('in-store settlement following failed initial online payment permits separate appointment confirmation',async()=>{
 const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
 await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'failed'});
 const result=await f.write('shop','paymentRecordInStore',{id:b.id,method:'simulated_cash'},'store-after-failure');
 assert.deepEqual(await f.write('shop','paymentRecordInStore',{id:b.id,method:'simulated_cash'},'store-after-failure'),result);
 const saved=f.db.rows.get('bookings/'+b.id);
 assert.equal(saved.status,'pending_confirmation');assert.equal(saved.paymentStatus,'paid');assert.equal(saved.paidCents,100000);assert.equal(saved.balanceDueCents,0);assert.equal(saved.appointmentAt,undefined);
 assert.equal(f.db.rows.get('bookings/'+b.id+'/paymentAttempts/'+b.paymentAttemptId).status,'failed');
 assert.equal(f.db.rows.get('paymentReceipts/'+result.paymentAttemptId).amountCents,100000);
 await f.write('shop','bookingConfirm',{id:b.id,...appointment});assert.equal(f.db.rows.get('bookings/'+b.id).status,'confirmed');
});

test('every mock payment mutation fails closed without an explicitly authorised local demo environment',async()=>{
 const configurations=[{},...Object.keys(LOCAL_MOCK_ENV).map(key=>({...LOCAL_MOCK_ENV,[key]:undefined})),
  {...LOCAL_MOCK_ENV,NODE_ENV:'production'}, {...LOCAL_MOCK_ENV,PMR_MOCK_PAYMENTS_ENABLED:'false'},
  {...LOCAL_MOCK_ENV,FIREBASE_PROJECT_ID:'real-project'}, {...LOCAL_MOCK_ENV,FIRESTORE_EMULATOR_HOST:'remote.example:8080'},
  {...LOCAL_MOCK_ENV,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:0'}, {...LOCAL_MOCK_ENV,GCLOUD_PROJECT:'real-project'}];
 for(const mockPaymentEnv of configurations){
  const f=fixture({}, {mockPaymentEnv});
  assert.deepEqual((await f.read('owner','vehicles')).items.map(v=>v.id),['car']);
  const offer=await offered(f); // request creation and quoting remain available
  const before=JSON.stringify([...f.db.rows]);
  for(const [uid,op,input] of [['owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}],['owner','paymentStart',{id:'any'}],['owner','paymentRetry',{id:'any'}],['owner','paymentMockResult',{id:'any',paymentAttemptId:'any',outcome:'successful'}],['shop','paymentRecordInStore',{id:'any',method:'simulated_cash'}]]){
   await assert.rejects(()=>f.write(uid,op,input),error=>error.code==='failed-precondition'&&/Mock payments are disabled/.test(error.message));
  }
  assert.equal(JSON.stringify([...f.db.rows]),before);
 }
 const f=fixture();f.db.projectId='real-project';const offer=await offered(f);
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:offer.id}),/Mock payments are disabled/);
});

test('malformed, incomplete and contradictory accounting is rejected without ledger writes',async()=>{
 const cases=[{paidCents:'0',balanceDueCents:'100000'},{paidCents:null},{balanceDueCents:null},{paidCents:NaN},{balanceDueCents:Infinity},{paidCents:0.5},{balanceDueCents:99999.5},
  {paidCents:-1,balanceDueCents:100001},{paidCents:100001,balanceDueCents:-1},{paidCents:Number.MAX_SAFE_INTEGER+1},{balanceDueCents:Number.MAX_SAFE_INTEGER+1},
  {paidCents:1,balanceDueCents:100000},{paidCents:25000,balanceDueCents:75000,paymentStatus:'due'},
  {paidCents:25000,balanceDueCents:75000,paymentStatus:'pending'},{paidCents:25000,balanceDueCents:75000,paymentStatus:'failed'},
  {paidCents:0,balanceDueCents:100000,paymentStatus:'partially_paid'},{paidCents:100000,balanceDueCents:0,paymentStatus:'partially_paid'},
  {paymentStatus:'unknown'},{paymentStatus:null},{totalCents:0},{totalCents:-1},{totalCents:100000001},{totalCents:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},
  {delete:'paidCents'},{delete:'balanceDueCents'},{delete:'paymentStatus'}];
 for(const changes of cases){
  const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_in_store'}),saved=f.db.rows.get('bookings/'+b.id);
  const {delete:removed,...values}=changes;Object.assign(saved,values);if(removed)delete saved[removed];
  const before=JSON.stringify([...f.db.rows]);
  await assert.rejects(()=>f.write('owner','paymentStart',{id:b.id}),{code:'failed-precondition'});
  await assert.rejects(()=>f.write('shop','paymentRecordInStore',{id:b.id,method:'simulated_cash'}),{code:'failed-precondition'});
  await assert.rejects(()=>f.write('owner','bookingCancel',{id:b.id,reason:'Corrupt record must remain untouched'}),{code:'failed-precondition'});
  assert.equal(JSON.stringify([...f.db.rows]),before);
 }
});

test('legacy accounting defaults apply only when both fields are absent and status is supported',async()=>{
 for(const status of [undefined,'due','pending','failed','cancelled','paid','partially_paid','invalid']){
  const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id}),saved=f.db.rows.get('bookings/'+b.id);
  delete saved.paidCents;delete saved.balanceDueCents;if(status===undefined)delete saved.paymentStatus;else saved.paymentStatus=status;
  if(['partially_paid','invalid'].includes(status)){await assert.rejects(()=>f.write('owner','bookingCancel',{id:b.id,reason:'Legacy cancellation'}),{code:'failed-precondition'});continue;}
  await f.write('owner','bookingCancel',{id:b.id,reason:'Legacy cancellation'});
  const after=f.db.rows.get('bookings/'+b.id);assert.equal(after.status,'cancelled');assert.equal(after.paymentReconciliationStatus,status==='paid'?'refund_review_required':undefined);
 }
});

test('legacy service completion requires a confirmed booking, selected shop and no previous completion evidence',async()=>{
 for(const variant of ['eligible','owner','competitor','pending','cancelled','completedAt','malformed']){
  const f=fixture(),b=await booked(f);await f.write('shop','bookingConfirm',{id:b.bookingId,...appointment});const saved=f.db.rows.get('bookings/'+b.bookingId);delete saved.serviceStatus;
  if(variant==='pending')saved.status='pending_confirmation';if(variant==='cancelled')saved.status='cancelled';if(variant==='completedAt')saved.serviceCompletedAt=Timestamp.now();if(variant==='malformed')saved.serviceStatus=null;
  if(variant!=='eligible'){await assert.rejects(()=>f.write(['owner','competitor'].includes(variant)?variant:'shop','bookingComplete',{id:b.bookingId}));continue;}
  const before=JSON.stringify({paid:saved.paidCents,balance:saved.balanceDueCents,payment:saved.paymentStatus,appointment:saved.appointmentAt});
  await f.write('shop','bookingComplete',{id:b.bookingId},'legacy-complete');
  const after=f.db.rows.get('bookings/'+b.bookingId);assert.equal(after.status,'confirmed');assert.equal(after.serviceStatus,'completed');assert.ok(after.serviceCompletedAt);
  assert.equal(JSON.stringify({paid:after.paidCents,balance:after.balanceDueCents,payment:after.paymentStatus,appointment:after.appointmentAt}),before);
  await f.write('shop','bookingComplete',{id:b.bookingId},'legacy-complete');
  await assert.rejects(()=>f.write('shop','bookingComplete',{id:b.bookingId}),{code:'failed-precondition'});
 }
});

test('current attempt is independently returned outside history pages without crossing booking ownership',async()=>{
 const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'}),saved=f.db.rows.get('bookings/'+b.id);
 const prefix='bookings/'+b.id+'/paymentAttempts/',original=f.db.rows.get(prefix+b.paymentAttemptId);f.db.rows.delete(prefix+b.paymentAttemptId);
 for(let i=0;i<26;i++)f.db.rows.set(prefix+'a'+String(i).padStart(2,'0'),{...original,status:'failed'});
 f.db.rows.set(prefix+'z-current',original);saved.currentPaymentAttemptId='z-current';
 const first=await f.read('owner','booking',{id:b.id});assert.equal(first.paymentAttempts.length,20);assert.equal(first.currentPaymentAttempt.id,'z-current');assert.equal(first.currentPaymentAttempt.status,'pending');assert.ok(first.paymentCursor);assert.ok(!first.paymentAttempts.some(a=>a.id==='z-current'));
 const second=await f.read('owner','booking',{id:b.id,paymentCursor:first.paymentCursor});assert.equal(second.currentPaymentAttempt.id,'z-current');assert.equal(second.paymentCursor,null);
 assert.equal(new Set([...first.paymentAttempts,...second.paymentAttempts].map(a=>a.id)).size,27);
 assert.equal((await f.read('shop','booking',{id:b.id})).currentPaymentAttempt.id,'z-current');
 for(const uid of ['other','competitor'])await assert.rejects(()=>f.read(uid,'booking',{id:b.id,paymentCursor:first.paymentCursor}),{code:'not-found'});
});


test('R250 checkout cannot settle the R750 balance and every acceptance replay is recovery-only',async()=>{
 const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'fixed',depositValue:25000}}),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'},'original-checkout');
 assert.equal(b.existingBooking,false);assert.equal(b.amountCents,25000);assert.equal(b.currency,'ZAR');
 await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'});
 const started=await f.write('owner','paymentStart',{id:b.id});assert.equal(started.amountCents,75000);assert.equal(started.paymentStatus,'partially_paid');assert.equal(started.paymentAttemptStatus,'pending');
 const before=JSON.stringify([...f.db.rows]),originalPaths=new Set(f.db.rows.keys());
 for(const key of ['original-checkout','new-checkout-key'])assert.deepEqual(await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'},key),{id:b.id,paymentAttemptId:null,existingBooking:true});
 assert.equal(JSON.stringify([...f.db.rows].filter(([p])=>originalPaths.has(p))),before);
 const added=[...f.db.rows.keys()].filter(p=>!originalPaths.has(p));assert.equal(added.length,1);assert.ok(added[0].startsWith('mutationReceipts/'));const afterReplay=JSON.stringify([...f.db.rows]);
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:started.paymentAttemptId,expectedAmountCents:25000,outcome:'successful'}),/Refresh the booking/);
 await assert.rejects(()=>f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'}),/Refresh the booking/);
 assert.equal(JSON.stringify([...f.db.rows]),afterReplay);
 const input={id:b.id,paymentAttemptId:started.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:75000,expectedCurrency:'ZAR',outcome:'successful'};
 const paid=await f.write('owner','paymentMockResult',input,'fresh-balance-confirmation');assert.equal(paid.paymentStatus,'paid');assert.equal(paid.paymentAttemptStatus,'paid');
 assert.deepEqual(await f.write('owner','paymentMockResult',input,'fresh-balance-confirmation'),paid);
 assert.equal(f.db.rows.get('bookings/'+b.id).paidCents,100000);assert.equal(f.db.rows.get('paymentReceipts/'+started.paymentAttemptId).amountCents,75000);
});

test('result confirmation requires the exact booking, amount and currency, never a client override',async()=>{
 const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
 const input={id:b.id,paymentAttemptId:b.paymentAttemptId,expectedBookingId:b.id,expectedAmountCents:100000,expectedCurrency:'ZAR',outcome:'successful'};
 for(const bad of [{expectedBookingId:'different'},{expectedAmountCents:1},{expectedAmountCents:-1},{expectedAmountCents:NaN},{expectedAmountCents:100000.5},{expectedCurrency:'USD'},{expectedBookingId:undefined},{expectedAmountCents:undefined},{expectedCurrency:undefined}]){
  const before=JSON.stringify([...f.db.rows]);await assert.rejects(()=>f.read('owner','paymentMockResult',{...input,...bad,requestId:'bad-confirmation'}),{code:'failed-precondition'});assert.equal(JSON.stringify([...f.db.rows]),before);
 }
 await assert.rejects(()=>f.read('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful',requestId:'old-mobile'}),/Refresh the booking/);
 await assert.rejects(()=>f.write('other','paymentMockResult',input),{code:'not-found'});
 await f.write('owner','paymentMockResult',input,'bound-confirmation');
 await assert.rejects(()=>f.write('owner','paymentMockResult',{...input,expectedAmountCents:1},'bound-confirmation'),{code:'already-exists'});
});

test('historical acceptance receipts without replay metadata also resume without exposing an attempt',async()=>{
 const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'},'legacy-accept');
 const saved=[...f.db.rows.values()].find(v=>v.op==='marketplace:quoteAccept');saved.result={id:b.id,paymentAttemptId:b.paymentAttemptId};
 assert.deepEqual(await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'},'legacy-accept'),{id:b.id,paymentAttemptId:null,existingBooking:true});
});

test('expired current quotation renewal preserves terms history and creates one fresh quotation head',async()=>{
 const f=fixture(),old=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:25}}),prior=f.db.rows.get('quotations/'+old.id);prior.validUntil=Timestamp.fromMillis(Date.now()-1);const oldTerms={scope:prior.scope,items:prior.items,total:prior.totalCents,deposit:prior.depositAmountCents,expiry:prior.validUntil.toMillis()};
 const before=f.db.rows.get('serviceRequests/'+old.serviceRequestId),version=before.version,terms=before.termsVersion;
 const input={...quoteData,serviceRequestId:old.serviceRequestId,termsVersion:terms,items:[{description:'Renewed work',amountCents:200000}],depositType:'fixed',depositValue:50000};
 const renewed=await f.write('shop','quoteSubmit',input,'renew-once');assert.deepEqual(await f.write('shop','quoteSubmit',input,'renew-once'),renewed);assert.notEqual(renewed.id,old.id);
 const history=f.db.rows.get('quotations/'+old.id),current=f.db.rows.get('quotations/'+renewed.id),request=f.db.rows.get('serviceRequests/'+old.serviceRequestId);
 assert.equal(history.status,'superseded');assert.deepEqual({scope:history.scope,items:history.items,total:history.totalCents,deposit:history.depositAmountCents,expiry:history.validUntil.toMillis()},oldTerms);
 assert.equal(current.totalCents,200000);assert.equal(current.depositAmountCents,50000);assert.ok(current.validUntil.toMillis()>Date.now());assert.equal(current.termsVersion,terms);
 assert.equal(request.version,version);assert.equal(request.termsVersion,terms);assert.equal(request.quotationCount,1);assert.equal(f.db.rows.get('quotationHeads/'+quoteId(old.serviceRequestId,'shop')).quoteId,renewed.id);
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:old.id}),{code:'failed-precondition'});
 const b=await f.write('owner','quoteAccept',{id:renewed.id,paymentMethod:'pay_deposit'});assert.equal(b.amountCents,50000);
});

test('concurrent renewals commit one replacement and cannot bypass withdrawal, booking or material revisions',async()=>{
 const f=fixture(),old=await offered(f);f.db.rows.get('quotations/'+old.id).validUntil=Timestamp.fromMillis(Date.now()-1);
 const input={...quoteData,serviceRequestId:old.serviceRequestId,termsVersion:1};
 const outcomes=await Promise.allSettled([f.write('shop','quoteSubmit',input,'renew-a'),f.write('shop','quoteSubmit',input,'renew-b')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'already-exists');
 assert.equal([...f.db.rows.values()].filter(v=>v.serviceRequestId===old.serviceRequestId&&v.status==='submitted').length,1);
 for(const variant of ['withdrawn','accepted','closed','stale-terms']){
  const g=fixture(),q=await offered(g);g.db.rows.get('quotations/'+q.id).validUntil=Timestamp.fromMillis(Date.now()-1);
  if(variant==='withdrawn')await g.write('shop','quoteWithdraw',{id:q.id});
  if(variant==='accepted'){g.db.rows.get('quotations/'+q.id).validUntil=Timestamp.fromMillis(Date.now()+100000);await g.write('owner','quoteAccept',{id:q.id});}
  if(variant==='closed')await g.write('owner','requestClose',{id:q.serviceRequestId});
  if(variant==='stale-terms')g.db.rows.get('serviceRequests/'+q.serviceRequestId).termsVersion=2;
  const before=JSON.stringify([...g.db.rows]);await assert.rejects(()=>g.write('shop','quoteSubmit',{...quoteData,serviceRequestId:q.serviceRequestId,termsVersion:1}));assert.equal(JSON.stringify([...g.db.rows]),before);
 }
});

test('expired legacy quotations renew safely while other shops can only create their own offers',async()=>{
 const f=fixture(),q=await offered(f),prior=f.db.rows.get('quotations/'+q.id);prior.validUntil=Timestamp.fromMillis(Date.now()-1);delete prior.termsVersion;delete prior.requestVersion;f.db.rows.delete('quotationHeads/'+quoteId(q.serviceRequestId,'shop'));
 const competitor=await f.write('competitor','quoteSubmit',{...quoteData,serviceRequestId:q.serviceRequestId});assert.equal(f.db.rows.get('quotations/'+q.id).status,'submitted');assert.equal(f.db.rows.get('quotations/'+competitor.id).shopId,'competitor');
 await assert.rejects(()=>f.write('owner','quoteSubmit',{...quoteData,serviceRequestId:q.serviceRequestId}),{code:'permission-denied'});
 const renewed=await f.write('shop','quoteSubmit',{...quoteData,serviceRequestId:q.serviceRequestId});assert.notEqual(renewed.id,q.id);assert.equal(f.db.rows.get('quotations/'+q.id).status,'superseded');assert.equal(f.db.rows.get('quotations/'+renewed.id).termsVersion,1);
});


test('retry responses keep overall partial payment distinct from the pending retry attempt',async()=>{
 const f=fixture(),q=await offered(f,{quote:{...quoteData,depositType:'fixed',depositValue:25000}}),b=await f.write('owner','quoteAccept',{id:q.id,paymentMethod:'pay_deposit'});
 await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'});const a=await f.write('owner','paymentStart',{id:b.id});await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:a.paymentAttemptId,outcome:'failed'});
 const retry=await f.write('owner','paymentRetry',{id:b.id});assert.equal(retry.paymentStatus,'partially_paid');assert.equal(retry.paymentAttemptStatus,'pending');assert.equal(retry.amountCents,75000);assert.equal(retry.currency,'ZAR');assert.equal(f.db.rows.get('bookings/'+b.id).paidCents,25000);
});

const collectionRows=(f,name)=>[...f.db.rows.entries()].filter(([path])=>path.startsWith(name+'/')).map(([path,data])=>({id:path.split('/').pop(),...data}));
test('Phase 3 receipts snapshot each deposit and settlement and never change after later payment or cancellation',async()=>{
 for(const inStore of [false,true]){
  const f=fixture(),offer=await offered(f,{quote:{...quoteData,depositType:'percentage',depositValue:25}}),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_deposit'});
  const pay={id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'};
  await f.write('owner','paymentMockResult',pay,'deposit-result');
  const first=(await f.read('owner','receipt',{id:b.paymentAttemptId})).receipt;
  assert.equal(first.receiptReference,'TEST-'+b.paymentAttemptId);assert.equal(first.amountCents,25000);assert.equal(first.totalCents,100000);assert.equal(first.paidCentsAfter,25000);assert.equal(first.balanceDueCentsAfter,75000);
  assert.equal(first.customer.id,'owner');assert.equal(first.shop.id,'shop');assert.equal(first.scope,quoteData.scope);assert.deepEqual(first.items,quoteData.items);assert.equal(first.method,'simulated_online');assert.ok(Number.isFinite(first.issuedAt));assert.match(first.notice,/SIMULATED \/ TEST/);
  await f.write('owner','paymentMockResult',pay,'deposit-result');
  await f.write('shop','bookingConfirm',{id:b.id,...appointment});
  let final;
  if(inStore)final=await f.write('shop','paymentRecordInStore',{id:b.id,method:'simulated_cash'},'settle');
  else{final=await f.write('owner','paymentStart',{id:b.id});await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:final.paymentAttemptId,outcome:'successful'},'settle');}
  const last=(await f.read('shop','receipt',{id:final.paymentAttemptId})).receipt;
  assert.equal(last.amountCents,75000);assert.equal(last.paidCentsAfter,100000);assert.equal(last.balanceDueCentsAfter,0);assert.equal(last.method,inStore?'simulated_cash':'simulated_online');
  assert.equal(f.db.rows.get('bookings/'+b.id).status,'confirmed');
  await f.write('owner','bookingCancel',{id:b.id,reason:'Test cancellation'});
  assert.deepEqual((await f.read('shop','receipt',{id:b.paymentAttemptId})).receipt,first);
  assert.equal(collectionRows(f,'paymentReceipts').length,2);
  for(const uid of ['other','competitor'])await assert.rejects(()=>f.read(uid,'receipt',{id:b.paymentAttemptId}),{code:'not-found'});
  for(const value of [first,last])assert.ok(!JSON.stringify(value).includes('private phone')&&!JSON.stringify(value).includes('private address'));
  await assert.rejects(()=>f.read('owner','receipt',{id:b.paymentAttemptId,balanceDueCentsAfter:0}),{code:'invalid-argument'});
 }
});
test('Phase 3 legacy receipts disclose missing historical snapshots without deriving current balances or methods',async()=>{
 const f=fixture(),b=await booked(f),id='legacy';f.db.rows.set('paymentReceipts/'+id,{bookingId:b.bookingId,paymentAttemptId:id,amountCents:10000,currency:'ZAR',simulated:true,testTransaction:true,issuedAt:Timestamp.fromMillis(1000)});
 f.db.rows.get('bookings/'+b.bookingId).balanceDueCents=123;
 const receipt=(await f.read('owner','receipt',{id})).receipt;
 assert.equal(receipt.historicalSnapshotUnavailable,true);assert.equal(receipt.totalCents,null);assert.equal(receipt.paidCentsAfter,null);assert.equal(receipt.balanceDueCentsAfter,null);assert.equal(receipt.method,null);assert.equal(receipt.amountCents,10000);assert.match(receipt.compatibilityNotice,/cannot be reconstructed/);
});
test('Phase 3 unsuccessful attempts never issue receipts and full and in-store payments do',async()=>{
 for(const outcome of ['failed','cancelled','pending','successful']){
  const f=fixture(),offer=await offered(f),b=await f.write('owner','quoteAccept',{id:offer.id,paymentMethod:'pay_now'});
  await f.write('owner','paymentMockResult',{id:b.id,paymentAttemptId:b.paymentAttemptId,outcome});
  assert.equal(collectionRows(f,'paymentReceipts').length,outcome==='successful'?1:0);
  if(outcome!=='successful')await assert.rejects(()=>f.read('owner','receipt',{id:b.paymentAttemptId}),{code:'not-found'});
 }
 const f=fixture(),b=await booked(f),r=await f.write('shop','paymentRecordInStore',{id:b.bookingId,method:'simulated_eft'});
 assert.equal((await f.read('owner','receipt',{id:r.paymentAttemptId})).receipt.balanceDueCentsAfter,0);
});
test('Phase 3 notifications are scoped, chronological with timestamp ties, paginated and read only by their recipient',async()=>{
 const f=fixture();
 for(let i=0;i<45;i++)await f.db.doc('notifications/n'+String(i).padStart(2,'0')).set({recipientUid:'owner',event:'booking_created',bookingId:'b',createdAt:Timestamp.fromMillis(Math.floor(i/3)*1000),readAt:null});
 await f.db.doc('notifications/foreign').set({recipientUid:'other',createdAt:Timestamp.fromMillis(90000),readAt:null});
 const first=await f.read('owner','notifications'),second=await f.read('owner','notifications',{cursor:first.cursor}),third=await f.read('owner','notifications',{cursor:second.cursor});
 assert.deepEqual([...first.items,...second.items,...third.items].map(x=>x.id),Array.from({length:45},(_,i)=>'n'+String(44-i).padStart(2,'0')));assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,5);assert.equal(third.cursor,null);
 assert.equal(first.items[0].readAt,null);
 await assert.rejects(()=>f.read('other','notifications',{cursor:first.cursor}),{code:'not-found'});
 await assert.rejects(()=>f.write('other','notificationRead',{id:first.items[0].id}),{code:'not-found'});
 const input={id:first.items[0].id};await f.write('owner','notificationRead',input,'mark-read');const time=f.db.rows.get('notifications/'+input.id).readAt;
 await f.write('owner','notificationRead',input,'mark-read');await f.write('owner','notificationRead',input,'mark-read-again');
 assert.deepEqual(f.db.rows.get('notifications/'+input.id).readAt,time);assert.ok((await f.read('owner','notifications')).items[0].readAt);assert.equal(collectionRows(f,'notifications').length,46);
});
test('Phase 3 event targets, renewal, test outbox templates and mutation replay are authoritative and idempotent',async()=>{
 const f=fixture(),id=await created(f,{visibility:'direct',shopId:'shop'});
 assert.deepEqual(collectionRows(f,'notifications')[0].target,{type:'request',id});
 let quote=await f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData},'submit');
 await f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData},'submit');
 f.db.rows.get('quotations/'+quote.id).validUntil=Timestamp.fromMillis(1);
 quote=await f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData},'renew');
 await f.write('shop','quoteSubmit',{serviceRequestId:id,...quoteData},'renew');
 assert.equal(collectionRows(f,'notifications').filter(n=>n.event==='quotation_renewed').length,1);
 const b=await f.write('owner','quoteAccept',{id:quote.id,paymentMethod:'pay_now'},'accept');await f.write('owner','quoteAccept',{id:quote.id,paymentMethod:'pay_now'},'accept');
 const pay={id:b.id,paymentAttemptId:b.paymentAttemptId,outcome:'successful'};await f.write('owner','paymentMockResult',pay,'payment');await f.write('owner','paymentMockResult',pay,'payment');
 await f.write('shop','bookingConfirm',{id:b.id,...appointment},'confirm');await f.write('shop','bookingConfirm',{id:b.id,...appointment},'confirm');
 await f.write('shop','bookingComplete',{id:b.id},'complete');await f.write('shop','bookingComplete',{id:b.id},'complete');
 await f.write('owner','bookingCancel',{id:b.id,reason:'Test'},'cancel');await f.write('owner','bookingCancel',{id:b.id,reason:'Test'},'cancel');
 const notifications=collectionRows(f,'notifications');
 for(const event of ['quotation_accepted','booking_created','simulated_payment_paid','booking_confirmed','service_completed','booking_cancelled'])assert.equal(notifications.filter(n=>n.event===event).length,2,event);
 const paid=notifications.find(n=>n.event==='simulated_payment_paid');assert.deepEqual(paid.target,{type:'receipt',id:b.paymentAttemptId,bookingId:b.id});assert.equal(paid.amountCents,100000);assert.match(paid.body,/ZAR 1000.00/);
 const renewed=notifications.find(n=>n.event==='quotation_renewed');assert.equal(renewed.recipientUid,'owner');assert.deepEqual(renewed.target,{type:'quotation',id});
 const emails=collectionRows(f,'emailOutbox');assert.equal(emails.length,10);
 for(const email of emails){assert.equal(email.transport,'test_outbox');assert.equal(email.deliveryStatus,'test_sink_only');assert.match(email.subject,/SIMULATED \/ TEST/);assert.match(email.body,/NOT REAL PAYMENT/);assert.match(email.deliveryDescription,/No email sent/);assert.ok(!JSON.stringify(email).includes('@')&&!JSON.stringify(email).includes('private phone'));}
 assert.match(emails.find(e=>e.event==='booking_created').subject,/awaiting appointment/);assert.match(emails.find(e=>e.event==='booking_confirmed').body,/09:30 SAST/);
 assert.equal((await f.read('other','notifications')).items.length,0);
});

test('owner receives authoritative rankings across pages without exposing competitors to shops',async()=>{
 const f=fixture(),id=await created(f);
 const full={...quoteData,serviceRequestId:id,scopeConfirmed:true,allChargesIncluded:true,coveredServices:[]};
 const a=await f.write('shop','quoteSubmit',full),b=await f.write('competitor','quoteSubmit',{...full,items:[{description:'Full work',amountCents:120000}]});
 const before=f.db.rows.size;
 const result=await f.read('owner','request',{id});
 assert.equal(result.recommendations.recommendedId,a.id);assert.deepEqual(result.recommendations.rankedIds,[a.id,b.id]);assert.equal(result.recommendations.distanceUsed,false);
 assert.equal(f.db.rows.size,before);
 const next=await f.read('owner','request',{id,quotesCursor:a.id});assert.deepEqual(next.recommendations.rankedIds,result.recommendations.rankedIds);
 const shop=await f.read('shop','request',{id});assert.equal(shop.recommendations,undefined);assert.deepEqual(shop.quotes.map(q=>q.id),[a.id]);
 await assert.rejects(()=>f.read('other','request',{id}),{code:'not-found'});
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:a.id,score:100,recommendedId:a.id}),{code:'invalid-argument'});
 // A customer may freely accept the lower-ranked valid offer using existing payment checks.
 const booked=await f.write('owner','quoteAccept',{id:b.id,paymentMethod:'pay_in_store'});
 assert.equal(booked.id,id);assert.equal(f.db.rows.get('bookings/'+id).totalCents,120000);
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,null);
});

test('recommendation reads exclude non-current heads, blocked shops and disabled Auth users',async()=>{
 const f=fixture(),id=await created(f);
 const full={...quoteData,serviceRequestId:id,scopeConfirmed:true,allChargesIncluded:true};
 const a=await f.write('shop','quoteSubmit',full),b=await f.write('competitor','quoteSubmit',full);
 assert.ok((await f.read('owner','request',{id})).recommendations.recommendedId);
 const head=f.db.rows.get('quotationHeads/'+quoteId(id,'shop'));head.quoteId='missing';
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,null);
 head.quoteId=a.id;f.users.set('competitor',{emailVerified:true,disabled:true});
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,null);
 f.users.clear();f.db.rows.get('users/competitor').accountStatus='blocked';
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,null);
});

test('mandatory requirements and explicit service coordinates are validated and versioned',async()=>{
 const f=fixture(),id=await created(f);
 const a=await f.write('shop','quoteSubmit',{...quoteData,serviceRequestId:id,scopeConfirmed:true,allChargesIncluded:true});
 const before=f.db.rows.get('serviceRequests/'+id);
 await f.write('owner','requestUpdate',{...requestData,id,version:before.version,mandatoryServices:['Preparation','Paint'],serviceLocation:{latitude:-26.2,longitude:28.04}});
 assert.equal(f.db.rows.get('serviceRequests/'+id).termsVersion,2);
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:a.id}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('shop','quoteSubmit',{...quoteData,serviceRequestId:id,coveredServices:['Unrequested']}),{code:'invalid-argument'});
 await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,serviceLocation:{latitude:'0',longitude:0}}),{code:'invalid-argument'});
 await assert.rejects(()=>f.write('owner','requestCreate',{...requestData,mandatoryServices:['Paint','paint']}),{code:'invalid-argument'});
 const updated=f.db.rows.get('serviceRequests/'+id);
 await f.write('owner','requestUpdate',{...requestData,id,version:updated.version,title:'Updated title'});
 assert.deepEqual(f.db.rows.get('serviceRequests/'+id).mandatoryServices,['Preparation','Paint']);
 assert.deepEqual(f.db.rows.get('serviceRequests/'+id).serviceLocation,{latitude:-26.2,longitude:28.04});
});

test('recommendation failures preserve the normal quotation list and suppress a winner',async()=>{
 const f=fixture(),offer=await offered(f);
 f.auth.getUser=async()=>{throw new Error('Private upstream details');};
 const result=await f.read('owner','request',{id:offer.serviceRequestId});
 assert.deepEqual(result.quotes.map(quote=>quote.id),[offer.id]);
 assert.equal(result.recommendations.recommendedId,null);
 assert.match(result.recommendations.limitation,/temporarily unavailable/);
 assert.equal(JSON.stringify(result).includes('Private upstream details'),false);
});

test('the recommendation read is bounded and never names a winner from a truncated comparison',async()=>{
 const f=fixture(),id=await created(f);
 for(let index=0;index<501;index++)f.db.rows.set('quotations/bounded-'+index,{...quoteData,serviceRequestId:id,status:'submitted'});
 const result=await f.read('owner','request',{id});
 assert.equal(result.quotes.length,20);assert.ok(result.quotesCursor);
 assert.equal(result.recommendations.recommendedId,null);assert.match(result.recommendations.limitation,/Too many quotations/);
 assert.ok(f.db.queries.some(query=>query.path==='quotations'&&query.maximum===501));
});

test('rankings include offers outside the visible page and derive live service/shop coordinates',async()=>{
 const f=fixture(),id=await created(f),saved=f.db.rows.get('serviceRequests/'+id);
 saved.serviceLocation={latitude:-26.2,longitude:28.04};
 const full={...quoteData,serviceRequestId:id,scopeConfirmed:true,allChargesIncluded:true};
 const a=await f.write('shop','quoteSubmit',full),b=await f.write('competitor','quoteSubmit',full);
 f.db.rows.get('users/shop').shop.coordinates={latitude:-28,longitude:28};
 f.db.rows.get('users/competitor').shop.coordinates=saved.serviceLocation;
 for(let index=0;index<25;index++)f.db.rows.set('quotations/000-history-'+String(index).padStart(2,'0'),{...full,status:'superseded'});
 const result=await f.read('owner','request',{id});
 assert.ok(result.quotes.every(quote=>quote.status==='superseded'));
 assert.equal(result.recommendations.recommendedId,b.id);assert.equal(result.recommendations.distanceUsed,true);
 f.db.rows.get('users/shop').shop.coordinates=saved.serviceLocation;
 delete f.db.rows.get('users/competitor').shop.coordinates;
 const missing=await f.read('owner','request',{id});assert.equal(missing.recommendations.distanceUsed,false);
 assert.equal(missing.recommendations.entries.find(entry=>entry.id===a.id).distanceKm,0);
 assert.equal(missing.recommendations.entries.find(entry=>entry.id===b.id).distanceKm,null);
});

test('shop-location saves recalculate distances and origin-only request edits invalidate old quotations',async()=>{
 const f=fixture(),id=await created(f);
 await f.write('owner','requestUpdate',{...requestData,id,version:1,serviceLocation:{latitude:0,longitude:0}});
 const full={...quoteData,serviceRequestId:id,scopeConfirmed:true,allChargesIncluded:true};
 const a=await f.write('shop','quoteSubmit',full),b=await f.write('competitor','quoteSubmit',full);
 const {createServices}=require('../services.cjs');
 const auth={getUser:async uid=>({...await f.auth.getUser(uid),metadata:{creationTime:'2020-01-01'},tokensValidAfterTime:'2020-01-01'})};
 const services=createServices({db:f.db,auth,storage:{}});
 const locate=(uid,coordinates,expectedCoordinates,requestId)=>services.completeProfile({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000}},data:{op:'shopLocationSave',coordinates,expectedCoordinates,requestId}});
 await locate('shop',{latitude:0,longitude:1},null,'set-shop-location');await locate('competitor',{latitude:0,longitude:2},null,'set-other-location');
 const first=(await f.read('owner','request',{id})).recommendations;
 assert.equal(first.recommendedId,a.id);assert.ok(Math.abs(first.entries.find(q=>q.id===a.id).distanceKm-111.195)<0.01);
 await locate('shop',{latitude:0,longitude:3},{latitude:0,longitude:1},'move-shop-location');
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,b.id);
 await locate('shop',null,{latitude:0,longitude:3},'remove-shop-location');assert.equal((await f.read('owner','request',{id})).recommendations.distanceUsed,false);
 const before=f.db.rows.get('serviceRequests/'+id);
 await f.write('owner','requestUpdate',{...requestData,id,version:before.version,serviceLocation:{latitude:1,longitude:0}});
 assert.equal(f.db.rows.get('serviceRequests/'+id).termsVersion,before.termsVersion+1);
 assert.equal((await f.read('owner','request',{id})).recommendations.recommendedId,null);
 await assert.rejects(()=>f.write('owner','quoteAccept',{id:b.id}),{code:'failed-precondition'});
 await assert.rejects(()=>f.write('other','requestUpdate',{...requestData,id,version:before.version+1,serviceLocation:null}),{code:'not-found'});
});

function messagingFixture() {
 const f=fixture(),{createServices}=require('../services.cjs');let sequence=0;
 const auth={getUser:async uid=>({metadata:{creationTime:'2020-01-01'},tokensValidAfterTime:'2020-01-01',...await f.auth.getUser(uid)})};
 const services=createServices({db:f.db,auth,storage:{},mockPaymentEnv:LOCAL_MOCK_ENV});
 const chat=(uid,op,data={})=>services.messaging({auth:{uid,token:{email_verified:true,auth_time:Date.now()/1000}},data:{op,...(['open','enquire','consent','send','read'].includes(op)?{requestId:`chat-test-${++sequence}`} : {}),...data}});
 return {...f,chat};
}
const chatRows=(f,prefix)=>[...f.db.rows.entries()].filter(([path])=>path.startsWith(prefix+'/'));

test('open-request visibility alone cannot initiate chat; an enquiry stays pending until customer consent',async()=>{
 const f=messagingFixture(),id=await created(f);
 await assert.rejects(()=>f.chat('shop','open',{serviceRequestId:id}),{code:'permission-denied'});
 assert.equal(chatRows(f,'conversations').length,0);
 const enquiry=await f.chat('shop','enquire',{serviceRequestId:id,reason:'May we discuss the required paint finish?'});
 assert.equal((await f.chat('shop','get',{id:enquiry.id})).conversation.canSend,false);
 await assert.rejects(()=>f.chat('shop','send',{id:enquiry.id,text:'Not approved'}),{code:'permission-denied'});
 await assert.rejects(()=>f.chat('shop','consent',{id:enquiry.id,decision:'approved'}),{code:'permission-denied'});
 await f.chat('owner','consent',{id:enquiry.id,decision:'approved'});
 await f.chat('shop','send',{id:enquiry.id,text:'Thanks for approving this discussion.'});
 assert.equal((await f.chat('owner','get',{id:enquiry.id})).messages.length,1);
});

test('customer initiation is explicit consent for an eligible shop on an owned request',async()=>{
 const f=messagingFixture(),id=await created(f);
 await assert.rejects(()=>f.chat('other','open',{serviceRequestId:id,shopId:'shop'}),{code:'not-found'});
 const conversation=await f.chat('owner','open',{serviceRequestId:id,shopId:'shop'});
 const result=await f.chat('shop','get',{id:conversation.id});assert.equal(result.conversation.consent,'approved');assert.equal(result.conversation.canSend,true);
 await f.chat('shop','send',{id:conversation.id,text:'Authorised reply'});
 assert.equal((await f.chat('owner','list')).items[0].unreadCount,1);
});

test('a current quoted shop can initiate while an unrelated shop cannot read, join or send',async()=>{
 const f=messagingFixture(),offer=await offered(f),id=offer.serviceRequestId;
 const conversation=await f.chat('shop','open',{serviceRequestId:id});
 await f.chat('shop','send',{id:conversation.id,text:'Question about the current offer'});
 for(const op of ['get','send','read','consent'])await assert.rejects(()=>f.chat('competitor',op,{id:conversation.id,...(op==='send'?{text:'Forged'}:op==='read'?{through:0}:op==='consent'?{decision:'approved'}:{})}),{code:'not-found'});
 await assert.rejects(()=>f.chat('competitor','open',{serviceRequestId:id,shopId:'shop'}),{code:'permission-denied'});
 await assert.rejects(()=>f.chat('shop','send',{id:conversation.id,text:'Forged sender',senderId:'owner'}),{code:'invalid-argument'});
 assert.deepEqual((await f.chat('other','list')).items,[]);assert.deepEqual((await f.chat('competitor','list')).items,[]);
});

test('direct invitation is restricted to its invited shop and ends when the request closes or changes shop',async()=>{
 const f=messagingFixture(),id=await created(f,{visibility:'direct',shopId:'shop'});
 await assert.rejects(()=>f.chat('competitor','open',{serviceRequestId:id}),{code:'not-found'});
 await assert.rejects(()=>f.chat('owner','open',{serviceRequestId:id,shopId:'competitor'}),{code:'permission-denied'});
 const c=await f.chat('shop','open',{serviceRequestId:id});await f.chat('shop','send',{id:c.id,text:'Invited discussion'});
 f.db.rows.get('serviceRequests/'+id).shopId='competitor';
 assert.equal((await f.chat('shop','get',{id:c.id})).conversation.canSend,false);
 await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'Old invitation'}),{code:'permission-denied'});
 f.db.rows.get('serviceRequests/'+id).shopId='shop';f.db.rows.get('serviceRequests/'+id).status='closed';
 assert.equal((await f.chat('shop','get',{id:c.id})).messages.length,1);
});

test('rejected enquiries and explicit revocation block both parties, even when a quote later exists',async()=>{
 const f=messagingFixture(),id=await created(f),c=await f.chat('shop','enquire',{serviceRequestId:id,reason:'Please approve a discussion.'});
 await f.chat('owner','consent',{id:c.id,decision:'rejected'});
 await assert.rejects(()=>f.chat('shop','enquire',{serviceRequestId:id,reason:'Repeated enquiry'}),{code:'permission-denied'});
 await f.write('shop','quoteSubmit',{...quoteData,serviceRequestId:id});
 for(const uid of ['shop','owner'])await assert.rejects(()=>f.chat(uid,'send',{id:c.id,text:'Rejected enquiry bypass'}),{code:'permission-denied'});
 await f.chat('owner','consent',{id:c.id,decision:'approved'});await f.chat('owner','send',{id:c.id,text:'We may discuss now'});
 await f.chat('owner','consent',{id:c.id,decision:'revoked'});
 for(const uid of ['shop','owner'])await assert.rejects(()=>f.chat(uid,'send',{id:c.id,text:'Revoked bypass'}),{code:'permission-denied'});
 assert.equal((await f.chat('owner','get',{id:c.id})).messages.length,1);
});

test('expired, withdrawn, superseded and obsolete offers preserve history but cannot authorise new messages',async()=>{
 for(const change of [quote=>{quote.validUntil=Timestamp.fromMillis(Date.now()-1);},quote=>{quote.status='withdrawn';},quote=>{quote.status='superseded';},quote=>{quote.termsVersion=0;}]) {
  const f=messagingFixture(),offer=await offered(f),c=await f.chat('shop','open',{serviceRequestId:offer.serviceRequestId});
  await f.chat('shop','send',{id:c.id,text:'Original authorised message'});change(f.db.rows.get('quotations/'+offer.id));
  const history=await f.chat('owner','get',{id:c.id});assert.equal(history.messages.length,1);assert.equal(history.conversation.canSend,false);
  await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'No current relationship'}),{code:'permission-denied'});
 }
});

test('a valid booking continues authorisation after quote expiry; cancellation or explicit revocation stops sends',async()=>{
 const f=messagingFixture(),offer=await offered(f),c=await f.chat('shop','open',{serviceRequestId:offer.serviceRequestId});
 await f.write('owner','quoteAccept',{id:offer.id});f.db.rows.get('quotations/'+offer.id).validUntil=Timestamp.fromMillis(Date.now()-1);
 await f.chat('shop','send',{id:c.id,text:'Discuss the booked appointment'});
 assert.equal((await f.chat('owner','get',{id:c.id})).conversation.bookingId,offer.serviceRequestId);
 f.db.rows.get('bookings/'+offer.serviceRequestId).status='cancelled';
 await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'Cancelled relationship'}),{code:'permission-denied'});
 assert.equal((await f.chat('owner','get',{id:c.id})).messages.length,1);
});

test('current quotation heads and material request versions are checked on every send',async()=>{
 const f=messagingFixture(),offer=await offered(f),c=await f.chat('shop','open',{serviceRequestId:offer.serviceRequestId});
 f.db.rows.get('quotationHeads/'+quoteId(offer.serviceRequestId,'shop')).quoteId='missing';
 await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'Not current'}),{code:'permission-denied'});
 await f.chat('owner','consent',{id:c.id,decision:'approved'});
 await f.write('owner','requestUpdate',{...requestData,id:offer.serviceRequestId,version:1,description:'Material scope change'});
 await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'Consent belongs to old terms'}),{code:'permission-denied'});
});

test('canonical conversations survive concurrent starts and enquiries without duplicate records or opening notifications',async()=>{
 const f=messagingFixture(),offer=await offered(f);
 const results=await Promise.all(Array.from({length:8},()=>f.chat('shop','open',{serviceRequestId:offer.serviceRequestId})));
 assert.equal(new Set(results.map(row=>row.id)).size,1);
 assert.equal(chatRows(f,'conversations').length,1);
 assert.equal(chatRows(f,'notifications').filter(([,row])=>row.event==='conversation_opened').length,1);
 const same=await f.chat('owner','open',{serviceRequestId:offer.serviceRequestId,shopId:'shop'});assert.equal(same.id,results[0].id);
 const late=messagingFixture(),current=await offered(late);
 const enquired=await late.chat('shop','enquire',{serviceRequestId:current.serviceRequestId,reason:'A quotation became current before this enquiry arrived.'});
 assert.equal((await late.chat('shop','get',{id:enquired.id})).conversation.canSend,true);
 assert.equal(chatRows(late,'notifications').filter(([,row])=>row.event==='conversation_opened').length,1);
 assert.equal((await late.chat('shop','open',{serviceRequestId:current.serviceRequestId})).id,enquired.id);
});

test('message retries persist one message, one recipient notification and one unread increment',async()=>{
 const f=messagingFixture(),id=await created(f),c=await f.chat('owner','open',{serviceRequestId:id,shopId:'shop'});
 const businessBefore=JSON.stringify([...f.db.rows].filter(([path])=>/^(serviceRequests|quotations|bookings)\//.test(path)));
 const payload={id:c.id,text:'Official changes still use the quotation and booking workflows.',requestId:'same-send'};
 const results=await Promise.all([f.chat('owner','send',payload),f.chat('owner','send',payload)]);assert.deepEqual(results[0],results[1]);
 const view=await f.chat('shop','get',{id:c.id});assert.equal(view.messages.length,1);assert.equal(view.messages[0].senderId,'owner');assert.equal(view.conversation.unreadCount,1);assert.equal(typeof view.messages[0].createdAt,'number');
 const notifications=chatRows(f,'notifications').filter(([,row])=>row.event==='message_received');assert.equal(notifications.length,1);assert.equal(notifications[0][1].recipientUid,'shop');
 assert.equal(JSON.stringify([...f.db.rows].filter(([path])=>/^(serviceRequests|quotations|bookings)\//.test(path))),businessBefore);
 await assert.rejects(()=>f.chat('owner','send',{...payload,text:'Altered retry'}),{code:'already-exists'});
});

test('read acknowledgements cannot clear unseen concurrent messages or change the other participant unread count',async()=>{
 const f=messagingFixture(),id=await created(f),c=await f.chat('owner','open',{serviceRequestId:id,shopId:'shop'});
 await f.chat('owner','send',{id:c.id,text:'First'});const first=await f.chat('shop','get',{id:c.id});
 assert.equal(first.conversation.unreadCount,1);
 await f.chat('owner','send',{id:c.id,text:'Second arrived later'});
 assert.equal((await f.chat('shop','read',{id:c.id,through:1})).unreadCount,1);
 await f.chat('shop','read',{id:c.id,through:1});assert.equal((await f.chat('shop','get',{id:c.id})).conversation.unreadCount,1);
 await assert.rejects(()=>f.chat('shop','read',{id:c.id,through:3}),{code:'invalid-argument'});
 await f.chat('shop','send',{id:c.id,text:'Reply'});await f.chat('shop','read',{id:c.id,through:2});
 assert.equal((await f.chat('owner','get',{id:c.id})).conversation.unreadCount,1);
});

test('history pagination is chronological and send throttling rejects spam without blocking idempotent retries',async()=>{
 const f=messagingFixture(),id=await created(f),c=await f.chat('owner','open',{serviceRequestId:id,shopId:'shop'});
 for(let i=0;i<25;i++){
  if(i%10===0){const row=f.db.rows.get('conversations/'+c.id);row.ownerSendWindow={start:Date.now()-61000,count:0};}
  await f.chat('owner','send',{id:c.id,text:'Message '+i});
 }
 const latest=await f.chat('shop','get',{id:c.id});assert.deepEqual(latest.messages.map(row=>row.sequence),Array.from({length:20},(_,i)=>i+6));assert.ok(latest.cursor);
 const older=await f.chat('shop','get',{id:c.id,cursor:latest.cursor});assert.deepEqual(older.messages.map(row=>row.sequence),[1,2,3,4,5]);assert.equal(older.cursor,null);
 for(let i=0;i<5;i++)await f.chat('owner','send',{id:c.id,text:'Burst '+i});
 await assert.rejects(()=>f.chat('owner','send',{id:c.id,text:'Spam'}),{code:'resource-exhausted'});
 for(const text of ['', 'x'.repeat(2001),'bad\u0000message'])await assert.rejects(()=>f.chat('shop','send',{id:c.id,text}),{code:'invalid-argument'});
});

test('disabled, unverified, revoked or unapproved participants cannot send; an active owner retains read-only history',async()=>{
 const f=messagingFixture(),id=await created(f),c=await f.chat('owner','open',{serviceRequestId:id,shopId:'shop'});
 await f.chat('shop','send',{id:c.id,text:'Before access changed'});
 f.users.set('shop',{emailVerified:true,disabled:true});await assert.rejects(()=>f.chat('shop','get',{id:c.id}),{code:'permission-denied'});
 assert.equal((await f.chat('owner','get',{id:c.id})).conversation.canSend,false);
 f.users.clear();f.db.rows.get('users/shop').verificationStatus='rejected';await assert.rejects(()=>f.chat('shop','send',{id:c.id,text:'Unapproved'}),{code:'permission-denied'});
 assert.equal((await f.chat('owner','get',{id:c.id})).messages.length,1);
});
