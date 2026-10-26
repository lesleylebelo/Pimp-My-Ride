const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const badge=tree=>tree.root.findAllByProps({testID:'notifications-unread-badge'});
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
function setup(role='owner'){
 const state={auth:{user:{uid:role,emailVerified:true},profile:{role,verificationStatus:'approved',fullName:'Test'},offline:false},focused:true,calls:[],messages:[],moves:[],
  pages:{first:{items:[{id:'n1',readAt:null},{id:'n2',readAt:100}],cursor:'next'},next:{items:[{id:'n3',readAt:null},{id:'n1',readAt:null},{id:'n4'}],cursor:null}}};
 const listeners=new Set(),appState={currentState:'active',addEventListener:(_,callback)=>{listeners.add(callback);return {remove:()=>listeners.delete(callback)};}};
 const feed={items:[],busy:false,refreshing:false,error:'',refresh:async()=>{},loadNext(){}},PostCard=()=>null;
 const mocks={
  'react-native':{AppState:appState},
  'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:24,bottom:34,left:0,right:0})},
  '@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  '../../../features/auth/context/AuthContext':{useAuth:()=>state.auth},'../../auth/context/AuthContext':{useAuth:()=>state.auth},'../context/AuthContext':{useAuth:()=>state.auth},
  '@react-navigation/native':{useIsFocused:()=>state.focused},
  '../services/marketApi':{marketApi:async(op,data)=>{state.calls.push({op,data});assert.equal(op,'notifications');return state.reply?state.reply(data):state.pages[data.cursor||'first'];}},
  '../services/messageApi':{messageApi:async(op,data)=>{state.messages.push({op,data});return {items:[{id:'chat',unreadCount:7}],cursor:null};}},
  '../hooks/useMarketData':{useMarketData:()=>({data:{items:[],cursor:null},busy:false,error:'',refresh:async()=>{}})},
  '../hooks/usePostsFeed':{usePostsFeed:()=>feed},'../../marketplace/hooks/usePostsFeed':{usePostsFeed:()=>feed},
  '../components/PostCard':{PostCard},'../../marketplace/components/PostCard':{PostCard},'../components/PhotoGallery':()=>null,
  '../components/BusinessLocation':()=>null,'../components/VerificationDocuments':()=>null,'firebase/auth':{},'../../../shared/services/firebase':{firebase:()=>({})},
 };
 const navigation={navigate:(...args)=>state.moves.push(args),canGoBack:()=>false,getState:()=>({index:0,routes:[{name:role==='owner'?'Discover':'ShopJobs'}]})};
 return {state,navigation,appState,listeners,load:file=>loadUI(file,mocks),mocks};
}
async function mount(Component,props={}){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});return tree;}
const close=tree=>act(async()=>tree.unmount());

test('both feed headers place the bell beside unchanged Messages with matching accessible touch targets',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),Component=role==='owner'?s.load('src/features/customer/screens/OwnerHomeScreen.js').default:s.load('src/features/marketplace/screens/ShopMarketplaceScreens.js').ShopJobsScreen;
  const tree=await mount(Component,{navigation:s.navigation});
  try{
   const bell=button(tree,'Notifications'),messages=button(tree,'Messages');assert.ok(bell);assert.ok(messages);
   const title=tree.root.findAllByType('Text').find(node=>node.props.children===(role==='owner'?'Discover':'Find Jobs'));
   const copy=role==='owner'?title.parent.parent:title.parent;
   assert.deepEqual(copy.parent.findAllByType('Pressable').map(node=>node.props.accessibilityLabel),['Notifications','Messages']);
   assert.equal(copy.props.style.minWidth,0);assert.equal(copy.props.style.flex,1);
   assert.equal(bell.props.accessibilityRole,'button');assert.equal(bell.findByType('Icon').props.name,'notifications-outline');
   assert.equal(bell.findByType('Icon').props.color,messages.findByType('Icon').props.color);
   assert.deepEqual(bell.props.style({pressed:false}),messages.props.style({pressed:false}));assert.equal(bell.props.style({pressed:false})[0].width,44);
   assert.equal(bell.props.accessibilityValue.text,'3 unread notifications');assert.equal(messages.props.accessibilityValue.text,'7 unread messages');
   assert.equal(badge(tree).length,1);assert.ok(button(tree,'All'));assert.ok(button(tree,'More filters'));
   assert.ok(!tree.root.findAllByType('ScrollView').some(scroll=>scroll.findAllByType('Pressable').includes(bell)));
   await act(async()=>bell.props.onPress());await act(async()=>messages.props.onPress());assert.deepEqual(s.state.moves,[['Notifications'],['Messages']]);
   assert.deepEqual(s.state.messages,[{op:'list',data:{}}]);assert.deepEqual(s.state.calls,[{op:'notifications',data:{cursor:null}},{op:'notifications',data:{cursor:'next'}}]);
  }finally{await close(tree);}
  assert.equal(s.listeners.size,0);
 }
});

