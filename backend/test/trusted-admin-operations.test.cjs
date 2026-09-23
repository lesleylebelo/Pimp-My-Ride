const test=require('node:test');
const assert=require('node:assert/strict');
const {Timestamp}=require('firebase-admin/firestore');
const {memoryDb}=require('./helpers/memory-db.cjs');
const {createTrustedAdminOperations}=require('../../scripts/trusted-admin-operations.cjs');
const request={uid:'target',operationId:'grant-1',operator:'operator:test',reason:'Approved team administrator'};
const recovery={operationId:'status-1',operator:'operator:test',reason:'Retry after verified provider interruption',workerQuiesced:true};
function fixture(seed={}){
 const db=memoryDb(seed),calls=[],user={email:'test@example.invalid',emailVerified:true,disabled:false,customClaims:{unrelated:true}};
 const auth={getUser:async()=>({...user,customClaims:{...user.customClaims}}),setCustomUserClaims:async(uid,claims)=>{calls.push(['claims',uid,claims]);user.customClaims={...claims};},revokeRefreshTokens:async uid=>calls.push(['revoke',uid]),updateUser:async(uid,changes)=>{calls.push(['update',uid,changes]);Object.assign(user,changes);}};
 return {db,auth,user,calls,api:createTrustedAdminOperations({db,auth,now:()=>1000000})};
}
const statusSeed=(overrides={})=>({'users/target':{role:'owner',accountStatus:'suspended',statusOperation:'status-1'},'adminOperations/status-1':{type:'accountStatus',target:'target',actor:'admin',reason:'Original status decision',requested:'active',status:'failed',createdAt:Timestamp.fromMillis(700000),...overrides}});
const audits=db=>[...db.rows.entries()].filter(([key])=>key.startsWith('auditLogs/')).map(([,value])=>value);

