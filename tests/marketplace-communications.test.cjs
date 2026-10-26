
const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;const {act}=Renderer;
const receipt={id:'attempt-1',receiptReference:'TEST-attempt-1',bookingId:'booking-1',paymentAttemptId:'attempt-1',quoteId:'quote-1',customer:{id:'owner-1',name:'Test Customer'},shop:{id:'shop-1',name:'Test Shop'},serviceTitle:'Restore bonnet',scope:'Prepare and paint',items:[{description:'Labour',amountCents:10000}],method:'simulated_online',amountCents:2500,totalCents:10000,paidCentsAfter:2500,balanceDueCentsAfter:7500,issuedAt:1000};
const notification=(id,extra={})=>({id,event:'simulated_payment_paid',title:'Simulated payment successful',body:'SIMULATED / TEST - NOT REAL PAYMENT',createdAt:1000,readAt:null,target:{type:'receipt',id:'attempt-1'},...extra});
function setup(overrides={}){
 const state={auth:{user:{uid:'owner-1'},profile:{role:'owner'},offline:false},data:{receipt},busy:false,error:'',reads:[],calls:[],navigations:[],refresh:async()=>({}),api:async()=>({read:true}),...overrides};
 const PrimaryButton=loadUI('src/shared/components/PrimaryButton.js').default;
 const landing={LandingText:'Text',LandingShell:({children})=>React.createElement('View',null,children),LandingButton:PrimaryButton,ownerTabs:[],shopTabs:[],ui:{},useLandingFeedback:()=>({showFeature(){}})};
 const screens=loadUI('src/features/marketplace/screens/CommunicationScreens.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '@react-navigation/native':{useIsFocused:()=>state.focused!==false},
  '../../../shared/components/landing/LandingUI':landing,
  '../hooks/useMarketData':{useMarketData:(op,input)=>{state.reads.push({op,input});return {data:state.data,busy:state.busy,error:state.error,refresh:()=>state.refresh()};}},
  '../services/marketApi':{marketApi:async(op,input)=>{if(op==='notifications'){state.reads.push({op,input});return state.notificationApi?state.notificationApi(input):state.data;}state.calls.push({op,input});return state.api(op,input);}},
 });
 const navigation={navigate:(...args)=>state.navigations.push(args)};return {state,screens,navigation};
}
const text=tree=>tree.root.findAllByType('Text').map(x=>Array.isArray(x.props.children)?x.props.children.join(''):x.props.children).join('\n');
const buttons=(tree,title)=>tree.root.findAllByType('Pressable').filter(x=>x.findAllByType('Text').some(t=>t.props.children===title));
async function mount(Screen,props){let tree;await act(async()=>{tree=Renderer.create(React.createElement(Screen,props));});return tree;}
test('receipt UI presents issued accounting snapshots and participant identities, and navigates by identifier',async()=>{
 const {state,screens,navigation}=setup(),props={navigation,route:{params:{id:'attempt-1',balanceDueCents:0}}},tree=await mount(screens.ReceiptDetailScreen,props);
 assert.deepEqual(state.reads.at(-1),{op:'receipt',input:{id:'attempt-1'}});assert.match(text(tree),/SIMULATED \/ TEST/);assert.match(text(tree),/NOT REAL PAYMENT/);assert.match(text(tree),/Test Customer/);assert.match(text(tree),/Test Shop/);assert.match(text(tree),/This simulated payment: R25.00 ZAR/);assert.match(text(tree),/Paid after this payment: R25.00/);assert.match(text(tree),/Balance after this payment: R75.00/);assert.match(text(tree),/Prepare and paint/);assert.match(text(tree),/Labour: R100.00/);assert.match(text(tree),/SAST/);
 await act(async()=>buttons(tree,'View related booking')[0].props.onPress());assert.deepEqual(state.navigations,[['BookingDetail',{id:'booking-1'}]]);assert.equal(state.calls.length,0);
 state.data={receipt:{...receipt,historicalSnapshotUnavailable:true,compatibilityNotice:'Historical balance snapshots were not recorded.',balanceDueCentsAfter:null,paidCentsAfter:null,totalCents:null,method:null}};
 await act(async()=>tree.update(React.createElement(screens.ReceiptDetailScreen,props)));assert.match(text(tree),/Historical balance snapshots were not recorded/);assert.doesNotMatch(text(tree),/Balance after this payment|Paid after this payment/);assert.match(text(tree),/Method: Not recorded/);
 state.auth={...state.auth,offline:true};await act(async()=>tree.update(React.createElement(screens.ReceiptDetailScreen,props)));assert.doesNotMatch(text(tree),/Test Customer/);assert.equal(buttons(tree,'Refresh receipt')[0].props.disabled,true);
 state.auth={...state.auth,offline:false};state.data=null;state.error='Receipt not found.';await act(async()=>tree.update(React.createElement(screens.ReceiptDetailScreen,props)));assert.match(text(tree),/Receipt not found/);await act(async()=>tree.unmount());
});
test('notification UI paginates without losing history, marks read through the API, retries errors and navigates to receipt',async()=>{
 const {state,screens,navigation}=setup({data:{items:[notification('n1')],cursor:'next'}}),props={navigation},tree=await mount(screens.NotificationsScreen,props);
 assert.match(text(tree),/Newest first/);assert.match(text(tree),/Unread/);
 state.api=async()=>{throw Error('Connection interrupted');};await act(async()=>buttons(tree,'Mark as read')[0].props.onPress());assert.match(text(tree),/Connection interrupted/);assert.equal(buttons(tree,'Mark as read').length,1);
 state.api=async()=>({read:true});await act(async()=>buttons(tree,'Mark as read')[0].props.onPress());assert.deepEqual(state.calls.at(-1),{op:'notificationRead',input:{id:'n1'}});assert.equal(buttons(tree,'Mark as read').length,0);assert.match(text(tree),/Read/);
 await act(async()=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityHint==='Opens the related record').props.onPress());assert.deepEqual(state.navigations,[['ReceiptDetail',{id:'attempt-1'}]]);
 state.data={items:[notification('n2',{title:'Earlier appointment confirmed',readAt:999,target:{type:'booking',id:'booking-1'}})],cursor:null};
 await act(async()=>buttons(tree,'Load more notifications')[0].props.onPress());assert.equal(state.reads.at(-1).input.cursor,'next');assert.match(text(tree),/Simulated payment successful/);assert.match(text(tree),/Earlier appointment confirmed/);assert.equal(buttons(tree,'Load more notifications').length,0);
 state.data={items:[],cursor:null};state.auth={...state.auth,user:{uid:'other'}};await act(async()=>tree.update(React.createElement(screens.NotificationsScreen,props)));assert.match(text(tree),/No notifications yet/);assert.doesNotMatch(text(tree),/Earlier appointment confirmed|Simulated payment successful/);assert.equal(state.reads.at(-1).input.cursor,null);
 let finish;state.notificationApi=()=>new Promise(resolve=>{finish=resolve;});await act(async()=>buttons(tree,'Refresh notifications')[0].props.onPress());assert.match(text(tree),/Loading/);assert.equal(buttons(tree,'Refresh notifications')[0].props.disabled,true);await act(async()=>finish({items:[],cursor:null}));await act(async()=>tree.unmount());
});
test('notification targets map to registered participant routes and reject unknown or malformed targets',()=>{
 const {screens}=setup(),target=screens.notificationDestination;
 for(const role of ['owner','shop']){assert.deepEqual(target({target:{type:'booking',id:'b'}},role),['BookingDetail',{id:'b'}]);assert.deepEqual(target({target:{type:'receipt',id:'p'}},role),['ReceiptDetail',{id:'p'}]);assert.deepEqual(target({bookingId:'legacy'},role),['BookingDetail',{id:'legacy'}]);}
 assert.deepEqual(target({target:{type:'quotation',id:'request'}},'owner'),['QuoteComparison',{id:'request'}]);assert.deepEqual(target({target:{type:'request',id:'request'}},'shop'),['ShopRequest',{id:'request'}]);assert.equal(target({target:{type:'admin',id:'b'}},'owner'),null);assert.equal(target({target:{type:'booking',id:'../private'}},'owner'),null);
});
test('notifications suppress stale updates after account switch during an in-flight read mutation',async()=>{
 let resolve;const {state,screens,navigation}=setup({data:{items:[notification('n1')],cursor:null},api:()=>new Promise(r=>{resolve=r;})}),props={navigation},tree=await mount(screens.NotificationsScreen,props);
 await act(async()=>buttons(tree,'Mark as read')[0].props.onPress());state.auth={...state.auth,user:{uid:'new-owner'}};state.data={items:[notification('n1')],cursor:null};await act(async()=>tree.update(React.createElement(screens.NotificationsScreen,props)));await act(async()=>resolve({read:true}));assert.equal(buttons(tree,'Mark as read').length,1);await act(async()=>tree.unmount());
});

