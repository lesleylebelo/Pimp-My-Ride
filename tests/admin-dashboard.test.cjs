const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const text=(tree,value)=>tree.root.findAllByType('Text').some(n=>n.props.children===value);
async function mount(Component,props={}){let tree;await act(async()=>{tree=Renderer.create(React.createElement(Component,props));});return tree;}
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());
const mocks={
 'firebase/auth':{},'../../../shared/services/firebase':{},
 '../../auth/services/loginCooldown':{},'../../auth/hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0})},
 '../services/adminApi':{adminError:e=>e.message},
};

test('overview renders authorised metrics, real zero, loading and unavailable states without fabricated totals',async()=>{
 let result={data:{accounts:125,pending:3,suspended:0,categories:12},busy:false,error:''},refreshed=0;
 const calls=[],navigation={navigate:(...args)=>calls.push(args)};
 const Home=loadUI('src/features/admin/screens/AdminHomeScreen.js',{'../services/useAdminData':{useAdminData:op=>{assert.equal(op,'dashboard');return {...result,refresh:()=>refreshed++};}}}).default;
 const tree=await mount(Home,{navigation});
 assert.ok(text(tree,'125'));assert.ok(text(tree,'0'));assert.ok(text(tree,'3'));assert.equal(button(tree,'Sign out'),undefined);
 await press(tree,'Review applications');assert.deepEqual(calls.pop(),['AdminAccounts',{filter:'pending'}]);
 await press(tree,'Refresh');assert.equal(refreshed,1);
 result={data:null,busy:true,error:''};await act(async()=>tree.update(React.createElement(Home,{navigation})));
 assert.ok(text(tree,'…'));assert.equal(button(tree,'Refresh').props.disabled,true);
 result={data:null,busy:false,error:'Access unavailable'};await act(async()=>tree.update(React.createElement(Home,{navigation})));
 assert.ok(text(tree,'—'));assert.ok(text(tree,'Access unavailable'));assert.equal(text(tree,'0'),false);
 result={data:{accounts:1,pending:0,categories:0,suspended:0},busy:false};await act(async()=>tree.update(React.createElement(Home,{navigation})));
 assert.ok(text(tree,'No workshop applications awaiting review.'));await act(async()=>tree.unmount());
});

test('sidebar covers every section, selects applications in nested details and opens the supported routes',async()=>{
 const calls=[],navigation={navigate:(...args)=>calls.push(args),canGoBack:()=>true,goBack:()=>calls.push(['back'])};
 const Shell=loadUI('src/features/admin/components/AdminShell.js',{
  'react-native':{useWindowDimensions:()=>({width:1440,height:900})},
  '../../auth/context/AuthContext':{useAuth:()=>({profile:{fullName:'Test admin'},user:{email:'admin@example.invalid'},logout:async()=>{}})},
 }).default;
 const props={navigation,state:{index:0,routes:[{name:'AdminAccount',params:{section:'applications'}}]},children:React.createElement('Content')};
 const tree=await mount(Shell,props);
 assert.equal(button(tree,'Workshop Applications').props.accessibilityState.selected,true);
 assert.equal(button(tree,'Accounts').props.accessibilityState.selected,false);
 for(const [label,route,filter] of [['Overview','AdminDashboard'],['Accounts','AdminAccounts','all'],['Workshop Applications','AdminAccounts','pending'],['Service Categories','AdminCategories'],['Online Status','AdminPresence'],['Activity Log','AdminAudit']]){
  await press(tree,label);assert.deepEqual(calls.pop(),[route,filter?{filter}:undefined]);
 }
 await press(tree,'Go back');assert.deepEqual(calls.pop(),['back']);
 assert.equal(button(tree,'Sign out'),undefined);await press(tree,'Admin account');assert.ok(text(tree,'admin@example.invalid'));assert.ok(button(tree,'Sign out'));
 await act(async()=>tree.unmount());
});

test('narrow navigation opens and closes without replacing the mounted content; details remain selected',async()=>{
 const calls=[],Shell=loadUI('src/features/admin/components/AdminShell.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({logout:async()=>{}})},
 }).default;
 const tree=await mount(Shell,{state:{index:0,routes:[{name:'AdminAccounts',params:{filter:'pending'}}]},navigation:{navigate:(...args)=>calls.push(args)},children:React.createElement('Content')});
 assert.equal(button(tree,'Overview'),undefined);await press(tree,'Open navigation');
 assert.equal(button(tree,'Workshop Applications').props.accessibilityState.selected,true);
 await press(tree,'Accounts');assert.equal(button(tree,'Overview'),undefined);assert.equal(tree.root.findAllByType('Content').length,1);
 assert.deepEqual(calls,[['AdminAccounts',{filter:'all'}]]);await act(async()=>tree.unmount());
});

