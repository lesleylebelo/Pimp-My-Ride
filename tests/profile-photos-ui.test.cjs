const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{create,act}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join(' ');
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const press=async(tree,label)=>{
 if(['Upload Photo','Change Photo'].includes(label)&&!button(tree,label).props.disabled){
  await act(async()=>{void button(tree,label).props.onPress();});
  await act(async()=>button(tree,'Choose from gallery').props.onPress());
 }else await act(async()=>button(tree,label).props.onPress());
};
async function setup(role='owner',platform='ios'){
 const {palettes}=loadUI('src/shared/theme/colors.js'),state={auth:{user:{uid:role},profile:{role},offline:false,refresh:async()=>{}},saved:{photoId:null,version:0},calls:[],focused:true,asset:{uri:platform==='web'?'blob:photo':'file:///photo.jpg',mimeType:'image/jpeg',fileName:'photo.jpg',width:1200,height:900,fileSize:10000}},busy=[];
 const api={profilePhotoStatus:async()=>({...state.saved}),viewProfilePhoto:async()=>({url:state.saved.photoId?'https://private.example.invalid/photo':null,expiresAt:Date.now()+60000}),onProfilePhotoChange:()=>()=>{},uploadProfilePhoto:async(file,version,uid,progress)=>{state.calls.push({op:'upload',file,version,uid});progress(75);if(state.fail)throw Error('Synthetic network failure');state.saved={photoId:'saved-photo',version:version+1};return state.saved;},removeProfilePhoto:async(version,uid)=>{state.calls.push({op:'remove',version,uid});state.saved={photoId:null,version:version+1};return state.saved;}};
 const mocks={'../context/AuthContext':{useAuth:()=>state.auth},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.dark})},'../services/profilePhotos':api,'@react-navigation/native':{useIsFocused:()=>state.focused},'react-native':{Platform:{OS:platform}},'expo-image-picker':{getCameraPermissionsAsync:async()=>({granted:true}),launchCameraAsync:async options=>{state.cameraOptions=options;return state.canceled?{canceled:true}:{assets:[{uri:'file:///capture',width:1200,height:900}]};},launchImageLibraryAsync:async options=>{state.pickerOptions=options;return state.canceled?{canceled:true}:{assets:[state.asset]};}},'expo-image-manipulator':{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(uri,operations)=>{state.operations=operations;return {uri,width:900,height:900,base64:'AAAA'};}}};
 const Screen=loadUI('src/features/auth/components/ProfilePhotoSettings.js',mocks).default;let tree;const onBusyChange=v=>busy.push(v);
 await act(async()=>{tree=create(React.createElement(Screen,{onBusyChange}));});
 return {state,tree,busy,update:async props=>act(async()=>tree.update(React.createElement(Screen,{onBusyChange,...props}))),close:async()=>act(async()=>tree.unmount())};
}
for(const role of ['owner','shop'])for(const platform of ['ios','android','web'])test(`${role} profile picker previews, saves, replaces and confirms removal on ${platform}`,async()=>{
 const s=await setup(role,platform);try{
  assert.ok(button(s.tree,'Upload Photo'));assert.equal(s.tree.root.findAllByType('Image').length,0);
  await press(s.tree,'Upload Photo');assert.equal(s.state.calls.length,0);assert.equal(s.state.pickerOptions.allowsEditing,true);assert.deepEqual(s.state.pickerOptions.aspect,[1,1]);
  assert.ok(s.tree.root.findByProps({accessibilityLabel:'Selected profile photo preview'}));
  await press(s.tree,'Save Photo');assert.equal(s.state.calls[0].uid,role);assert.equal(s.state.calls[0].version,0);assert.ok(text(s.tree).includes('Profile photo saved.'));assert.ok(button(s.tree,'Change Photo'));
  await press(s.tree,'Change Photo');await press(s.tree,'Save Photo');assert.equal(s.state.calls[1].version,1);
  await press(s.tree,'Remove Photo');assert.equal(s.state.calls.length,2);await press(s.tree,'Cancel');assert.equal(s.state.calls.length,2);
  await press(s.tree,'Remove Photo');await press(s.tree,'Confirm');assert.equal(s.state.calls[2].op,'remove');assert.ok(button(s.tree,'Upload Photo'));assert.ok(text(s.tree).includes('Profile photo removed.'));assert.ok(s.busy.includes(true));
 }finally{await s.close();}
});
test('failed upload preserves preview and can retry without losing other profile data',async()=>{
 const s=await setup();try{await press(s.tree,'Upload Photo');s.state.fail=true;await press(s.tree,'Save Photo');assert.ok(text(s.tree).includes('Synthetic network failure'));assert.ok(button(s.tree,'Save Photo'));s.state.fail=false;await press(s.tree,'Save Photo');assert.equal(s.state.calls.length,2);assert.ok(button(s.tree,'Change Photo'));}finally{await s.close();}
});
test('unsupported/oversized selections fail before saving, cancellation and offline actions do not write',async()=>{
 const s=await setup();try{
  for(const bad of [{mimeType:'image/gif'},{fileSize:6*1024*1024}]){s.state.asset={...s.state.asset,...bad};await press(s.tree,'Upload Photo');assert.ok(!button(s.tree,'Save Photo'));}
  s.state.canceled=true;await press(s.tree,'Upload Photo');assert.equal(s.state.calls.length,0);
  s.state.auth.offline=true;await s.update();assert.equal(button(s.tree,'Upload Photo').props.disabled,true);await press(s.tree,'Upload Photo');assert.equal(s.state.calls.length,0);
 }finally{await s.close();}
});
test('account switch discards a selected private preview and re-reads the new account',async()=>{
 const s=await setup();try{await press(s.tree,'Upload Photo');assert.ok(button(s.tree,'Save Photo'));s.state.auth={...s.state.auth,user:{uid:'new-owner'}};await s.update();assert.ok(!button(s.tree,'Save Photo'));assert.equal(s.state.calls.length,0);}finally{await s.close();}
});
test('profile avatars use authorised context and discard images on errors, offline, blur and account changes',async()=>{
 const {palettes}=loadUI('src/shared/theme/colors.js'),state={user:{uid:'viewer'},offline:false,focused:true},calls=[];
 const Avatar=loadUI('src/shared/components/ProfileAvatar.js',{'../../features/auth/context/AuthContext':{useAuth:()=>state},'../theme/ThemeContext':{useTheme:()=>({theme:palettes.light})},'../../features/auth/services/profilePhotos':{onProfilePhotoChange:()=>()=>{},viewProfilePhoto:async(...args)=>{calls.push(args);return {url:'https://private.example.invalid/avatar',expiresAt:Date.now()+60000};}},'@react-navigation/native':{useIsFocused:()=>state.focused}}).default;
 let tree;const props={context:'conversation',id:'thread',shop:true};await act(async()=>{tree=create(React.createElement(Avatar,props));});
 try{
  assert.deepEqual(calls[0],['conversation','thread','viewer',0,false]);assert.equal(tree.root.findByType('Image').props.resizeMode,'cover');
  await act(async()=>tree.root.findByType('Image').props.onError());assert.equal(tree.root.findAllByType('Image').length,0);assert.equal(calls.length,1);
  state.offline=true;await act(async()=>tree.update(React.createElement(Avatar,props)));assert.equal(tree.root.findAllByType('Image').length,0);
  state.offline=false;state.focused=false;await act(async()=>tree.update(React.createElement(Avatar,props)));assert.equal(calls.length,1);
  state.focused=true;state.user={uid:'second'};await act(async()=>tree.update(React.createElement(Avatar,props)));assert.deepEqual(calls.at(-1),['conversation','thread','second',0,true]);
 }finally{await act(async()=>tree.unmount());}
});

