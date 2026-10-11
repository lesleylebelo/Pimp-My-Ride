const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;

function loadPicker({result}){
 const events=[];
 const pickerModule={
   launchImageLibraryAsync:async options=>{events.push(['launch',options]);return result;},
 };
 const manipulatorModule={
   SaveFormat:{JPEG:'jpeg'},
   manipulateAsync:async(...args)=>{events.push(['manipulate',args]);return {uri:'file:///compressed.jpg',fileSize:512};},
 };
 const picker=loadUI('src/features/marketplace/services/postsApi.js',{
  'react-native':{Platform:{OS:'ios'}},
  '../utils/photos':{photoFileError:()=>null},
 });
 const options={
  loadImagePicker:async()=>{events.push(['import-picker']);return pickerModule;},
  loadImageManipulator:async()=>{events.push(['import-manipulator']);return manipulatorModule;},
 };
 return {pick:maximum=>picker.pickPostPhotos(maximum,options),events};
}

test('photo selection launches ImagePicker before initializing ImageManipulator',async()=>{
 const picker=loadPicker({result:{canceled:false,assets:[{
  uri:'file:///original.png',fileName:'original.png',fileSize:1024,mimeType:'image/png',width:2000,
 }]}});
 const selected=await picker.pick(10);
 assert.deepEqual(picker.events.map(([name])=>name),['import-picker','launch','import-manipulator','manipulate']);
 assert.deepEqual(picker.events[1][1],{
  mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:10,quality:1,
 });
 assert.deepEqual(selected,[{
  uri:'file:///compressed.jpg',name:'original.jpg',size:512,mimeType:'image/jpeg',
 }]);
 assert.deepEqual(picker.events[3][1],[
  'file:///original.png',[{resize:{width:1600}}],{compress:0.78,format:'jpeg'},
 ]);
});

test('cancelling or receiving no assets does not initialize the image manipulator',async()=>{
 for(const result of [{canceled:true,assets:null},{canceled:false,assets:[]} ]){
  const picker=loadPicker({result});
  assert.deepEqual(await picker.pick(10),[]);
  assert.deepEqual(picker.events.map(([name])=>name),['import-picker','launch']);
 }
});

test('showcase photo-picker failures retain the full stack in the development console',async()=>{
 const originalDev=globalThis.__DEV__,originalError=console.error;
 globalThis.__DEV__=true;
 const failure=new TypeError("Cannot read property 'reload' of undefined");
 failure.stack=`${failure.name}: ${failure.message}\n    at launchImageLibraryAsync (native)`;
 const logged=[];
 console.error=(...args)=>logged.push(args);
 const Text='Text';
 const {PostFormScreen}=loadUI('src/features/marketplace/screens/PostScreens.js',{
  'react-native':{Pressable:({children,...props})=>React.createElement('Pressable',props,children)},
  '../../../shared/components/landing/LandingUI':{LandingText:Text},
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'shop-1'},profile:{role:'shop',verificationStatus:'approved'},offline:false})},
  '../services/postsApi':{
   postsApi:async()=>{},
   pickPostPhotos:async()=>{throw failure;},
   uploadPostPhoto:async()=>{},
  },
  '../hooks/usePostsFeed':{usePostsFeed:()=>({items:[],busy:false,error:'',refresh:async()=>{}})},
  '../components/PostCard':{PostCard:'PostCard'},
  '../components/MarketplaceUI':{
   Page:({children})=>React.createElement('View',null,children),
   Card:({children})=>React.createElement('View',null,children),
   Field:'TextInput',
   Button:({title,onPress,disabled})=>React.createElement('Pressable',{accessibilityLabel:title,onPress,disabled},React.createElement(Text,null,title)),
   Notice:({error})=>error?React.createElement(Text,{accessibilityRole:'alert'},error):null,
   useInfiniteCursor:()=>({items:[]}),
  },
  '../hooks/useMarketData':{useMarketData:()=>({data:null,busy:false,error:'',refresh:async()=>{}})},
 });
 let tree;
 try{
  await act(async()=>{tree=Renderer.create(React.createElement(PostFormScreen,{navigation:{goBack(){}},route:{params:{type:'showcase'}}}));});
  const pickerButton=tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel?.startsWith('Add photos ('));
  assert.ok(pickerButton,'New showcase should expose Add photos');
  await act(async()=>pickerButton.props.onPress());
  const pickerLogs=logged.filter(args=>args[0]==='[PimpMyRide showcase photo picker failed]');
  assert.equal(pickerLogs.length,1);
  assert.equal(pickerLogs[0][1],failure);
  assert.match(pickerLogs[0][1].stack,/launchImageLibraryAsync/);
  assert.ok(tree.root.findAllByType('Text').some(node=>node.props.children===failure.message));
 }finally{
  console.error=originalError;
  if(originalDev===undefined)delete globalThis.__DEV__;else globalThis.__DEV__=originalDev;
  if(tree)await act(async()=>tree.unmount());
 }
});