test('all seven Admin routes use the shared navigator shell with the duplicate native header disabled',async()=>{
 const stub=()=>null;
 const Navigator=loadUI('src/features/admin/AdminNavigator.js',{
  '@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'Navigator',Screen:'Screen'})},
  './screens/AdminHomeScreen':{default:stub},'./screens/AdminScreens':{AccountsScreen:stub,AccountDetailScreen:stub,CategoriesScreen:stub,AuditScreen:stub,PresenceScreen:stub,ConfirmIdentityScreen:stub},
  './components/AdminShell':'Shell',
 }).default;
 const tree=await mount(Navigator),nav=tree.root.findByType('Navigator');
 assert.equal(nav.props.screenOptions.headerShown,false);
 assert.deepEqual(tree.root.findAllByType('Screen').map(n=>n.props.name),['AdminDashboard','AdminAccounts','AdminAccount','AdminCategories','AdminAudit','AdminPresence','AdminConfirm']);
 assert.equal(nav.props.layout({children:'screen'}).type,'Shell');await act(async()=>tree.unmount());
});

test('account queue switches filters from sidebar params and searches only loaded results',async()=>{
 let args;const calls=[];
 const {AccountsScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,
  '../services/useAdminData':{useAdminData:(op,input)=>{args=input;return {data:{items:[{id:input.filter,fullName:input.filter==='pending'?'Pending Garage':'Customer One',email:'test@example.invalid',role:'shop',verificationStatus:'pending'}]}};}},
 });
 const navigation={navigate:(...a)=>calls.push(a)},tree=await mount(AccountsScreen,{navigation,route:{params:{filter:'all'}}});
 await act(async()=>tree.update(React.createElement(AccountsScreen,{navigation,route:{params:{filter:'pending'}}})));
 assert.equal(args.filter,'pending');assert.ok(text(tree,'Pending Garage'));assert.equal(text(tree,'Customer One'),false);
 await press(tree,'View details');assert.deepEqual(calls,[['AdminAccount',{uid:'pending',section:'applications'}]]);
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('no-match'));
 assert.ok(text(tree,'No matching accounts loaded yet.'));await act(async()=>tree.unmount());
});

test('data rows switch to stacked mobile layouts and omit desktop headers',async()=>{
 for(const width of [360,768,1440]){
  const {DataRow}=loadUI('src/features/admin/components/AdminUI.js',{'react-native':{useWindowDimensions:()=>({width,height:900})}});
  const tree=await mount(DataRow,{cells:['Name','Email']});
  assert.equal(tree.root.findAllByType('View')[0].props.style.flexDirection,width>=1000?'row':'column');
  await act(async()=>tree.update(React.createElement(DataRow,{header:true,cells:['Name']})));
  assert.equal(tree.toJSON()===null,width<1000);await act(async()=>tree.unmount());
 }
});

test('activity labels preserve raw events, support readable search and expose technical details on demand',async()=>{
 const {eventLabel}=loadUI('src/features/admin/utils/presentation.js');
 assert.equal(eventLabel('session.active'),'Session started');assert.equal(eventLabel('session.inactive'),'Session inactive');assert.equal(eventLabel('shop.pending'),'Workshop resubmission requested');assert.equal(eventLabel('future.unknownEvent'),'Future unknown Event');
 const data={items:[{id:'e1',action:'session.active',actor:'actor-uid',target:'target-uid',createdAt:1000,details:{source:'foreground'}}]};
 const {AuditScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,'../services/useAdminData':{useAdminData:()=>({data})}});
 const tree=await mount(AuditScreen);assert.ok(text(tree,'Session started'));assert.equal(text(tree,'session.active'),false);
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('Session started'));
 assert.ok(text(tree,'Session started'));const disclosure=tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityState?.expanded===false);
 await act(async()=>disclosure.props.onPress());assert.ok(text(tree,'session.active'));assert.ok(text(tree,'foreground'));await act(async()=>tree.unmount());
});

test('presence uses server snapshot deadlines and qualifies online activity without changing the 90-second contract',async()=>{
 const {PresenceScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,'../services/useAdminData':{useAdminData:()=>({refresh:()=>{},data:{serverNow:2000,items:[{id:'a',uid:'a',fullName:'Recent',role:'owner',sessions:{one:2001}},{id:'b',uid:'b',fullName:'Expired',role:'shop',sessions:{one:2000}}]}})}});
 const tree=await mount(PresenceScreen,{navigation:{navigate(){}}});assert.ok(text(tree,'Online recently'));assert.ok(text(tree,'Offline'));await act(async()=>tree.unmount());
});

