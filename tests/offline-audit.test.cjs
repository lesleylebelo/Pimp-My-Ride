const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {act,create}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const memory=()=>{const data=new Map();return {data,getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{data.set(key,value);},removeItem:async key=>{data.delete(key);}};};
const text=tree=>tree.root.findAllByType('Text').map(node=>[node.props.children].flat().filter(value=>typeof value==='string'||typeof value==='number').join('')).join('\n');
async function mount(Screen,props,verify){
 let tree;
 await act(async()=>{tree=create(React.createElement(Screen,props));});
 try{await verify(tree,()=>act(async()=>tree.update(React.createElement(Screen,props))));}
 finally{await act(async()=>tree.unmount());}
}

test('landing cache survives module recreation, remains account isolated, and refuses inactive or expired records',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});
 const storage=memory(),load=()=>loadUI('src/shared/offline/profileCache.js',{'@react-native-async-storage/async-storage':storage});
 const first=load();
 await first.saveProfileCache('owner-a',{role:'owner',fullName:'Private name',email:'private@fixture.invalid',phone:'private',password:'secret'});
 const restarted=load();
 assert.deepEqual((await restarted.readProfileCache('owner-a')).profile,{role:'owner'});
 assert.equal(await restarted.readProfileCache('owner-b'),null);
 assert.doesNotMatch([...storage.data.values()].join(''),/Private name|private@fixture|secret|phone/);
 t.mock.timers.tick(first.CACHE_AGE+1);
 assert.equal(await restarted.readProfileCache('owner-a'),null);
 assert.equal(storage.data.size,0,'expired previews are erased');
 for(const accountStatus of ['deactivated','deleting','suspended','archived']){
  await first.saveProfileCache('owner-a',{role:'owner'});
  await first.saveProfileCache('owner-a',{role:'owner',accountStatus});
  assert.equal(await restarted.readProfileCache('owner-a'),null);
  assert.equal(storage.data.size,0);
 }
});

test('native session adapter restores from the same secure store after recreation and sign-out removes the active session',async()=>{
 const secure=memory(),legacy=memory();
 const store={WHEN_UNLOCKED_THIS_DEVICE_ONLY:17,getItemAsync:secure.getItem,setItemAsync:secure.setItem,deleteItemAsync:secure.removeItem};
 const load=()=>loadUI('src/shared/services/securePersistence.js',{'expo-secure-store':store,'@react-native-async-storage/async-storage':legacy}).createSecurePersistence(store,legacy);
 const key='firebase:authUser:fixture:[DEFAULT]',value=JSON.stringify({uid:'owner-a',refreshToken:'synthetic-token'});
 await load().setItem(key,value);
 assert.equal(await load().getItem(key),value);
 assert.equal(legacy.data.size,0);
 await load().removeItem(key);
 assert.equal(await load().getItem(key),null);
 assert.equal(secure.data.size,0);
});

test('all backend mutation transports reject a known offline connection before tokens, fetch or XHR',async()=>{
 let tokens=0,fetches=0;
 const state={isConnected:false,isInternetReachable:false};
 const network=loadUI('src/shared/services/network.js',{'@react-native-community/netinfo':{fetch:async()=>state}});
 const api=loadUI('src/shared/services/api.js',{
  './network':network,
  './firebase':{firebase:()=>({auth:{currentUser:{uid:'owner',getIdToken:async()=>{tokens++;return 'synthetic-token';}}}})},
 });
 const oldFetch=global.fetch;global.fetch=async()=>{fetches++;throw Error('Unexpected fetch');};
 try{
  for(const request of [
   ()=>api.apiRequest('marketplace',{op:'quoteAccept'}),
   ()=>api.apiRequest('marketplace',{op:'paymentRecordInStore'}),
   ()=>api.apiRequest('account',{op:'deactivate'}),
   ()=>api.apiMethodRequest('posts',{method:'POST',data:{title:'Synthetic showcase'}}),
   ()=>api.uploadRequest('photos',{}),
  ])await assert.rejects(request,/offline/i);
  assert.equal(tokens,0);assert.equal(fetches,0);
 }finally{global.fetch=oldFetch;}
 assert.equal(network.isOffline({isConnected:true,isInternetReachable:false}),true);
 assert.equal(network.isOffline({isConnected:null,isInternetReachable:null}),false,'unknown reachability is allowed to attempt a request');
});

