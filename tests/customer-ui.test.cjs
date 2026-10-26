const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,title)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===title);
const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join(' ');
function setup(width=390,role='owner',mode='dark'){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={viewport:{width,height:900,fontScale:1,scale:1},auth:{user:{uid:'fixture-customer'},profile:{role},offline:false},moves:[],saves:[],feed:{items:[],busy:false,error:'',cursor:null,refresh(){},loadNext(){}}};
 const mocks={'react-native':{Platform:{OS:'web'},useWindowDimensions:()=>state.viewport},
  '@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
  '../../marketplace/hooks/usePostsFeed':{usePostsFeed:options=>{state.options=options;return state.feed;}},
  '../services/postsApi':{postsApi:async(...args)=>{state.saves.push(args);return {};},viewPostPhoto:async()=>{throw Error('No fixture media');}},
  '../../../shared/components/ProfileAvatar':()=>React.createElement('View'),
 };
 const navigation={navigate:(...args)=>state.moves.push(args),getState:()=>({index:0,routes:[{name:'Discover'}]}),canGoBack:()=>true,goBack:()=>state.moves.push(['back'])};
 return {state,mocks,navigation,load:file=>loadUI(file,mocks)};
}
async function mounted(Component,props,fn,options){let tree;await act(async()=>{tree=create(React.createElement(Component,props),options);});try{await fn(tree,()=>act(async()=>tree.update(React.createElement(Component,props))));}finally{await act(async()=>tree.unmount());}}

test('Customer grids adapt at 390, 768 and 1440 with larger text falling back to one column',()=>{
 const {customerLayout}=setup().load('src/features/customer/components/CustomerUI.js');
 for(const [width,columns,desktop] of [[390,1,false],[768,2,false],[1440,3,true]])assert.deepEqual({...customerLayout(width),cardWidth:undefined},{desktop,columns,cardWidth:undefined});
 assert.equal(customerLayout(1440,1.6).columns,1);assert.equal(customerLayout(1440,1.6).desktop,false);
});

test('measured Customer grid columns fit actual web content after scrollbar width and fractional rounding',async()=>{
 const s=setup(1440),{CustomerGrid}=s.load('src/features/customer/components/CustomerUI.js');
 await mounted(CustomerGrid,{children:[1,2,3].map(id=>React.createElement('Text',{key:id},String(id)))},async tree=>{
  const grid=tree.root.findAllByType('View').find(n=>n.props.onLayout);
  for(const [width,columns] of [[1137,3],[705,2]]){
   await act(async()=>grid.props.onLayout({nativeEvent:{layout:{width}}}));
   const cells=grid.findAllByType('View').filter(n=>typeof n.props.style?.width==='number');
   const cardWidth=cells[0].props.style.width;
   assert.ok(columns*cardWidth+(columns-1)*18<=width);
   assert.ok(width-(columns*cardWidth+(columns-1)*18)<columns);
  }
 });
});

test('Customer buttons keep hover, focus, pressed, disabled and loading states without layout motion',async()=>{
 const s=setup(),{CustomerAction}=s.load('src/features/customer/components/CustomerUI.js');
 await mounted(CustomerAction,{title:'Save vehicle',primary:true,onPress(){}},async tree=>{
  const control=button(tree,'Save vehicle'),normal=flat(control.props.style({pressed:false}));
  assert.ok(normal.minHeight>=44);assert.equal(normal.transform,undefined);
  await act(async()=>control.props.onHoverIn({}));assert.equal(flat(control.props.style({pressed:false})).opacity,.9);
  await act(async()=>control.props.onFocus({}));assert.equal(flat(control.props.style({pressed:false})).outlineWidth,2);
  assert.equal(flat(control.props.style({pressed:true})).opacity,.72);
  await act(async()=>control.props.onBlur({}));assert.equal(flat(control.props.style({pressed:false})).outlineWidth,undefined);
 });
 for(const props of [{disabled:true},{loading:true}])await mounted(CustomerAction,{title:'Save',...props},async tree=>{const control=button(tree,'Save');assert.equal(control.props.disabled,true);await act(async()=>{control.props.onFocus({});control.props.onHoverIn({});});assert.equal(flat(control.props.style({pressed:true})).outlineWidth,undefined);});
});

