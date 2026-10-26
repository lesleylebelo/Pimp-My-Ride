const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const service=()=>loadUI('src/shared/services/photoSource.js');
const canceled={canceled:true,assets:[]};
const permissionPicker=(permission)=>{
 const calls=[];return {calls,picker:{getCameraPermissionsAsync:async()=>{calls.push('get');return permission;},requestCameraPermissionsAsync:async()=>{calls.push('request');return permission;},launchCameraAsync:options=>{calls.push(options);return Promise.resolve(canceled);},launchImageLibraryAsync:options=>{calls.push(options);return Promise.resolve(canceled);}}};
};

test('native permission is requested only for camera, and granted capture is images-only and single',async()=>{
 const {picker,calls}=permissionPicker({granted:true});
 await service().launchPhotoSource('gallery',{maximum:4},{picker,platform:'ios'});
 assert.equal(calls.length,1);assert.equal(calls[0].selectionLimit,4);assert.equal(calls[0].allowsMultipleSelection,true);
 calls.length=0;await service().launchPhotoSource('camera',{maximum:4},{picker,platform:'android'});
 assert.equal(calls[0],'get');assert.equal(calls.length,2);assert.deepEqual(calls[1].mediaTypes,['images']);assert.equal(calls[1].allowsMultipleSelection,false);
});
test('a permission grant after the prompt opens camera without requesting microphone or library access',async()=>{
 const {picker,calls}=permissionPicker({granted:false,canAskAgain:true});picker.requestCameraPermissionsAsync=async()=>{calls.push('request');return {granted:true};};
 await service().launchPhotoSource('camera',{}, {picker,platform:'ios'});assert.deepEqual(calls.slice(0,2),['get','request']);assert.equal(calls.length,3);
});
test('denial keeps camera closed; permanent denial is not requested again',async()=>{
 for(const canAskAgain of [true,false]){
  const {picker,calls}=permissionPicker({granted:false,canAskAgain});
  await assert.rejects(service().launchPhotoSource('camera',{}, {picker,platform:'ios'}),e=>e.code===(canAskAgain?'CAMERA_DENIED':'CAMERA_SETTINGS'));
  assert.deepEqual(calls,canAskAgain?['get','request']:['get']);
 }
});
test('web camera launches within the synchronous click path without permission calls or imports',async()=>{
 const originalWindow=global.window,originalDocument=global.document;
 try{
  global.window={isSecureContext:true};global.document={};let launched=false;
  const picker={launchCameraAsync:options=>{launched=true;assert.equal(options.allowsMultipleSelection,false);return Promise.resolve(canceled);},getCameraPermissionsAsync:()=>assert.fail('Web must not await permission')};
  const result=service().launchPhotoSource('camera',{}, {picker,platform:'web'});assert.equal(launched,true);assert.deepEqual(await result,canceled);
  global.window.isSecureContext=false;assert.throws(()=>service().launchPhotoSource('camera',{}, {picker,platform:'web'}),/HTTPS/);
 }finally{if(originalWindow===undefined)delete global.window;else global.window=originalWindow;if(originalDocument===undefined)delete global.document;else global.document=originalDocument;}
});
test('unavailable camera and launch failures explain recovery without opening gallery automatically',async()=>{
 assert.throws(()=>service().launchPhotoSource('camera',{}, {picker:{},platform:'ios'}),/unavailable/);
 const {picker}=permissionPicker({granted:true});picker.launchCameraAsync=()=>{throw Error('No camera');};
 await assert.rejects(service().launchPhotoSource('camera',{}, {picker,platform:'ios'}),/No camera/);
 assert.match(service().photoSourceError(Error('NotAllowedError'),'camera'),/choose from gallery/);
});

