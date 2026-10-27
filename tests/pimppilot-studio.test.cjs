const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const plan={objective:'Daily driver',observations:[],assumptions:[],modifications:[{title:'Wrap',scope:'Wrap doors in matte black.',parts:['Vinyl'],tradeOffs:'Check paint condition.'},{title:'Wheels',scope:'Fit new wheels after fitment assessment.',parts:[],tradeOffs:'Confirm daily comfort.'}],considerations:['Check compatibility.'],questions:['What finish do you prefer?']};
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
test('draft transfer includes only selected proposed scopes, requires nonempty selection and respects the existing limit',()=>{
 const {studioRequestDraft}=loadUI('src/features/marketplace/services/pimpPilotStudio.js',{'../../../shared/services/api':{}});
 assert.equal(studioRequestDraft(plan,[]),null);
 assert.deepEqual(studioRequestDraft(plan,[0]),{title:'Vehicle customisation plan',description:'Proposed work: Wrap doors in matte black.'});
 assert.equal(studioRequestDraft({modifications:[{scope:'x'.repeat(300)}]},[0]),null);
});
async function setup(params={vehicleId:'car',vehicle:{id:'car',make:'Toyota'}}){
 const state={auth:{user:{uid:'owner'},offline:false},focused:true,calls:[],pushed:[],photo:'/9j/4AAQ/9k=',cameraAllowed:true,pickerCanceled:false,reply:async()=>({vehicleId:'car',plan})};
 const UI={Page:({children})=>React.createElement('View',null,children),Card:({children})=>React.createElement('View',null,children),Button:props=>React.createElement('Button',props),Field:props=>React.createElement('TextInput',props),Notice:({error})=>React.createElement('Text',null,error)};
 const Component=loadUI('src/features/marketplace/screens/PimpPilotStudioScreen.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '@react-navigation/native':{useIsFocused:()=>state.focused,usePreventRemove:(enabled,callback)=>{state.preventRemove=enabled;state.onRemove=callback;}},
  '../components/MarketplaceUI':UI,
  '../hooks/useMarketData':{useMarketData:()=>({data:{items:[{id:'car',ownerId:'owner',make:'Toyota',model:'Corolla',year:2022},{id:'foreign',ownerId:'someone-else',make:'Foreign'},{id:'archived',ownerId:'owner',make:'Archived',archived:true}]},busy:false,error:'',refresh:async()=>{}})},
  '../../../shared/components/ConfirmationButton':props=>React.createElement('Confirmation',props),
  '../services/pimpPilotStudio':{...loadUI('src/features/marketplace/services/pimpPilotStudio.js',{'../../../shared/services/api':{}}),createStudioPlan:async(...args)=>{state.calls.push(args);return state.reply();}},
  'expo-image-picker':{requestCameraPermissionsAsync:async()=>({granted:state.cameraAllowed}),launchCameraAsync:async()=>({canceled:false,assets:[{uri:'file:///camera.jpg'}]}),launchImageLibraryAsync:async()=>({canceled:state.pickerCanceled,assets:[{uri:'file:///car.jpg'}]})},
  'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>({base64:state.photo})},
 }).default;
 const navigation={push:(...args)=>state.pushed.push(args),dispatch:action=>state.dispatched=action},props={route:{params},navigation};
 let tree;await act(async()=>{tree=create(React.createElement(Component,props));});
 const update=()=>act(async()=>tree.update(React.createElement(Component,props)));
 const press=title=>act(async()=>{tree.root.findAllByType('Button').find(node=>node.props.title===title).props.onPress();await new Promise(done=>setImmediate(done));});
 const type=value=>act(async()=>tree.root.findByType('TextInput').props.onChangeText(value));
 return {state,tree,update,press,type,close:()=>act(async()=>tree.unmount())};
}
test('Studio previews plans, selects nothing automatically and transfers only after the confirmation callback',async()=>{
 const s=await setup();try{
  assert.match(text(s.tree),/AI image editing.*Not available yet/);
  await s.type('Black wrap');await s.press('Prepare plan');
  assert.equal(s.state.calls[0][1],'owner');assert.deepEqual(s.state.calls[0][0],{vehicleId:'car',message:'Black wrap',history:[]});
  assert.equal(s.tree.root.findByType('Confirmation').props.disabled,true);assert.equal(s.state.pushed.length,0);
  await s.press('Select Wrap for request');const confirmation=s.tree.root.findByType('Confirmation');
  assert.equal(confirmation.props.disabled,false);assert.match(confirmation.props.message,/Proposed work: Wrap doors/);assert.equal(s.state.pushed.length,0);
  await act(async()=>confirmation.props.onConfirm());
  assert.equal(s.state.pushed[0][0],'RequestForm');assert.equal(s.state.pushed[0][1].vehicleId,'car');
  assert.equal(s.state.pushed[0][1].studioDraft.uid,'owner');assert.doesNotMatch(s.state.pushed[0][1].studioDraft.description,/wheels/i);
 }finally{await s.close();}
});
test('refinement carries bounded context; replacing the photo resets the plan and removing it clears sensitive state',async()=>{
 const s=await setup();try{
  await s.type('Black wrap');await s.press('Prepare plan');await s.type('More subtle');await s.press('Refine plan');
  assert.equal(s.state.calls[1][0].history.length,1);assert.equal(s.state.calls[1][0].message,'More subtle');
  await s.press('Add vehicle photo (optional)');assert.equal(s.tree.root.findAllByType('Confirmation').length,0);
  await s.type('Use this photo');await s.press('Prepare plan');assert.equal(s.state.calls[2][0].history.length,0);assert.equal(s.state.calls[2][0].image.mimeType,'image/jpeg');
  await s.press('Remove photo and reset plan');assert.equal(s.tree.root.findAllByType('Image').length,0);assert.equal(s.tree.root.findAllByType('Confirmation').length,0);
 }finally{await s.close();}
});
test('focus and account changes discard context and late private responses',async()=>{
 const s=await setup();let resolve;
 try{
  s.state.reply=()=>new Promise(done=>resolve=done);await s.type('Wrap');await s.press('Prepare plan');
  s.state.focused=false;await s.update();await act(async()=>resolve({vehicleId:'car',plan}));
  assert.equal(s.tree.root.findAllByType('Confirmation').length,0);
  s.state.focused=true;s.state.auth.user.uid='other';await s.update();assert.equal(s.tree.root.findByType('TextInput').props.value,'');
 }finally{await s.close();}
});
test('landing starts locally; Garage picker excludes foreign and archived vehicles',async()=>{
 const s=await setup({});try{
  assert.match(text(s.tree),/Built around your vision/);assert.equal(s.state.calls.length,0);
  await s.press('Start New Concept');
  assert.match(text(s.tree),/2022 Toyota Corolla/);assert.doesNotMatch(text(s.tree),/Foreign|Archived/);
  await s.press('Use 2022 Toyota Corolla');await s.type('Subtle styling');await s.press('Prepare plan');
  assert.equal(s.state.calls[0][0].vehicleId,'car');
 }finally{await s.close();}
});

