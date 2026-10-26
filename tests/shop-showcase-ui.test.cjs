const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
const {palettes}=loadUI('src/shared/theme/colors.js');
global.IS_REACT_ACT_ENVIRONMENT=true;
const text=tree=>tree.root.findAllByType('Text').map(n=>n.props.children).flat(Infinity).join(' ');
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const landing={LandingText:'Text',ownerTabs:[{label:'Discover'},{label:'Garage'},{label:'My Requests'},{label:'Bookings'},{label:'Profile'}],shopTabs:[{label:'Find Jobs'},{label:'Requests'},{label:'Quotes'},{label:'Bookings'},{label:'My Shop'}]};
function fixture(options={}){
 const state={role:'owner',offline:false,items:[],busy:false,error:'',refreshing:false,...options},calls=[],routes=[],feedArgs=[];
 const profile={role:state.role,verificationStatus:state.verificationStatus||'approved',shop:{shopName:'Real workshop',city:'Durban',services:'Wheels and tuning'}};
 const feed={...state,loadNext:()=>calls.push('next'),refresh:async()=>calls.push('refresh')};
 const auth={useAuth:()=>({user:{uid:'actor'},profile,offline:state.offline})};
 const mocks={
  '../../../shared/components/landing/LandingUI':landing,
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[state.mode||'dark']})},
  '../../auth/context/AuthContext':auth,
  '../hooks/usePostsFeed':{usePostsFeed:args=>{feedArgs.push(args);return feed;}},
  '../services/postsApi':{postsApi:async(op,data)=>{calls.push({op,data});if(state.fail)throw Error(state.fail);return {post:state.post};},pickPostPhotos:async()=>[],uploadPostPhoto:async()=>assert.fail('No real upload')},
  '../components/PostCard':{PostCard:props=>React.createElement('PostCard',props)},
  '../components/ShowcasePhoto':{__esModule:true,default:props=>React.createElement('PrivatePhoto',props),hasPostImage:i=>!!i?.path},
  '../components/AIAssistButton':()=>null,
 };
 const screens=loadUI('src/features/marketplace/screens/PostScreens.js',mocks);
 const navigation={navigate:(...args)=>routes.push(args),goBack:()=>routes.push(['back']),canGoBack:()=>true};
 return {screens,state,calls,routes,feedArgs,navigation,mocks,profile,render:async(name,params={})=>{let tree;await act(async()=>{tree=create(React.createElement(screens[name],{navigation,route:{params}}));});return tree;}};
}
test('customer storefront uses the supplied identity and shop-scoped portfolio without contact privileges',async()=>{
 const f=fixture({items:[{id:'one'},{id:'two'}]}),shop={id:'real-shop',name:'Long workshop name',city:'Durban'};
 const tree=await f.render('ShopProfileScreen',{shop});try{
  assert.match(text(tree),/Long workshop name/);assert.match(text(tree),/Durban/);
  assert.equal(f.feedArgs[0].shopId,'real-shop');assert.equal(tree.root.findAllByType('PostCard').length,2);
  assert.doesNotMatch(text(tree),/Verified workshop|followers|Chat|Contact|reviews/i);
  await act(async()=>tree.root.findAllByType('PostCard')[0].props.onOpen());assert.deepEqual(f.routes[0],['PostDetail',{id:'one'}]);
 }finally{await act(async()=>tree.unmount());}
});
test('verification requires an explicit approved status, including light theme and missing logo fallback',async()=>{
 const f=fixture({mode:'light'}),{WorkshopIdentity}=loadUI('src/features/marketplace/components/ShowcaseUI.js',f.mocks);
 for(const verificationStatus of [undefined,'pending','rejected','approved']){let tree;await act(async()=>{tree=create(React.createElement(WorkshopIdentity,{shop:{name:'Workshop',verificationStatus}}));});try{
  assert.equal(text(tree).includes('Verified workshop'),verificationStatus==='approved');
  assert.equal(tree.root.findAllByType('Image').length,0);assert.ok(tree.root.findAllByType('Icon').some(n=>n.props.name==='storefront-outline'));
 }finally{await act(async()=>tree.unmount());}}
});
test('portfolio refresh, pagination, errors and empty state keep the existing feed controls',async()=>{
 for(const error of ['', 'Permission denied']){const f=fixture({error,cursor:'next'}),tree=await f.render('ShopProfileScreen',{shop:{id:'shop'}});try{
  if(error){assert.match(text(tree),/Permission denied/);await act(async()=>button(tree,'Retry loading portfolio').props.onPress());}
  else assert.match(text(tree),/has not shared any showcases/);
  await act(async()=>button(tree,'Load more showcases').props.onPress());assert.ok(f.calls.includes('next'));
  const scroll=tree.root.findAllByType('ScrollView')[0];await act(async()=>scroll.props.refreshControl.props.onRefresh());assert.ok(f.calls.includes('refresh'));
 }finally{await act(async()=>tree.unmount());}}
});
test('invalid shop references never render an unrestricted feed',async()=>{
 const f=fixture({items:[{id:'unrelated'}]}),tree=await f.render('ShopProfileScreen');try{assert.match(text(tree),/Workshop unavailable/);assert.equal(tree.root.findAllByType('PostCard').length,0);assert.equal(f.feedArgs.length,0);}finally{await act(async()=>tree.unmount());}
});
test('loading portfolios and projects without images have honest placeholder states',async()=>{
 const f=fixture({busy:true}),tree=await f.render('ShopProfileScreen',{shop:{id:'shop'}});try{
  assert.ok(tree.root.findAllByType('Text').some(n=>n.props.accessibilityRole==='status'&&n.props.children==='Loading...'));assert.doesNotMatch(text(tree),/has not shared/);
 }finally{await act(async()=>tree.unmount());}
 const detail=await fixture({post:{id:'no-photo',title:'Real project',images:[]}}).render('PostDetailScreen',{id:'no-photo'});try{
  assert.match(text(detail),/No project photos available/);assert.equal(detail.root.findAllByType('PrivatePhoto').length,0);
 }finally{await act(async()=>detail.unmount());}
});
test('bookmark feedback waits for the server and preserves retry after failure',async()=>{
 const f=fixture(),{PostCard}=loadUI('src/features/marketplace/components/PostCard.js',f.mocks);let tree;
 await act(async()=>{tree=create(React.createElement(PostCard,{post:{id:'post',authorRole:'shop',title:'Work',images:[]}}));});try{
  assert.doesNotMatch(text(tree),/Verified workshop/);
  f.state.fail='Offline bookmark update';await act(async()=>button(tree,'Save post').props.onPress());
  assert.match(text(tree),/Offline bookmark update/);assert.ok(button(tree,'Save post'));
  f.state.fail='';await act(async()=>button(tree,'Save post').props.onPress());assert.ok(button(tree,'Unsave post'));
  assert.deepEqual(f.calls.map(c=>c.data),[{id:'post',saved:true},{id:'post',saved:true}]);
 }finally{await act(async()=>tree.unmount());}
});
test('Customer portfolio uses compact desktop columns and one with larger accessibility fonts',async()=>{
 for(const fontScale of [1,1.8]){const f=fixture({items:[{id:'one'},{id:'two'}]}),screens=loadUI('src/features/marketplace/screens/PostScreens.js',{...f.mocks,'react-native':{useWindowDimensions:()=>({width:1100,height:900,fontScale})}});let tree;
  await act(async()=>{tree=create(React.createElement(screens.ShopProfileScreen,{navigation:f.navigation,route:{params:{shop:{id:'shop'}}}}));});try{
   const width=fontScale===1?338:'100%';assert.ok(tree.root.findAllByType('View').filter(n=>n.props.style?.width===width).length>=2);
  }finally{await act(async()=>tree.unmount());}
 }
});
test('shop management preserves edit, create and account routes and existing tab count',async()=>{
 const post={id:'own',type:'showcase',title:'Own project'},f=fixture({role:'shop',items:[post]}),tree=await f.render('MyPostsScreen');try{
  assert.match(text(tree),/Real workshop/);assert.match(text(tree),/Verified workshop/);
  await act(async()=>button(tree,'Shop account settings').props.onPress());await act(async()=>button(tree,'New showcase').props.onPress());
  await act(async()=>tree.root.findByType('PostCard').props.onEdit(post));
  assert.deepEqual(f.routes,[['ShopAccount'],['PostForm',{type:'showcase'}],['PostForm',{type:'showcase',post}]]);
  assert.equal(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').length,5);
 }finally{await act(async()=>tree.unmount());}
});
test('detail deep link loads by ID, switches authenticated previews and opens the original shop reference',async()=>{
 const shop={id:'shop',name:'Workshop'},post={id:'project',title:'Real project',description:'Real work',createdAt:1700000000000,shop,images:[{path:'posts/shop/a'},{path:'posts/shop/b'}]},f=fixture({post}),tree=await f.render('PostDetailScreen',{id:'project'});try{
  assert.deepEqual(f.calls[0],{op:'get',data:{id:'project'}});assert.match(text(tree),/Real work/);assert.match(text(tree),/Published/);
  await act(async()=>button(tree,'View project photo 2').props.onPress());assert.equal(tree.root.findAllByType('PrivatePhoto')[0].props.image.path,'posts/shop/b');
  await act(async()=>button(tree,'View workshop portfolio').props.onPress());assert.deepEqual(f.routes[0],['ShopProfile',{shop}]);
  assert.equal(button(tree,'Post options'),undefined);
 }finally{await act(async()=>tree.unmount());}
});
test('private or offline detail failures offer retry without a fake project',async()=>{
 const f=fixture({fail:'Connect to load this private project'}),tree=await f.render('PostDetailScreen',{id:'private'});try{assert.match(text(tree),/Connect to load/);assert.equal(tree.root.findAllByType('PrivatePhoto').length,0);await act(async()=>button(tree,'Retry loading post').props.onPress());assert.equal(f.calls.length,2);}finally{await act(async()=>tree.unmount());}
});
test('review and cancel never publish; existing fields and keyboard handling remain available',async()=>{
 const f=fixture({role:'shop'}),tree=await f.render('PostFormScreen',{type:'showcase'});try{
  assert.equal(button(tree,'Post').props.disabled,true);await act(async()=>button(tree,'Review showcase').props.onPress());assert.match(text(tree),/Review does not publish/);assert.equal(f.calls.length,0);
  const scroll=tree.root.findByType('ScrollView');assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,'padding');
  assert.ok(tree.root.findAllByType('TextInput').some(n=>n.props.accessibilityLabel==='Title'));
  await act(async()=>button(tree,'Cancel').props.onPress());assert.deepEqual(f.routes,[['back']]);
 }finally{await act(async()=>tree.unmount());}
});
test('unverified and offline shops cannot select photos or publish',async()=>{
 for(const options of [{verificationStatus:'pending'},{offline:true}]){const f=fixture({role:'shop',...options}),tree=await f.render('PostFormScreen',{type:'showcase'});try{assert.equal(button(tree,'Post').props.disabled,true);assert.equal(button(tree,'Add photos (0/10)').props.disabled,true);}finally{await act(async()=>tree.unmount());}}
});
test('photo reordering and removal stay local until the existing save action confirms the ordered references',async()=>{
 const images=['a','b','c'].map(name=>({bucket:'showcase-images',path:'posts/actor/'+name})),post={id:'own',title:'Project',images},f=fixture({role:'shop'}),tree=await f.render('PostFormScreen',{post,type:'showcase'});try{
  const buttons=label=>tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityLabel===label);
  await act(async()=>buttons('Move photo earlier')[1].props.onPress());
  await act(async()=>buttons('Remove')[1].props.onPress());assert.equal(f.calls.length,0);
  assert.deepEqual(tree.root.findAllByType('PrivatePhoto').map(n=>n.props.image.path),['posts/actor/b','posts/actor/c']);
  await act(async()=>button(tree,'Save changes').props.onPress());
  assert.equal(f.calls[0].op,'update');assert.equal(f.calls[0].data.showcase,true);assert.deepEqual(f.calls[0].data.images,['posts/actor/b','posts/actor/c']);assert.deepEqual(f.routes,[['back']]);
 }finally{await act(async()=>tree.unmount());}
});
test('shop account retains business location editing and presents registered services without creating new editors',async()=>{
 const f=fixture({role:'shop'}),Account=loadUI('src/features/auth/screens/AccountScreen.js',{
  '../context/AuthContext':{useAuth:()=>({user:{uid:'actor',emailVerified:true,email:'shop@example.invalid'},profile:{...f.profile,accountStatus:'active'},refresh:async()=>{},logout:async()=>{},requireConnection:async()=>{}})},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes.dark,mode:'dark'})},
  '../../../shared/services/firebase':{firebase:()=>({})},
  '../components/BusinessLocation':()=>React.createElement('BusinessLocation'),
  '../components/VerificationDocuments':()=>React.createElement('VerificationDocuments'),
 }).default;
 let tree;await act(async()=>{tree=create(React.createElement(Account,{navigation:f.navigation}));});try{
  assert.match(text(tree),/Real workshop/);assert.match(text(tree),/Wheels and tuning/);assert.match(text(tree),/Verified workshop/);assert.equal(tree.root.findAllByType('BusinessLocation').length,1);
  await act(async()=>button(tree,'Manage showcases').props.onPress());assert.deepEqual(f.routes,[['ShopPosts']]);
 }finally{await act(async()=>tree.unmount());}
});
