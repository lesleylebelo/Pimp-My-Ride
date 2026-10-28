const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const fixture={id:'workshop-post',type:'showcase',authorRole:'shop',title:'Wheels fitted',description:'A tidy installation',vehicle:{make:'Honda',model:'Civic',year:2024},shop:{id:'workshop',name:'Workshop'},images:[]};
function setup(platform='web'){
 const store=loadUI('src/features/marketplace/services/bookmarkState.js');
 const state={firebaseUser:{uid:'owner'},auth:{user:{uid:'owner'},profile:{role:'owner'},offline:false},calls:[],reply:async(_path,data)=>({id:data.id,saved:data.saved})};
 const api=loadUI('src/features/marketplace/services/postsApi.js',{
  './bookmarkState':store,
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:state.firebaseUser}})},
  '../../../shared/services/api':{apiRequest:async(...args)=>{state.calls.push(args);return state.reply(...args);},apiMethodRequest:async()=>state.readReply},
 });
 const mocks={
  '@expo-google-fonts/space-grotesk':{},'@expo-google-fonts/manrope':{},
  'react-native':{Platform:{OS:platform}},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},
  '../services/postsApi':api,'../services/bookmarkState':store,
  '../../marketplace/services/bookmarkState':store,
  '../../../shared/components/ProfileAvatar':()=>React.createElement('View'),
 };
 const {PostCard}=loadUI('src/features/marketplace/components/PostCard.js',mocks);
 return {state,store,api,PostCard,load:(file,extra={})=>loadUI(file,{...mocks,...extra})};
}
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
async function mounted(Component,props,run){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await run(tree,async changes=>act(async()=>tree.update(React.createElement(Component,{...props,...changes}))));}finally{await act(async()=>tree.unmount());}}

test('save service coalesces same desired state, serializes an opposite state and preserves the existing payload contract',async()=>{
 const s=setup();let acknowledge;
 s.state.reply=(_path,data)=>new Promise(resolve=>{acknowledge=()=>resolve({id:data.id,saved:data.saved});});
 const first=s.api.postsApi('save',{id:fixture.id,saved:true},'owner'),second=s.api.postsApi('save',{id:fixture.id,saved:true},'owner');
 await new Promise(setImmediate);assert.equal(s.state.calls.length,1);
 const remove=s.api.postsApi('save',{id:fixture.id,saved:false},'owner');
 acknowledge();await Promise.all([first,second]);await new Promise(setImmediate);assert.equal(s.state.calls.length,2);
 acknowledge();await remove;
 assert.deepEqual(s.state.calls.map(call=>call[1]),[{op:'save',id:fixture.id,saved:true},{op:'save',id:fixture.id,saved:false}]);
 assert.equal(s.store.bookmarkSnapshot('owner',fixture.id).saved,false);
});

test('two rendered cards share pending and acknowledged state, ignore same-turn repeated taps and retain state after a failed unsave',async()=>{
 for(const platform of ['android','web']){
  const s=setup(platform);let acknowledge;
  s.state.reply=(_path,data)=>new Promise(resolve=>{acknowledge=()=>resolve({id:data.id,saved:data.saved});});
  const Pair=()=>React.createElement(React.Fragment,null,React.createElement(s.PostCard,{post:fixture,presentation:'feed'}),React.createElement(s.PostCard,{post:fixture}));
  await mounted(Pair,{},async tree=>{
   const save=button(tree,'Save post').props.onPress;
   await act(async()=>{save();save();});assert.equal(s.state.calls.length,1);
   assert.ok(tree.root.findAllByType('Pressable').filter(node=>node.props.accessibilityLabel==='Save post').every(node=>node.props.disabled));
   await act(async()=>acknowledge());assert.equal(tree.root.findAllByType('Pressable').filter(node=>node.props.accessibilityLabel==='Unsave post').length,2);
   s.state.reply=async()=>{throw Error('Save unavailable. Try again.');};
   await act(async()=>button(tree,'Unsave post').props.onPress());
   assert.equal(tree.root.findAllByType('Pressable').filter(node=>node.props.accessibilityLabel==='Unsave post').length,2);
   assert.match(text(tree),/Save unavailable/);
  });
 }
});

test('authoritative read values seed cards, stale reads cannot overwrite an acknowledgement, and session replacement clears state',async()=>{
 const s=setup();s.state.readReply={items:[{...fixture,saved:true}]};
 await s.api.postsApi('feed',{},'owner');assert.equal(s.store.bookmarkSnapshot('owner',fixture.id).saved,true);
 const started=s.store.bookmarkRevision();
 await s.api.postsApi('save',{id:fixture.id,saved:false},'owner');
 s.store.publishBookmark('owner',fixture.id,true,started);assert.equal(s.store.bookmarkSnapshot('owner',fixture.id).saved,false);
 s.state.firebaseUser={uid:'owner'};s.state.readReply={items:[]};await s.api.postsApi('feed',{},'owner',{force:true});
 assert.equal(s.store.bookmarkSnapshot('owner',fixture.id),undefined);
});

test('logout and account replacement discard late save acknowledgements and never update the replacement account',async()=>{
 const s=setup();let acknowledge;
 s.state.reply=()=>new Promise(resolve=>{acknowledge=resolve;});
 const save=s.api.postsApi('save',{id:fixture.id,saved:true},'owner');await new Promise(setImmediate);
 s.state.firebaseUser={uid:'someone-else'};s.state.readReply={items:[]};await s.api.postsApi('feed',{},'someone-else');
 acknowledge({id:fixture.id,saved:true});await assert.rejects(save,/account changed/);
 assert.equal(s.store.bookmarkSnapshot('someone-else',fixture.id),undefined);
 assert.equal(s.store.bookmarkSnapshot('owner',fixture.id),undefined);
 s.state.firebaseUser=null;await assert.rejects(s.api.postsApi('saved'),/Sign in/);
});

