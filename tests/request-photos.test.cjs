const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
function setup(){
 const state={uid:'shop',offline:false,focused:true,calls:[],fail:false,late:false};
 const Component=loadUI('src/features/marketplace/components/RequestPhotos.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:state.uid},offline:state.offline})},
  '@react-navigation/native':{useIsFocused:()=>state.focused},'./MarketplaceUI':{Button:'Button'},
  '../services/photoApi':{viewPhoto:async(...args)=>{state.calls.push(args);if(state.fail)throw Error('Private provider information');if(state.late)return new Promise(resolve=>{state.resolve=resolve;});return {url:`https://private.example.invalid/${args[3]}/${args[2]}/${state.calls.length}`,expiresAt:Date.now()+60000};}},
 }).default;
 return {state,Component};
}
const images=tree=>tree.root.findAllByType('Image');
const texts=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const render=(Component,request)=>React.createElement(Component,{request});

test('request previews renew expired URLs without relisting Garage photos or reloading on feed object refresh',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const {state,Component}=setup(),request={id:'job',photoIds:['b','a'],photos:[{id:'garage-secret',url:'https://unsafe.example/garage'}]};let tree;
 try{
  await act(async()=>{tree=create(render(Component,request));});assert.equal(images(tree).length,2);assert.equal(state.calls.length,2);
  const firstUrls=images(tree).map(image=>image.props.source.uri),staleError=images(tree)[0].props.onError;
  await act(async()=>tree.update(render(Component,{...request,photoIds:[...request.photoIds]})));assert.equal(state.calls.length,2);
  await act(async()=>t.mock.timers.tick(55000));assert.equal(state.calls.length,2);
  await act(async()=>t.mock.timers.tick(5000));assert.equal(state.calls.length,4);assert.ok(images(tree).every(image=>!firstUrls.includes(image.props.source.uri)));
  assert.deepEqual(state.calls.map(call=>call.slice(0,3)),[['request','job','b'],['request','job','a'],['request','job','b'],['request','job','a']]);
  await act(async()=>staleError());assert.equal(images(tree).length,2);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('unavailable images show a safe placeholder and explicit retry without a renewal loop',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const {state,Component}=setup();state.fail=true;let tree;
 try{
  await act(async()=>{tree=create(render(Component,{id:'job',photoIds:['one']}));});assert.equal(images(tree).length,0);assert.match(texts(tree),/Photo unavailable/);assert.doesNotMatch(texts(tree),/provider/);
  await act(async()=>t.mock.timers.tick(120000));assert.equal(state.calls.length,1);
  state.fail=false;await act(async()=>tree.root.findByType('Button').props.onPress());assert.equal(images(tree).length,1);
  await act(async()=>images(tree)[0].props.onError());assert.equal(images(tree).length,0);assert.match(texts(tree),/Photo unavailable/);
  await act(async()=>t.mock.timers.tick(120000));assert.equal(state.calls.length,2);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('blur, offline and account changes clear request previews and ignore late signed responses',async()=>{
 for(const transition of [{focused:false},{offline:true},{uid:'another-shop'}]){
  const {state,Component}=setup(),request={id:'job',photoIds:['one']};let tree;
  try{
   await act(async()=>{tree=create(render(Component,request));});assert.equal(images(tree).length,1);
   state.late=true;await act(async()=>{state.uid='waiting-shop';tree.update(render(Component,request));});
   const resolve=state.resolve;await act(async()=>{Object.assign(state,transition);tree.update(render(Component,request));});
   await act(async()=>resolve({url:'https://private.example.invalid/old-account',expiresAt:Date.now()+60000}));assert.equal(images(tree).length,0);
  }finally{if(tree)await act(async()=>tree.unmount());}
 }
});

test('legacy photoIds-only requests work; URL-only metadata and invalid IDs never enumerate private Garage media',async()=>{
 const {state,Component}=setup();let tree;
 try{
  await act(async()=>{tree=create(render(Component,{id:'job',photoIds:['legacy-id']}));});assert.equal(images(tree).length,1);
  await act(async()=>tree.update(render(Component,{id:'job',photoIds:[],photos:[{id:'not-attached',url:'https://unsafe.example/private'}]})));
  assert.equal(images(tree).length,0);assert.equal(state.calls.length,1);assert.match(texts(tree),/Attached photos unavailable/);
  await act(async()=>tree.update(render(Component,{id:'job',photoIds:['../forged','https://unsafe.example/private']})));assert.equal(state.calls.length,1);
 }finally{if(tree)await act(async()=>tree.unmount());}
});
