const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label),field=(tree,label)=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(node=>[node.props.children].flat().filter(value=>typeof value==='string'||typeof value==='number').join('')).join('\n');
const press=(tree,label)=>act(async()=>{const node=button(tree,label);assert.ok(node,label);await node.props.onPress();});
function setup(role='owner',platform='web',width=320,mode='dark'){
 const {palettes}=loadUI('src/shared/theme/colors.js'),profile={role,fullName:'Synthetic Person',phone:'0821234567',...(role==='shop'?{shop:{shopName:'Synthetic Workshop',regNumber:'SYNTHETIC',address:'Synthetic address',city:'Pretoria',province:'Gauteng',services:'Paint'}}:{})};
 const state={auth:{user:{uid:role,email:'synthetic@fixture.invalid'},profile,offline:false},calls:[],passwords:[],refreshes:0,signouts:0,api:null};
 const service={accountRequestId:(()=>{let n=0;return()=>`stable-${++n}`;})(),accountApi:async(op,data)=>{state.calls.push([op,data]);return state.api?state.api(op,data):op==='profile'?{profile:{...state.auth.profile,version:0},email:state.auth.user.email}:op==='save'?{version:1}:{accepted:true,status:'pending'};},confirmPassword:async value=>{state.passwords.push(value);},closeLocalSession:async()=>{state.signouts++;},changeEmail:async()=> 'Verification sent.',changePassword:async()=>{},resetOwnPassword:async()=>{},recoverAccount:async()=>({accountStatus:'deactivated',job:{state:'completed'}})};
 const mocks={'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:900,fontScale:1,scale:1})},'../context/AuthContext':{useAuth:()=>({...state.auth,refresh:async()=>{state.refreshes++;},run:fn=>fn()})},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],mode,isDark:mode==='dark',toggleTheme(){}})},'../../../shared/components/landing/LandingUI':{LandingText:'Text',LandingButton:({title,...props})=>React.createElement('Pressable',{...props,accessibilityLabel:title},React.createElement('Text',null,title))},'../services/accountManagement':service,'./ProfilePhotoSettings':props=>React.createElement('PhotoSettings',props),'./BusinessLocation':props=>React.createElement('BusinessLocation',props)};
 return {state,service,mocks,Screen:loadUI('src/features/auth/components/ManageProfile.js',mocks).default};
}
async function mount(Component,props,fn){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await fn(tree,()=>act(async()=>tree.update(React.createElement(Component,props))));}finally{await act(async()=>tree.unmount());}}
test('customer and workshop Manage Profile expose four sections and whitelisted updates across Android/web widths and themes',async()=>{
 for(const [role,platform,width,mode] of [['owner','web',320,'dark'],['shop','web',1440,'light'],['shop','android',390,'dark']]){
  const s=setup(role,platform,width,mode);await mount(s.Screen,{},async tree=>{
   for(const label of ['Personal Information','Security & Sign-In','Account Preferences','Account Management'])assert.ok(text(tree).includes(label));
   assert.equal(field(tree,'Display name').props.value,'Synthetic Person');assert.equal(button(tree,'Save profile').props.disabled,true);assert.equal(button(tree,'Delete Account').props.disabled,true);
   await act(async()=>field(tree,'Display name').props.onChangeText('Updated Person'));await press(tree,'Save profile');const call=s.state.calls.find(([op])=>op==='save');assert.equal(call[1].fullName,'Updated Person');assert.ok(!Object.hasOwn(call[1],'role'));assert.ok(!Object.hasOwn(call[1],'email'));assert.ok(!Object.hasOwn(call[1],'uid'));assert.equal(!!call[1].shop,role==='shop');assert.match(text(tree),/Profile saved/);
   assert.equal(tree.root.findAllByType('PhotoSettings').length,1);assert.equal(tree.root.findAllByType('BusinessLocation').length,role==='shop'?1:0);
  });
 }
});
test('failed profile save preserves the draft and retry identity; repeated taps send only one request',async()=>{
 const s=setup();let release;s.state.api=async(op)=>op==='profile'?{profile:{...s.state.auth.profile,version:0}}:new Promise(resolve=>{release=resolve;});
 await mount(s.Screen,{},async tree=>{await act(async()=>field(tree,'Display name').props.onChangeText('Updated Person'));await act(async()=>{const action=button(tree,'Save profile').props.onPress;action();action();});assert.equal(s.state.calls.filter(([op])=>op==='save').length,1);assert.equal(button(tree,'Save profile').props.disabled,true);await act(async()=>release({version:1}));assert.match(text(tree),/Profile saved/);});
 const f=setup();await mount(f.Screen,{},async tree=>{await act(async()=>field(tree,'Display name').props.onChangeText('Retained Draft'));f.state.api=async()=>{throw Error('Synthetic network failure');};await press(tree,'Save profile');assert.equal(field(tree,'Display name').props.value,'Retained Draft');const first=f.state.calls.at(-1)[1].requestId;f.state.api=async()=>({version:1});await press(tree,'Save profile');assert.equal(f.state.calls.at(-1)[1].requestId,first);});
});
test('closure requires password, typed confirmation and the final dialog, reports pending deletion and preserves failure feedback',async()=>{
 const s=setup();await mount(s.Screen,{},async tree=>{
  await act(async()=>field(tree,'Account confirmation').props.onChangeText('DELETE'));assert.equal(button(tree,'Delete Account').props.disabled,true);
  await act(async()=>field(tree,'Current password').props.onChangeText('synthetic-current-password'));await press(tree,'Delete Account');assert.equal(s.state.calls.filter(([op])=>op==='delete').length,0);await press(tree,'Cancel');assert.equal(s.state.calls.filter(([op])=>op==='delete').length,0);
  await press(tree,'Delete Account');await press(tree,'Confirm');assert.equal(s.state.signouts,1);const payload=s.state.calls.find(([op])=>op==='delete')[1];assert.equal(payload.confirmation,'DELETE');assert.ok(!Object.hasOwn(payload,'password'));assert.ok(!Object.hasOwn(payload,'uid'));assert.match(text(tree),/pending/);assert.doesNotMatch(text(tree),/Deletion completed successfully/);
 });
 const f=setup();await mount(f.Screen,{},async tree=>{await act(async()=>{field(tree,'Account confirmation').props.onChangeText('DEACTIVATE');field(tree,'Current password').props.onChangeText('synthetic-current-password');});f.state.api=async()=>{throw Error('Resolve active bookings first');};await press(tree,'Deactivate Account');await press(tree,'Confirm');assert.match(text(tree),/Resolve active bookings first/);assert.equal(f.state.signouts,0);});
});
test('offline and busy child controls disable account mutations and account replacement clears drafts',async()=>{
 const s=setup();await mount(s.Screen,{},async(tree,update)=>{await act(async()=>field(tree,'Display name').props.onChangeText('Private old draft'));await act(async()=>tree.root.findByType('PhotoSettings').props.onBusyChange(true));assert.equal(button(tree,'Save profile').props.disabled,true);await act(async()=>tree.root.findByType('PhotoSettings').props.onBusyChange(false));s.state.auth={user:{uid:'replacement',email:'other@synthetic.invalid'},profile:{role:'owner',fullName:'Replacement Person',phone:'0831234567'},offline:false};await update();assert.equal(field(tree,'Display name').props.value,'Replacement Person');assert.doesNotMatch(text(tree),/Private old draft/);s.state.auth.offline=true;await update();assert.equal(button(tree,'Save profile').props.disabled,true);});
});
test('contextual recovery requires eligibility and no authenticated app identity, then rechecks credentials only on explicit selection',async()=>{
 const s=setup(),calls=[];let completed=0;s.state.auth.user=null;s.service.recoverAccount=async(...args)=>{calls.push(args);return {reactivated:true};};
 const Screen=loadUI('src/features/auth/components/AccountRecovery.js',s.mocks).default,props={eligible:true,email:'synthetic@fixture.invalid',password:'synthetic-current-password',disabled:false,onRecovered:()=>{completed++;}};
 await mount(Screen,{...props,eligible:false},async tree=>assert.ok(!button(tree,'Reactivate my account')));
 await mount(Screen,props,async tree=>{assert.equal(calls.length,0);await press(tree,'Reactivate my account');assert.equal(completed,1);assert.deepEqual(calls,[['synthetic@fixture.invalid','synthetic-current-password',true]]);assert.ok(!button(tree,'Check account status / recovery'));});
 s.state.auth.user={uid:'unrelated'};await mount(Screen,props,async tree=>assert.ok(!button(tree,'Reactivate my account')));
});