test('identity verification refreshes the Firebase token and returns only after successful reauthentication',async()=>{
 const calls=[],user={email:'admin@example.invalid'}, {ConfirmIdentityScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,
  'firebase/auth':{EmailAuthProvider:{credential:(email,password)=>({email,password})},reauthenticateWithCredential:async(u,c)=>{assert.equal(u,user);assert.equal(c.password,'temporary');calls.push('reauthenticate');},getIdToken:async(u,force)=>{assert.equal(force,true);calls.push('token');}},
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:user}})},'../../auth/services/loginCooldown':{guardedLogin:f=>f()},
 });
 const tree=await mount(ConfirmIdentityScreen,{navigation:{goBack:()=>calls.push('back')}});
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('temporary'));await press(tree,'Confirm password');
 assert.deepEqual(calls,['reauthenticate','token','back']);assert.equal(tree.root.findByType('TextInput').props.value,'');assert.equal(tree.root.findByType('TextInput').props.secureTextEntry,true);await act(async()=>tree.unmount());
});

test('admin controls expose selected/disabled states, keyboard focus styling and theme-aware contrast',async()=>{
 const {Button}=loadUI('src/features/admin/components/AdminUI.js');const tree=await mount(Button,{title:'Action',selected:true,disabled:true});
 const control=button(tree,'Action');assert.deepEqual(control.props.accessibilityState,{disabled:true,selected:true});
 const focus=control.props.style({focused:true});assert.ok(focus.some(s=>s?.outlineWidth===2));await act(async()=>tree.unmount());
});

test('leaving identity verification clears secrets and an outstanding confirmation cannot navigate another screen',async()=>{
 let focused=true,release;const calls=[];
 const {ConfirmIdentityScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,
  '@react-navigation/native':{useIsFocused:()=>focused},
  'firebase/auth':{EmailAuthProvider:{credential:()=>({})},reauthenticateWithCredential:()=>new Promise(r=>{release=r;}),getIdToken:async()=>{}},
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:{email:'admin@example.invalid'}}})},'../../auth/services/loginCooldown':{guardedLogin:f=>f()},
 });
 const props={navigation:{goBack:()=>calls.push('back')}},tree=await mount(ConfirmIdentityScreen,props);
 await act(async()=>tree.root.findByType('TextInput').props.onChangeText('temporary'));
 let pending;await act(async()=>{pending=button(tree,'Confirm password').props.onPress();});
 focused=false;await act(async()=>tree.update(React.createElement(ConfirmIdentityScreen,props)));
 assert.equal(tree.root.findByType('TextInput').props.value,'');await act(async()=>{release();await pending;});
 assert.deepEqual(calls,[]);await act(async()=>tree.unmount());
});

test('returning to Accounts discards stale queue entries after a completed review',async()=>{
 let focused=true,data={items:[{id:'shop',fullName:'Awaiting review',role:'shop'}]};
 const {AccountsScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,'@react-navigation/native':{useIsFocused:()=>focused},'../services/useAdminData':{useAdminData:()=>({data})}});
 const props={navigation:{},route:{params:{filter:'pending'}}},tree=await mount(AccountsScreen,props);
 assert.ok(text(tree,'Awaiting review'));focused=false;await act(async()=>tree.update(React.createElement(AccountsScreen,props)));
 data=null;await act(async()=>tree.update(React.createElement(AccountsScreen,props)));
 focused=true;await act(async()=>tree.update(React.createElement(AccountsScreen,props)));
 data={items:[]};await act(async()=>tree.update(React.createElement(AccountsScreen,props)));
 assert.equal(text(tree,'Awaiting review'),false);assert.ok(text(tree,'No matching accounts loaded yet.'));await act(async()=>tree.unmount());
});

test('light theme uses readable Admin primary controls and dialogs retain platform focus and dismissal semantics',async()=>{
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const {Button,Dialog}=loadUI('src/features/admin/components/AdminUI.js',{'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.light,isDark:false})},'react-native':{Modal:({visible,...props})=>visible?React.createElement('Modal',props):null}});
 const tree=await mount(Button,{title:'Save',primary:true});
 assert.ok(button(tree,'Save').props.style({}).some(s=>s?.backgroundColor==='#526E13'));
 let closed=0;await act(async()=>tree.update(React.createElement(Dialog,{visible:true,title:'Review',busy:true,onClose:()=>closed++})));
 const modal=tree.root.findByType('Modal');assert.equal(modal.props.animationType,'none');modal.props.onRequestClose();assert.equal(closed,0);
 await act(async()=>tree.update(React.createElement(Dialog,{visible:true,title:'Review',busy:false,onClose:()=>closed++})));
 await act(async()=>tree.root.findByType('Modal').props.onRequestClose());assert.equal(closed,1);await act(async()=>tree.unmount());
});

test('an empty category draft never renders a raw text node into its native page container',async()=>{
 const {CategoriesScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{...mocks,'../services/useAdminData':{useAdminData:()=>({data:null})}});
 const tree=await mount(CategoriesScreen,{navigation:{}});
 const children=tree.root.findByType('ScrollView').props.children.flat(Infinity);
 assert.equal(children.some(child=>typeof child==='string'||typeof child==='number'),false);
 await act(async()=>tree.unmount());
});
