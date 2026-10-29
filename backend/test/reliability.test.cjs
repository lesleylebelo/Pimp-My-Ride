const {test}=require('node:test');
const assert=require('node:assert/strict');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {mutation}=require('../mutations.cjs');
const {createPresence}=require('../presence.cjs');
const {createServices}=require('../services.cjs');

test('mutation retries survive lost acknowledgements without repeating writes',async()=>{
 const db=memoryDb(),input={requestId:'retry-1',name:'Paint',nested:{a:1,b:2}},receipt=mutation(db,'admin','categorySave',input);
 let changes=0;const change=async tx=>{changes++;tx.create(db.doc('serviceCategories/paint'),{name:input.name});return {id:'paint'};};
 db.after=async n=>{if(n===1)throw Error('lost acknowledgement');};
 await assert.rejects(()=>receipt.atomic(change),/lost acknowledgement/);
 assert.deepEqual(await mutation(db,'admin','categorySave',{nested:{b:2,a:1},name:'Paint',requestId:'retry-1'}).atomic(change),{id:'paint'});
 assert.equal(changes,1);assert.equal(db.rows.size,2);
});

test('mutation keys isolate actors and operations and reject changed payloads',async()=>{
 const db=memoryDb(),input={requestId:'same-key',name:'Paint'};
 const first=mutation(db,'admin-one','categorySave',input);
 await first.atomic(async()=>({ok:true}));
 await assert.rejects(()=>mutation(db,'admin-one','categorySave',{...input,name:'Wrap'}).atomic(async()=>assert.fail('must not run change')), {code:'already-exists'});
 const otherActor=mutation(db,'admin-two','categorySave',input),otherOperation=mutation(db,'admin-one','categoryArchive',input);
 assert.notEqual(first.id,otherActor.id);assert.notEqual(first.id,otherOperation.id);
 await otherActor.atomic(async()=>({id:'second'}));await otherOperation.atomic(async()=>({id:'third'}));
 assert.equal(db.rows.size,3);
});

test('failed atomic changes leave no receipt and permit a meaningful retry',async()=>{
 const db=memoryDb(),receipt=mutation(db,'admin','editAccount',{requestId:'retry-change',uid:'owner'});
 await assert.rejects(()=>receipt.atomic(async tx=>{tx.create(db.doc('users/owner'),{fullName:'Owner'});throw Error('validation failed');}),/validation failed/);
 assert.equal(db.rows.size,0);
 assert.deepEqual(await receipt.atomic(async tx=>{tx.create(db.doc('users/owner'),{fullName:'Owner'});return {ok:true};}),{ok:true});
 assert.equal(db.rows.size,2);
});

function presenceFixture(){
 let time=1000000,actors=0;const db=memoryDb();
 db.rows.set('users/owner',{role:'owner',fullName:'Demo'});
 const sessionEvent=createPresence({db,now:()=>time,actor:async()=>{actors++;return {uid:'owner',profile:{role:'owner',fullName:'Demo'}};}});
 return {db,event:(session,state='heartbeat')=>sessionEvent({data:{session,state}}),advance:ms=>{time+=ms;},actors:()=>actors,row:()=>db.rows.get('presence/owner'),logs:()=>[...db.rows].filter(([path])=>path.startsWith('auditLogs/'))};
}

test('presence throttles repeated heartbeats while still authorizing every request',async()=>{
 const s=presenceFixture();await s.event('tab-one');const first=s.row();
 s.advance(10000);await s.event('tab-one');assert.equal(s.row(),first);assert.equal(s.logs().length,1);assert.equal(s.actors(),2);
 s.advance(10001);await s.event('tab-one');assert.ok(s.row().sessions['tab-one']>first.sessions['tab-one']);assert.equal(s.logs().length,1);
});

