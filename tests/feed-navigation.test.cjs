const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const texts=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const badge=tree=>tree.root.findAllByProps({testID:'messages-unread-badge'});
function setup(role='owner'){
 const state={auth:{user:{uid:role,emailVerified:true},profile:{role,fullName:'Test User',verificationStatus:'approved'},offline:false},calls:[],moves:[],logoutCalls:0,focused:true,
  pages:{first:{items:[{id:'one',unreadCount:2}],cursor:'next'},next:{items:[{id:'two',unreadCount:3}],cursor:null}}};
 state.auth.logout=async()=>{state.logoutCalls++;if(state.logout)await state.logout();};
 const appState={currentState:'active',addEventListener:(_,callback)=>{state.appListener=callback;return {remove:()=>{state.listenerRemoved=true;}};}};
 const PostCard=()=>null,feed={items:[],busy:false,refreshing:false,error:'',refresh:async()=>{},loadNext(){}};
 const mocks={
  'react-native':{AppState:appState},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:24,bottom:34,left:0,right:0})},
  '@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  '../../../features/auth/context/AuthContext':{useAuth:()=>state.auth},'../../auth/context/AuthContext':{useAuth:()=>state.auth},'../context/AuthContext':{useAuth:()=>state.auth},
  '@react-navigation/native':{useIsFocused:()=>state.focused},
  '../services/messageApi':{messageApi:async(op,data)=>{state.calls.push({op,data});return state.reply?state.reply(op,data):state.pages[data.cursor||'first'];}},
  '../services/marketApi':{marketApi:async()=>({})},
  '../hooks/useMarketData':{useMarketData:()=>({data:{items:[],cursor:null},busy:false,error:'',refresh:async()=>{}})},
  '../hooks/usePostsFeed':{usePostsFeed:()=>feed},'../../marketplace/hooks/usePostsFeed':{usePostsFeed:()=>feed},
  '../components/PostCard':{PostCard},'../../marketplace/components/PostCard':{PostCard},
  '../components/PhotoGallery':()=>null,'../components/VerificationDocuments':()=>React.createElement('View',{testID:'documents'}),
  '../components/BusinessLocation':()=>React.createElement('View',{testID:'business-location'}),
  'firebase/auth':{},'../../../shared/services/firebase':{firebase:()=>({})},
 };
 const navigation={navigate:(...args)=>state.moves.push(args),canGoBack:()=>false,getState:()=>({index:0,routes:[{name:role==='owner'?'Discover':'ShopJobs'}]})};
 return {state,mocks,navigation,appState,load:file=>loadUI(file,mocks)};
}
async function mount(Component,props={}){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});return tree;}
const close=tree=>act(async()=>tree.unmount());

test('customer and shop feed headers show the same accessible inbox icon, aggregate unread pages and keep feed controls',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),Component=role==='owner'?s.load('src/features/customer/screens/OwnerHomeScreen.js').default:s.load('src/features/marketplace/screens/ShopMarketplaceScreens.js').ShopJobsScreen;
  const tree=await mount(Component,{navigation:s.navigation});
  try{
   const inbox=button(tree,'Messages');assert.ok(inbox);assert.equal(inbox.props.accessibilityRole,'button');assert.equal(inbox.props.accessibilityValue.text,'5 unread messages');
   assert.equal(inbox.findByType('Icon').props.name,'chatbubbles-outline');
   const style=inbox.props.style({pressed:false})[0];assert.ok(style.width>=44&&style.height>=44);
   const title=tree.root.findAllByType('Text').find(node=>node.props.children===(role==='owner'?'Discover':'Find Jobs'));
   assert.ok((role==='owner'?title.parent.parent.parent:title.parent.parent).findAllByType('Pressable').includes(inbox));
   assert.equal(badge(tree).length,1);assert.match(texts(tree),/5/);assert.doesNotMatch(texts(tree),/Sign out/i);
   assert.ok(button(tree,'All'));assert.ok(button(tree,'More filters'));assert.equal(tree.root.findAllByType('TextInput').length,1);
   await act(async()=>inbox.props.onPress());assert.deepEqual(s.state.moves,[['Messages']]);
   assert.deepEqual(s.state.calls,[{op:'list',data:{}},{op:'list',data:{cursor:'next'}}]);
   assert.ok(tree.root.findByType('SafeAreaView').props.edges.includes('top'));
  }finally{await close(tree);}
 }
});

test('unread badge refreshes from current counters, caps its label and never marks messages read',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const s=setup();s.state.pages={first:{items:[{id:'one',unreadCount:120}],cursor:null}};
 const Component=s.load('src/features/marketplace/components/MessagesHeaderButton.js').default,tree=await mount(Component,{navigation:s.navigation});
 try{
  assert.match(texts(tree),/99\+/);assert.equal(button(tree,'Messages').props.accessibilityValue.text,'120 unread messages');
  s.state.pages.first.items[0].unreadCount=0;await act(async()=>t.mock.timers.tick(15000));assert.equal(badge(tree).length,0);
  assert.ok(s.state.calls.every(call=>call.op==='list'));
 }finally{await close(tree);}
 assert.equal(s.state.listenerRemoved,true);
});

