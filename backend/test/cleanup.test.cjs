const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCleanup,PROPOSED_GRACE_MS}=require('../cleanup.cjs');
const {options}=require('../../scripts/cleanup-storage.cjs');
const AT=2000000000000,OLD=AT-PROPOSED_GRACE_MS-1;
const path='verification/fictionalShop/ownerId/ae12fc34-5678-4abc-8def-123456789012';
const attempt={path,uid:'fictionalShop',kind:'ownerId',state:'cleanupPending',createdAt:OLD,updatedAt:OLD};
function setup(seed={}){
 const rows=new Map(Object.entries(seed)),calls={reads:0,writes:0,removes:0,waits:[]};
 const snapshot=key=>({id:key.split('/').at(-1),exists:rows.has(key),data:()=>structuredClone(rows.get(key))});
 const write=()=>{calls.writes++;throw Error('Unexpected write');};
 const db={before:null,rows,runTransaction:write,doc:key=>({get:async()=>{calls.reads++;await db.before?.({key});return snapshot(key);},set:write,delete:write,update:write}),collection:key=>query(key,false),collectionGroup:key=>query(key,true)};
 function query(key,group,filter=null,after=null,take=Infinity){return {
  where:(field,operator,value)=>{assert.equal(operator,'==');return query(key,group,{field,value},after,take);},
  orderBy:field=>{assert.equal(field,'__name__');return query(key,group,filter,after,take);},
  startAfter:id=>query(key,group,filter,id,take),limit:n=>query(key,group,filter,after,n),add:write,
  get:async()=>{
   calls.reads++;await db.before?.({key,group,filter});
   const keys=[...rows.keys()].filter(p=>group?p.split('/').at(-2)===key:p.split('/').slice(0,-1).join('/')===key).filter(p=>!filter||rows.get(p)?.[filter.field]===filter.value).filter(p=>!after||p.split('/').at(-1)>after).sort().slice(0,take);
   return {docs:keys.map(snapshot)};
  }
 };}
 const storage={remove:async()=>{calls.removes++;throw Error('Unexpected deletion');}};
 const api=createCleanup({db,storage,now:()=>AT,sleep:async n=>calls.waits.push(n)});
 return {db,api,calls,rows};
}
test('dry run repeats safely without writes or storage deletion, including legacy tasks',async()=>{
 const s=setup({'storageCleanup/taskA':{path,createdAt:OLD},'storageUploadAttempts/uploadA':attempt});
 const before=structuredClone([...s.rows]);const first=await s.api.report();
 assert.equal(first.counts.candidates,1);assert.deepEqual(await s.api.report(),first);
 assert.deepEqual([...s.rows],before);assert.equal(s.calls.writes,0);assert.equal(s.calls.removes,0);
 assert.equal(JSON.stringify(first).includes(path),false);assert.equal(JSON.stringify(first).includes('fictionalShop'),false);
});
test('current metadata and unexpected global references each preserve an object',async()=>{
 for(const location of ['users/fictionalShop/documents/ownerId','users/anotherFictionalShop/documents/cipcCert']){
  const s=setup({'storageCleanup/taskA':{path,createdAt:OLD},[location]:{path}});
  assert.equal((await s.api.report()).items[0].reason,'referenced');
 }
});
test('uploading, referenced, and unknown ledger states remain retained',async()=>{
 for(const state of ['uploading','referenced','other',undefined]){
  const s=setup({'storageCleanup/taskA':{path,createdAt:OLD},'storageUploadAttempts/uploadA':{...attempt,state}});
  assert.equal((await s.api.report()).counts.candidates,0);
  assert.equal((await s.api.report({source:'attempts'})).counts.candidates,0);
 }
});
test('grace begins at the later timestamp and malformed, future, and missing ages are retained',async()=>{
 for(const dates of [{createdAt:OLD,updatedAt:AT-1000},{createdAt:AT+1},{},{createdAt:'yesterday'},{createdAt:OLD,updatedAt:'unknown'}]){
  const s=setup({'storageCleanup/taskA':{path,...dates}});assert.equal((await s.api.report()).counts.candidates,0);
 }
 const s=setup({'storageUploadAttempts/uploadA':attempt});assert.equal((await s.api.report({source:'attempts'})).counts.candidates,1);
});
test('failed global reference checks retain files and redact service errors',async()=>{
 const s=setup({'storageCleanup/taskA':{path,createdAt:OLD}});
 s.db.before=async q=>{if(q.group)throw Object.assign(Error(`private path ${path}`),{code:'failed-precondition'});};
 const result=await s.api.report();assert.equal(result.counts.failedChecks,1);assert.equal(result.items[0].errorCode,'failed-precondition');
 assert.equal(JSON.stringify(result).includes(path),false);assert.deepEqual(s.calls.waits,[]);
});
test('transient read failures retry with bounds and can recover on the next report',async()=>{
 const s=setup({'storageCleanup/taskA':{path,createdAt:OLD}});let failures=3;
 s.db.before=async q=>{if(q.group&&failures-->0)throw Object.assign(Error('network error'),{code:14});};
 assert.equal((await s.api.report()).counts.failedChecks,1);assert.deepEqual(s.calls.waits,[100,200]);
 assert.equal((await s.api.report()).counts.candidates,1);assert.equal(s.calls.writes,0);assert.equal(s.calls.removes,0);
});
test('invalid paths, mismatched identities, and ambiguous attempts are preserved',async()=>{
 const invalid=setup({'storageCleanup/taskA':{path:'../another-file',createdAt:OLD}});
 assert.equal((await invalid.api.report()).items[0].reason,'invalid-path');
 const mismatch=setup({'storageUploadAttempts/uploadA':{...attempt,uid:'different'}});
 assert.equal((await mismatch.api.report({source:'attempts'})).items[0].reason,'attempt-identity-mismatch');
 const ambiguous=setup({'storageCleanup/taskA':{path,createdAt:OLD},'storageUploadAttempts/uploadA':attempt,'storageUploadAttempts/uploadB':attempt});
 assert.equal((await ambiguous.api.report()).items[0].reason,'ambiguous-upload-attempts');
});
test('ledger changes during the report do not become cleanup candidates',async()=>{
 for(const change of ['state','remove','timestamp']){
  const s=setup({'storageUploadAttempts/uploadA':attempt});
  s.db.before=async q=>{if(q.key==='storageUploadAttempts'&&q.filter){
   if(change==='remove')s.rows.delete('storageUploadAttempts/uploadA');
   else if(change==='state')s.rows.get('storageUploadAttempts/uploadA').state='uploading';
   else s.rows.get('storageUploadAttempts/uploadA').updatedAt=AT;
  }};
  assert.equal((await s.api.report({source:'attempts'})).counts.candidates,0);
 }
});
test('bounded pages use stable task IDs so reports can resume without a worker',async()=>{
 const s=setup(Object.fromEntries(['taskA','taskB','taskC'].map(id=>[`storageCleanup/${id}`,{path,createdAt:OLD}])));
 const page=await s.api.report({limit:2});assert.deepEqual(page.items.map(x=>x.id),['taskA','taskB']);assert.equal(page.nextCursor,'taskB');
 const next=await s.api.report({limit:2,cursor:page.nextCursor});assert.deepEqual(next.items.map(x=>x.id),['taskC']);assert.equal(next.nextCursor,null);
});
test('apply and invalid configuration fail before any I/O',async()=>{
 const s=setup();await assert.rejects(()=>s.api.report({apply:true}),/approval/);await assert.rejects(()=>s.api.report({limit:501}));
 assert.equal(s.calls.reads,0);assert.throws(()=>options(['--apply']),/approval/);
 assert.equal(options(['--help']),null);assert.throws(()=>options([]),/Usage/);
 assert.deepEqual(options(['--project','demo-cleanup-test','--source','attempts','--limit','2']),{projectId:'demo-cleanup-test',source:'attempts',limit:2,cursor:null});
});