test('presence retains at most twenty live sessions and keeps a new tied heartbeat',async()=>{
 const s=presenceFixture();
 for(let i=0;i<21;i++)await s.event(`tab-${i}`);
 assert.equal(Object.keys(s.row().sessions).length,20);assert.equal(s.row().sessions['tab-20'],1090000);
 const count=s.logs().length;await s.event('tab-20');assert.equal(s.logs().length,count);
 assert.equal([...s.db.rows.keys()].some(path=>path.includes('/sessions/')),false);
 s.advance(90001);await s.event('tab-20');assert.deepEqual(Object.keys(s.row().sessions),['tab-20']);
});

test('presence offline closes only that tab and does not repeat the inactive audit',async()=>{
 const s=presenceFixture();await s.event('tab-one');await s.event('tab-two');
 await s.event('tab-one','offline');assert.deepEqual(Object.keys(s.row().sessions),['tab-two']);
 const count=s.logs().length;await s.event('tab-one','offline');assert.equal(s.logs().length,count);
 await assert.rejects(()=>s.event('bad/path'),{code:'invalid-argument'});
 await assert.rejects(()=>s.event('tab-one','unexpected'),{code:'invalid-argument'});
});

function statusFixture(){
 const db=memoryDb({'users/admin':{role:'admin',accountStatus:'active'},'users/owner':{role:'owner',accountStatus:'active'}});
 let updates=0,revocations=0;
 const auth={getUser:async()=>({emailVerified:true,disabled:false,customClaims:{admin:true},metadata:{creationTime:'2020-01-01T00:00:00Z'},tokensValidAfterTime:'2020-01-01T00:00:00Z'}),updateUser:async()=>{updates++;},revokeRefreshTokens:async()=>{revocations++;}};
 const services=createServices({db,auth,storage:{}});
 const input={op:'status',uid:'owner',status:'suspended',reason:'Test suspension',requestId:'status-retry'};
 return {db,auth,input,run:(data=input)=>services.adminApi({auth:{uid:'admin',token:{admin:true,email_verified:true,auth_time:Date.now()/1000}},data}),counts:()=>({updates,revocations}),profile:()=>db.rows.get('users/owner')};
}

test('status lost completion acknowledgement and subsequent retry do not repeat Auth writes',async()=>{
 const s=statusFixture();s.db.after=async n=>{if(n===2)throw Error('lost completion acknowledgement');};
 assert.deepEqual(await s.run(),{ok:true});assert.equal(s.profile().accountStatus,'suspended');assert.equal(s.profile().statusOperation,undefined);
 const rowCount=s.db.rows.size;assert.deepEqual(await s.run(),{ok:true});assert.deepEqual(s.counts(),{updates:1,revocations:1});assert.equal(s.db.rows.size,rowCount);
 await assert.rejects(()=>s.run({...s.input,status:'archived'}),{code:'already-exists'});
});

test('failed Auth status update leaves a restricted account and refuses implicit replay',async()=>{
 const s=statusFixture();s.auth.updateUser=async()=>{throw Error('Auth unavailable');};
 await assert.rejects(()=>s.run(),{code:'internal'});
 assert.equal(s.profile().accountStatus,'suspended');assert.ok(s.profile().statusOperation);
 assert.equal(s.db.rows.get(`adminOperations/${s.profile().statusOperation}`).status,'failed');
 await assert.rejects(()=>s.run(),{code:'failed-precondition'});
});

test('an old status worker cannot mark a concurrently reconciled operation failed',async()=>{
 const s=statusFixture();s.auth.updateUser=async()=>{
  const id=s.profile().statusOperation,operation=s.db.rows.get(`adminOperations/${id}`);
  operation.status='completed';s.profile().accountStatus='suspended';delete s.profile().statusOperation;
  throw Error('old worker transport error');
 };
 assert.deepEqual(await s.run(),{ok:true});
 assert.equal([...s.db.rows.values()].some(value=>value.action==='account.statusFailed'),false);
 assert.equal([...s.db.rows.values()].find(value=>value.type==='accountStatus').status,'completed');
});