test('unread indicator clears on background, offline, blur and account changes and ignores stale responses',async()=>{
 for(const transition of ['offline','blur','account']){
  const s=setup(),Component=s.load('src/features/marketplace/components/MessagesHeaderButton.js').default;let resolve;
  s.state.reply=()=>new Promise(done=>{resolve=done;});const tree=await mount(Component,{navigation:s.navigation});
  try{
   const old=resolve;if(transition==='offline')s.state.auth.offline=true;if(transition==='blur')s.state.focused=false;if(transition==='account')s.state.auth.user={uid:'other'};
   await act(async()=>tree.update(React.createElement(Component,{navigation:s.navigation})));
   await act(async()=>old({items:[{id:'private',unreadCount:5}],cursor:null}));assert.equal(badge(tree).length,0);
  }finally{await close(tree);}
 }
 const s=setup(),Component=s.load('src/features/marketplace/components/MessagesHeaderButton.js').default,tree=await mount(Component,{navigation:s.navigation});
 try{
  assert.equal(badge(tree).length,1);await act(async()=>{s.appState.currentState='background';s.state.appListener('background');});assert.equal(badge(tree).length,0);
  await act(async()=>{s.appState.currentState='active';s.state.appListener('active');});assert.equal(badge(tree).length,1);
 }finally{await close(tree);}
});

test('both Account screens keep Sign out last inside safe scrollable content and use existing logout action',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),Component=s.load('src/features/auth/screens/AccountScreen.js').default,tree=await mount(Component,{navigation:s.navigation});
  try{
   const scroll=tree.root.findByType('ScrollView');assert.ok((scroll.props.contentContainerStyle.padding||scroll.props.contentContainerStyle.paddingHorizontal)>=16);assert.ok(tree.root.findByType('SafeAreaView'));
   assert.ok(scroll.findAllByType('Pressable').at(-1)===button(tree,'Sign out'));assert.equal(!!button(tree,'Messages'),role==='owner');
   await act(async()=>button(tree,'Sign out').props.onPress());assert.equal(s.state.logoutCalls,1);
   s.state.logout=async()=>{throw Error('Sign-out failed');};await act(async()=>button(tree,'Sign out').props.onPress());assert.match(texts(tree),/Sign-out failed/);
  }finally{await close(tree);}
 }
});

test('customer utility links and unchanged Workshop navigation retain existing inbox routes',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),{Page}=s.load('src/features/marketplace/components/MarketplaceUI.js'),tree=await mount(Page,{title:'Bookings',navigation:s.navigation});
  try{assert.equal(!!button(tree,'Messages'),role==='owner');assert.doesNotMatch(texts(tree),/Sign out/i);assert.ok(!tree.root.findAllByType('Pressable').some(node=>node.props.accessibilityRole==='tab'&&node.props.accessibilityLabel==='Messages'));}
  finally{await close(tree);}
 }
});

test('existing internal inbox/chat routes and conversation notification destinations are preserved for both roles',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),empty=()=>null,screenNames=['ReceiptDetailScreen','NotificationsScreen','BookingsScreen','BookingDetailScreen','QuoteComparisonScreen','GarageScreen','VehicleFormScreen','OwnerRequestsScreen','RequestFormScreen','OwnerRequestScreen','ShopJobsScreen','ShopRequestsScreen','ShopRequestScreen','QuoteFormScreen','ShopQuotesScreen','MyPostsScreen','PostFormScreen','PostDetailScreen','ShopProfileScreen','MessagesScreen','ChatScreen'];
  const screens=Object.fromEntries(screenNames.map(name=>[name,empty]));
  const mocks={...s.mocks,'@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'Navigator',Screen:'Screen'})},'../customer/screens/OwnerHomeScreen':empty,'../auth/screens/AccountScreen':empty};
  for(const name of ['MessagingScreens','CommunicationScreens','BookingScreens','QuoteComparisonScreen','OwnerMarketplaceScreens','ShopMarketplaceScreens','PostScreens'])mocks['./screens/'+name]=screens;
  mocks['./screens/PaymentChoiceScreen']=empty;mocks['./screens/VehiclePhotosScreen']=empty;
  const Component=loadUI(`src/features/marketplace/${role==='owner'?'Owner':'Shop'}Navigator.js`,mocks).default;
  const tree=await mount(Component);try{const routes=tree.root.findAllByType('Screen').map(child=>child.props.name);assert.ok(routes.includes('Messages'));assert.ok(routes.includes('Chat'));}finally{await close(tree);}
  const {notificationDestination}=s.load('src/features/marketplace/screens/CommunicationScreens.js');assert.deepEqual(notificationDestination({target:{type:'conversation',id:'thread-1'}},role),['Chat',{id:'thread-1'}]);
 }
});