test('signed URL renewal keeps the current image until its real expiry and removal clears it immediately',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const {palettes}=loadUI('src/shared/theme/colors.js'),state={user:{uid:'viewer'},offline:false},calls=[];let resolveRenewal;
 const Avatar=loadUI('src/shared/components/ProfileAvatar.js',{'../../features/auth/context/AuthContext':{useAuth:()=>state},'../theme/ThemeContext':{useTheme:()=>({theme:palettes.light})},'../../features/auth/services/profilePhotos':{onProfilePhotoChange:()=>()=>{},viewProfilePhoto:async(...args)=>{calls.push(args);if(calls.length===2)return new Promise(resolve=>{resolveRenewal=resolve;});return {url:'https://private.example.invalid/old',expiresAt:Date.now()+60000};}}}).default;
 let tree;const props={context:'request',id:'job',revision:1};await act(async()=>{tree=create(React.createElement(Avatar,props));});
 try{
  const original=tree.root.findByType('Image');await act(async()=>t.mock.timers.tick(55000));assert.equal(calls.length,2);assert.equal(tree.root.findByType('Image'),original);
  await act(async()=>t.mock.timers.tick(5000));assert.equal(tree.root.findAllByType('Image').length,0);
  await act(async()=>resolveRenewal({url:'https://private.example.invalid/new',expiresAt:Date.now()+60000}));assert.match(tree.root.findByType('Image').props.source.uri,/new/);
  await act(async()=>tree.update(React.createElement(Avatar,{...props,revision:2,enabled:false})));assert.equal(tree.root.findAllByType('Image').length,0);
  await act(async()=>t.mock.timers.tick(120000));assert.equal(calls.length,2);
 }finally{await act(async()=>tree.unmount());}
});