test('notification first-page refresh keeps newer arrivals above retained older history',async()=>{
 const {state,screens,navigation}=setup({data:{items:[notification('n1',{title:'Original update'})],cursor:null}}),props={navigation},tree=await mount(screens.NotificationsScreen,props);
 state.data={items:[notification('n2',{title:'New arrival',createdAt:2000}),notification('n1',{title:'Original update'})],cursor:null};await act(async()=>buttons(tree,'Refresh notifications')[0].props.onPress());
 const content=text(tree);assert.ok(content.indexOf('New arrival')<content.indexOf('Original update'));assert.equal(content.match(/Original update/g).length,1);await act(async()=>tree.unmount());
});


const events=(high,low)=>Array.from({length:high-low+1},(_,i)=>notification('event-'+(high-i),{title:'Notification '+(high-i),createdAt:(high-i)*1000}));
const displayed=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).filter(value=>typeof value==='string'&&value.startsWith('Notification ')).map(value=>value.slice('Notification '.length));
const sequence=(high,low)=>Array.from({length:high-low+1},(_,i)=>String(high-i));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function press(tree,title){await act(async()=>buttons(tree,title)[0].props.onPress());}
async function renderAgain(tree,Screen,navigation){await act(async()=>tree.update(React.createElement(Screen,{navigation})));}

