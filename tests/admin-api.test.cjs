const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadUI}=require('./helpers/load-ui.cjs');

function setup(){
 const auth={currentUser:{uid:'admin-one'}},calls=[];
 let handler=async()=>{throw Error('Response was lost');};
 const api=loadUI('src/features/admin/services/adminApi.js',{
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/api':{apiRequest:async(path,data,options)=>{const call={path,data,options};calls.push(call);return handler(call);}},
 });
 return {...api,auth,calls,respond:fn=>{handler=fn;},last:()=>calls.at(-1)};
}
const category={name:'Paint',description:'Paint services'};
const recencyError=()=>Object.assign(Error('Confirm your password, then retry this action.'),{code:'api/failed-precondition'});

test('a transport failure followed by reauthentication preserves the original mutation identity',async()=>{
 const s=setup();
 await assert.rejects(()=>s.adminApi('categorySave',category),/Response was lost/);const original=s.last().data.requestId;
 s.respond(async()=>{throw recencyError();});
 await assert.rejects(()=>s.adminApi('categorySave',category),{code:'api/failed-precondition'});
 assert.equal(s.last().data.requestId,original);
 // Firebase reauthentication refreshes the token for the same trusted account.
 s.auth.currentUser={uid:'admin-one',refreshed:true};s.respond(async()=>({id:'original-category'}));
 assert.deepEqual(await s.adminApi('categorySave',category),{id:'original-category'});
 assert.equal(s.last().data.requestId,original);
 assert.deepEqual(s.last().options,{expectedUid:'admin-one'});
});

test('confirmed success releases the key for a subsequent explicit action',async()=>{
 const s=setup();s.respond(async()=>({ok:true}));
 await s.adminApi('categorySave',category);const first=s.last().data.requestId;
 await s.adminApi('categorySave',category);assert.notEqual(s.last().data.requestId,first);
});

test('equivalent map order preserves a retry but changed content has another identity',async()=>{
 const s=setup();
 await assert.rejects(()=>s.adminApi('categorySave',category));const first=s.last().data.requestId;
 await assert.rejects(()=>s.adminApi('categorySave',{description:category.description,name:category.name}));assert.equal(s.last().data.requestId,first);
 await assert.rejects(()=>s.adminApi('categorySave',{...category,name:'Wrap'}));assert.notEqual(s.last().data.requestId,first);
 await assert.rejects(()=>s.adminApi('categoryArchive',category));assert.notEqual(s.last().data.requestId,first);
});

test('observed account switches clear previous retry payloads and isolate actors',async()=>{
 const s=setup();
 await assert.rejects(()=>s.adminApi('categorySave',category));const first=s.last().data.requestId;
 s.auth.currentUser={uid:'admin-two'};s.respond(async()=>({items:[]}));
 await s.adminApi('categories');assert.deepEqual(s.last().options,{expectedUid:'admin-two'});
 s.respond(async()=>{throw Error('Response was lost');});
 await assert.rejects(()=>s.adminApi('categorySave',category));assert.notEqual(s.last().data.requestId,first);
 assert.deepEqual(s.last().options,{expectedUid:'admin-two'});
 s.auth.currentUser={uid:'admin-one'};
 await assert.rejects(()=>s.adminApi('categorySave',category));assert.notEqual(s.last().data.requestId,first);
});

test('presence calls also observe logout and clear the earlier account retry keys',async()=>{
 const s=setup();await assert.rejects(()=>s.adminApi('categorySave',category));const first=s.last().data.requestId;
 s.auth.currentUser=null;await assert.rejects(()=>s.callBackend('sessionEvent',{session:'tab',state:'offline'}));assert.equal(s.last().path,'session');
 s.auth.currentUser={uid:'admin-one'};
 await assert.rejects(()=>s.adminApi('categorySave',category));assert.notEqual(s.last().data.requestId,first);
});

test('retry memory holds only fifty recent distinct unresolved actions',async()=>{
 const s=setup();
 await assert.rejects(()=>s.adminApi('categorySave',{...category,name:'Oldest'}));const oldest=s.last().data.requestId;
 for(let i=0;i<49;i++)await assert.rejects(()=>s.adminApi('categorySave',{...category,name:`Category ${i}`}));
 const recent=s.last().data.requestId;
 await assert.rejects(()=>s.adminApi('categorySave',{...category,name:'Overflow'}));
 await assert.rejects(()=>s.adminApi('categorySave',{...category,name:'Category 48'}));assert.equal(s.last().data.requestId,recent);
 await assert.rejects(()=>s.adminApi('categorySave',{...category,name:'Oldest'}));assert.notEqual(s.last().data.requestId,oldest);
});