test('unavailable keeps local ideas and photo, retries explicitly, and never transfers or fabricates results',async()=>{
 const s=await setup();try{
  s.state.reply=async()=>{throw Object.assign(Error('HTTP 503'),{code:'api/unavailable',status:503});};
  await s.press('Add vehicle photo (optional)');await s.type('Keep this idea');await s.press('Prepare plan');
  assert.match(text(s.tree),/Analysis is unavailable|analysis is unavailable/);
  assert.equal(s.tree.root.findByType('TextInput').props.value,'Keep this idea');assert.equal(s.tree.root.findAllByType('Image').length,1);
  assert.equal(s.state.calls.length,1);assert.equal(s.state.pushed.length,0);assert.equal(s.tree.root.findAllByType('Confirmation').length,0);
  s.state.reply=async()=>({vehicleId:'car',plan});await s.press('Retry Studio analysis');
  assert.equal(s.state.calls.length,2);assert.match(text(s.tree),/Daily driver/);
 }finally{await s.close();}
});

test('empty input does not call AI; interest chips use the message contract and total length is validated',async()=>{
 const s=await setup();try{
  await s.press('Prepare plan');assert.equal(s.state.calls.length,0);
  const chip=s.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Visual styling');
  await act(async()=>chip.props.onPress());await s.type('x'.repeat(1500));await s.press('Prepare plan');
  assert.equal(s.state.calls.length,0);assert.match(text(s.tree),/Shorten your instructions/);
  await s.type('Daily use');await s.press('Prepare plan');
  assert.equal(s.state.calls[0][0].message,'Interests: Visual styling.\nDaily use');
  assert.equal(Object.hasOwn(s.state.calls[0][0],'category'),false);
 }finally{await s.close();}
});

test('loading excludes duplicate calls; conversation retains the last six turns',async()=>{
 const s=await setup();let resolve;try{
  s.state.reply=()=>new Promise(done=>resolve=done);await s.type('Wrap');await s.press('Prepare plan');
  assert.equal(s.tree.root.findAllByType('Button').find(node=>node.props.title==='Preparing your concept...').props.disabled,true);
  await s.press('Preparing your concept...');assert.equal(s.state.calls.length,1);
  await act(async()=>resolve({vehicleId:'car',plan}));s.state.reply=async()=>({vehicleId:'car',plan});
  for(let i=0;i<8;i++){await s.type(`Refinement ${i}`);await s.press('Refine plan');}
  assert.equal(s.state.calls.at(-1)[0].history.length,6);assert.equal(s.state.calls.at(-1)[0].history[0].message,'Refinement 1');
 }finally{await s.close();}
});

test('camera denial, canceled picker and oversized image do not send an AI request',async()=>{
 const s=await setup();try{
  s.state.cameraAllowed=false;await s.press('Take vehicle photo');assert.match(text(s.tree),/Camera permission/);
  s.state.pickerCanceled=true;await s.press('Add vehicle photo (optional)');assert.equal(s.tree.root.findAllByType('Image').length,0);
  s.state.pickerCanceled=false;s.state.photo='x'.repeat(1398101);await s.press('Add vehicle photo (optional)');assert.match(text(s.tree),/too large/);
  assert.equal(s.state.calls.length,0);
 }finally{await s.close();}
});

