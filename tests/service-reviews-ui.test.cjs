const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const booking={id:'booking',shopName:'Synthetic Workshop',requestTitle:'Paint repair',status:'confirmed',serviceStatus:'completed',serviceCompletedAt:1};
const text=tree=>tree.root.findAllByType('Text').map(node=>[node.props.children].flat().filter(v=>typeof v==='string'||typeof v==='number').join('')).join('\n');
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const field=tree=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Written review');
const press=(tree,label)=>act(async()=>{const target=button(tree,label);assert.ok(target,label);await target.props.onPress();});
function setup(platform='web',width=320,mode='dark'){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={uid:'owner',offline:false,focused:true,calls:[],own:{review:null,eligible:true},pages:{first:{items:[],cursor:null,summary:{average:null,count:0}}}};
 const mocks={
  'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:844,fontScale:1,scale:1})},
  '@react-navigation/native':{useIsFocused:()=>state.focused},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:state.uid},profile:{role:'owner'},offline:state.offline})},
  '../services/serviceReviewsApi':{serviceReviewsApi:async(op,input)=>{state.calls.push([op,input]);if(state.api)return state.api(op,input);return op==='bookingReview'?state.own:op==='workshopReviews'?state.pages[input.cursor||'first']:{id:'hash'};}},
 };
 return {state,ui:loadUI('src/features/marketplace/components/ServiceReviews.js',mocks),mocks};
}
async function mount(Component,props,run){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await run(tree,()=>act(async()=>tree.update(React.createElement(Component,props))));}finally{await act(async()=>tree.unmount());}}
test('Android/web reviews select yellow stars before enabling text, validate, cancel and submit once',async()=>{
 for(const [platform,width,mode] of [['web',320,'dark'],['web',1440,'light'],['android',390,'dark']]){
  const s=setup(platform,width,mode);let release;
  await mount(s.ui.BookingReview,{booking},async tree=>{
   await press(tree,'Rate & Review Workshop');assert.equal(field(tree).props.editable,false);
   await press(tree,'Submit review');assert.match(text(tree),/Select a star rating first/);
   await press(tree,'Rate 4 out of 5');assert.equal(field(tree).props.editable,true);assert.match(text(tree),/4 out of 5/);
   const filled=tree.root.findAllByType('Icon').filter(node=>node.props.name==='star');assert.equal(filled.length,4);assert.ok(filled.every(node=>node.props.color==='#FACC15'));
   assert.ok(button(tree,'Rate 4 out of 5').props.accessibilityState.selected);
   await act(async()=>field(tree).props.onChangeText('Short'));await press(tree,'Submit review');assert.match(text(tree),/20–2,000/);
   await press(tree,'Cancel review');assert.ok(!button(tree,'Submit review'));
   await press(tree,'Rate & Review Workshop');await act(async()=>field(tree).props.onChangeText('  Excellent paintwork and very clear communication.  '));
   s.state.api=async(op,input)=>op==='reviewSubmit'?new Promise(resolve=>{release=resolve;}):s.state.own;
   await act(async()=>{const action=button(tree,'Submit review').props.onPress;action();action();});
   assert.equal(s.state.calls.filter(([op])=>op==='reviewSubmit').length,1);assert.equal(button(tree,'Submit review').props.disabled,true);
   await act(async()=>release({id:'hash'}));assert.match(text(tree),/Thank you/);assert.ok(button(tree,'View Your Review'));assert.ok(!button(tree,'Rate & Review Workshop'));
   await press(tree,'View Your Review');assert.match(text(tree),/Excellent paintwork/);
   const submitted=s.state.calls.find(([op])=>op==='reviewSubmit')[1];assert.deepEqual(submitted,{id:'booking',rating:4,text:'Excellent paintwork and very clear communication.'});
  });
 }
});
test('failed review submissions preserve the draft for retry and loading/error/eligibility states are honest',async()=>{
 const s=setup();await mount(s.ui.BookingReview,{booking},async tree=>{
  await press(tree,'Rate & Review Workshop');await press(tree,'Rate 1 out of 5');await act(async()=>field(tree).props.onChangeText('The service communication could have been much clearer.'));
  s.state.api=async(op)=>{if(op==='reviewSubmit')throw Error('Network unavailable');return s.state.own;};
  await press(tree,'Submit review');assert.match(text(tree),/Network unavailable/);assert.ok(field(tree).props.value.includes('communication'));assert.equal(button(tree,'Submit review').props.disabled,false);
  s.state.api=null;await press(tree,'Submit review');assert.ok(button(tree,'View Your Review'));
 });
 const ineligible=setup();ineligible.state.own.eligible=false;await mount(ineligible.ui.BookingReview,{booking},async tree=>{assert.ok(!button(tree,'Rate & Review Workshop'));assert.match(text(tree),/after an eligible service/);});
 const broken=setup();broken.state.api=async()=>{throw Error('Reviews unavailable');};await mount(broken.ui.BookingReview,{booking},async tree=>{assert.match(text(tree),/Reviews unavailable/);assert.ok(button(tree,'Retry loading review'));});
});
test('existing review and workshop notification destination expose the review without edit controls',async()=>{
 const s=setup();s.state.own={review:{rating:2,text:'The service communication could have been clearer.',status:'visible',createdAt:0},eligible:true};
 await mount(s.ui.BookingReview,{booking},async tree=>{assert.ok(!button(tree,'Rate & Review Workshop'));await press(tree,'View Your Review');assert.match(text(tree),/2 out of 5/);assert.ok(!field(tree));});
 await mount(s.ui.WorkshopBookingReview,{booking},async tree=>{assert.match(text(tree),/communication could have been clearer/);assert.ok(!button(tree,'Submit review'));});
 const {notificationDestination}=loadUI('src/features/marketplace/utils/notificationPresentation.js');
 assert.deepEqual(notificationDestination({target:{type:'booking',id:'booking'},event:'service_review_created'},'shop'),['BookingDetail',{id:'booking'}]);
});
test('workshop history presents real ratings, pagination, privacy-safe identity and refresh/empty/error states',async()=>{
 const s=setup();s.state.pages.first={items:[{id:'hash1',rating:5,text:'Careful synthetic paintwork and clear communication.',customerName:'Verified customer',createdAt:0,serviceCategory:'Paint'}],cursor:'hash1',summary:{average:4.5,count:2}};
 s.state.pages.hash1={items:[{id:'hash2',rating:4,text:'Another genuine service experience at the workshop.'}],cursor:null,summary:{average:4.5,count:2}};
 await mount(s.ui.WorkshopReviews,{shopId:'shop'},async tree=>{
  assert.match(text(tree),/4.5 \/ 5/);assert.match(text(tree),/2 verified reviews/);assert.match(text(tree),/Verified customer/);assert.match(text(tree),/1970/);
  await press(tree,'Load more reviews');assert.match(text(tree),/Another genuine/);assert.ok(!button(tree,'Load more reviews'));
  s.state.pages.first={items:[],cursor:null,summary:{average:null,count:0}};await press(tree,'Refresh reviews');assert.match(text(tree),/Not yet rated/);assert.doesNotMatch(text(tree),/0.0/);assert.match(text(tree),/No verified reviews yet/);
  s.state.api=async()=>{throw Error('History unavailable');};await press(tree,'Refresh reviews');assert.match(text(tree),/History unavailable/);assert.ok(button(tree,'Retry loading reviews'));
 });
});
test('changing customer identity cannot display a previous customer review',async()=>{
 const s=setup();s.state.own={review:{rating:4,text:'Private customer review shown only to its owner.'},eligible:true};
 await mount(s.ui.BookingReview,{booking},async(tree,update)=>{await press(tree,'View Your Review');assert.match(text(tree),/Private customer review/);s.state.uid='other';s.state.own={review:null,eligible:false};await update();assert.doesNotMatch(text(tree),/Private customer review/);assert.ok(!button(tree,'View Your Review'));});
});

