const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const booking={simulated:true,testTransaction:true,paymentProvider:'mock',paymentAccountingMode:'simulated',id:'fixture-booking',serviceRequestId:'fixture-request',quoteId:'fixture-quote',shopId:'fixture-shop',shopName:'Fixture Workshop with a long supplied name',customerName:'Fixture Customer',requestTitle:'Restore bonnet',vehicle:{make:'Toyota',model:'Corolla',year:2024,colour:'Blue'},status:'pending_confirmation',serviceStatus:'not_started',paymentMethod:'pay_in_store',paymentStatus:'due',totalCents:10050,paidCents:0,balanceDueCents:10050,depositType:'fixed',depositValue:2500,depositAmountCents:2500,scope:'Prepare and paint the bonnet.',items:[{description:'Paint and labour',amountCents:10050}],completionDays:4};
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join('\n');
const input=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());
const flatten=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
function setup(role='owner',mode='dark',platform='ios',width=390){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={auth:{user:{uid:role},profile:{role},offline:false},data:{booking},busy:false,error:'',calls:[],moves:[],refreshes:0};
 const mocks={
  'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:844,fontScale:1,scale:1})},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text',ownerTabs:['Discover','Garage','My Requests','Bookings','Profile'].map(label=>({label})),shopTabs:['Find Jobs','Requests','Quotes','Bookings','My Shop'].map(label=>({label}))},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
  '../hooks/useMarketData':{useMarketData:()=>({data:state.data,busy:state.busy,error:state.error,refresh:async()=>{state.refreshes++;return state.refresh?state.refresh():state.data;}})},
  '../hooks/useMockPayments':{useMockPayments:()=>({enabled:true,busy:false,error:'',refresh:async()=>{}})},
  '../services/marketApi':{marketApi:async(op,data)=>{state.calls.push({op,data});return state.api?state.api(op,data):{id:booking.id};}},
  '../components/ConversationAction':{ConversationAction:props=>React.createElement('ConversationAction',props)},
  '../components/PhotoGallery':props=>React.createElement('PhotoGallery',props),
 };
 const screens=loadUI('src/features/marketplace/screens/BookingScreens.js',mocks),ui=loadUI('src/features/marketplace/components/BookingUI.js',mocks);
 const navigation={navigate:(...args)=>state.moves.push(args),goBack:()=>state.moves.push(['back']),canGoBack:()=>true};
 return {state,screens,ui,navigation,palettes};
}
async function mounted(Component,props,run){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await run(tree,()=>act(async()=>tree.update(React.createElement(Component,props))));}finally{await act(async()=>tree.unmount());}}
const details=s=>({navigation:s.navigation,route:{params:{id:booking.id}}});
async function appointment(tree){await act(async()=>input(tree,'Appointment date (YYYY-MM-DD)').props.onChangeText('2099-01-02'));await act(async()=>input(tree,'Appointment time (HH:mm, SAST)').props.onChangeText('14:30'));}