test('malformed or wrong-vehicle replies fail safely; API permission messages are respected',async()=>{
 const s=await setup();try{
  for(const reply of [{vehicleId:'other',plan},{vehicleId:'car',plan:{modifications:[]}}]){
   s.state.reply=async()=>reply;await s.type('Wrap');await s.press('Prepare plan');
   assert.match(text(s.tree),/could not prepare/);assert.equal(s.tree.root.findAllByType('Confirmation').length,0);
  }
  s.state.reply=async()=>{throw Object.assign(Error('Active vehicle not found.'),{code:'api/not-found'});};
  await s.press('Prepare plan');assert.match(text(s.tree),/Active vehicle not found/);
 }finally{await s.close();}
});

test('empty plans offer refinement and offline ideas never trigger AI calls',async()=>{
 const s=await setup();try{
  s.state.reply=async()=>({vehicleId:'car',plan:{...plan,modifications:[]}});
  await s.type('Wrap');await s.press('Prepare plan');assert.match(text(s.tree),/No modifications were proposed/);
  s.state.auth.offline=true;await s.update();await s.type('Offline idea');await s.press('Refine plan');
  assert.equal(s.state.calls.length,1);assert.equal(s.tree.root.findByType('TextInput').props.value,'Offline idea');
 }finally{await s.close();}
});

test('departure confirmation stays in the session or explicitly clears and dispatches back',async()=>{
 const s=await setup();try{
  await s.type('Keep this concept');assert.equal(s.state.preventRemove,true);
  await act(async()=>s.state.onRemove({data:{action:{type:'GO_BACK'}}}));assert.match(text(s.tree),/Keep working on your vision/);
  await s.press('Stay in Studio');assert.equal(s.tree.root.findByType('TextInput').props.value,'Keep this concept');assert.equal(s.state.dispatched,undefined);
  await act(async()=>s.state.onRemove({data:{action:{type:'GO_BACK'}}}));await s.press('Leave and clear session');
  assert.deepEqual(s.state.dispatched,{type:'GO_BACK'});assert.equal(s.tree.root.findByType('TextInput').props.value,'');
 }finally{await s.close();}
});

test('switching vehicle can be canceled; confirming a new canvas clears prior photo, plan and conversation',async()=>{
 const s=await setup();try{
  await s.press('Add vehicle photo (optional)');await s.type('Wrap');await s.press('Prepare plan');
  await s.press('Choose another vehicle');await s.press('Keep current vehicle');assert.match(text(s.tree),/Daily driver/);
  await s.press('Choose another vehicle');await s.press('Use 2022 Toyota Corolla');
  assert.equal(s.tree.root.findAllByType('Confirmation').length,0);assert.equal(s.tree.root.findAllByType('Image').length,0);assert.doesNotMatch(text(s.tree),/Your direction so far/);
 }finally{await s.close();}
});

test('normal request form accepts only the current account Studio draft and preserves existing request edits',async()=>{
 const auth={user:{uid:'owner'},profile:{role:'owner'},offline:false},writes=[];
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const {RequestFormScreen}=loadUI('src/features/marketplace/screens/OwnerMarketplaceScreens.js',{
  '../../../shared/components/landing/LandingUI':{LandingText:props=>React.createElement('Text',props),LandingShell:({children,...props})=>React.createElement('View',props,children),LandingButton:Primary,ui:{},ownerTabs:[],shopTabs:[],useLandingFeedback:()=>({})},
  '../../auth/context/AuthContext':{useAuth:()=>auth},
  '../components/PhotoGallery':props=>React.createElement('PhotoGallery',props),
  '../components/PrivatePhoto':props=>React.createElement('PrivatePhoto',props),
  '../services/marketApi':{marketApi:async(...args)=>writes.push(args)},
  '../hooks/useMarketData':{useMarketData:()=>({data:{items:[]},busy:false,error:'',refresh:async()=>{}})},
 });
 const draft={uid:'owner',title:'Customisation plan',description:'Proposed work: Wrap doors.'};
 for(const [params,title,description] of [
  [{vehicleId:'car',studioDraft:draft},draft.title,draft.description],
  [{vehicleId:'car',studioDraft:{...draft,uid:'other'}},'',''],
  [{vehicleId:'car',studioDraft:draft,request:{id:'request',status:'open',title:'Existing title',description:'Existing description'}},'Existing title','Existing description'],
 ]){
  let tree;await act(async()=>{tree=create(React.createElement(RequestFormScreen,{route:{params},navigation:{canGoBack:()=>true}}));});
  const input=label=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel===label);
  assert.equal(input('Request title').props.value,title);assert.equal(input('Description').props.value,description);assert.equal(writes.length,0);
  await act(async()=>tree.unmount());
 }
});
