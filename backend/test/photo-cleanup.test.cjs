const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const {createPhotoCleanup,PROPOSED_GRACE_MS}=require('../photo-cleanup.cjs');
const {options,validateEnvironment}=require('../../scripts/cleanup-photos.cjs');
const AT=2000000000000,OLD=AT-PROPOSED_GRACE_MS-1;
const ID='a'.repeat(64),OTHER='b'.repeat(64),ASSET='ae12fc34-5678-4abc-8def-123456789012';
const PATH=`photos/fictionalOwner/fictionalVehicle/${ASSET}`;
const ATTEMPT={provider:'supabase',uid:'fictionalOwner',vehicleId:'fictionalVehicle',assetId:ASSET,slot:'1',path:PATH,state:'cleanupPending',createdAt:OLD,updatedAt:OLD};
const ASSET_DATA={provider:'supabase',ownerId:ATTEMPT.uid,vehicleId:ATTEMPT.vehicleId,slot:ATTEMPT.slot,path:PATH,uploadAttemptId:ID};
const attemptKey=`storagePhotosUploadAttempts/${ID}`,assetKey=`marketplacePhotos/${ASSET}`;
function setup(seed={}){
 const rows=new Map(Object.entries(seed)),calls={reads:0,writes:0,removes:0,waits:[],queries:[]};
 const snapshot=key=>{const value=structuredClone(rows.get(key));return {id:key.split('/').at(-1),exists:rows.has(key),data:()=>structuredClone(value)};};
 const write=()=>{calls.writes++;throw Error('Unexpected write');};
 const db={before:null,rows,runTransaction:write,doc:key=>({get:async()=>{calls.reads++;await db.before?.({key});return snapshot(key);},set:write,delete:write,update:write}),collection:key=>query(key)};
 function query(key,filter=null,after=null,take=Infinity){return {
  where:(field,operator,value)=>{assert.ok(['==','array-contains'].includes(operator));return query(key,{field,operator,value},after,take);},
  orderBy:field=>{assert.equal(field,'__name__');return query(key,filter,after,take);},
  startAfter:id=>query(key,filter,id,take),limit:n=>query(key,filter,after,n),add:write,
  get:async()=>{
   calls.reads++;calls.queries.push({key,filter,after,take});await db.before?.({key,filter,after,take});
   const keys=[...rows.keys()].filter(p=>p.split('/').slice(0,-1).join('/')===key).filter(p=>!filter||(filter.operator==='array-contains'?rows.get(p)?.[filter.field]?.includes(filter.value):rows.get(p)?.[filter.field]===filter.value)).filter(p=>!after||p.split('/').at(-1)>after).sort().slice(0,take);
   return {docs:keys.map(snapshot)};
  }
 };}
 const storage={remove:async()=>{calls.removes++;throw Error('Unexpected deletion');}};
 const api=createPhotoCleanup({db,storage,now:()=>AT,sleep:async n=>calls.waits.push(n)});
 return {db,api,calls,rows};
}
test('photo report repeats without writes/deletion and excludes identities, paths and asset metadata',async()=>{
 const s=setup({[attemptKey]:ATTEMPT,[assetKey]:{...ASSET_DATA,name:'private-name.jpg',signedUrl:'https://private.invalid/token'}});
 const before=structuredClone([...s.rows]),result=await s.api.report();
 assert.equal(result.counts.candidates,1);assert.deepEqual(await s.api.report(),result);
 assert.deepEqual([...s.rows],before);assert.equal(s.calls.writes,0);assert.equal(s.calls.removes,0);
 for(const secret of [PATH,ASSET,'fictionalOwner','fictionalVehicle','private-name.jpg','private.invalid'])assert.equal(JSON.stringify(result).includes(secret),false);
});
test('garage references and immutable request references independently preserve photos',async()=>{
 for(const [collection,reason] of [['vehicles','vehicle-reference'],['serviceRequests','request-reference']]){
  const s=setup({[attemptKey]:ATTEMPT,[assetKey]:ASSET_DATA,[`${collection}/unrelatedRecord`]:{photoIds:[ASSET],archived:true,status:'closed'}});
  const result=await s.api.report();assert.equal(result.counts.candidates,0);assert.equal(result.items[0].reason,reason);
 }
});
test('removing a garage photo cannot turn its request attachment into a cleanup candidate',async()=>{
 const s=setup({[attemptKey]:{...ATTEMPT,reason:'removed'},[assetKey]:ASSET_DATA,'vehicles/fictionalVehicle':{photoIds:[]},'serviceRequests/closedRequest':{photoIds:[ASSET],status:'closed'}});
 assert.equal((await s.api.report()).items[0].reason,'request-reference');
 s.rows.delete('serviceRequests/closedRequest');assert.equal((await s.api.report()).counts.candidates,1);
});
test('upload failure before asset publication can be reported only after both reference checks',async()=>{
 const s=setup({[attemptKey]:{...ATTEMPT,reason:'failed'}});
 assert.equal((await s.api.report()).counts.candidates,1);
 assert.deepEqual(s.calls.queries.filter(q=>q.filter?.operator==='array-contains').map(q=>q.key),['vehicles','serviceRequests']);
});
test('uploading, referenced and unknown states always retain their objects',async()=>{
 for(const state of ['uploading','referenced','other',undefined]){
  const s=setup({[attemptKey]:{...ATTEMPT,state}});assert.equal((await s.api.report()).counts.candidates,0);
 }
});
test('grace uses later timestamp and unknown, missing, future or malformed ages retain objects',async()=>{
 for(const changes of [{updatedAt:AT-1},{createdAt:AT+1},{createdAt:null},{updatedAt:undefined},{createdAt:'yesterday'},{updatedAt:NaN},{createdAt:-1}]){
  const s=setup({[attemptKey]:{...ATTEMPT,...changes}});assert.equal((await s.api.report()).counts.candidates,0);
 }
 const s=setup({[attemptKey]:{...ATTEMPT,createdAt:new Date(OLD),updatedAt:new Date(OLD)}});
 assert.equal((await s.api.report()).counts.candidates,1);
});
test('path, provider, slot and identity corruption stays retained',async()=>{
 for(const changes of [{path:'../private.jpg'},{uid:'someoneElse'},{vehicleId:'anotherVehicle'},{assetId:'not-a-uuid'},{slot:'6'},{slot:1},{provider:'unknown'}]){
  const s=setup({[attemptKey]:{...ATTEMPT,...changes}});assert.equal((await s.api.report()).items[0].reason,'attempt-identity-mismatch');
 }
 for(const changes of [{path:'photos/other/other/file'},{ownerId:'someoneElse'},{vehicleId:'anotherVehicle'},{slot:'2'},{uploadAttemptId:OTHER},{provider:'unknown'}]){
  const s=setup({[attemptKey]:ATTEMPT,[assetKey]:{...ASSET_DATA,...changes}});assert.equal((await s.api.report()).items[0].reason,'asset-identity-mismatch');
 }
});
test('duplicate ledgers for one immutable path prevent a candidate',async()=>{
 const s=setup({[attemptKey]:ATTEMPT,[`storagePhotosUploadAttempts/${OTHER}`]:ATTEMPT});
 assert.equal((await s.api.report()).items[0].reason,'ambiguous-upload-attempts');
});
test('each reference, asset, ledger query or reread failure retains the photo and redacts raw errors',async()=>{
 for(const target of ['vehicles','serviceRequests',assetKey,'ledger-query',attemptKey]){
  const s=setup({[attemptKey]:ATTEMPT,[assetKey]:ASSET_DATA});
  s.db.before=async q=>{if(q.key===target||(target==='ledger-query'&&q.key==='storagePhotosUploadAttempts'&&q.filter))throw Object.assign(Error(`Private ${PATH}`),{code:'failed-precondition'});};
  const result=await s.api.report();assert.equal(result.counts.failedChecks,1);assert.equal(result.items[0].errorCode,'failed-precondition');
  assert.equal(JSON.stringify(result).includes(PATH),false);assert.deepEqual(s.calls.waits,[]);
 }
});
test('transient failures retry at most three reads and a later report can recover',async()=>{
 const s=setup({[attemptKey]:ATTEMPT});let failures=3;
 s.db.before=async q=>{if(q.key==='serviceRequests'&&failures-->0)throw Object.assign(Error('Transient network error'),{code:14});};
 assert.equal((await s.api.report()).counts.failedChecks,1);assert.deepEqual(s.calls.waits,[100,200]);
 assert.equal((await s.api.report()).counts.candidates,1);assert.equal(s.calls.writes,0);
});
test('changed, missing or unresolved exact ledger rereads prevent a candidate',async()=>{
 for(const change of ['state','remove','age','old-age','path','asset']){
  const s=setup({[attemptKey]:ATTEMPT});
  s.db.before=async q=>{if(q.key===attemptKey){
   if(change==='remove')s.rows.delete(attemptKey);
   else if(change==='state')s.rows.get(attemptKey).state='uploading';
   else if(change==='age')s.rows.get(attemptKey).updatedAt=AT;
   else if(change==='old-age')s.rows.get(attemptKey).updatedAt=OLD-1;
   else if(change==='path')s.rows.get(attemptKey).path='photos/other/other/file';
   else s.rows.get(attemptKey).assetId='unknown';
  }};
  assert.equal((await s.api.report()).counts.candidates,0);
 }
});
test('bounded stable pages include one lookahead and invalid record IDs are redacted',async()=>{
 const ids=['1','2','3'].map(c=>c.repeat(64));
 const s=setup(Object.fromEntries(ids.map(id=>[`storagePhotosUploadAttempts/${id}`,{...ATTEMPT,state:'referenced'}])));
 const first=await s.api.report({limit:2});assert.deepEqual(first.items.map(x=>x.id),ids.slice(0,2));assert.equal(first.nextCursor,ids[1]);assert.equal(s.calls.queries[0].take,3);
 const next=await s.api.report({limit:2,cursor:first.nextCursor});assert.deepEqual(next.items.map(x=>x.id),[ids[2]]);assert.equal(next.nextCursor,null);
 const invalid=setup({'storagePhotosUploadAttempts/privateIdentity':ATTEMPT,'storagePhotosUploadAttempts/z':ATTEMPT});
 const blocked=await invalid.api.report({limit:1});assert.equal(blocked.items[0].id,'invalid-attempt-id');assert.equal(blocked.paginationBlocked,true);assert.equal(blocked.nextCursor,null);assert.equal(JSON.stringify(blocked).includes('privateIdentity'),false);
});
test('apply and invalid report options fail without any I/O',async()=>{
 const s=setup();for(const options of [{apply:true},{apply:'false'},{limit:0},{limit:501},{limit:1.2},{cursor:'privateIdentity'}])await assert.rejects(()=>s.api.report(options));
 assert.equal(s.calls.reads,0);assert.equal(s.calls.writes,0);
});
test('CLI validates explicit projects and bounds, and rejects apply before credentials',()=>{
 assert.equal(options(['--help']),null);
 assert.deepEqual(options(['--project','demo-photo-cleanup','--limit','2','--after',ID]),{projectId:'demo-photo-cleanup',limit:2,cursor:ID});
 for(const args of [[],['--project','bad'],['--project','demo-cleanup','--limit','501'],['--project','demo-cleanup','--after','UID'],['--project','demo-cleanup','--project','demo-other'],['--unknown','value']])assert.throws(()=>options(args),/Usage/);
 for(const args of [['--apply'],['--help','--apply'],['--project','--apply'],['--apply=true']])assert.throws(()=>options(args),/approval/);
 const result=spawnSync(process.execPath,[resolve(__dirname,'../../scripts/cleanup-photos.cjs'),'--apply'],{encoding:'utf8',env:{...process.env,FIREBASE_SERVICE_ACCOUNT_JSON:'invalid private credential'}});
 assert.equal(result.status,1);assert.match(result.stderr,/Photo retention policy approval/);assert.doesNotMatch(result.stderr,/invalid private credential|MODULE_NOT_FOUND|credential configuration/);
});
test('CLI emulator guard rejects remote, malformed, wrong-project and missing-emulator targets',()=>{
 for(const host of ['localhost:8080','127.0.0.1:8080','[::1]:8080'])assert.doesNotThrow(()=>validateEnvironment({projectId:'demo-photo-cleanup'},{FIRESTORE_EMULATOR_HOST:host}));
 for(const host of ['remote.invalid:8080','http://localhost:8080','localhost:0','localhost:65536'])assert.throws(()=>validateEnvironment({projectId:'demo-photo-cleanup'},{FIRESTORE_EMULATOR_HOST:host}),/loopback/);
 assert.throws(()=>validateEnvironment({projectId:'production-project'},{FIRESTORE_EMULATOR_HOST:'localhost:8080'}),/demo-/);
 assert.throws(()=>validateEnvironment({projectId:'demo-photo-cleanup'},{}),/requires a local/);
 assert.doesNotThrow(()=>validateEnvironment({projectId:'explicit-project'},{}));
});
