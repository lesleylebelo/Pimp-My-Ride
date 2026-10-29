const {test}=require('node:test'),assert=require('node:assert/strict');
const {createAccountManagement,obligation,deletionControls}=require('../account-management.cjs');
const {memoryDb}=require('./helpers/memory-db.cjs');
function fixture(role='owner',env={}){
 const db=memoryDb({'users/own':{role,fullName:'Synthetic Person',phone:'0821234567',accountStatus:'active',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:'Workshop',regNumber:'SYNTHETIC',address:'Synthetic address',city:'Pretoria',province:'Gauteng',services:'Paint'}}:{})}});
 const api=createAccountManagement({db,env,auth:{getUser:async()=>({email:'verified@synthetic.invalid',emailVerified:true,disabled:false})},actor:async()=>({uid:'own',profile:db.rows.get('users/own')})}).api;
 const call=(op,data={},authTime=Math.floor(Date.now()/1000))=>api({auth:{uid:'own',token:{auth_time:authTime}},data:{op,...data}});
 return {db,call};
}
test('closure holds on active services, unsettled balances, reconciliation and disputes without treating simulation as settlement',()=>{
 for(const value of [{status:'pending_payment'},{status:'confirmed',serviceStatus:'not_started',balanceDueCents:0},{status:'confirmed',serviceStatus:'completed',balanceDueCents:1},{status:'confirmed',serviceStatus:'completed'},{status:'cancelled',paymentReconciliationStatus:'simulated_reconciliation_required'},{status:'cancelled',disputeStatus:'open'}])assert.equal(obligation(value),true);
 for(const value of [{status:'cancelled'},{status:'confirmed',serviceStatus:'completed',balanceDueCents:0}])assert.equal(obligation(value),false);
 assert.equal(obligation({status:'cancelled',activeDispute:true,accountClosureResolvedAt:1}),true);
});

test('permanent deletion gates default disabled and require exact independent opt-ins in production and local environments',()=>{
 for(const NODE_ENV of ['production','development','test',undefined])for(const value of [undefined,'false','TRUE','1',' true ',true])assert.deepEqual(deletionControls({NODE_ENV,PMR_ACCOUNT_DELETION_REQUESTS_ENABLED:value,PMR_ACCOUNT_DELETION_WORKER_ENABLED:value}),{requests:false,worker:false});
 assert.deepEqual(deletionControls({PMR_ACCOUNT_DELETION_REQUESTS_ENABLED:'true'}),{requests:true,worker:false});assert.deepEqual(deletionControls({PMR_ACCOUNT_DELETION_WORKER_ENABLED:'true'}),{requests:false,worker:true});
});

test('disabled intake creates no restriction, receipt, job or audit and does not block profile/email updates',async()=>{
 const f=fixture(),before=JSON.stringify([...f.db.rows]);await assert.rejects(()=>f.call('delete',{confirmation:'DELETE',requestId:'disabled-delete'}),{code:'unavailable'});assert.equal(JSON.stringify([...f.db.rows]),before);
 await f.call('save',{fullName:'Updated Person',phone:'0831234567',version:0,requestId:'normal-save'});await f.call('syncEmail',{requestId:'normal-email'});assert.equal(f.db.rows.get('users/own').email,'verified@synthetic.invalid');
});

test('paused execution preserves delete jobs and cursors at every phase without Auth, storage or data mutations',async()=>{
 for(const phase of ['revoke','settle','media:0','data:0','identity']){
  const db=memoryDb({'users/own':{role:'owner',accountStatus:'deleting',statusOperation:'self:own'},'accountLifecycleJobs/own':{uid:'own',kind:'delete',state:'pending',phase,cursor:'retained-cursor'}}),before=JSON.stringify([...db.rows]);
  const service=createAccountManagement({db,env:{NODE_ENV:'production'},auth:new Proxy({},{get:()=>()=>assert.fail('Auth must not run while paused')}),actor:()=>assert.fail('No actor needed for internal pause'),stores:{}});
  assert.deepEqual(await service.process('own'),{pending:true,paused:true});assert.equal(JSON.stringify([...db.rows]),before);
 }
});
test('profile edits derive identity, preserve protected data and reject stale versions and forged fields',async()=>{
 const f=fixture();await f.call('save',{fullName:'Updated Person',phone:'0831234567',version:0,requestId:'save-once'});assert.equal(f.db.rows.get('users/own').role,'owner');assert.equal(f.db.rows.get('users/own').profileVersion,1);assert.equal(f.db.rows.get('users/own').email,'verified@synthetic.invalid');
 await assert.rejects(()=>f.call('save',{fullName:'Stale',phone:'0831234567',version:0,requestId:'stale'}),{code:'failed-precondition'});
 for(const field of ['uid','role','email','accountStatus','verificationStatus','verifiedRating'])await assert.rejects(()=>f.call('save',{fullName:'Forged',phone:'0831234567',version:1,requestId:'forged',[field]:'forged'}),{code:'invalid-argument'});
 await assert.rejects(()=>f.call('save',{fullName:'Valid',phone:'invalid',version:1,requestId:'bad-phone'}),{code:'invalid-argument'});
});
test('self-service security operations require recent authentication and never accept admin roles',async()=>{
 const f=fixture();for(const authTime of [undefined,NaN,1,Date.now()/1000+3600])await assert.rejects(()=>f.call('delete',{confirmation:'DELETE',requestId:'delete'},authTime===undefined?null:authTime),{code:'failed-precondition'});
 const admin=fixture('admin');await assert.rejects(()=>admin.call('profile'),{code:'permission-denied'});await assert.rejects(()=>f.call('process',{uid:'other'}),{code:'invalid-argument'});
});
test('business identity requires renewed verification, while services preserve approval and aggregates',async()=>{
 const f=fixture('shop'),p=f.db.rows.get('users/own');p.verifiedRating={count:2,sum:8,revision:2};
 const services=await f.call('save',{fullName:p.fullName,phone:p.phone,shop:{...p.shop,services:'Paint, wheels'},version:0,requestId:'services'});assert.equal(services.reverificationRequired,false);assert.equal(f.db.rows.get('users/own').verificationStatus,'approved');
 const current=f.db.rows.get('users/own');const changed=await f.call('save',{fullName:current.fullName,phone:current.phone,shop:{...current.shop,regNumber:'NEW-REG'},version:1,requestId:'identity'});assert.equal(changed.reverificationRequired,true);assert.equal(f.db.rows.get('users/own').verificationStatus,'pending');assert.deepEqual(f.db.rows.get('users/own').verifiedRating,{count:2,sum:8,revision:2});
});
