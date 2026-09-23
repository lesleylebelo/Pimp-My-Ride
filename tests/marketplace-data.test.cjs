const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const validation=loadUI('src/features/marketplace/utils/validation.js');
test('rand inputs preserve cents and reject ambiguous, overprecise or oversized amounts',()=>{
 for(const [input,cents] of [['0.29',29],['1250.50',125050],['0',0],['1000000',100000000]])assert.equal(validation.parseMoney(input),cents);
 for(const input of ['',null,'1e3','-1','1,000','1.001','1000000.01','Infinity'])assert.equal(validation.parseMoney(input),null);
 const quote={scope:'Paint',items:[{description:'Paint',amount:'0.29'}],completionDays:'1',warranty:'',validForDays:'14'};
 assert.deepEqual(validation.quoteErrors(quote),{});
 assert.ok(validation.quoteErrors({...quote,items:Array.from({length:11},()=>quote.items[0])}).items);
 assert.ok(validation.quoteErrors({...quote,items:[{description:'One',amount:'1000000'},{description:'Two',amount:'0.01'}]}).items);
});
test('vehicle and request validation rejects invalid registrations, calendar dates and reversed budgets',()=>{
 const v={make:'Test',model:'Car',year:'2020',colour:'Blue',registration:'TEST 123'};assert.deepEqual(validation.vehicleErrors(v),{});assert.ok(validation.vehicleErrors({...v,registration:'---'}).registration);
 const r={vehicleId:'car',categoryId:'paint',title:'Paint',description:'Paint the doors',city:'Pretoria',visibility:'open',preferredDate:'',budgetMin:'100',budgetMax:'200'};assert.deepEqual(validation.requestErrors(r),{});
 for(const preferredDate of ['2000-01-01','2100-02-29','not-a-date'])assert.ok(validation.requestErrors({...r,preferredDate}).preferredDate);
 assert.ok(validation.requestErrors({...r,budgetMax:'99'}).budgetMax);assert.ok(validation.requestErrors({...r,visibility:'direct',shopId:''}).shopId);
});
function serviceSetup(){
 const auth={currentUser:{uid:'owner'}},calls=[];let response=async()=>{throw Error('Uncertain transport');};
 const {marketApi}=loadUI('src/features/marketplace/services/marketApi.js',{'../../../shared/services/firebase':{firebase:()=>({auth})},'../../../shared/services/api':{apiRequest:async(path,data,options)=>{calls.push({path,data,options});return response();}}});
 return {auth,calls,marketApi,respond:fn=>{response=fn;}};
}
test('market mutations retain their retry key on uncertainty, scope it to payload/account and never retry automatically',async()=>{
 const s=serviceSetup(),input={make:'Test',year:2020};await assert.rejects(()=>s.marketApi('vehicleSave',input));const first=s.calls.at(-1).data.requestId;
 await assert.rejects(()=>s.marketApi('vehicleSave',{year:2020,make:'Test'}));assert.equal(s.calls.at(-1).data.requestId,first);assert.equal(s.calls.length,2);
 await assert.rejects(()=>s.marketApi('vehicleSave',{...input,make:'Changed'}));assert.notEqual(s.calls.at(-1).data.requestId,first);
 s.auth.currentUser={uid:'other'};s.respond(async()=>({id:'other-car'}));await s.marketApi('vehicleSave',input);assert.notEqual(s.calls.at(-1).data.requestId,first);assert.equal(s.calls.at(-1).options.expectedUid,'other');
 await s.marketApi('vehicles',{cursor:null});assert.equal(s.calls.at(-1).data.requestId,undefined);
});
test('a response for a previous account cannot be delivered after switching identities',async()=>{
 const s=serviceSetup();s.respond(async()=>{s.auth.currentUser={uid:'other'};return {id:'private'};});await assert.rejects(()=>s.marketApi('vehicles',{}),/account changed/);
 s.auth.currentUser=null;const before=s.calls.length;await assert.rejects(()=>s.marketApi('vehicles',{}),/Sign in/);assert.equal(s.calls.length,before);
});

