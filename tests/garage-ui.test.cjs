const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const car={id:'car-1',version:7,make:'Toyota',model:'Corolla',year:2024,colour:'White',registration:'TEST001GP',photoIds:['photo-1'],archived:false};
const other={...car,id:'car-2',make:'Ford',model:'Fiesta',photoIds:[]};
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join('\n');
const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
function setup({mode='dark',width=390,platform='ios'}={}){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={auth:{user:{uid:'owner'},profile:{role:'owner'},offline:false},data:{items:[car,other],cursor:null},busy:false,error:'',calls:[],moves:[],refreshes:0};
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const mocks={
  'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:844,fontScale:1,scale:1})},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text',LandingButton:Primary,LandingShell:({children})=>React.createElement('View',null,children),ownerTabs:['Discover','Garage','My Requests','Bookings','Profile'].map(label=>({label})),shopTabs:[],useLandingFeedback:()=>({})},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../hooks/useMarketData':{useMarketData:()=>({data:state.data,busy:state.busy,error:state.error,refresh:async()=>{state.refreshes++;}})},
  '../services/marketApi':{marketApi:async(op,input)=>{state.calls.push({op,input});return state.reply?state.reply(op,input):{id:'saved'};}},
  '../components/PhotoGallery':props=>React.createElement('PhotoGallery',props),
  '../components/PrivatePhoto':props=>React.createElement('PrivatePhoto',props),
 };
 const screens=loadUI('src/features/marketplace/screens/OwnerMarketplaceScreens.js',mocks);
 const Photos=loadUI('src/features/marketplace/screens/VehiclePhotosScreen.js',mocks).default;
 const navigation={navigate:(...args)=>state.moves.push(args),goBack:()=>state.moves.push(['back']),canGoBack:()=>true};
 return {state,screens,Photos,navigation,palettes};
}
async function mounted(s,name,params,run){
 const Screen=name==='Photos'?s.Photos:s.screens[name];let tree;
 const props={navigation:s.navigation,route:{params:params||{}}};
 await act(async()=>{tree=create(React.createElement(Screen,props));});
 const update=()=>act(async()=>tree.update(React.createElement(Screen,props)));
 try{await run(tree,update);}finally{await act(async()=>tree.unmount());}
}