test('Customer fields use readable placeholder text without changing the shared field default',async()=>{
 const s=setup(),{CustomerField}=s.load('src/features/customer/components/CustomerUI.js');
 await mounted(CustomerField,{label:'Search',placeholder:'Search workshops'},async tree=>{assert.equal(tree.root.findByType('TextInput').props.placeholderTextColor,'#98989D');});
 const StandardField=s.load('src/shared/components/AppTextInput.js').default;
 await mounted(StandardField,{label:'Unchanged field'},async tree=>{assert.equal(tree.root.findByType('TextInput').props.placeholderTextColor,'#6A6A70');});
});

test('Customer shell keeps five bottom tabs at all widths, real utility destinations and route families',async()=>{
 for(const width of [390,768,1440]){
  const s=setup(width),{CustomerPage,customerActiveRoute}=s.load('src/features/customer/components/CustomerUI.js');
  assert.equal(customerActiveRoute('VehicleForm'),'Garage');assert.equal(customerActiveRoute('QuoteComparison'),'OwnerRequests');
  await mounted(CustomerPage,{title:'Discover',navigation:s.navigation},async tree=>{
   assert.equal(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,5);
   await act(async()=>button(tree,'Messages').props.onPress());await act(async()=>button(tree,'My Requests').props.onPress());
   assert.deepEqual(s.state.moves,[['Messages'],['OwnerRequests']]);
   assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,['top','bottom','left','right']);
  });
 }
 const s=setup(),{CustomerPage}=s.load('src/features/customer/components/CustomerUI.js');
 s.navigation.canGoBack=()=>false;
 await mounted(CustomerPage,{title:'Messages',activeRoute:'Messages',back:true,navigation:s.navigation},async tree=>{await act(async()=>button(tree,'Go back').props.onPress());assert.deepEqual(s.state.moves,[['Discover']]);});
});

test('Customer bottom tabs keep exact order and icons outside the scroller at phone, tablet and desktop widths',async()=>{
 const labels=['Discover','Garage','Requests','Bookings','Profile'];
 const icons=['compass-outline','car-sport-outline','document-text-outline','calendar-outline','person-outline'];
 for(const width of [390,768,1440]){
  const s=setup(width),{CustomerPage}=s.load('src/features/customer/components/CustomerUI.js');
  await mounted(CustomerPage,{title:'Discover',navigation:s.navigation,children:React.createElement('Text',null,'Last content action')},async tree=>{
   const safe=tree.root.findByType('SafeAreaView'),list=tree.root.findAllByType('View').filter(n=>n.props.accessibilityRole==='tablist');
   assert.equal(list.length,1);
   const tabs=list[0].findAllByType('Pressable');
   assert.deepEqual(tabs.map(n=>n.findByType('Text').props.children),labels);
   assert.deepEqual(tabs.map(n=>n.findByType('Icon').props.name),icons);
   assert.ok(safe.children.at(-1)===list[0].parent,'The sole tab list is the final shell child, below all content');
   assert.equal(flat(list[0].parent.props.style).flexShrink,0);
   assert.equal(flat(list[0].props.style).maxWidth,640);
   assert.equal(flat(list[0].props.style).alignSelf,'center');
   assert.equal(flat(list[0].props.style).width,'100%');
   const scroll=tree.root.findByType('ScrollView');
   assert.equal(scroll.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,0);
   assert.deepEqual(safe.props.edges,['top','bottom','left','right']);
   assert.equal(flat(safe.props.style).minHeight,0);
   assert.equal(flat(list[0].parent.props.style).position,undefined,'Intrinsic footer reserves its height instead of overlaying content');
   assert.ok(safe.findAllByType('View').some(n=>flat(n.props.style).flex===1&&flat(n.props.style).minHeight===0));
  });
 }
});

