const {test}=require('node:test'),assert=require('node:assert/strict'),{loadUI}=require('./helpers/load-ui.cjs');
const CUSTOMER='aT6RWRl4AtQjtJKYIiD39eaR3x73',VEHICLE='78gG6bPHbGvCTOCuZAwR',ID='12345678-1234-4123-8123-123456789abc';
function fixture(options={}){
 const calls=[],fields=[],auth={currentUser:{uid:CUSTOMER}},makeFormData=()=>({append:(...args)=>fields.push(args)});
 const apiRequest=async(...args)=>{calls.push(args);const n=calls.length;
  if(n===1)return {items:[],version:options.version??0,canManage:true};
  if(n===2){if(options.failed)throw Error('Network failure');return {ok:true,id:ID,slot:'1',version:1};}
  if(n===3)return {items:[{id:ID,slot:'1'}],version:1};
  return {url:`https://${options.wrongHost?'evil.invalid':'nymiyrzdpjctyembixbe.supabase.co'}/storage/v1/object/sign/vehicle-images/photos/${CUSTOMER}/${VEHICLE}/${ID}?token=synthetic`,expiresAt:Date.now()+60000};
 };
 const {approvedVehicleTest}=loadUI('src/features/marketplace/utils/approvedVehicleTest.js',{'../../../shared/services/api':{apiRequest}});
 return {calls,fields,run:extra=>approvedVehicleTest({auth,makeFormData,loadFixture:async()=>options.uri||'file:///cache/fixture.png',...extra})};
}
test('approved device flow reads before/after, sends one native file part and signs only the new asset',async()=>{
 const s=fixture(),result=await s.run();assert.equal(result.assetId,ID);assert.equal(s.calls.length,4);
 assert.deepEqual(s.fields,[['file',{uri:'file:///cache/fixture.png',name:'pmr-synthetic-20261019-01.png',type:'image/png'}]]);
 assert.match(s.calls[1][0],/^photos\/vehicles\/78gG6bPHbGvCTOCuZAwR\/1\?version=0&requestId=pmr_media_20261019_01_vehicle$/);
 assert.equal(s.calls[1][2].multipart,true);assert.ok(s.calls.every(call=>call[2].expectedUid===CUSTOMER));
 assert.deepEqual(s.calls[3][1],{op:'view',target:'vehicle',id:VEHICLE,photoId:ID});
});
test('changed revision and nonlocal fixture stop before any upload',async()=>{
 for(const option of [{version:1},{uri:'https://remote.invalid/photo'}]){const s=fixture(option);await assert.rejects(()=>s.run());assert.equal(s.calls.length,1);assert.equal(s.fields.length,0);}
 const s=fixture();await assert.rejects(()=>s.run({auth:{currentUser:{uid:'admin'}}}));assert.equal(s.calls.length,0);
});
test('network uncertainty never triggers a second upload or preview',async()=>{
 const s=fixture({failed:true});await assert.rejects(()=>s.run());assert.equal(s.calls.length,2);
});
test('signed preview response must target the exact project, private bucket and new asset',async()=>{
 const s=fixture({wrongHost:true});await assert.rejects(()=>s.run(),error=>/scope or expiry/.test(error.userMessage));assert.equal(s.calls.length,4);
});
