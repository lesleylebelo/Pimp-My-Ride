const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act} = Renderer;
const button = (tree, label) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label);
const says = (tree, text) => tree.root.findAllByType('Text').some(node => String([node.props.children].flat().join('')).includes(text));
const press = (tree, title) => act(async () => button(tree, title).props.onPress());
const change = (tree, label, value) => act(async () => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label).props.onChangeText(value));
const unmount = tree => act(async () => tree.unmount());
const value = {latitude:-25.7479,longitude:28.2293};
async function mount(Component, props) {let tree;await act(async () => {tree = Renderer.create(React.createElement(Component, props));});return tree;}
function picker({status='granted', get=async()=>({coords:value})}={}) {
  const calls=[],changes=[],busy=[];
  const Component=loadUI('src/shared/location/LocationPicker.js',{
    'react-native':{Platform:{OS:'android'}},'react-native-webview':{WebView:'WebView'},
    'expo-location':{Accuracy:{Balanced:3},requestForegroundPermissionsAsync:async()=>{calls.push('permission');return {status};},getCurrentPositionAsync:async()=>{calls.push('position');return get();}},
  }).default;
  const props={label:'Service location',value:null,onChange:next=>changes.push(next),onBusyChange:next=>busy.push(next)};
  return {Component,props,calls,changes,busy};
}

test('opening a location form or map never requests permission or fabricates a selected position',async()=>{
 const c=picker(),tree=await mount(c.Component,c.props);
 assert.ok(says(tree,'Distance unavailable'));assert.deepEqual(c.calls,[]);
 await press(tree,'Choose service location');await press(tree,'Choose on map');
 assert.equal(button(tree,'Confirm selected location').props.disabled,true);
 assert.deepEqual(c.calls,[]);assert.deepEqual(c.changes,[]);
 assert.ok(tree.root.findByType('WebView').props.source.html.includes('OpenStreetMap contributors'));
 await unmount(tree);
});
test('current location is previewed only after an explicit action and requires confirmation',async()=>{
 const c=picker(),tree=await mount(c.Component,c.props);await press(tree,'Choose service location');await press(tree,'Use current location');
 assert.deepEqual(c.calls,['permission','position']);assert.deepEqual(c.changes,[]);
 assert.ok(says(tree,'-25.747900, 28.229300'));await press(tree,'Confirm selected location');assert.deepEqual(c.changes,[value]);
 assert.deepEqual(c.busy.slice(0,2),[true,false]);await unmount(tree);
});
test('permission denial and unavailable GPS keep manual selection available',async()=>{
 for(const options of [{status:'denied'},{get:async()=>{throw Error('GPS unavailable');}}]) {
  const c=picker(options),tree=await mount(c.Component,c.props);await press(tree,'Choose service location');await press(tree,'Use current location');
  assert.equal(button(tree,'Confirm selected location').props.disabled,true);assert.deepEqual(c.changes,[]);
  if(options.status==='denied')assert.deepEqual(c.calls,['permission']);
  await change(tree,'Service location latitude','-26.2');await change(tree,'Service location longitude','28.04');await press(tree,'Preview coordinates');await press(tree,'Confirm selected location');
  assert.deepEqual(c.changes,[{latitude:-26.2,longitude:28.04}]);await unmount(tree);
 }
});
test('manual validation rejects blanks and invalid coordinates, accepts zero, and cancellation leaves saved data intact',async()=>{
 const c=picker(),tree=await mount(c.Component,{...c.props,value});await press(tree,'Choose service location');
 for(const [latitude,longitude] of [['','0'],['91','0'],['0','181'],['NaN','0'],['1e2','0']]) {
  await change(tree,'Service location latitude',latitude);await change(tree,'Service location longitude',longitude);await press(tree,'Preview coordinates');assert.equal(button(tree,'Confirm selected location').props.disabled,true);
 }
 await change(tree,'Service location latitude','0');await change(tree,'Service location longitude','0');await press(tree,'Preview coordinates');
 await press(tree,'Cancel location selection');assert.deepEqual(c.changes,[]);assert.ok(says(tree,'-25.747900, 28.229300'));
 await press(tree,'Remove service location');assert.deepEqual(c.changes,[null]);assert.deepEqual(c.calls,[]);await unmount(tree);
});
test('map messages validate their channel and numbers, and moving the pin needs explicit confirmation',async()=>{
 const c=picker(),tree=await mount(c.Component,c.props);await press(tree,'Choose service location');await press(tree,'Choose on map');
 const send=data=>act(async()=>tree.root.findByType('WebView').props.onMessage({nativeEvent:{data}}));
 for(const data of ['bad',JSON.stringify({type:'other',...value}),JSON.stringify({type:'pmr-location',latitude:'0',longitude:0}),JSON.stringify({type:'pmr-location',latitude:999,longitude:0})])await send(data);
 assert.equal(button(tree,'Confirm selected location').props.disabled,true);
 await send(JSON.stringify({type:'pmr-location',...value}));assert.deepEqual(c.changes,[]);await press(tree,'Confirm selected location');assert.deepEqual(c.changes,[value]);await unmount(tree);
});
test('offline controls and a location result arriving after unmount cannot change saved selection',async()=>{
 let resolve;const c=picker({get:()=>new Promise(done=>{resolve=done;})}),tree=await mount(c.Component,c.props);
 await press(tree,'Choose service location');let pending;
 await act(async()=>{pending=button(tree,'Use current location').props.onPress();});await unmount(tree);
 await act(async()=>{resolve({coords:value});await pending;});assert.deepEqual(c.changes,[]);
 const offline=await mount(c.Component,{...c.props,disabled:true});await press(offline,'Choose service location');assert.equal(button(offline,'Use current location'),undefined);await unmount(offline);
});
test('map document creates a draggable pin on clicks and sends the actual selected coordinates',()=>{
 const {mapDocument}=loadUI('src/shared/location/mapDocument.js');
 const messages=[],handlers={},markerHandlers={};let markerPosition;
 const point=(latitude,longitude)=>({lat:latitude,lng:longitude,wrap(){return this;}});
 const map={setView:()=>map,on:(event,fn)=>{handlers[event]=fn;}};
 const marker={addTo:()=>marker,on:(event,fn)=>{markerHandlers[event]=fn;},setLatLng:p=>{markerPosition=p;},getLatLng:()=>markerPosition};
 const L={map:()=>map,tileLayer:()=>({addTo:()=>({on(){}})}),marker:(p,options)=>{assert.equal(options.draggable,true);markerPosition=p;return marker;},divIcon:()=>({}),latLng:point};
 const html=mapDocument(null),script=html.match(/<script>([\s\S]*)<\/script>/)[1];
 vm.runInNewContext(script,{L,window:{L,parent:{postMessage:message=>messages.push(JSON.parse(message))}},document:{getElementById:()=>({})}});
 assert.equal(messages.length,0);handlers.click({latlng:point(value.latitude,value.longitude)});assert.deepEqual(messages[0],{type:'pmr-location',...value});
 markerPosition=point(0,0);markerHandlers.dragend();assert.deepEqual(messages[1],{type:'pmr-location',latitude:0,longitude:0});
});

