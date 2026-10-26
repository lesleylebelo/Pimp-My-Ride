const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const flat=value=>Object.assign({},...[value].flat(Infinity).filter(Boolean));
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
function setup(width=390){
 const state={moves:[],saves:[],photos:[],auth:{user:{uid:'fixture-shop'},profile:{role:'shop'},offline:false}};
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const mocks={'react-native':{Platform:{OS:'web'},useWindowDimensions:()=>({width,height:900,fontScale:1,scale:1})},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,bottom:34,left:0,right:0})},'@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.dark,isDark:true})},
  '../../../shared/components/ProfileAvatar':props=>React.createElement('Avatar',props),
  '../services/photoApi':{viewPhoto:async(...args)=>{state.photos.push(args);return {url:'https://fixture.invalid/private',expiresAt:Date.now()+60000};}},
  '../services/postsApi':{postsApi:async(...args)=>{state.saves.push(args);return {};},viewPostPhoto:async()=>({url:'https://fixture.invalid/showcase',expiresAt:Date.now()+60000})},
 };
 return {state,mocks,load:file=>loadUI(file,mocks)};
}
async function mount(Component,props,fn){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await fn(tree);}finally{await act(async()=>tree.unmount());}}
test('Workshop feed column stays single-width and centered at phone, tablet and desktop sizes',async()=>{
 for(const width of [390,768,1440]){const s=setup(width),{WorkshopFeedColumn}=s.load('src/features/marketplace/components/WorkshopFeedCards.js');await mount(WorkshopFeedColumn,{children:React.createElement('Text',null,'Post')},async tree=>{const style=flat(tree.root.findByType('View').props.style);assert.equal(style.width,'100%');assert.equal(style.maxWidth,680);assert.equal(style.gap,24);assert.equal(style.alignSelf,'center');assert.notEqual(style.flexDirection,'row');});}
});
test('request identity, type, full heading/description and vehicle precede authorised photos and contextual actions',async()=>{
 const s=setup(),{WorkshopRequestCard}=s.load('src/features/marketplace/components/WorkshopFeedCards.js');
 const request={id:'request-fixture',customerName:'Authorised name',customerAvatar:{hasPhoto:true,revision:3},createdAt:1,status:'open',title:'Repair the wheels',categoryName:'Wheels',description:'A complete description',vehicle:{year:2024,make:'Toyota',model:'Hilux'},photoIds:['attached-one','attached-two'],quotationCount:0};
 await mount(WorkshopRequestCard,{request,time:'1h ago',onOpen:()=>s.state.moves.push(['detail'])},async tree=>{
  const output=JSON.stringify(tree.toJSON()),parts=['Authorised name','Service request','Repair the wheels','A complete description','2024 Toyota Hilux','Attached request photo 1','View request:'];let previous=-1;for(const part of parts){const next=output.indexOf(part,previous+1);assert.ok(next>previous,part);previous=next;}
  assert.deepEqual(s.state.photos,[['request',request.id,'attached-one','fixture-shop'],['request',request.id,'attached-two','fixture-shop']]);
  const image=tree.root.findAllByType('Image')[0];assert.equal(flat(image.props.style).aspectRatio,4/3);assert.equal(flat(image.props.style).width,'100%');
  await act(async()=>button(tree,'View request: Repair the wheels').props.onPress());assert.deepEqual(s.state.moves,[['detail']]);
  assert.equal(tree.root.findByType('Avatar').props.enabled,true);
 });
});
test('neutral customer identity and missing attachments expose no invented details or private garage URLs',async()=>{
 const s=setup(),{WorkshopRequestCard}=s.load('src/features/marketplace/components/WorkshopFeedCards.js');
 await mount(WorkshopRequestCard,{request:{id:'request',status:'closed',photos:[{url:'https://private.invalid/not-authorised'}]},disabled:true},async tree=>{const output=JSON.stringify(tree.toJSON());assert.match(output,/Customer/);assert.match(output,/Vehicle details not provided/);assert.match(output,/Attached photos unavailable/);assert.doesNotMatch(output,/private.invalid|Verified|No quotes yet/);assert.equal(tree.root.findByType('Avatar').props.enabled,false);assert.deepEqual(s.state.photos,[]);assert.ok(tree.root.findAllByType('Pressable').every(n=>n.props.disabled));});
});
test('Workshop showcase information precedes media; profile/detail/bookmark targets remain independent',async()=>{
 const s=setup(),{PostCard}=s.load('src/features/marketplace/components/PostCard.js');
 const post={id:'showcase',authorRole:'shop',type:'showcase',shop:{id:'other-shop',name:'Real workshop'},title:'Wheel project',description:'All project details',category:'Wheels',vehicle:{year:2024,make:'Ford',model:'Fiesta'},images:[{url:'https://fixture.invalid/image'}]};
 await mount(PostCard,{post,presentation:'feed',onOpen:()=>s.state.moves.push(['detail']),onProfile:()=>s.state.moves.push(['profile'])},async tree=>{
  const output=JSON.stringify(tree.toJSON());let previous=-1;for(const part of ['Real workshop','SHOWCASE','Wheel project','All project details','2024 Ford Fiesta','Showcase photo','Save post']){const index=output.indexOf(part,previous+1);assert.ok(index>previous,part);previous=index;}
  assert.doesNotMatch(output,/Verified workshop|rating|review count/);
  await act(async()=>button(tree,'Save post').props.onPress({stopPropagation(){}}));assert.deepEqual(s.state.moves,[]);assert.deepEqual(s.state.saves,[['save',{id:'showcase',saved:true},'fixture-shop']]);
  await act(async()=>button(tree,'View workshop: Real workshop').props.onPress());await act(async()=>button(tree,'View showcase').props.onPress());assert.deepEqual(s.state.moves,[['profile'],['detail']]);
 });
});
test('Workshop tabs keep their actual order, selected state, safe inset and accessible interaction states at every width',async()=>{
 const tabs=[{label:'Find Jobs',icon:'discover'},{label:'Requests',icon:'garage'},{label:'Quotes',icon:'requests'},{label:'Bookings',icon:'bookings'},{label:'My Shop',icon:'profile'}];
 for(const width of [390,768,1440]){const s=setup(width),Nav=s.load('src/features/marketplace/components/ShopBottomNavigation.js').default;await mount(Nav,{tabs,active:'Quotes',bottomInset:34,onTabPress:label=>s.state.moves.push(label)},async tree=>{const list=tree.root.findAllByType('View').find(n=>n.props.accessibilityRole==='tablist'),controls=list.findAllByType('Pressable');assert.deepEqual(controls.map(n=>n.props.accessibilityLabel),tabs.map(t=>t.label));assert.equal(flat(list.props.style).maxWidth,640);assert.equal(flat(list.parent.props.style).paddingBottom,34);assert.equal(flat(list.parent.props.style).flexShrink,0);assert.deepEqual(controls.map(n=>n.props['aria-selected']),[false,false,true,false,false]);for(const control of controls){assert.ok(flat(control.props.style({pressed:false})).minHeight>=44);await act(async()=>control.props.onPress());}assert.deepEqual(s.state.moves,tabs.map(t=>t.label));await act(async()=>controls[2].props.onFocus({}));assert.equal(flat(controls[2].props.style({pressed:false})).outlineWidth,2);await act(async()=>controls[2].props.onHoverIn({}));assert.equal(flat(controls[2].props.style({pressed:false})).opacity,.9);assert.equal(flat(controls[2].props.style({pressed:true})).opacity,.72);});}
});
test('own Workshop showcase edit and confirmed delete retain their existing callbacks without opening the post',async()=>{
 const s=setup(),{PostCard}=s.load('src/features/marketplace/components/PostCard.js');
 const post={id:'own',title:'Own showcase',type:'showcase',authorRole:'shop'};
 await mount(PostCard,{post,presentation:'feed',editable:true,onOpen:()=>s.state.moves.push('detail'),onEdit:item=>s.state.moves.push(['edit',item.id]),onRemoved:id=>s.state.moves.push(['removed',id])},async tree=>{
  await act(async()=>button(tree,'Edit post').props.onPress());assert.deepEqual(s.state.moves,[['edit','own']]);
  await act(async()=>button(tree,'Delete post').props.onPress());assert.deepEqual(s.state.saves,[]);
  await act(async()=>button(tree,'Confirm').props.onPress());assert.deepEqual(s.state.saves,[['remove',{id:'own',showcase:true},'fixture-shop']]);assert.deepEqual(s.state.moves,[['edit','own'],['removed','own']]);
 });
});
test('Workshop showcase search includes supplied vehicle objects instead of searching object serialization',async()=>{
 const s=setup(),data={items:[]},posts={items:[{id:'project',authorId:'another-shop',authorRole:'shop',type:'showcase',title:'Wheel project',vehicle:{make:'Toyota',model:'Hilux',year:2024}}],busy:false,error:'',refresh:async()=>{},loadNext(){}};
 s.mocks['../hooks/useMarketData']={useMarketData:()=>({data,busy:false,error:'',refresh:async()=>{}})};
 s.mocks['../hooks/usePostsFeed']={usePostsFeed:()=>posts};
 s.mocks['../components/MessagesHeaderButton']=()=>null;s.mocks['../components/NotificationsHeaderButton']=()=>null;
 const {ShopJobsScreen}=s.load('src/features/marketplace/screens/ShopMarketplaceScreens.js');
 await mount(ShopJobsScreen,{navigation:{getState:()=>({index:0,routes:[{name:'ShopJobs'}]}),navigate(){}}},async tree=>{
  const search=tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Search requests, vehicles or services');
  await act(async()=>search.props.onChangeText('Toyota'));await act(async()=>new Promise(resolve=>setTimeout(resolve,220)));
  assert.ok(button(tree,'View Wheel project'));
  await act(async()=>search.props.onChangeText('not present'));await act(async()=>new Promise(resolve=>setTimeout(resolve,220)));
  assert.ok(!button(tree,'View Wheel project'));assert.match(tree.root.findAllByType('Text').map(n=>typeof n.props.children==='string'?n.props.children:'').join(' '),/No posts match your search/);
 });
});