test('invalid acknowledgements and lost responses keep the old state; retry sends the same desired boolean',async()=>{
 const s=setup();s.state.reply=async()=>({id:'wrong-post',saved:true});
 await assert.rejects(s.api.postsApi('save',{id:fixture.id,saved:true},'owner'),/could not be confirmed/);
 assert.notEqual(s.store.bookmarkSnapshot('owner',fixture.id).saved,true);
 s.state.reply=async()=>{throw Error('Acknowledgement lost');};
 await assert.rejects(s.api.postsApi('save',{id:fixture.id,saved:true},'owner'),/lost/);
 s.state.reply=async(_path,data)=>({id:data.id,saved:data.saved});await s.api.postsApi('save',{id:fixture.id,saved:true},'owner');
 assert.ok(s.state.calls.every(call=>call[1].saved===true));assert.equal(s.store.bookmarkSnapshot('owner',fixture.id).saved,true);
});

test('guests, offline accounts and customer builds have disabled bookmark controls',async()=>{
 for(const kind of ['guest','offline','build']){
  const s=setup();if(kind==='guest')s.state.auth.user=null;if(kind==='offline')s.state.auth.offline=true;
  await mounted(s.PostCard,{post:kind==='build'?{...fixture,type:'build',authorRole:'customer'}:fixture},async tree=>{
   const save=button(tree,'Save post');assert.equal(save.props.disabled,true);await act(async()=>save.props.onPress());assert.equal(s.state.calls.length,0);
  });
 }
});


test('Saved Posts keeps a bounded feed, supports workshop/detail navigation, scrolling, removal and retry states',async()=>{
 for(const width of [320,1440]){
  const s=setup(),moves=[];let loads=0,refreshes=0;
  const feed={items:[fixture],busy:false,refreshing:false,error:'',cursor:'next',loadNext(){loads++;},refresh(){refreshes++;}};
  const Screen=s.load('src/features/customer/screens/CustomerSavedScreen.js',{
   'react-native':{Platform:{OS:'web'},useWindowDimensions:()=>({width,height:900,fontScale:1,scale:1})},
   '../../marketplace/hooks/usePostsFeed':{usePostsFeed:()=>feed},
  }).default;
  await mounted(Screen,{navigation:{navigate:(...args)=>moves.push(args)}},async(tree,update)=>{
   const column=tree.root.findAllByType('View').find(node=>node.props.style?.maxWidth===680);assert.ok(column);
   await act(async()=>button(tree,'View workshop: Workshop').props.onPress());await act(async()=>button(tree,'View Wheels fitted').props.onPress());
   assert.deepEqual(moves,[['ShopProfile',{shop:fixture.shop}],['PostDetail',{id:fixture.id}]]);
   const scroll=tree.root.findAllByType('ScrollView').find(node=>node.props.onScroll);
   await act(async()=>scroll.props.onScroll({nativeEvent:{contentOffset:{y:0},contentSize:{height:2000},layoutMeasurement:{height:600}}}));assert.equal(loads,0);
   await act(async()=>scroll.props.onScroll({nativeEvent:{contentOffset:{y:1500},contentSize:{height:2000},layoutMeasurement:{height:600}}}));assert.equal(loads,1);
   await act(async()=>button(tree,'Unsave post').props.onPress());assert.ok(!button(tree,'View Wheels fitted'));
   assert.doesNotMatch(text(tree),/Nothing saved yet/);assert.match(text(tree),/Load more to continue/);
   feed.cursor=null;await update({});assert.match(text(tree),/Nothing saved yet/);
   feed.error='Saved posts unavailable';await update({});assert.match(text(tree),/Saved posts unavailable/);assert.doesNotMatch(text(tree),/Nothing saved yet/);
   await act(async()=>button(tree,'Try again').props.onPress());assert.equal(refreshes,1);
   feed.error='';feed.busy=true;await update({});assert.match(text(tree),/Loading saved posts/);
  });
 }
});

test('Saved Posts clears unavailable cached content offline and post-detail uses the same bookmark state',async()=>{
 const s=setup();s.state.auth.offline=true;
 const Saved=s.load('src/features/customer/screens/CustomerSavedScreen.js',{'../../marketplace/hooks/usePostsFeed':{usePostsFeed:()=>({items:[fixture],busy:false,error:'',refresh(){}})}}).default;
 await mounted(Saved,{navigation:{navigate(){}}},async tree=>{assert.equal(button(tree,'View Wheels fitted'),undefined);assert.match(text(tree),/Connect to view saved posts/);});
 s.state.auth.offline=false;s.state.readReply={post:{...fixture,saved:false}};
 const {PostDetailScreen}=s.load('src/features/marketplace/screens/PostScreens.js');
 await mounted(PostDetailScreen,{navigation:{navigate(){}},route:{params:{id:fixture.id}}},async tree=>{
  assert.ok(button(tree,'Save post'));await act(async()=>button(tree,'Save post').props.onPress());assert.ok(button(tree,'Unsave post'));
  assert.deepEqual(s.state.calls.at(-1)[1],{op:'save',id:fixture.id,saved:true});
 });
});