async function chooserFixture(){
 const state={uid:'first',focused:true,permission:{granted:true},results:[],launches:[],settings:0};
 const picker={getCameraPermissionsAsync:async()=>state.permission,requestCameraPermissionsAsync:async()=>state.permission,
  launchCameraAsync:options=>{state.launches.push(['camera',options]);return state.capture?state.capture():Promise.resolve(canceled);},
  launchImageLibraryAsync:options=>{state.launches.push(['gallery',options]);return Promise.resolve({assets:[{uri:'file:///gallery.jpg'}]});}};
 const {usePhotoSource}=loadUI('src/shared/components/PhotoSourceChooser.js',{'expo-image-picker':picker,'@react-navigation/native':{useIsFocused:()=>state.focused},'react-native':{Linking:{openSettings:async()=>{state.settings++;}}}});
 function Harness(){const source=usePhotoSource({scopeKey:state.uid});return React.createElement('View',null,React.createElement('Pressable',{accessibilityLabel:'Open',onPress:()=>{void source.choose({maximum:3}).then(result=>state.results.push(result));}}),source.chooser);}
 let tree;await act(async()=>{tree=create(React.createElement(Harness));});
 const button=label=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
 return {state,tree,button,press:label=>act(async()=>button(label).props.onPress()),update:()=>act(async()=>tree.update(React.createElement(Harness))),close:()=>act(async()=>tree.unmount())};
}
test('chooser opens, cancels without a picker, and gallery returns existing multiple selection options',async()=>{
 const s=await chooserFixture();try{
  await s.press('Open');assert.ok(s.button('Take photo'));assert.ok(s.button('Choose from gallery'));assert.equal(s.state.launches.length,0);
  await s.press('Cancel');assert.equal(s.tree.root.findAllByType('Modal').length,0);assert.equal(s.state.results[0].canceled,true);
  await s.press('Open');await s.press('Choose from gallery');assert.equal(s.state.results[1].source,'gallery');assert.equal(s.state.launches[0][1].selectionLimit,3);
 }finally{await s.close();}
});
test('permanent denial exposes Settings and leaves gallery usable; capture cancellation is not an error',async()=>{
 const s=await chooserFixture();try{
  s.state.permission={granted:false,canAskAgain:false};await s.press('Open');await s.press('Take photo');assert.ok(s.button('Open settings'));await s.press('Open settings');assert.equal(s.state.settings,1);
  assert.ok(s.button('Choose from gallery'));assert.equal(s.state.launches.length,0);await s.press('Choose from gallery');assert.equal(s.state.results.length,1);
  s.state.permission={granted:true};await s.press('Open');await s.press('Take photo');assert.equal(s.state.results[1].canceled,true);assert.equal(s.tree.root.findAllByType('Modal').length,0);
 }finally{await s.close();}
});
test('late captures after account switch, blur or chooser cancellation cannot enter a new selection',async()=>{
 for(const transition of ['account','blur','cancel']){
  const s=await chooserFixture();let resolve;s.state.capture=()=>new Promise(r=>{resolve=r;});
  try{await s.press('Open');await s.press('Take photo');if(transition==='account')s.state.uid='second';if(transition==='blur')s.state.focused=false;
   if(transition==='cancel')await s.press('Cancel');else await s.update();
   await act(async()=>resolve({assets:[{uri:'file:///private-old.jpg'}]}));assert.equal(s.state.results.length,1);assert.equal(s.state.results[0].canceled,true);
  }finally{await s.close();}
 }
});
test('processing normalizes missing capture metadata, bounds capture count, and validates decoded output and size',async()=>{
 const {pickPostPhotos}=loadUI('src/features/marketplace/services/postsApi.js');let processed=0;
 const options={selectAssets:async()=>({source:'camera',assets:[{uri:'file:///capture'}, {uri:'file:///extra'}]}),loadImageManipulator:async()=>({SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>{processed++;return {uri:'file:///prepared.jpg',base64:'AAAA'};}})};
 const files=await pickPostPhotos(5,options);assert.equal(files.length,1);assert.equal(processed,1);assert.deepEqual(files[0],{uri:'file:///prepared.jpg',name:'photo.jpg',size:3,mimeType:'image/jpeg'});
 await assert.rejects(pickPostPhotos(1,{...options,selectAssets:async()=>({assets:[{uri:'file:///capture',mimeType:'image/gif'}]})}),/JPEG/);
 await assert.rejects(pickPostPhotos(1,{...options,selectAssets:async()=>({assets:[{uri:'file:///capture',fileSize:6*1024*1024}]})}),/5 MB/);
 await assert.rejects(pickPostPhotos(1,{...options,loadImageManipulator:async()=>({SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>({uri:'file:///prepared.jpg'})})}),/size could not be read/);
 assert.deepEqual(await pickPostPhotos(0,{selectAssets:()=>assert.fail('Limit reached')}),[]);
});

test('native camera configuration preserves identifiers/plugins and never enables microphone recording',()=>{
 const c=require('../app.json').expo,plugin=c.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-image-picker')[1];
 assert.match(plugin.cameraPermission,/vehicles, service requests, showcases and profile pictures/);assert.equal(plugin.microphonePermission,false);assert.ok(c.android.permissions.includes('android.permission.CAMERA'));assert.ok(!c.android.permissions.includes('android.permission.RECORD_AUDIO'));
 assert.equal(c.android.package,'com.lesleylebelo.pimpmyride');assert.equal(c.extra.eas.projectId,'9b1b3efd-d33a-4dfc-a78b-28e4d1aa1cde');for(const name of ['expo-location','expo-splash-screen'])assert.ok(c.plugins.some(p=>Array.isArray(p)&&p[0]===name));
});

test('web dialog restores the captured opener after modal teardown rather than the modal focus trap',async()=>{
 const previousDocument=global.document;let restored=0,tree;const opener={focus(){restored++;}};
 global.document={activeElement:{focus(){assert.fail('Do not focus modal body');}},addEventListener(){},removeEventListener(){},querySelector(){return null;}};
 try{
  const {PhotoSourceDialog}=loadUI('src/shared/components/PhotoSourceChooser.js',{'react-native':{Platform:{OS:'web'}}});
  const props={restoreFocus:opener,onCancel(){},onSource(){}};
  await act(async()=>{tree=create(React.createElement(PhotoSourceDialog,{...props,visible:true}));});
  await act(async()=>tree.update(React.createElement(PhotoSourceDialog,{...props,visible:false})));await act(async()=>new Promise(r=>setTimeout(r,10)));assert.equal(restored,1);
 }finally{if(tree)await act(async()=>tree.unmount());if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
});
