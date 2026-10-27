const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const vehicle={id:'car',make:'Toyota',model:'Corolla',year:2024,colour:'White',registration:'PRIVATE001',archived:false};
const request={id:'request',version:4,termsVersion:3,vehicleId:vehicle.id,vehicle,categoryId:'paint',categoryName:'Paint',title:'Paint the doors',description:'Repair and paint both front doors.',city:'Pretoria',budgetMinCents:50000,budgetMaxCents:100000,preferredDate:'',visibility:'open',status:'open',photoIds:[],quotationCount:0};
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join('\n');
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const input=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());
const change=(tree,label,value)=>act(async()=>input(tree,label).props.onChangeText(value));
const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
function setup({width=390,fontScale=1,mode='dark',platform='web'}={}){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={auth:{user:{uid:'owner'},profile:{role:'owner'},offline:false},items:[request],request,quotes:[],busy:false,error:'',calls:[],moves:[],reads:[],refreshes:0};
 const screens=loadUI('src/features/marketplace/screens/OwnerMarketplaceScreens.js',{
  'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:1000,fontScale,scale:1})},
  '@react-navigation/native':{useIsFocused:()=>true,usePreventRemove:(enabled,callback)=>{state.preventRemove=enabled;state.beforeRemove=callback;}},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text',LandingShell:({children})=>React.createElement('View',null,children),ownerTabs:[],shopTabs:[],useLandingFeedback:()=>({})},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
  '../components/PhotoGallery':props=>React.createElement('PhotoGallery',props),
  '../components/PrivatePhoto':props=>React.createElement('PrivatePhoto',props),
  '../components/RequestPhotoUploads':props=>React.createElement('RequestPhotoUploads',props),
  '../components/AIAssistButton':props=>React.createElement('AIAssist',props),
  '../hooks/useMarketData':{useMarketData:(op,params)=>{
   state.reads.push({op,params});
   const data=state.noData?null:op==='requests'?{items:state.items,cursor:null}:op==='request'?{request:state.request,quotes:state.quotes,quotesCursor:null}:{items:op==='vehicles'?[vehicle]:op==='categories'?[{id:'paint',name:'Paint'}]:[{id:'shop',shopName:'Local workshop',city:'Pretoria'}],cursor:null};
   return {data,busy:state.busy,error:state.error,refresh:async()=>{state.refreshes++;}};
  }},
  '../services/marketApi':{marketApi:async(op,data)=>{state.calls.push({op,data});return state.reply?state.reply(op,data):{id:request.id};}},
 });
 const navigation={navigate:(...args)=>state.moves.push(['navigate',...args]),replace:(...args)=>state.moves.push(['replace',...args]),dispatch:action=>state.moves.push(['dispatch',action]),canGoBack:()=>true,goBack:()=>{if(state.preventRemove)state.beforeRemove({data:{action:{type:'GO_BACK'}}});else state.moves.push(['back']);}};
 return {state,screens,navigation,palette:palettes[mode]};
}
async function mount(s,name,params,run){let tree;const props={navigation:s.navigation,route:{params:params||{}}};await act(async()=>{tree=create(React.createElement(s.screens[name],props));});const update=()=>act(async()=>tree.update(React.createElement(s.screens[name],props)));try{await run(tree,update);}finally{await act(async()=>tree.unmount());}}