test('booking overviews use role-authorised names and do not invent customer contacts',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role);await mounted(s.ui.BookingOverview,{booking,detail:true},async tree=>{
   assert.match(text(tree),/Awaiting shop confirmation/);assert.match(text(tree),/Restore bonnet/);assert.match(text(tree),/2024.*Toyota.*Corolla/);assert.match(text(tree),/Appointment not scheduled/);
   assert.ok(text(tree).includes(role==='shop'?'Fixture Customer':booking.shopName));
   if(role==='owner')assert.doesNotMatch(text(tree),/Fixture Customer/);
   assert.doesNotMatch(text(tree),/email|phone|registration|Paid/);assert.equal(s.state.calls.length,0);
  });
 }
});
test('backend booking states and separate service completion remain distinct',async()=>{
 const s=setup();
 for(const [status,label] of Object.entries({pending_payment:'Payment pending',pending_confirmation:'Awaiting shop confirmation',confirmed:'Confirmed',cancelled:'Cancelled'})){
  await mounted(s.ui.BookingOverview,{booking:{...booking,status,serviceStatus:'completed'}},async tree=>{assert.ok(text(tree).includes(label));assert.match(text(tree),/Service completed/);});
 }
 assert.equal(s.ui.bookingStatusLabel('unknown'),'unknown');assert.equal(s.ui.serviceStatusLabel(undefined),'Not recorded');
 await mounted(s.ui.BookingProgress,{booking:{...booking,status:'cancelled'}},async tree=>{assert.match(text(tree),/retained in history/);assert.doesNotMatch(text(tree),/Appointment confirmed/);});
});
test('missing or incomplete appointment data never looks like a confirmed appointment',async()=>{
 const s=setup();
 for(const value of [{},{appointmentDate:'2099-01-02'},{appointmentTime:'14:30'}])await mounted(s.ui.AppointmentInfo,{booking:value},async tree=>{
  assert.match(text(tree),Object.keys(value).length?/Appointment details incomplete/:/Appointment not scheduled/);assert.doesNotMatch(text(tree),/undefined|Invalid Date|Confirmed/);
 });
 await mounted(s.ui.AppointmentInfo,{booking:{appointmentDate:'2099-01-02',appointmentTime:'14:30'}},async tree=>{assert.match(text(tree),/2099-01-02 at 14:30 SAST/);});
});
test('multiple booking cards adapt to desktop and keep Bookings selected for both roles',async()=>{
 for(const role of ['owner','shop'])for(const width of [390,1200]){
  const s=setup(role,'dark','ios',width);s.state.data={items:[booking,{...booking,id:'other-booking'}],cursor:null};
  await mounted(s.screens.BookingsScreen,{navigation:s.navigation},async tree=>{
   assert.equal(tree.root.findAllByType('View').filter(n=>n.props.testID?.startsWith('booking-card-')).length,2);
   assert.equal(flatten(tree.root.findByProps({testID:'booking-card-fixture-booking'}).props.style).width,width>=850?'48%':'100%');
   assert.equal(button(tree,'Bookings').props.accessibilityState.selected,true);assert.equal(!!button(tree,'Messages'),role==='owner');assert.equal(!!button(tree,'Notifications'),role==='owner');
   assert.equal(s.state.calls.length,0);const buttons=tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityLabel==='View booking');await act(async()=>buttons[1].props.onPress());assert.deepEqual(s.state.moves,[['BookingDetail',{id:'other-booking'}]]);
  });
 }
});
test('booking details show exact accepted price and deposit without treating service completion as payment',async()=>{
 const s=setup();s.state.data={booking:{...booking,status:'confirmed',serviceStatus:'completed'}};
 await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
  for(const value of ['Quotation total: R100.50','Accepted required deposit: R25.00','Simulated amount paid: R0.00','Outstanding balance: R100.50','Simulated payment status: Unpaid'])assert.ok(text(tree).includes(value),value);
  assert.match(text(tree),/Service completed/);assert.equal(button(tree,'Confirm booking'),undefined);assert.equal(button(tree,'Mark service completed'),undefined);
  assert.equal(s.state.calls.length,0);assert.equal(button(tree,'Reschedule'),undefined);
 });
});
test('appointment review can be cancelled and only its final confirmation writes',async()=>{
 const s=setup('shop');await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
  await appointment(tree);await press(tree,'Confirm booking');assert.equal(s.state.calls.length,0);assert.match(text(tree),/does not change payment status/);
  await press(tree,'Cancel');assert.equal(input(tree,'Appointment date (YYYY-MM-DD)').props.value,'2099-01-02');assert.equal(s.state.calls.length,0);
  await press(tree,'Confirm booking');await press(tree,'Confirm');assert.deepEqual(s.state.calls,[{op:'bookingConfirm',data:{id:booking.id,appointmentDate:'2099-01-02',appointmentTime:'14:30'}}]);
  assert.match(text(tree),/Booking confirmed/);assert.equal(button(tree,'Confirm booking'),undefined);
 });
});
test('completion requires confirmation, preserves failures, and retains an acknowledged result over a stale refresh',async()=>{
 const s=setup('shop');s.state.data={booking:{...booking,status:'confirmed'}};let fail=true;s.state.api=async()=>{if(fail)throw Error('Completion unavailable');return {id:booking.id,serviceStatus:'completed'};};
 await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
  await press(tree,'Mark service completed');assert.equal(s.state.calls.length,0);await press(tree,'Confirm');assert.match(text(tree),/Completion unavailable/);assert.doesNotMatch(text(tree),/Service marked completed/);
  fail=false;await press(tree,'Confirm');assert.match(text(tree),/Service marked completed/);assert.match(text(tree),/payment status are unchanged/);assert.equal(button(tree,'Mark service completed'),undefined);
  assert.match(text(tree),/Simulated payment status: Unpaid/);assert.match(text(tree),/Outstanding balance: R100.50/);
  assert.ok(s.state.calls.every(call=>call.op==='bookingComplete'&&Object.keys(call.data).join(',')==='id'));
 });
});
test('failed booking refresh disables stale actions and keeps refresh available',async()=>{
 const s=setup('shop');s.state.error='Could not refresh current booking';
 await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
  assert.match(text(tree),/Could not refresh/);assert.equal(button(tree,'Confirm booking').props.disabled,true);assert.equal(button(tree,'Cancel booking').props.disabled,true);assert.equal(button(tree,'Refresh booking').props.disabled,false);
  await press(tree,'Refresh booking');assert.equal(s.state.refreshes,1);assert.equal(s.state.calls.length,0);
 });
});
test('request and contextual messaging retain the booking request and authorised workshop IDs',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role);await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
   const chat=tree.root.findByType('ConversationAction');assert.equal(chat.props.serviceRequestId,booking.serviceRequestId);assert.equal(chat.props.shopId,booking.shopId);assert.equal(chat.props.disabled,false);
   await press(tree,'View related request');assert.deepEqual(s.state.moves,[[role==='shop'?'ShopRequest':'OwnerRequest',{id:booking.serviceRequestId}]]);assert.equal(s.state.calls.length,0);
  });
 }
});
test('booking list loading, empty, offline, error and refreshing states offer truthful controls',async()=>{
 const s=setup();s.state.data={items:[],cursor:null};s.state.busy=true;
 await mounted(s.screens.BookingsScreen,{navigation:s.navigation},async(tree,update)=>{
  assert.match(text(tree),/Loading bookings/);assert.doesNotMatch(text(tree),/No bookings yet/);
  s.state.busy=false;await update();assert.match(text(tree),/No bookings yet/);
  s.state.error='Unavailable';await update();assert.match(text(tree),/Unavailable/);assert.doesNotMatch(text(tree),/No bookings yet/);
  s.state.error='';s.state.data={items:[booking],cursor:null};await update();await act(async()=>tree.root.findByType('ScrollView').props.refreshControl.props.onRefresh());assert.equal(s.state.refreshes,1);
  s.state.busy=true;await update();assert.equal(tree.root.findByType('ScrollView').props.refreshControl.props.refreshing,true);
  s.state.busy=false;s.state.auth.offline=true;await update();assert.equal(button(tree,'View booking'),undefined);assert.match(text(tree),/Connect to the internet/);assert.equal(button(tree,'Refresh bookings').props.disabled,true);
 });
});
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('booking statuses and actions have accessible contrast in both themes',async()=>{
 for(const mode of ['dark','light'])for(const status of ['pending_confirmation','confirmed','cancelled']){
  const s=setup('owner',mode);await mounted(s.ui.BookingOverview,{booking:{...booking,status}},async tree=>{
   const label=tree.root.findAllByType('Text').find(n=>n.props.children===s.ui.bookingStatusLabel(status)),background=flatten(label.parent.props.style).backgroundColor;
   assert.ok(contrast(flatten(label.props.style).color,background)>=4.5);
  });
  await mounted(s.ui.BookingAction,{title:'View details',onPress(){}},async tree=>{const action=button(tree,'View details'),bg=flatten(action.props.style({pressed:false})).backgroundColor;assert.ok(contrast(flatten(action.findByType('Text').props.style).color,bg)>=4.5);assert.equal(action.props.style({pressed:false})[0].minHeight,48);});
 }
});
test('historical or real bookings retain recorded labels and never expose simulation actions',async()=>{
 for(const role of ['owner','shop']){
  const s=setup(role);s.state.data={booking:{...booking,simulated:undefined,testTransaction:undefined,paymentProvider:undefined}};
  await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
   assert.match(text(tree),/Recorded payment status/);assert.match(text(tree),/Historical payment evidence is preserved/);
   assert.equal(button(tree,'Start simulated balance payment'),undefined);assert.equal(button(tree,'Record test cash'),undefined);assert.equal(s.state.calls.length,0);
  });
 }
});

test('booking forms preserve safe areas and platform keyboard handling without adding scheduling fields',async()=>{
 for(const platform of ['ios','android','web']){
  const s=setup('shop','dark',platform);await mounted(s.screens.BookingDetailScreen,details(s),async tree=>{
   assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,['top','bottom','left','right']);assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,platform==='ios'?'padding':platform==='android'?'height':undefined);
   assert.equal(tree.root.findAllByType('TextInput').length,3);assert.equal(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');assert.equal(s.state.calls.length,0);
  });
 }
});