test('theme and workshop feed source restore after remount and are device preferences shared between accounts',async()=>{
 const storage=memory(),{palettes}=loadUI('src/shared/theme/colors.js');
 const theme=loadUI('src/shared/theme/ThemeContext.js',{'@react-native-async-storage/async-storage':storage});
 let context;
 function Probe(){context=theme.useTheme();return null;}
 function Theme(){return React.createElement(theme.ThemeProvider,null,React.createElement(Probe));}
 await mount(Theme,{},async()=>{assert.equal(context.mode,'dark');await act(async()=>context.toggleTheme());assert.equal(context.mode,'light');});
 await mount(Theme,{},async()=>assert.equal(context.mode,'light'));
 const {FeedSourceSelector}=loadUI('src/shared/components/landing/FeedControls.js',{
  '@react-native-async-storage/async-storage':storage,
  '../../theme/ThemeContext':{useTheme:()=>({theme:palettes.dark})},
 });
 const selections=[],props={options:[{label:'All',value:'all'},{label:'Customers',value:'customers'}],storageKey:'feed-source:shop',onChange:value=>selections.push(value)};
 await mount(FeedSourceSelector,props,async tree=>{await act(async()=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Customers').props.onPress());});
 await mount(FeedSourceSelector,props,async()=>assert.equal(selections.at(-1),'customers'));
 assert.deepEqual([...storage.data.keys()].sort(),['feed-source:shop','theme-mode:v1']);
});

function screenMocks(state){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 return {
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.dark,mode:'dark',isDark:true})},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '../../../shared/components/LogoMark':()=>null,
  '../components/PrivatePhoto':()=>null,
 };
}

test('customer offline notice identifies potentially outdated data and scopes the timestamp to the account preview',async()=>{
 const state={auth:{user:{uid:'a'},profile:{role:'owner'},offline:true,cachedAt:1800000000000}};
 const {CustomerFrame}=loadUI('src/features/customer/components/CustomerUI.js',screenMocks(state));
 await mount(CustomerFrame,{title:'Synthetic screen'},async(tree,update)=>{
  assert.match(text(tree),/Displayed information may be outdated/);
  assert.match(text(tree),/Account preview saved/);
  assert.match(text(tree),new RegExp(new Date(state.auth.cachedAt).toLocaleString().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  state.auth.cachedAt=null;await update();assert.doesNotMatch(text(tree),/Account preview saved/);
  state.auth.offline=false;await update();assert.doesNotMatch(text(tree),/Displayed information may be outdated/);
 });
});

test('already-open Garage retains RAM rows offline with actions blocked, but reopening offline has no saved vehicles',async()=>{
 const state={auth:{user:{uid:'a'},profile:{role:'owner'},offline:false}},calls=[];
 const vehicle={id:'synthetic-car',make:'Synthetic',model:'Vehicle',year:2024,version:1};
 const mocks={...screenMocks(state),'../services/marketApi':{marketApi:async(op)=>{calls.push(op);return {items:[vehicle]};}}};
 const {GarageScreen}=loadUI('src/features/marketplace/screens/OwnerMarketplaceScreens.js',mocks);
 const props={navigation:{navigate(){},getState:()=>({index:0,routes:[{name:'Garage'}]})}};
 await mount(GarageScreen,props,async(tree,update)=>{
  assert.match(text(tree),/Synthetic Vehicle/);
  state.auth.offline=true;await update();
  assert.match(text(tree),/Synthetic Vehicle/,'these are previously loaded RAM rows, not persistent offline storage');
  assert.match(text(tree),/may be outdated/);
  for(const label of ['Add vehicle','Request service for Synthetic Vehicle','Edit Synthetic Vehicle']){
   const control=tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
   assert.ok(control,label);assert.equal(control.props.disabled,true,label);
  }
  assert.equal(calls.length,1);
 });
 await mount(GarageScreen,props,async tree=>{assert.doesNotMatch(text(tree),/Synthetic Vehicle/);assert.equal(calls.length,1);});
});

test('post detail labels retained RAM content offline and refreshes on reconnection and refocus without a render loop',async()=>{
 const state={auth:{user:{uid:'a'},profile:{role:'owner'},offline:false}},calls=[];
 let focused=true;
 const {PostDetailScreen}=loadUI('src/features/marketplace/screens/PostScreens.js',{
  ...screenMocks(state),
  '@react-navigation/native':{useIsFocused:()=>focused},
  '../services/postsApi':{postsApi:async()=>{calls.push('get');return {post:{id:'p',title:'Synthetic retained post',images:[]}};}},
 });
 await mount(PostDetailScreen,{route:{params:{id:'p'}},navigation:{}},async(tree,update)=>{
  assert.match(text(tree),/Synthetic retained post/);
  state.auth.offline=true;await update();assert.match(text(tree),/Synthetic retained post/);assert.match(text(tree),/previously loaded post may be outdated/);
  state.auth.offline=false;await update();assert.equal(calls.length,2);
  await update();assert.equal(calls.length,2);
  focused=false;await update();assert.equal(calls.length,2);
  focused=true;await update();assert.equal(calls.length,3);
 });
});

test('marketplace reconnect within the read TTL reuses RAM data; explicit refresh requests current data',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});
 const user={uid:'a'},state={auth:{user,profile:{role:'owner'},offline:false}},calls=[];
 const {useMarketData}=loadUI('src/features/marketplace/hooks/useMarketData.js',{
  ...screenMocks(state),
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:user}})},
  '../../../shared/services/api':{apiRequest:async()=>{calls.push('read');return {items:[{id:`version-${calls.length}`}]};}},
 });
 let result;
 function Probe(){result=useMarketData('vehicles');return null;}
 await mount(Probe,{},async(tree,update)=>{
  assert.equal(result.data.items[0].id,'version-1');
  state.auth.offline=true;await update();assert.equal(result.data,null);
  t.mock.timers.tick(1000);state.auth.offline=false;await update();
  assert.equal(result.data.items[0].id,'version-1');assert.equal(calls.length,1);
  await act(async()=>result.refresh());
  assert.equal(result.data.items[0].id,'version-2');assert.equal(calls.length,2);
 });
});