test('same-booking evidence changes, explicit refresh and navigation focus reconcile eligibility without bypassing server reasons',async()=>{
 const s=setup(),props={booking:{...booking,serviceCompletedAt:null},refreshKey:0};
 s.state.own={review:null,eligible:false,reason:'Completion evidence is missing. Contact the workshop/support.'};
 await mount(s.ui.BookingReview,props,async(tree,update)=>{
  assert.match(text(tree),/Completion evidence is missing/);assert.ok(!button(tree,'Rate & Review Workshop'));
  s.state.own={review:null,eligible:true};props.booking={...props.booking,serviceCompletedAt:123};await update();assert.ok(button(tree,'Rate & Review Workshop'));
  s.state.own={review:{rating:4,text:'Existing submitted service review remains visible.'},eligible:true};props.refreshKey++;await update();assert.ok(button(tree,'View Your Review'));assert.ok(!button(tree,'Rate & Review Workshop'));
  s.state.focused=false;await update();const reads=s.state.calls.length;s.state.focused=true;await update();assert.equal(s.state.calls.length,reads+1);assert.ok(button(tree,'View Your Review'));
 });
});

test('admin moderation requires a reason, preserves failures and provides hide/restore/reconciliation actions',async()=>{
 const s=setup(),state={data:{items:[{id:'hash1',shopId:'shop',rating:1,text:'The service communication could have been clearer.',status:'visible'}],cursor:null},calls:[],fail:false};
 const mocks={...s.mocks,
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'admin'},profile:{role:'admin'}})},
  '../services/useAdminData':{useAdminData:()=>({data:state.data,busy:false,error:'',refresh:async()=>{}})},
  '../services/adminApi':{adminError:e=>e.message,adminApi:async(op,input)=>{state.calls.push([op,input]);if(state.fail)throw Error('Moderation unavailable');if(op==='serviceReviewModerate')state.data={...state.data,items:state.data.items.map(item=>({...item,status:input.status}))};return {id:'hash1'};}},
 };
 const Screen=loadUI('src/features/admin/screens/ServiceReviewModerationScreen.js',mocks).default;
 await mount(Screen,{},async tree=>{
  await press(tree,'Moderate review hash1');await press(tree,'Hide abusive review');assert.match(text(tree),/at least 10/);assert.equal(state.calls.length,0);
  const reason=()=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Moderation reason');
  await act(async()=>reason().props.onChangeText('Investigated personal information disclosure.'));state.fail=true;await press(tree,'Hide abusive review');assert.match(text(tree),/Moderation unavailable/);assert.ok(reason().props.value);
  state.fail=false;await press(tree,'Hide abusive review');assert.match(text(tree),/hidden/);
  await press(tree,'Moderate review hash1');await act(async()=>reason().props.onChangeText('Investigation found that this review is legitimate.'));await press(tree,'Restore review');assert.match(text(tree),/visible/);
  await press(tree,'Moderate review hash1');await act(async()=>reason().props.onChangeText('Routine consistency investigation of rating totals.'));await press(tree,'Reconcile workshop rating totals');assert.equal(state.calls.at(-1)[0],'serviceReviewReconcile');assert.equal(state.calls.at(-1)[1].shopId,'shop');
 });
});