test('garage renders multiple vehicles, private covers, honest placeholders and responsive cards',async()=>{
 for(const width of [390,1200]){
  const s=setup({width});await mounted(s,'GarageScreen',{},async tree=>{
   assert.match(text(tree),/Toyota Corolla/);assert.match(text(tree),/Ford Fiesta/);
   const cards=tree.root.findAllByType('View').filter(n=>n.props.testID?.startsWith('garage-vehicle-'));assert.equal(cards.length,2);
   assert.equal(flat(cards[0].props.style).width,'100%');assert.equal(flat(cards[0].parent.props.style).width==='100%',width<768);
   const cover=tree.root.findByType('PrivatePhoto');assert.equal(cover.props.target,'vehicle');assert.equal(cover.props.id,'car-1');assert.equal(cover.props.imageStyle.height,250);
   assert.match(text(tree),/Add photos to make it yours/);assert.equal(tree.root.findAllByType('Image').length,1,'Only the existing brand logo is rendered; vehicle imagery stays private.');
   assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,['top','bottom','left','right']);
   await press(tree,'Add vehicle');assert.deepEqual(s.state.moves,[['VehicleForm']]);
   await press(tree,'Photos for Toyota Corolla');assert.deepEqual(s.state.moves.at(-1),['VehiclePhotos',{id:'car-1'}]);
   await press(tree,'Edit Ford Fiesta');assert.deepEqual(s.state.moves.at(-1),['VehicleForm',{vehicle:other}]);
   await press(tree,'Request service for Ford Fiesta');assert.deepEqual(s.state.moves.at(-1),['RequestForm',{vehicleId:other.id,vehicle:other}]);
  });
 }
});
test('details group supplied specifications and preserve edit, photos, request and back navigation',async()=>{
 const s=setup();await mounted(s,'GarageScreen',{},async tree=>{
  await press(tree,'View Toyota Corolla');assert.match(text(tree),/Vehicle specifications/);assert.match(text(tree),/TEST001GP/);
  const modal=tree.root.findByType('Modal');assert.equal(modal.findAllByType('PrivatePhoto')[0].props.id,'car-1');
  await press(tree,'Back to Garage');assert.equal(tree.root.findAllByType('Modal').length,0);
  for(const [action,destination,params] of [['Manage photos','VehiclePhotos',{id:car.id}],['Edit vehicle','VehicleForm',{vehicle:car}],['Create service request','RequestForm',{vehicleId:car.id,vehicle:car}]]){
   await press(tree,'View Toyota Corolla');await press(tree,action);assert.equal(tree.root.findAllByType('Modal').length,0);assert.deepEqual(s.state.moves.at(-1),[destination,params]);
  }
 });
});
test('loading, empty, error, offline and archived states use truthful actions and preserve archive confirmation',async()=>{
 const s=setup();s.state.data=null;s.state.busy=true;
 await mounted(s,'GarageScreen',{},async(tree,update)=>{
  assert.match(text(tree),/Loading/);assert.equal(button(tree,'Add vehicle').props.disabled,true);
  s.state.busy=false;s.state.data={items:[],cursor:null};await update();assert.match(text(tree),/Your garage is empty/);
  s.state.error='Garage unavailable';await update();assert.match(text(tree),/Garage unavailable/);assert.doesNotMatch(text(tree),/Your garage is empty/);
  s.state.error='';s.state.data={items:[car],cursor:null};await update();s.state.auth.offline=true;await update();
  await press(tree,'Edit Toyota Corolla');assert.equal(s.state.moves.length,0);
  s.state.auth.offline=false;await update();await press(tree,'Remove Toyota Corolla');await press(tree,'Cancel');assert.equal(s.state.calls.length,0);
  await press(tree,'Remove Toyota Corolla');await press(tree,'Confirm');assert.deepEqual(s.state.calls,[{op:'vehicleArchive',input:{id:car.id,version:7,archived:true}}]);
  await press(tree,'Archived vehicles');s.state.data={items:[{...car,archived:true}],cursor:null};await update();
  assert.equal(button(tree,'Edit Toyota Corolla'),undefined);assert.equal(button(tree,'Request service for Toyota Corolla'),undefined);assert.ok(button(tree,'Restore Toyota Corolla'));
  await press(tree,'View Toyota Corolla');assert.equal(button(tree,'Create service request'),undefined);
 });
});
test('garage keeps bottom destinations and exposes Customer utility links',async()=>{
 const s=setup();await mounted(s,'GarageScreen',{},async tree=>{
  const tabs=tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab');
  assert.deepEqual(tabs.map(n=>n.props.accessibilityLabel),['Discover','Garage','My Requests','Bookings','Profile']);
  assert.ok(button(tree,'Messages'));assert.ok(button(tree,'Notifications'));
  assert.equal(button(tree,'Garage').props.accessibilityState.selected,true);await press(tree,'My Requests');assert.deepEqual(s.state.moves,[['OwnerRequests']]);
  const refresh=tree.root.findByType('ScrollView').props.refreshControl;await act(async()=>refresh.props.onRefresh());assert.equal(s.state.refreshes,1);
 });
});
test('account changes discard another account vehicle details',async()=>{
 const s=setup();await mounted(s,'GarageScreen',{},async(tree,update)=>{
  await press(tree,'View Toyota Corolla');s.state.auth.user={uid:'different-owner'};s.state.data={items:[],cursor:null};await update();
  assert.equal(tree.root.findAllByType('Modal').length,0);assert.doesNotMatch(text(tree),/TEST001GP/);
 });
});
test('add form shows grouped required fields, live validation, keyboard layout and safe cancel',async()=>{
 for(const platform of ['ios','android','web']){
  const s=setup({platform,width:1200});await mounted(s,'VehicleFormScreen',{},async tree=>{
   assert.match(text(tree),/Vehicle identity/);assert.match(text(tree),/Appearance & registration/);assert.match(text(tree),/All fields marked/);
   assert.equal(tree.root.findAllByType('TextInput').length,5);assert.equal(button(tree,'Save vehicle').props.disabled,true);assert.match(text(tree),/Make is required/);
   assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,platform==='ios'?'padding':platform==='android'?'height':undefined);
   assert.equal(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');
   for(const [label,value] of [['Make','Toyota'],['Model','Corolla'],['Year','2024'],['Colour','White'],['Registration number','TEST001GP']])await act(async()=>field(tree,label).props.onChangeText(value));
   assert.equal(button(tree,'Save vehicle').props.disabled,false);assert.equal(field(tree,'Registration number').props.autoCapitalize,'characters');
   await press(tree,'Cancel');assert.deepEqual(s.state.moves,[['back']]);assert.equal(s.state.calls.length,0);
  });
 }
});
test('edit saves the original revision once, retains failed fields and disables offline saves',async()=>{
 const s=setup();s.state.reply=async()=>{throw Error('Revision changed. Refresh your garage.');};
 await mounted(s,'VehicleFormScreen',{vehicle:car},async(tree,update)=>{
  assert.equal(field(tree,'Make').props.value,'Toyota');await act(async()=>field(tree,'Colour').props.onChangeText('Blue'));
  await press(tree,'Save vehicle');assert.equal(s.state.calls[0].input.version,7);assert.equal(s.state.calls[0].input.id,'car-1');assert.equal(s.state.calls[0].input.year,2024);
  assert.equal(field(tree,'Colour').props.value,'Blue');assert.match(text(tree),/Revision changed/);assert.equal(s.state.moves.length,0);
  s.state.auth.offline=true;await update();assert.equal(field(tree,'Make').props.editable,false);assert.equal(button(tree,'Save vehicle').props.disabled,true);
 });
});
test('photos route opts into the garage gallery without adding transport or changing target IDs',async()=>{
 const s=setup();await mounted(s,'Photos',{id:'car-1'},async tree=>{
  const gallery=tree.root.findByType('PhotoGallery');assert.deepEqual({target:gallery.props.target,id:gallery.props.id,editable:gallery.props.editable,presentation:gallery.props.presentation},{target:'vehicle',id:'car-1',editable:true,presentation:'garage'});
  await press(tree,'Go back');assert.deepEqual(s.state.moves,[['back']]);
 });
 await mounted(s,'Photos',{},async tree=>{assert.match(text(tree),/Choose a vehicle/);assert.equal(tree.root.findAllByType('PhotoGallery').length,0);});
});
function luminance(hex){const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('both themes retain readable text and accessible action sizes',async()=>{
 for(const mode of ['light','dark']){
  const s=setup({mode});await mounted(s,'GarageScreen',{},async tree=>{
   const card=tree.root.findByProps({testID:'garage-vehicle-car-1'}),bg=flat(card.props.style).backgroundColor;
   const title=card.findAllByType('Text').find(n=>[n.props.children].flat().join('')==='Toyota Corolla');assert.ok(contrast(flat(title.props.style).color,bg)>=4.5);
   const add=button(tree,'Add vehicle'),addStyle=flat(add.props.style({pressed:false}));assert.equal(addStyle.minHeight,48);assert.ok(contrast(flat(add.findByType('Text').props.style).color,addStyle.backgroundColor)>=4.5);
   assert.ok(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').every(n=>flat(n.props.style({pressed:false})).minHeight>=44));
  });
 }
});