test('request cards show actual status, vehicle and description before the supplied response count and supported actions',async()=>{
 const s=setup();s.state.items=[{...request,quotationCount:2,photoIds:['photo']}];await mount(s,'OwnerRequestsScreen',{},async tree=>{
  assert.match(text(tree),/My Requests/);assert.doesNotMatch(text(tree),/PRIVATE001/);
  const card=tree.root.findByProps({testID:'customer-request-request'}),words=card.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join('\n');
  const values=['Paint the doors','Open for quotations','2024 Toyota Corolla',request.description,'2 submitted quotations','View request'];let previous=-1;
  for(const value of values){const index=words.indexOf(value);assert.ok(index>previous,value);previous=index;}
  const photo=tree.root.findByType('PrivatePhoto');assert.equal(photo.props.target,'request');assert.equal(photo.props.id,request.id);
  await press(tree,'View Paint the doors');await press(tree,'Edit Paint the doors');await press(tree,'View quotations for Paint the doors');
  assert.deepEqual(s.state.moves,[['navigate','OwnerRequest',{id:request.id}],['navigate','RequestForm',{request:s.state.items[0]}],['navigate','QuoteComparison',{id:request.id}]]);
  assert.ok(s.state.reads.some(x=>x.op==='requests'));assert.ok(s.state.reads.filter(x=>x.op==='requests').every(x=>x.params.feed==='mine'&&Object.keys(x.params).sort().join(',')==='cursor,feed'));
 });
});

test('listing never infers counts, unknown statuses or missing vehicle/photo data',async()=>{
 const s=setup();s.state.items=[{...request,vehicle:null,status:'unsupported',quotationCount:undefined}];await mount(s,'OwnerRequestsScreen',{},async tree=>{
  assert.match(text(tree),/Vehicle details unavailable/);assert.match(text(tree),/Status unavailable/);assert.doesNotMatch(text(tree),/0 submitted|undefined|Closed request/);
  assert.equal(button(tree,'Edit Paint the doors'),undefined);assert.equal(button(tree,'View quotations for Paint the doors'),undefined);assert.equal(tree.root.findAllByType('PrivatePhoto').length,0);
 });
});

test('empty, loading, failed and offline lists never fabricate success or an empty Garage and retain safe account-scoped records',async()=>{
 const s=setup();s.state.items=[];await mount(s,'OwnerRequestsScreen',{},async(tree,update)=>{
  assert.match(text(tree),/No requests yet/);await press(tree,'New request');assert.deepEqual(s.state.moves,[['navigate','RequestForm']]);
  s.state.error='Requests unavailable';await update();assert.doesNotMatch(text(tree),/No requests yet/);assert.match(text(tree),/Requests unavailable/);
  await press(tree,'Refresh requests');assert.equal(s.state.refreshes,1);
  s.state.error='';s.state.noData=true;s.state.busy=true;await update();assert.match(text(tree),/Loading your requests/);
  s.state.noData=false;s.state.busy=false;s.state.items=[request];await update();s.state.auth.offline=true;await update();assert.match(text(tree),/Paint the doors/);assert.equal(button(tree,'View Paint the doors').props.disabled,true);
  s.state.auth.user={uid:'other-owner'};s.state.noData=true;await update();assert.doesNotMatch(text(tree),/Paint the doors/);
 });
});

test('request layout and bottom navigation remain bounded outside the scroll content at 390, 768 and 1440 with text scaling',async()=>{
 for(const [width,fontScale] of [[390,1],[768,1],[1440,1],[1440,1.6]]){
  const s=setup({width,fontScale});await mount(s,'OwnerRequestsScreen',{},async tree=>{
   const grid=tree.root.findByProps({testID:'customer-request-grid'}),wrapper=grid.children[0];
   assert.equal(flat(wrapper.props.style).width,width===390||fontScale>=1.4?'100%':width===768?351:487);
   await act(async()=>grid.props.onLayout({nativeEvent:{layout:{width:358}}}));assert.equal(flat(wrapper.props.style).width,'100%');
   const tabs=tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab');assert.deepEqual(tabs.map(n=>n.props.accessibilityLabel),['Discover','Garage','My Requests','Bookings','Profile']);assert.equal(button(tree,'My Requests').props.accessibilityState.selected,true);
   assert.equal(tree.root.findByType('ScrollView').findAll(n=>n.props.accessibilityRole==='tablist').length,0);assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,['top','bottom','left','right']);
  });
 }
});