test('acceptance and booking transitions preserve retry identity after a lost acknowledgement',async()=>{
 for(const [op,input] of [['quoteAccept',{id:'quote'}],['bookingConfirm',{id:'booking',appointmentDate:'2030-01-15',appointmentTime:'10:00'}],['bookingCancel',{id:'booking',reason:'Plans changed'}]]){
  const s=serviceSetup();await assert.rejects(()=>s.marketApi(op,input));const retry=s.calls.at(-1).data.requestId;assert.ok(retry);
  s.respond(async()=>({id:'booking'}));assert.deepEqual(await s.marketApi(op,input),{id:'booking'});
  assert.equal(s.calls.at(-1).data.requestId,retry);assert.equal(s.calls.length,2);
  await s.marketApi(op,input);assert.notEqual(s.calls.at(-1).data.requestId,retry);
 }
 const s=serviceSetup();await assert.rejects(()=>s.marketApi('quoteAccept',{id:'first'}));const first=s.calls.at(-1).data.requestId;
 await assert.rejects(()=>s.marketApi('quoteAccept',{id:'second'}));assert.notEqual(s.calls.at(-1).data.requestId,first);
 s.respond(async()=>({items:[],cursor:null}));await s.marketApi('bookings',{cursor:null});assert.equal(s.calls.at(-1).data.requestId,undefined);
 await s.marketApi('booking',{id:'booking'});assert.equal(s.calls.at(-1).data.requestId,undefined);
});
function hookSetup(){
 const state={auth:{user:{uid:'owner'},offline:false},focused:true,calls:[],pending:[]};let current;
 const {useMarketData}=loadUI('src/features/marketplace/hooks/useMarketData.js',{'../../auth/context/AuthContext':{useAuth:()=>state.auth},'@react-navigation/native':{useIsFocused:()=>state.focused},'../services/marketApi':{marketApi:(op,input)=>{state.calls.push({op,input});return new Promise((resolve,reject)=>state.pending.push({resolve,reject}));}}});
 function Screen(){current=useMarketData('vehicles',{cursor:null});return null;}
 return {state,Screen,get:()=>current};
}
test('marketplace reads clear on offline/account changes and discard earlier in-flight results',async()=>{
 const s=hookSetup();let tree;await act(async()=>{tree=create(React.createElement(s.Screen));});assert.equal(s.state.calls.length,1);
 await act(async()=>{s.state.auth={user:{uid:'other'},offline:false};tree.update(React.createElement(s.Screen));});assert.equal(s.state.calls.length,2);
 await act(async()=>{s.state.pending[0].resolve({items:[{id:'old-private-car'}]});});assert.equal(s.get().data,null);
 await act(async()=>{s.state.pending[1].resolve({items:[{id:'other-car'}]});});assert.equal(s.get().data.items[0].id,'other-car');
 await act(async()=>{s.state.auth={...s.state.auth,offline:true};tree.update(React.createElement(s.Screen));});assert.equal(s.get().data,null);assert.equal(s.state.calls.length,2);assert.match(s.get().error,/Connect/);
 await act(async()=>{s.state.auth={...s.state.auth,offline:false};tree.update(React.createElement(s.Screen));});assert.equal(s.state.calls.length,3);
 await act(async()=>{s.state.pending[2].reject(Error('Access denied'));});assert.equal(s.get().data,null);assert.match(s.get().error,/Access denied/);
 await act(async()=>tree.unmount());
});
test('refocusing refreshes data while late results from a blurred screen are ignored',async()=>{
 const s=hookSetup();let tree;await act(async()=>{tree=create(React.createElement(s.Screen));});
 await act(async()=>{s.state.focused=false;tree.update(React.createElement(s.Screen));s.state.pending[0].resolve({items:[{id:'stale'}]});});assert.equal(s.get().data,null);
 await act(async()=>{s.state.focused=true;tree.update(React.createElement(s.Screen));});assert.equal(s.state.calls.length,2);
 await act(async()=>{s.state.pending[1].resolve({items:[]});});assert.deepEqual(s.get().data,{items:[]});await act(async()=>tree.unmount());
});