test('an unfinished profile draft stays in the mounted form but is lost when the form is reopened',async()=>{
 const state={auth:{user:{uid:'a'},profile:{role:'owner',fullName:'Saved name'},offline:false}};
 const {default:ManageProfile}=loadUI('src/features/auth/components/ManageProfile.js',{
  ...screenMocks(state),
  '../context/AuthContext':{useAuth:()=>state.auth},
  '../services/accountManagement':{accountApi:async()=>({profile:{fullName:'Saved name',phone:'',version:1}})},
  './ProfilePhotoSettings':()=>null,
  './BusinessLocation':()=>null,
 });
 const field=tree=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Display name');
 await mount(ManageProfile,{},async tree=>{
  await act(async()=>field(tree).props.onChangeText('Unfinished synthetic draft'));
  assert.equal(field(tree).props.value,'Unfinished synthetic draft');
 });
 await mount(ManageProfile,{},async tree=>assert.equal(field(tree).props.value,'Saved name'));
});

test('post-detail reconnect, focus and manual retries preserve the real read coordinator rate limit',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});
 const user={uid:'a'},state={auth:{user,profile:{role:'owner'},offline:false}},calls=[];
 let focused=true;
 const Screen=loadUI('src/features/marketplace/screens/PostScreens.js',{
  ...screenMocks(state),'@react-navigation/native':{useIsFocused:()=>focused},
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:user}})},
  '../../../shared/services/api':{apiMethodRequest:async()=>{calls.push('get');throw Object.assign(Error('Synthetic rate limit'),{status:429,retryAt:Date.now()+60000});}},
 }).PostDetailScreen;
 await mount(Screen,{route:{params:{id:'p'}},navigation:{}},async(tree,update)=>{
  assert.equal(calls.length,1);
  state.auth.offline=true;await update();state.auth.offline=false;await update();
  focused=false;await update();focused=true;await update();
  const retry=()=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Retry loading post').props.onPress();
  await act(async()=>retry());assert.equal(calls.length,1);
  t.mock.timers.tick(60000);await act(async()=>retry());assert.equal(calls.length,2);
 });
});

test('cold offline post detail waits for connectivity and ignores late results after blur or account replacement',async()=>{
 const state={auth:{user:{uid:'a'},profile:{role:'owner'},offline:true}};
 let focused=true,calls=0,release;
 const Screen=loadUI('src/features/marketplace/screens/PostScreens.js',{
  ...screenMocks(state),'@react-navigation/native':{useIsFocused:()=>focused},
  '../services/postsApi':{postsApi:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}},
 }).PostDetailScreen;
 await mount(Screen,{route:{params:{id:'p'}},navigation:{}},async(tree,update)=>{
  assert.equal(calls,0);assert.match(text(tree),/Connect to load this post/);
  state.auth.offline=false;await update();assert.equal(calls,1);
  focused=false;await update();await act(async()=>release({post:{title:'Old account private post'}}));
  assert.doesNotMatch(text(tree),/Old account private post/);
  state.auth.user={uid:'b'};focused=true;await update();assert.equal(calls,2);
  await act(async()=>release({post:{title:'Replacement account post'}}));assert.match(text(tree),/Replacement account post/);
 });
});

test('workshop showcase and quotation pages label transient offline data without claiming durable caching',async()=>{
 const state={auth:{user:{uid:'shop'},profile:{role:'shop'},offline:true}},mocks={...screenMocks(state),'./ShopBottomNavigation':()=>null};
 const pages=[
  loadUI('src/features/marketplace/components/ShowcaseUI.js',mocks).ShowcasePage,
  loadUI('src/features/marketplace/components/QuotationUI.js',mocks).QuotationPage,
 ];
 for(const Screen of pages)await mount(Screen,{title:'Synthetic workshop page',navigation:{}},async(tree,update)=>{
  assert.match(text(tree),/Displayed information may be outdated/);assert.doesNotMatch(text(tree),/durably cached|saved offline/i);
  state.auth.offline=false;await update();assert.doesNotMatch(text(tree),/Displayed information may be outdated/);state.auth.offline=true;
 });
});

test('landing notice scopes its saved timestamp to the account preview',async()=>{
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const {LandingShell}=loadUI('src/shared/components/landing/LandingUI.js',{
  '@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({bottom:0})},
  '../../../features/auth/context/AuthContext':{useAuth:()=>({profile:{role:'shop'},offline:true,cachedAt:1800000000000})},
  '../../theme/ThemeContext':{useTheme:()=>({theme:palettes.dark})},
 });
 await mount(LandingShell,{title:'Synthetic landing'},async tree=>{
  assert.match(text(tree),/Account preview saved/);assert.match(text(tree),/Displayed information may be outdated/);
  assert.doesNotMatch(text(tree),/Read-only preview/);
 });
});
