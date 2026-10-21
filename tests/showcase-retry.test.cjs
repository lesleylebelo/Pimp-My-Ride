const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadUI}=require('./helpers/load-ui.cjs');
function setup(){
 const auth={currentUser:{uid:'shop'}},calls=[];let fail=true;
 const api=loadUI('src/features/marketplace/services/postsApi.js',{
  'react-native':{Platform:{OS:'android'}},
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/api':{apiMethodRequest:async(path,options)=>{calls.push({path,...options});if(fail)throw Error('Synthetic lost acknowledgement');return {post:{id:'saved'}};}},
 });
 return {api,auth,calls,succeed:()=>{fail=false;}};
}
const data={type:'showcase',title:'Synthetic retry',serviceCategory:'Other',images:['posts/shop/fixture']};
test('REST showcase create retains a stable account-scoped request ID after uncertain delivery',async()=>{
 const s=setup();await assert.rejects(()=>s.api.postsApi('create',data,'shop'),/lost acknowledgement/);
 const first=s.calls[0].data.requestId;assert.equal(typeof first,'string');assert.ok(first.length>10);
 s.succeed();await s.api.postsApi('create',{images:data.images,serviceCategory:'Other',title:data.title,type:'showcase'},'shop');
 assert.equal(s.calls[1].data.requestId,first);assert.equal(s.calls[1].data.type,undefined);
 await s.api.postsApi('create',data,'shop');assert.notEqual(s.calls[2].data.requestId,first);
});
test('REST showcase retry identity changes for edited payloads and account transitions',async()=>{
 const s=setup();await assert.rejects(()=>s.api.postsApi('create',data,'shop'));
 await assert.rejects(()=>s.api.postsApi('create',{...data,title:'Changed title'},'shop'));
 assert.ok(s.calls[0].data.requestId);assert.notEqual(s.calls[1].data.requestId,s.calls[0].data.requestId);
 s.auth.currentUser={uid:'other'};s.succeed();await s.api.postsApi('create',data,'other');
 assert.notEqual(s.calls[2].data.requestId,s.calls[0].data.requestId);assert.equal(s.calls[2].expectedUid,'other');
});