for(const authorRole of ['shop','customer'])test(authorRole+' Discover author uses the existing private avatar and current photo revision',async()=>{
 const {palettes}=loadUI('src/shared/theme/colors.js'),calls=[];
 const Card=loadUI('src/features/marketplace/components/PostCard.js',{'../../../shared/components/landing/LandingUI':{LandingText:'Text'},'../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'viewer'},profile:{role:'owner'},offline:false})},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.dark})},'../../auth/services/profilePhotos':{onProfilePhotoChange:()=>()=>{},viewProfilePhoto:async(...args)=>{calls.push(args);return {url:'https://private.example.invalid/author',expiresAt:Date.now()+60000};}}}).PostCard;
 const post={id:'build',authorRole,authorName:'Visible Author',authorPhotoRevision:4,images:[],...(authorRole==='shop'?{shop:{id:'workshop',name:'Visible Workshop'}}:{})};let tree;
 await act(async()=>{tree=create(React.createElement(Card,{post}));});try{assert.equal(tree.root.findAllByType('Image').length,1);assert.deepEqual(calls[0].slice(0,4),[authorRole==='shop'?'shop':'post',authorRole==='shop'?'workshop':'build','viewer',4]);}finally{await act(async()=>tree.unmount());}
});

for(const role of ['owner','shop'])test(role+' camera preview keeps the saved profile image until explicit successful replacement',async()=>{
 const s=await setup(role);try{
  s.state.saved={photoId:'existing-private-photo',version:3};await s.update();
  await act(async()=>{void button(s.tree,'Upload Photo').props.onPress();});await act(async()=>button(s.tree,'Take photo').props.onPress());
  assert.equal(s.state.cameraOptions.allowsEditing,true);assert.ok(s.tree.root.findByProps({accessibilityLabel:'Selected profile photo preview'}));assert.equal(s.state.calls.length,0);assert.equal(s.state.saved.photoId,'existing-private-photo');
  s.state.fail=true;await press(s.tree,'Save Photo');assert.equal(s.state.saved.photoId,'existing-private-photo');assert.ok(button(s.tree,'Save Photo'));
  s.state.fail=false;await press(s.tree,'Save Photo');assert.equal(s.state.calls.at(-1).uid,role);assert.equal(s.state.calls.at(-1).file.mimeType,'image/jpeg');
 }finally{await s.close();}
});