test('notification badge uses all pages, caps at 99+, updates read state and never acknowledges notifications',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const s=setup();
 s.state.pages={first:{items:Array.from({length:105},(_,id)=>({id:String(id),readAt:null})),cursor:null}};
 const Component=s.load('src/features/marketplace/components/NotificationsHeaderButton.js').default,tree=await mount(Component,{navigation:s.navigation});
 try{
  assert.match(text(tree),/99\+/);assert.equal(button(tree,'Notifications').props.accessibilityValue.text,'105 unread notifications');
  s.state.pages.first.items.forEach(item=>{item.readAt=100;});await act(async()=>t.mock.timers.tick(15000));assert.equal(badge(tree).length,0);
  s.state.reply=async()=>{throw Error('Unavailable');};await act(async()=>t.mock.timers.tick(15000));assert.equal(badge(tree).length,0);assert.equal(button(tree,'Notifications').props.accessibilityValue.text,'Unread status unavailable');
  assert.ok(s.state.calls.every(call=>call.op==='notifications'));
 }finally{await close(tree);}
});

test('notification count discards late responses on account, focus, offline and background changes',async()=>{
 for(const transition of ['account','blur','offline','background']){
  const s=setup();let resolve;s.state.reply=()=>new Promise(done=>{resolve=done;});
  const Component=s.load('src/features/marketplace/components/NotificationsHeaderButton.js').default,tree=await mount(Component,{navigation:s.navigation});
  try{
   const old=resolve;
   await act(async()=>{if(transition==='account')s.state.auth.user={uid:'other'};if(transition==='blur')s.state.focused=false;if(transition==='offline')s.state.auth.offline=true;
    if(transition==='background'){s.appState.currentState='background';for(const listener of s.listeners)listener('background');}else tree.update(React.createElement(Component,{navigation:s.navigation}));});
   await act(async()=>old({items:[{id:'private',readAt:null}],cursor:null}));assert.equal(badge(tree).length,0);
  }finally{await close(tree);}
 }
});

test('Customer utility navigation exposes notifications while Workshop keeps its original shortcuts',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role),Account=s.load('src/features/auth/screens/AccountScreen.js').default,{Page}=s.load('src/features/marketplace/components/MarketplaceUI.js');
  for(const [Component,props] of [[Account,{navigation:s.navigation}],[Page,{title:'Bookings',navigation:s.navigation}]]){
   const tree=await mount(Component,props);try{assert.equal(!!button(tree,'Notifications'),role==='owner');assert.ok(!button(tree,'Notification history'));}finally{await close(tree);}
  }
 }
});

test('existing notification deep links keep request, quotation, booking and conversation destinations',()=>{
 const s=setup(),{notificationDestination}=s.load('src/features/marketplace/screens/CommunicationScreens.js');
 for(const role of ['owner','shop']){
  assert.deepEqual(notificationDestination({target:{type:'conversation',id:'chat'}},role),['Chat',{id:'chat'}]);
  assert.deepEqual(notificationDestination({target:{type:'booking',id:'booking'}},role),['BookingDetail',{id:'booking'}]);
  assert.deepEqual(notificationDestination({target:{type:'request',id:'request'}},role),[role==='shop'?'ShopRequest':'OwnerRequest',{id:'request'}]);
  assert.deepEqual(notificationDestination({target:{type:'quotation',id:'quote'}},role),[role==='shop'?'ShopRequest':'QuoteComparison',{id:'quote'}]);
 }
});