test('both theme action states retain focus, hover, pressed feedback and disabled navigation',async()=>{
 for(const mode of ['light','dark']){
  const s=setup({mode});await mount(s,'OwnerRequestsScreen',{},async(tree,update)=>{
   const action=()=>button(tree,'View Paint the doors'),style=()=>flat(action().props.style({pressed:false}));assert.ok(style().minHeight>=48);
   await act(async()=>action().props.onHoverIn({}));assert.ok(style().opacity<1);await act(async()=>action().props.onFocus({}));assert.equal(style().outlineColor,s.palette.accent);assert.equal(style().outlineWidth,2);
   assert.equal(flat(action().props.style({pressed:true})).opacity,.72);s.state.auth.offline=true;await update();await press(tree,'View Paint the doors');assert.deepEqual(s.state.moves,[]);
  });
 }
});

test('detail actions respect open, closed, booked and unknown states without changing quotation or booking destinations',async()=>{
 for(const status of ['open','closed','booked','unsupported']){
  const s=setup();s.state.request={...request,status,...(status==='booked'?{bookingId:'booking'}:{})};await mount(s,'OwnerRequestScreen',{id:request.id},async tree=>{
   assert.equal(!!button(tree,'Edit request'),status==='open');assert.equal(!!button(tree,'Close request'),status==='open');assert.equal(!!button(tree,'Compare quotes'),status==='open');assert.match(text(tree),/No photos attached/);assert.doesNotMatch(text(tree),/PRIVATE001/);
   if(status==='open'){await press(tree,'Close request');await press(tree,'Cancel');assert.equal(s.state.calls.length,0);await press(tree,'Close request');await press(tree,'Confirm');assert.deepEqual(s.state.calls,[{op:'requestClose',data:{id:request.id}}]);}
   if(status==='booked'){await press(tree,'View booking');assert.deepEqual(s.state.moves,[['navigate','BookingDetail',{id:'booking'}]]);}
  });
 }
});

test('read-only photo detail is ID-scoped and missing/error responses never present invented quotations',async()=>{
 const s=setup();s.state.request={...request,photoIds:['photo'],quotationCount:undefined};await mount(s,'OwnerRequestScreen',{id:request.id},async(tree,update)=>{
  const gallery=tree.root.findByType('PhotoGallery');assert.equal(gallery.props.target,'request');assert.equal(gallery.props.id,request.id);assert.notEqual(gallery.props.editable,true);
  s.state.noData=true;s.state.error='Not authorised';await update();assert.equal(tree.root.findAllByType('PhotoGallery').length,0);assert.doesNotMatch(text(tree),/No quotations yet/);
 });
});

test('create and edit guard changed drafts, preserve failed data and lock duplicate saves until acknowledgement',async()=>{
 const s=setup();let reject;s.state.reply=()=>new Promise((_,r)=>{reject=r;});
 await mount(s,'RequestFormScreen',{request},async tree=>{
  await change(tree,'Description','Paint both doors blue.');await press(tree,'Cancel request changes');assert.match(text(tree),/Discard request changes/);await press(tree,'Keep editing');assert.equal(input(tree,'Description').props.value,'Paint both doors blue.');
  let first,second;const save=button(tree,'Save request').props.onPress;await act(async()=>{first=save();second=save();});assert.equal(s.state.calls.length,1);assert.equal(s.state.calls[0].data.version,4);assert.equal(button(tree,'Save request').props.disabled,true);
  await act(async()=>{reject(Error('Request changed. Refresh before saving.'));await Promise.all([first,second]);});assert.equal(input(tree,'Description').props.value,'Paint both doors blue.');assert.equal(s.state.moves.length,0);
  s.state.reply=async()=>({id:request.id});await press(tree,'Save request');assert.deepEqual(s.state.moves,[['replace','OwnerRequest',{id:request.id}]]);assert.equal(s.state.preventRemove,false);
 });
});

