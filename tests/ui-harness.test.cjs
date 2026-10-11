const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const buttonFile='src/shared/components/PrimaryButton.js';
async function mount(mocks={},props={}){
 const Button=loadUI(buttonFile,mocks).default;
 let tree;await act(async()=>{tree=create(React.createElement(Button,{title:'Continue',...props}));});
 return tree;
}

test('shared native animation mock renders the real button and completes press animations without timers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const tree=await mount();
 try{
  const press=tree.root.findByType('Pressable');
  const interpolation=tree.root.findByType('AnimatedView').props.style[1].transform[0].translateX;
  assert.equal(interpolation.value.value,-1);
  assert.deepEqual(interpolation.config,{inputRange:[-1,1],outputRange:[-400,400]});
  await act(async()=>press.props.onPressIn());assert.equal(interpolation.value.value,1);
  await act(async()=>press.props.onPressOut());assert.equal(interpolation.value.value,-1);
  t.mock.timers.tick(1000);assert.equal(interpolation.value.value,-1);
 }finally{await act(async()=>tree.unmount());}
});

test('partial per-screen native overrides retain shared animation exports and remain isolated between loads',async()=>{
 const custom=await mount({'react-native':{Pressable:'CustomPressable',Platform:{OS:'web'}}});
 const standard=await mount();
 try{
  assert.equal(custom.root.findByType('CustomPressable').props.accessibilityLabel,'Continue');
  assert.equal(custom.root.findAllByType('AnimatedView').length,1);
  assert.equal(standard.root.findAllByType('Pressable').length,1);
  assert.equal(standard.root.findAllByType('CustomPressable').length,0);
 }finally{await act(async()=>{custom.unmount();standard.unmount();});}
});

test('explicit native animation overrides are honoured by the loader',async()=>{
 const calls=[];
 class Value {interpolate(){return 'custom interpolation';}}
 const tree=await mount({'react-native':{Animated:{Value,View:'CustomAnimation',timing:(value,config)=>({start(){calls.push({value,config});}})}}});
 try{
  assert.equal(tree.root.findByType('CustomAnimation').props.style[1].transform[0].translateX,'custom interpolation');
  const press=tree.root.findByType('Pressable');
  await act(async()=>{press.props.onPressIn();press.props.onPressOut();});
  assert.equal(calls.length,2);assert.ok(calls[0].value instanceof Value);
  assert.equal(calls[0].value,calls[1].value);
  assert.deepEqual(calls.map(call=>call.config),[
   {toValue:1,duration:500,useNativeDriver:true},{toValue:-1,duration:0,useNativeDriver:true},
  ]);
 }finally{await act(async()=>tree.unmount());}
});

test('real button loading and disabled semantics survive the animation mock',async()=>{
 const tree=await mount({}, {loading:true});
 try{
  const press=tree.root.findByType('Pressable');
  assert.equal(press.props.disabled,true);
  assert.deepEqual(press.props.accessibilityState,{disabled:true,busy:true});
  assert.equal(tree.root.findAllByType('ActivityIndicator').length,1);
  assert.equal(tree.root.findAllByType('AnimatedView').length,0);
 }finally{await act(async()=>tree.unmount());}
});