test('exact 121-81 regression: first-page revalidation and gap pagination display server chronology',async()=>{
 const {state,screens,navigation}=setup({data:{items:events(100,81),cursor:'event-81'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 assert.deepEqual(displayed(tree),sequence(100,81));
 // Returning from a related screen revalidates the first page after 21 arrivals.
 state.focused=false;await renderAgain(tree,screens.NotificationsScreen,navigation);
 state.data={items:events(121,102),cursor:'event-102'};state.focused=true;await renderAgain(tree,screens.NotificationsScreen,navigation);
 assert.deepEqual(displayed(tree),sequence(121,102));
 state.data={items:events(101,82),cursor:'event-82'};await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),sequence(121,82));
 state.data={items:events(81,62),cursor:'event-62'};await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),sequence(121,62));
 state.data={items:events(61,61),cursor:null};await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),sequence(121,61));assert.equal(buttons(tree,'Load more notifications').length,0);
 await act(async()=>tree.unmount());
});

test('multiple pages of new arrivals and repeated refreshes restart a contiguous ordered history',async()=>{
 const {state,screens,navigation}=setup({data:{items:events(100,81),cursor:'event-81'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 for(const high of [150,200,225]){
  state.data={items:events(high,high-19),cursor:'event-'+(high-19)};await press(tree,'Refresh notifications');
  assert.deepEqual(displayed(tree),sequence(high,high-19));
  for(let pageHigh=high-20;pageHigh>=81;pageHigh-=20){
   const low=Math.max(81,pageHigh-19);state.data={items:events(pageHigh,low),cursor:low>81?'event-'+low:null};await press(tree,'Load more notifications');
   assert.deepEqual(displayed(tree),sequence(high,low));assert.equal(new Set(displayed(tree)).size,displayed(tree).length);
  }
 }
 await act(async()=>tree.unmount());
});

test('overlapping and duplicate notification pages keep one row per identity in backend order',async()=>{
 const first=events(10,8);const {state,screens,navigation}=setup({data:{items:[...first,first[1]],cursor:'event-8'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 assert.deepEqual(displayed(tree),sequence(10,8));
 const next=events(9,5);state.data={items:[...next,next[2]],cursor:null};await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),sequence(10,5));
 await act(async()=>tree.unmount());
});

test('equal timestamps preserve descending document-ID ties across overlapping pages',async()=>{
 const row=id=>notification(id,{title:'Notification '+id,createdAt:1000});
 const {state,screens,navigation}=setup({data:{items:[row('z'),row('m')],cursor:'m'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 state.data={items:[row('m'),row('a')],cursor:null};await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),['z','m','a']);
 // Different Firestore nanoseconds can serialize to the same millisecond.
 // The authoritative page order must survive even when IDs ascend locally.
 state.data={items:[row('a'),row('z')],cursor:null};await press(tree,'Refresh notifications');
 assert.deepEqual(displayed(tree),['a','z']);
 await act(async()=>tree.unmount());
});

test('refresh during an older page request ignores stale success and stale failure in either completion order',async()=>{
 for(const lateFailure of [false,true])for(const oldFinishesFirst of [false,true]){
  const old=deferred(),fresh=deferred();
  const {state,screens,navigation}=setup({data:{items:events(100,81),cursor:'event-81'}}),tree=await mount(screens.NotificationsScreen,{navigation});
  state.notificationApi=({cursor})=>cursor?old.promise:fresh.promise;
  await press(tree,'Load more notifications');assert.ok(!buttons(tree,'Refresh notifications')[0].props.disabled);
  await press(tree,'Refresh notifications');
  const completeOld=async()=>{await act(async()=>lateFailure?old.reject(Error('Stale page failure')):old.resolve({items:events(80,61),cursor:'stale-cursor'}));};
  if(oldFinishesFirst){await completeOld();assert.deepEqual(displayed(tree),sequence(100,81));assert.equal(buttons(tree,'Refresh notifications')[0].props.disabled,true);}
  await act(async()=>fresh.resolve({items:events(121,102),cursor:'event-102'}));
  if(!oldFinishesFirst)await completeOld();
  assert.deepEqual(displayed(tree),sequence(121,102));assert.doesNotMatch(text(tree),/Stale page failure/);
  state.notificationApi=()=>({items:events(101,82),cursor:null});await press(tree,'Load more notifications');
  assert.deepEqual(displayed(tree),sequence(121,82));
  await act(async()=>tree.unmount());
 }
});

test('read state survives refresh, overlapping unread snapshots and loading historical pages again',async()=>{
 const read=notification('r',{title:'Notification read',readAt:500}),unread=notification('u',{title:'Notification unread'});
 const {state,screens,navigation}=setup({data:{items:[read,unread],cursor:'u'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 assert.equal(buttons(tree,'Mark as read').length,1);await press(tree,'Mark as read');assert.equal(buttons(tree,'Mark as read').length,0);
 state.data={items:[{...read,readAt:null},unread],cursor:'u'};await press(tree,'Refresh notifications');assert.equal(buttons(tree,'Mark as read').length,0);assert.deepEqual(displayed(tree),['read','unread']);
 state.data={items:[unread,notification('older',{title:'Notification older',createdAt:0,readAt:400})],cursor:null};await press(tree,'Load more notifications');assert.equal(buttons(tree,'Mark as read').length,0);assert.deepEqual(displayed(tree),['read','unread','older']);
 state.data={items:[notification('new',{title:'Notification new',createdAt:2000,readAt:600})],cursor:'new'};await press(tree,'Refresh notifications');assert.deepEqual(displayed(tree),['new']);
 state.data={items:[read,unread],cursor:null};await press(tree,'Load more notifications');assert.deepEqual(displayed(tree),['new','read','unread']);assert.equal(buttons(tree,'Mark as read').length,0);
 await act(async()=>tree.unmount());
});

test('failed pagination retries the same cursor without losing or duplicating displayed history',async()=>{
 const {state,screens,navigation}=setup({data:{items:events(10,8),cursor:'event-8'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 state.notificationApi=()=>{throw Error('Temporary page failure');};await press(tree,'Load more notifications');assert.match(text(tree),/Temporary page failure/);assert.deepEqual(displayed(tree),sequence(10,8));
 state.notificationApi=()=>({items:events(7,5),cursor:null});await press(tree,'Load more notifications');assert.deepEqual(displayed(tree),sequence(10,5));assert.equal(state.reads.at(-1).input.cursor,'event-8');
 await act(async()=>tree.unmount());
});


test('a failed first-page refresh keeps the last valid history and permits pagination retry',async()=>{
 const old=deferred(),fresh=deferred();
 const {state,screens,navigation}=setup({data:{items:events(10,8),cursor:'event-8'}}),tree=await mount(screens.NotificationsScreen,{navigation});
 state.notificationApi=({cursor})=>cursor?old.promise:fresh.promise;
 await press(tree,'Load more notifications');await press(tree,'Refresh notifications');
 await act(async()=>fresh.reject(Error('Refresh interrupted')));assert.deepEqual(displayed(tree),sequence(10,8));assert.match(text(tree),/Refresh interrupted/);
 await act(async()=>old.resolve({items:events(7,5),cursor:'obsolete'}));assert.deepEqual(displayed(tree),sequence(10,8));
 state.notificationApi=()=>({items:events(7,5),cursor:null});await press(tree,'Load more notifications');
 assert.deepEqual(displayed(tree),sequence(10,5));assert.equal(state.reads.at(-1).input.cursor,'event-8');
 await act(async()=>tree.unmount());
});