test('provision requires a reason and an enabled verified account before mutation',async()=>{
 for(const change of [{emailVerified:false},{disabled:true}]){
  const f=fixture();Object.assign(f.user,change);
  await assert.rejects(f.api.provisionAdmin(request),/enabled account/);
  assert.equal(f.db.rows.size,0);assert.equal(f.calls.length,0);
 }
 const f=fixture();await assert.rejects(f.api.provisionAdmin({...request,reason:''}),/Reason/);
 assert.equal(f.db.rows.size,0);assert.equal(f.calls.length,0);
});
test('provision preserves profile details and unrelated claims, revokes old sessions, and audits the reason',async()=>{
 const createdAt=Timestamp.fromMillis(1234),f=fixture({'users/target':{fullName:'Existing name',role:'owner',phone:'0123456789',createdAt}});
 assert.deepEqual(await f.api.provisionAdmin(request),{ok:true});
 const p=f.db.rows.get('users/target');assert.equal(p.role,'admin');assert.equal(p.accountStatus,'active');assert.equal(p.fullName,'Existing name');assert.equal(p.createdAt.toMillis(),1234);assert.equal(p.provisioningOperation,undefined);
 assert.deepEqual(f.user.customClaims,{unrelated:true,admin:true});assert.equal(f.calls.filter(c=>c[0]==='revoke').length,1);
 assert.equal(f.db.rows.get('adminOperations/grant-1').status,'completed');
 assert.deepEqual(audits(f.db).map(a=>a.action),['admin.provisionRequested','admin.provisioned']);
 assert.ok(audits(f.db).every(a=>a.details.reason===request.reason));
 const before=f.calls.length;assert.deepEqual(await f.api.provisionAdmin(request),{ok:true,alreadyCompleted:true});assert.equal(f.calls.length,before);
});
test('provision failures keep a restricted profile and retry the same durable operation',async()=>{
 const f=fixture(),revoke=f.auth.revokeRefreshTokens;f.auth.revokeRefreshTokens=async()=>{throw Object.assign(Error('provider secret must not be saved'),{code:'auth/internal-error'});};
 await assert.rejects(f.api.provisionAdmin(request),/remains restricted/);
 assert.equal(f.db.rows.get('users/target').accountStatus,'suspended');assert.equal(f.db.rows.get('users/target').provisioningOperation,'grant-1');
 assert.equal(f.db.rows.get('adminOperations/grant-1').status,'failed');assert.ok(!JSON.stringify([...f.db.rows.values()]).includes('provider secret'));
 f.auth.revokeRefreshTokens=revoke;await f.api.provisionAdmin(request);
 assert.equal(f.db.rows.get('users/target').accountStatus,'active');assert.equal(f.db.rows.get('adminOperations/grant-1').status,'completed');
});
test('provision rejects operation reuse and restrictions without overwriting existing records',async()=>{
 const f=fixture();await f.api.provisionAdmin(request);const count=f.calls.length;
 await assert.rejects(f.api.provisionAdmin({...request,reason:'Changed intent'}),/another request/);assert.equal(f.calls.length,count);
 for(const profile of [{role:'owner',accountStatus:'archived'},{role:'shop',reviewOperation:'review-1'},{role:'owner',statusOperation:'status-1'}]){
  const blocked=fixture({'users/target':profile});await assert.rejects(blocked.api.provisionAdmin(request),/Resolve account/);assert.deepEqual(blocked.db.rows.get('users/target'),profile);assert.equal(blocked.calls.length,0);
 }
});
test('provision recognizes a lost completion acknowledgement and never reverts completed state',async()=>{
 const f=fixture();f.db.after=async count=>{if(count===2)throw Error('lost acknowledgement');};
 assert.deepEqual(await f.api.provisionAdmin(request),{ok:true});assert.equal(f.db.rows.get('adminOperations/grant-1').status,'completed');assert.equal(f.db.rows.get('users/target').accountStatus,'active');assert.ok(!audits(f.db).some(a=>a.action==='admin.provisionFailed'));
});
test('a changed provisioning lock prevents completion and preserves the newer restriction',async()=>{
 const f=fixture();f.auth.revokeRefreshTokens=async()=>{f.db.rows.set('users/target',{role:'admin',accountStatus:'archived',provisioningOperation:'newer-operation'});};
 await assert.rejects(f.api.provisionAdmin(request),/incomplete/);
 assert.equal(f.db.rows.get('users/target').accountStatus,'archived');assert.equal(f.db.rows.get('users/target').provisioningOperation,'newer-operation');assert.equal(f.db.rows.get('adminOperations/grant-1').status,'pending');
});
test('reconcile preserves original decision reason, logs recovery reason, and is idempotent after completion',async()=>{
 const f=fixture(statusSeed());await f.api.reconcileStatus(recovery);
 assert.equal(f.db.rows.get('users/target').accountStatus,'active');assert.equal(f.db.rows.get('users/target').statusReason,'Original status decision');assert.equal(f.db.rows.get('users/target').statusOperation,undefined);
 assert.deepEqual(f.calls.map(c=>c[0]),['update','revoke']);assert.equal(audits(f.db)[1].details.reason,recovery.reason);
 const count=f.calls.length;assert.deepEqual(await f.api.reconcileStatus(recovery),{ok:true,alreadyCompleted:true});assert.equal(f.calls.length,count);
});
test('reconcile refuses young, malformed, unrelated and protected operations',async()=>{
 const unacknowledged=fixture(statusSeed());await assert.rejects(unacknowledged.api.reconcileStatus({...recovery,workerQuiesced:false}),/worker has terminated/);assert.equal(unacknowledged.calls.length,0);assert.equal(audits(unacknowledged.db).length,0);
 for(const changes of [{createdAt:Timestamp.fromMillis(900000)},{createdAt:'missing timestamp'},{type:'shopReview'},{requested:'admin'}]){
  const f=fixture(statusSeed(changes));await assert.rejects(f.api.reconcileStatus(recovery));assert.equal(f.calls.length,0);
 }
 const f=fixture(statusSeed());f.db.rows.get('users/target').role='admin';await assert.rejects(f.api.reconcileStatus(recovery),/lock/);assert.equal(f.calls.length,0);
 const claimed=fixture(statusSeed());claimed.user.customClaims.admin=true;await assert.rejects(claimed.api.reconcileStatus(recovery),/incomplete/);assert.equal(claimed.calls.length,0);assert.equal(claimed.db.rows.get('users/target').accountStatus,'suspended');
});
test('reconcile provider failure stays restricted and a later retry completes',async()=>{
 const f=fixture(statusSeed()),revoke=f.auth.revokeRefreshTokens;f.auth.revokeRefreshTokens=async()=>{throw Error('private provider failure');};
 await assert.rejects(f.api.reconcileStatus(recovery),/incomplete/);assert.equal(f.db.rows.get('users/target').statusOperation,'status-1');assert.equal(f.db.rows.get('adminOperations/status-1').status,'failed');assert.equal(f.db.rows.get('users/target').accountStatus,'suspended');
 f.auth.revokeRefreshTokens=revoke;await f.api.reconcileStatus(recovery);assert.equal(f.db.rows.get('users/target').accountStatus,'active');assert.ok(!JSON.stringify([...f.db.rows.values()]).includes('private provider failure'));
});
test('reconcile checks operation ownership again after Auth and accepts a lost completion acknowledgement',async()=>{
 const changed=fixture(statusSeed());changed.auth.revokeRefreshTokens=async()=>{changed.db.rows.get('users/target').statusOperation='newer-operation';};
 await assert.rejects(changed.api.reconcileStatus(recovery),/incomplete/);assert.equal(changed.db.rows.get('users/target').statusOperation,'newer-operation');assert.equal(changed.db.rows.get('users/target').accountStatus,'suspended');
 const lost=fixture(statusSeed());lost.db.after=async count=>{if(count===2)throw Error('lost acknowledgement');};
 assert.deepEqual(await lost.api.reconcileStatus(recovery),{ok:true});assert.equal(lost.db.rows.get('adminOperations/status-1').status,'completed');assert.ok(!audits(lost.db).some(a=>a.action==='account.reconcileFailed'));
});