test('bottom navigation keeps destinations, selected family, repeat selection and pointer/keyboard feedback in both themes',async()=>{
 for(const mode of ['dark','light']){
  const s=setup(1440,'owner',mode),{CustomerPage}=s.load('src/features/customer/components/CustomerUI.js');
  const {palettes}=loadUI('src/shared/theme/colors.js'),theme=palettes[mode];
  await mounted(CustomerPage,{title:'Garage',activeRoute:'VehicleForm',navigation:s.navigation},async tree=>{
   const tabs=tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab');
   assert.deepEqual(tabs.map(n=>n.props.accessibilityState.selected),[false,true,false,false,false]);
   assert.deepEqual(tabs.map(n=>n.props['aria-selected']),[false,true,false,false,false]);
   const active=tabs[1],inactive=tabs[0];
   assert.equal(flat(active.props.style({pressed:false})).borderTopColor,theme.accent);
   assert.equal(flat(active.props.style({pressed:false})).backgroundColor,theme.accentLight);
   assert.equal(active.findByType('Icon').props.color,theme.accent);
   assert.equal(inactive.findByType('Icon').props.color,theme.textSecondary);
   for(const tab of tabs){assert.ok(flat(tab.props.style({pressed:false})).minHeight>=44);await act(async()=>tab.props.onPress());}
   assert.deepEqual(s.state.moves,[['Discover'],['Garage'],['OwnerRequests'],['Bookings'],['OwnerAccount']]);
   await act(async()=>active.props.onHoverIn({}));assert.equal(flat(active.props.style({pressed:false})).opacity,.9);
   await act(async()=>active.props.onFocus({}));assert.equal(flat(active.props.style({pressed:false})).outlineWidth,2);
   assert.equal(flat(active.props.style({pressed:true})).opacity,.72);
  });
  s.navigation.getState=()=>({index:0,routes:[{name:'Discover'}]});
  s.state.moves=[];
  await mounted(CustomerPage,{title:'Discover',navigation:s.navigation},async tree=>{await act(async()=>button(tree,'Discover').props.onPress());assert.deepEqual(s.state.moves,[]);});
 }
});

test('Discover scrolling and viewport/text-size changes retain one bottom bar with no content overlay',async()=>{
 const s=setup(),Component=s.load('src/features/customer/screens/CustomerDiscoverScreen.js').default;
 let pages=0;s.state.feed.loadNext=()=>pages++;
 await mounted(Component,{navigation:s.navigation},async(tree,update)=>{
  for(const [width,height,fontScale] of [[390,844,1],[768,700,1],[1440,900,1],[390,500,1.8]]){
   Object.assign(s.state.viewport,{width,height,fontScale});await update();
   const scroll=tree.root.findAllByType('ScrollView').find(n=>n.props.onScroll);
   await act(async()=>scroll.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:500}}}));
   const safe=tree.root.findByType('SafeAreaView'),list=tree.root.findAllByType('View').filter(n=>n.props.accessibilityRole==='tablist');
   assert.equal(list.length,1);assert.ok(safe.children.at(-1)===list[0].parent);
   assert.equal(scroll.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,0);
   assert.equal(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,5);
   assert.equal(flat(scroll.props.style).flex,1);
  }
  assert.equal(pages,4);
 });
});

test('Customer bookmark action is a sibling of the open target and unsaves only after API success',async()=>{
 const s=setup(),{PostCard}=s.load('src/features/marketplace/components/PostCard.js');let stopped=0;
 await mounted(PostCard,{post:{id:'fixture-post',title:'Paint project',type:'showcase',saved:true},onOpen:()=>s.state.moves.push(['detail'])},async tree=>{
  const save=button(tree,'Unsave post'),open=button(tree,'View Paint project');
  assert.ok(!open.findAllByType('Pressable').includes(save));
  await act(async()=>save.props.onPress({stopPropagation(){stopped++;}}));
  assert.equal(stopped,1);assert.deepEqual(s.state.moves,[]);assert.deepEqual(s.state.saves,[['save',{id:'fixture-post',saved:false},'fixture-customer']]);
  await act(async()=>open.props.onPress());assert.deepEqual(s.state.moves,[['detail']]);
 });
});

test('saved Customer content uses the posts saved operation, removes the right card and resets on account switch',async()=>{
 const s=setup(),Component=s.load('src/features/customer/screens/CustomerSavedScreen.js').default;
 s.state.feed.items=[{id:'one',title:'First',type:'showcase'},{id:'two',title:'Second',type:'showcase'}];
 await mounted(Component,{navigation:s.navigation},async(tree,update)=>{
  assert.deepEqual(s.state.options,{view:'saved'});
  await act(async()=>button(tree,'Unsave post').props.onPress({stopPropagation(){}}));
  assert.ok(!button(tree,'View First'));assert.ok(button(tree,'View Second'));
  s.state.auth.user={uid:'other'};await update();assert.ok(button(tree,'View First'));
 });
});

