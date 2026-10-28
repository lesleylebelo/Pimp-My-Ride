const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadUI}=require('./helpers/load-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const session={current:{uid:'owner'}},module=loadUI('src/shared/services/readCoordinator.js');
 return {session,...module,read:module.createReadCoordinator(()=>session.current)};
}
test('concurrent reads coalesce, navigation reuses a short cache, and manual refresh bypasses freshness',async()=>{
 const f=fixture();let calls=0;
 const execute=async()=>{calls++;await turn();return {items:[]};};
 await Promise.all(Array.from({length:20},()=>f.read(['vehicles',{}],execute)));
 assert.equal(calls,1);
 for(let i=0;i<10;i++)await f.read(['vehicles',{}],execute);
 assert.equal(calls,1);await f.read(['vehicles',{}],execute,{force:true});assert.equal(calls,2);
});
test('mutations invalidate completed reads and prevent stale in-flight reads repopulating caches',async()=>{
 const f=fixture();let resolve,calls=0;
 const first=f.read('list',()=>new Promise(done=>{resolve=done;}));
 await turn();f.invalidateReads();resolve({version:1});await first;
 assert.deepEqual(await f.read('list',async()=>{calls++;return {version:2};}),{version:2});assert.equal(calls,1);
 f.invalidateReads();await f.read('list',async()=>{calls++;return {};});assert.equal(calls,2);
});
test('account and same-UID session replacement discard caches and reject late responses',async()=>{
 const f=fixture();let resolve;
 const first=f.read('private',()=>new Promise(done=>{resolve=done;}));
 await turn();f.session.current={uid:'owner'};resolve({private:'previous session'});
 await assert.rejects(()=>first,/account changed/);
 assert.deepEqual(await f.read('private',async()=>({fresh:true})),{fresh:true});
 f.session.current={uid:'shop'};assert.deepEqual(await f.read('private',async()=>({shop:true})),{shop:true});
 f.session.current=null;await assert.rejects(()=>f.read('private',async()=>({})),/Sign in/);
});
test('429 cooldown survives cache invalidation and manual refresh, covers other keys, and expires without retry timers',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});
 const f=fixture(),error=Object.assign(Error('Wait'),{status:429,retryAt:Date.now()+90000});let calls=0;
 const fail=async()=>{calls++;throw error;};
 await assert.rejects(()=>f.read('one',fail),error);
 f.invalidateReads();await assert.rejects(()=>f.read('two',fail,{force:true}),error);assert.equal(calls,1);
 t.mock.timers.tick(89999);await assert.rejects(()=>f.read('two',fail),error);assert.equal(calls,1);
 t.mock.timers.tick(1);await f.read('two',async()=>{calls++;return {};});assert.equal(calls,2);
});
test('transient read failures back off exponentially and successful recovery resets them',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});const f=fixture();let calls=0;
 const fail=async()=>{calls++;throw Error('Unavailable');};
 await assert.rejects(()=>f.read('list',fail));
 t.mock.timers.tick(4999);await assert.rejects(()=>f.read('list',fail));assert.equal(calls,1);
 t.mock.timers.tick(1);await assert.rejects(()=>f.read('list',fail));assert.equal(calls,2);
 t.mock.timers.tick(9999);await assert.rejects(()=>f.read('list',fail));assert.equal(calls,2);
 t.mock.timers.tick(1);await f.read('list',async()=>({ok:true}));
});
test('delegated post writes and unknown operations never enter marketplace read caching',async()=>{
 const auth={currentUser:{uid:'owner'}},calls=[];
 const {marketApi}=loadUI('src/features/marketplace/services/marketApi.js',{
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/api':{apiRequest:async(path,data)=>{calls.push([path,data.op]);return {ok:true};}},
  './postsApi':{postsApi:async(op)=>{calls.push(['posts',op]);return {ok:true};}},
 });
 await marketApi('posts',{view:'create'});await marketApi('posts',{view:'create'});
 await marketApi('futureMutation',{});await marketApi('futureMutation',{});
 assert.deepEqual(calls,[['posts','create'],['posts','create'],['marketplace','futureMutation'],['marketplace','futureMutation']]);
});
