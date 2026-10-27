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
async function setup(){
 const state={auth:{user:{uid:'owner'},offline:false},focused:true,calls:[],pushed:[],reply:async()=>({vehicleId:'car',plan})};
 const UI={Page:({children})=>React.createElement('View',null,children),Card:({children})=>React.createElement('View',null,children),Button:props=>React.createElement('Button',props),Field:props=>React.createElement('TextInput',props),Notice:({error})=>React.createElement('Text',null,error)};
 const Component=loadUI('src/features/marketplace/screens/PimpPilotStudioScreen.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '@react-navigation/native':{useIsFocused:()=>state.focused,usePreventRemove:()=>{}},
  '../components/MarketplaceUI':UI,
  '../../../shared/components/ConfirmationButton':props=>React.createElement('Confirmation',props),
  '../services/pimpPilotStudio':{...loadUI('src/features/marketplace/services/pimpPilotStudio.js',{'../../../shared/services/api':{}}),createStudioPlan:async(...args)=>{state.calls.push(args);return state.reply();}},
  'expo-image-picker':{launchImageLibraryAsync:async()=>({canceled:false,assets:[{uri:'file:///car.jpg'}]})},
  'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>({base64:'/9j/4AAQ/9k='})},
 }).default;
 const navigation={push:(...args)=>state.pushed.push(args)},props={route:{params:{vehicleId:'car',vehicle:{id:'car',make:'Toyota'}}},navigation};
 let tree;await act(async()=>{tree=create(React.createElement(Component,props));});
 const update=()=>act(async()=>tree.update(React.createElement(Component,props)));
 const press=title=>act(async()=>{tree.root.findAllByType('Button').find(node=>node.props.title===title).props.onPress();await new Promise(done=>setImmediate(done));});
 const type=value=>act(async()=>tree.root.findByType('TextInput').props.onChangeText(value));
 return {state,tree,update,press,type,close:()=>act(async()=>tree.unmount())};
}
test('Studio previews plans, selects nothing automatically and transfers only after the confirmation callback',async()=>{
 const s=await setup();try{
  assert.match(text(s.tree),/AI image editing is not configured/);
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