test('business location confirmation stays local until save and sends ownership-bound optimistic data',async()=>{
 const state={user:{uid:'shop'},profile:{role:'shop',shop:{coordinates:null}},offline:false},calls=[];
 state.refresh=async()=>{state.profile={role:'shop',shop:{coordinates:value}};};
 const BusinessLocation=loadUI('src/features/auth/components/BusinessLocation.js',{
  '../context/AuthContext':{useAuth:()=>state},'../../../shared/location/LocationPicker':props=>React.createElement('LocationPicker',props),
  '../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);return {ok:true,coordinates:value};}},
 }).default;
 const tree=await mount(BusinessLocation,{});assert.equal(button(tree,'Save business location').props.disabled,true);
 await act(async()=>tree.root.findByType('LocationPicker').props.onChange(value));assert.equal(calls.length,0);
 await press(tree,'Save business location');assert.equal(calls.length,1);assert.equal(calls[0][0],'profile');
 assert.deepEqual(calls[0][1].coordinates,value);assert.equal(calls[0][1].expectedCoordinates,null);assert.deepEqual(calls[0][2],{expectedUid:'shop'});
 assert.equal(Object.hasOwn(calls[0][1],'uid'),false);assert.ok(says(tree,'Business location saved'));await unmount(tree);
});
test('failed shop save preserves the draft and retry key; account switch resets the location draft',async()=>{
 const state={user:{uid:'shop'},profile:{role:'shop',shop:{coordinates:null}},offline:false,refresh:async()=>{}},calls=[];
 const BusinessLocation=loadUI('src/features/auth/components/BusinessLocation.js',{
  '../context/AuthContext':{useAuth:()=>state},'../../../shared/location/LocationPicker':props=>React.createElement('LocationPicker',props),
  '../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);throw Error('Connection lost');}},
 }).default;
 const tree=await mount(BusinessLocation,{});await act(async()=>tree.root.findByType('LocationPicker').props.onChange(value));
 await press(tree,'Save business location');await press(tree,'Save business location');assert.equal(calls[0][1].requestId,calls[1][1].requestId);assert.deepEqual(tree.root.findByType('LocationPicker').props.value,value);
 state.user={uid:'other'};await act(async()=>tree.update(React.createElement(BusinessLocation,{})));
 assert.equal(button(tree,'Save business location').props.disabled,true);assert.equal(tree.root.findByType('LocationPicker').props.value,null);await unmount(tree);
});

test('a stale shop-location conflict preserves the draft and reloads the current profile before retrying',async()=>{
 const newer={latitude:-26.2,longitude:28.04},state={user:{uid:'shop'},profile:{role:'shop',shop:{coordinates:null}},offline:false};
 state.refresh=async()=>{state.profile={role:'shop',shop:{coordinates:newer}};};
 const Component=loadUI('src/features/auth/components/BusinessLocation.js',{
  '../context/AuthContext':{useAuth:()=>state},'../../../shared/location/LocationPicker':props=>React.createElement('LocationPicker',props),
  '../../../shared/services/api':{apiRequest:async()=>{throw Error('Location changed. Refresh before saving.');}},
 }).default;
 const tree=await mount(Component,{});await act(async()=>tree.root.findByType('LocationPicker').props.onChange(value));await press(tree,'Save business location');
 assert.deepEqual(tree.root.findByType('LocationPicker').props.value,value);await press(tree,'Reload saved business location');
 // The mock context needs the render that AuthProvider emits after its profile refresh.
 await act(async()=>tree.update(React.createElement(Component,{})));
 assert.deepEqual(tree.root.findByType('LocationPicker').props.value,newer);assert.equal(button(tree,'Save business location').props.disabled,true);await unmount(tree);
});
