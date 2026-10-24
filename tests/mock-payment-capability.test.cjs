const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
test('payment availability fails closed during loading, errors and malformed or non-demo responses',async()=>{
 const state={data:null,busy:true,error:''};let result,reads=[];
 const {useMockPayments}=loadUI('src/features/marketplace/hooks/useMockPayments.js',{'./useMarketData':{useMarketData:op=>{reads.push(op);return {...state,refresh:async()=>{}};}}});
 function Probe(){result=useMockPayments();return null;}
 let tree;await act(async()=>{tree=create(React.createElement(Probe));});try{
  assert.equal(result.enabled,false);
  for(const data of [null,{}, {enabled:true},{enabled:true,simulated:false,mode:'local-emulator'},{enabled:true,simulated:true,mode:'production'},{enabled:true,simulated:true,mode:'hosted-demo'},{enabled:'true',simulated:true,mode:'local-emulator'}]){
   state.busy=false;state.data=data;await act(async()=>tree.update(React.createElement(Probe)));assert.equal(result.enabled,false);
  }
  state.data={enabled:true,simulated:true,mode:'local-emulator'};await act(async()=>tree.update(React.createElement(Probe)));assert.equal(result.enabled,true);
  state.data={enabled:true,simulated:true,mode:'mock'};await act(async()=>tree.update(React.createElement(Probe)));assert.equal(result.enabled,true);assert.equal(result.mode,'mock');
  state.error='Network unavailable';await act(async()=>tree.update(React.createElement(Probe)));assert.equal(result.enabled,false);
  assert.ok(reads.every(op=>op==='paymentSimulation'));
 }finally{await act(async()=>tree.unmount());}
});