test('workshop discovery uses supplied identity, filters loaded records and preserves approved profile parameters',async()=>{
 const s=setup(1440),shop={id:'fixture-workshop',shopName:'Fixture Paintworks',city:'Pretoria',services:['Paint'],verified:true};
 const data={items:[shop],cursor:null},props={navigation:s.navigation,query:''};
 s.mocks['../../marketplace/hooks/useMarketData']={useMarketData:(op)=>{assert.equal(op,'shops');return {data,busy:false,error:'',refresh:async()=>{}};}};
 const {WorkshopDirectory}=s.load('src/features/customer/screens/CustomerDiscoverScreen.js');
 await mounted(WorkshopDirectory,props,async(tree,update)=>{
  assert.match(text(tree),/Fixture Paintworks/);assert.doesNotMatch(text(tree),/reviews|rating|discount|near you/i);
  await act(async()=>button(tree,'View workshop: Fixture Paintworks').props.onPress());
  assert.deepEqual(s.state.moves,[['ShopProfile',{shop:{...shop,name:shop.shopName,verificationStatus:'approved'}}]]);
  props.query='not present';await update();assert.match(text(tree),/No workshops match/);assert.ok(!button(tree,'View workshop: Fixture Paintworks'));
 });
});

test('a showcase workshop snapshot without verification metadata can open a request draft without claiming verification',async()=>{
 const s=setup(),shop={id:'fixture-workshop',name:'Fixture Paintworks',city:'Pretoria'};
 const {ShopProfileScreen}=s.load('src/features/marketplace/screens/PostScreens.js');
 await mounted(ShopProfileScreen,{navigation:s.navigation,route:{params:{shop}}},async tree=>{
  assert.ok(button(tree,'Request a service'));assert.doesNotMatch(text(tree),/Verified workshop/);
  await act(async()=>button(tree,'Request a service').props.onPress());
  assert.deepEqual(s.state.moves,[['RequestForm',{shop:{id:shop.id,shopName:shop.name,city:shop.city}}]]);assert.deepEqual(s.state.saves,[]);
 });
});

test('owner navigator registers all 19 audited destinations without exposing build publishing or duplicating auth screens',()=>{
 const source=fs.readFileSync('src/features/marketplace/OwnerNavigator.js','utf8');
 const routes=[...source.matchAll(/<Stack.Screen name="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(routes.length,19);assert.equal(new Set(routes).size,19);
 for(const name of ['Discover','Garage','VehicleForm','VehiclePhotos','OwnerRequests','RequestForm','OwnerRequest','QuoteComparison','PaymentChoice','Bookings','BookingDetail','ReceiptDetail','Messages','Chat','OwnerAccount','PostDetail','ShopProfile','Notifications','SavedPosts'])assert.ok(routes.includes(name),name);
 assert.ok(!routes.includes('SignIn'));assert.ok(!routes.includes('PostForm'));
});

test('Customer web dialog traps keyboard focus, closes with Escape and restores its trigger',async()=>{
 const s=setup(),{CustomerModal}=s.load('src/features/customer/components/CustomerUI.js');
 const previousDocument=global.document,handlers=new Map();let closed=0,restored=0;
 const first={disabled:false,getAttribute:()=>null,getClientRects:()=>[{}],focus(){global.document.activeElement=this;}},last={disabled:false,getAttribute:()=>null,getClientRects:()=>[{}],focus(){global.document.activeElement=this;}};
 global.document={activeElement:{focus(){restored++;}},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 const props={visible:true,onRequestClose:()=>closed++};
 try{await mounted(CustomerModal,props,async(tree,update)=>{
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(global.document.activeElement,first);
  let prevented=0;global.document.activeElement=last;handlers.get('keydown')({key:'Tab',preventDefault(){prevented++;}});assert.equal(global.document.activeElement,first);
  handlers.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(global.document.activeElement,last);
  handlers.get('keydown')({key:'Escape',preventDefault(){prevented++;}});assert.equal(closed,1);assert.equal(prevented,3);
  props.visible=false;await update();assert.equal(restored,1);assert.equal(handlers.size,0);
 },{createNodeMock:()=>({querySelectorAll:()=>[first,last]})});}finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
});

test('an owner with an authentication/profile error retains the restricted root Account view',async()=>{
 const s=setup();s.state.auth.user.emailVerified=true;s.state.auth.error='Profile access needs attention';
 s.mocks['../components/ProfilePhotoSettings']=()=>null;s.mocks['firebase/auth']={};
 const Component=s.load('src/features/auth/screens/AccountScreen.js').default;
 await mounted(Component,{navigation:s.navigation},async tree=>{assert.match(text(tree),/Account access needs attention/);assert.ok(!button(tree,'Messages'));assert.equal(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,0);});
});