test('closed edits and archived vehicle preselection cannot expose a working submit path',async()=>{
 const s=setup();await mount(s,'RequestFormScreen',{request:{...request,status:'closed'}},async tree=>{assert.equal(button(tree,'Save request'),undefined);assert.match(text(tree),/can no longer be edited/);});
 await mount(s,'RequestFormScreen',{vehicleId:vehicle.id,vehicle:{...vehicle,archived:true}},async tree=>{assert.equal(tree.root.findAllByType('PhotoGallery').length,0);assert.equal(button(tree,'Submit request').props.disabled,true);});
});

test('AI Apply is explicit and changes only supported suggestion fields; attachment IDs and request terms stay intact',async()=>{
 const s=setup(),original={...request,photoIds:['existing'],mandatoryServices:['Retain finish'],serviceLocation:{latitude:-26.1,longitude:28.1}};
 await mount(s,'RequestFormScreen',{request:original},async tree=>{
  const ai=tree.root.findByType('AIAssist');assert.equal(ai.props.description,request.description);assert.equal(s.state.calls.length,0);
  await act(async()=>ai.props.onApply({title:'Door paint request',description:'Please paint both doors.',category:{id:'paint',name:'Paint'}}));assert.equal(s.state.calls.length,0);assert.deepEqual(tree.root.findByType('PhotoGallery').props.selectedIds,['existing']);
  await press(tree,'Save request');assert.equal(s.state.calls[0].data.title,'Door paint request');assert.deepEqual(s.state.calls[0].data.mandatoryServices,original.mandatoryServices);assert.deepEqual(s.state.calls[0].data.serviceLocation,original.serviceLocation);assert.equal(s.state.calls[0].data.budgetMaxCents,100000);
 });
});

test('validation appears after interaction, and account changes discard drafts and late save navigation',async()=>{
 const s=setup();await mount(s,'RequestFormScreen',{},async tree=>{assert.doesNotMatch(text(tree),/Title is required/);await act(async()=>input(tree,'Request title').props.onBlur());assert.match(text(tree),/Title is required/);await press(tree,'Show required fields');assert.match(text(tree),/Vehicle is required/);});
 let resolve;s.state.reply=()=>new Promise(r=>{resolve=r;});await mount(s,'RequestFormScreen',{request},async(tree,update)=>{
  await change(tree,'Description','Unsaved blue finish');let pending;await act(async()=>{pending=button(tree,'Save request').props.onPress();});s.state.auth.user={uid:'other-owner'};await update();assert.equal(input(tree,'Description').props.value,request.description);await act(async()=>{resolve({id:request.id});await pending;});assert.equal(s.state.moves.length,0);
 });
});

test('a photo preview alone protects an otherwise unchanged Garage request draft until explicitly cancelled',async()=>{
 const s=setup();await mount(s,'RequestFormScreen',{vehicleId:vehicle.id,vehicle},async tree=>{
  assert.equal(s.state.preventRemove,false);const uploads=tree.root.findByType('RequestPhotoUploads');
  await act(async()=>uploads.props.onDraftChange(true));await press(tree,'Cancel request changes');assert.match(text(tree),/Discard request changes/);assert.equal(s.state.calls.length,0);
  await press(tree,'Keep editing');await act(async()=>uploads.props.onDraftChange(false));assert.equal(s.state.preventRemove,false);await press(tree,'Cancel request changes');assert.deepEqual(s.state.moves,[['back']]);
 });
 await mount(s,'RequestFormScreen',{request},async tree=>{
  const uploads=tree.root.findByType('RequestPhotoUploads');await act(async()=>uploads.props.onDraftChange(true));assert.equal(button(tree,'Save request').props.disabled,true);await press(tree,'Save request');assert.equal(s.state.calls.length,0);assert.match(text(tree),/Upload or cancel your selected photo/);
  await act(async()=>uploads.props.onDraftChange(false));assert.equal(button(tree,'Save request').props.disabled,false);
 });
});
