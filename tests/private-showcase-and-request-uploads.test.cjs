const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{create,act}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;

test('private showcase previews renew, clear on account/blur/offline and reject late responses',async()=>{
 const state={uid:'owner',focused:true,offline:false,calls:0};let tree,renew,resolveLate;
 const realSet=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{assert.ok(ms>55000&&ms<=60000);renew=fn;return 777;};
 global.clearTimeout=id=>{if(id!==777)realClear(id);};
 const Photo=loadUI('src/features/marketplace/components/ShowcasePhoto.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:state.uid},offline:state.offline})},
  '@react-navigation/native':{useIsFocused:()=>state.focused},'./MarketplaceUI':{Button:'Button'},
  '../services/postsApi':{viewPostPhoto:async(id,path,uid)=>{assert.equal(id,'post');assert.equal(path,'posts/shop/image');state.calls++;if(state.late)return new Promise(resolve=>{resolveLate=resolve;});return {url:'https://signed.example/'+uid+'/'+state.calls,expiresAt:Date.now()+60000};}},
 }).default;
 const element=()=>React.createElement(Photo,{postId:'post',image:{bucket:'showcase-images',path:'posts/shop/image',url:'https://stale.example/persisted-signed-url'}});
 try{
  await act(async()=>{tree=create(element());});assert.equal(tree.root.findByType('Image').props.source.uri,'https://signed.example/owner/1');
  await act(async()=>renew());assert.equal(state.calls,2);
  await act(async()=>{state.uid='other';tree.update(element());});assert.equal(tree.root.findByType('Image').props.source.uri,'https://signed.example/other/3');
  await act(async()=>{state.focused=false;tree.update(element());});assert.equal(tree.root.findAllByType('Image').length,0);
  await act(async()=>{state.focused=true;state.late=true;tree.update(element());});
  await act(async()=>{state.offline=true;tree.update(element());});
  await act(async()=>resolveLate({url:'https://late.example/secret',expiresAt:Date.now()+60000}));
  assert.equal(tree.root.findAllByType('Image').length,0);
 }finally{if(tree)await act(async()=>tree.unmount());global.setTimeout=realSet;global.clearTimeout=realClear;}
});

test('20 private feed images do not renew inside the first API minute and failures stop renewal',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 let calls=0,limited=false,tree;
 const Photo=loadUI('src/features/marketplace/components/ShowcasePhoto.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'owner'},offline:false})},
  '../services/postsApi':{viewPostPhoto:async()=>{calls++;if(limited)throw Object.assign(Error('Wait'),{status:429});return {url:'https://signed.example/photo',expiresAt:Date.now()+60000};}},
  './MarketplaceUI':{Button:'Button'},
 }).default;
 try{
  await act(async()=>{tree=create(React.createElement(React.Fragment,null,Array.from({length:20},(_,i)=>React.createElement(Photo,{key:i,postId:`post${i}`,image:{bucket:'showcase-images',path:`posts/shop/image${i}`}}))));});
  assert.equal(calls,20);await act(async()=>t.mock.timers.tick(55000));assert.equal(calls,20);
  limited=true;await act(async()=>t.mock.timers.tick(5000));assert.equal(calls,40);
  await act(async()=>t.mock.timers.tick(120000));assert.equal(calls,40,'no timer retries failed images');
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('failed or expired showcase access stays unavailable and offers an explicit retry',async()=>{
 let tree,calls=0;
 const Photo=loadUI('src/features/marketplace/components/ShowcasePhoto.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'owner'},offline:false})},
  '../services/postsApi':{viewPostPhoto:async()=>{calls++;return {url:'https://signed.example/photo',expiresAt:Date.now()-1};}},
  './MarketplaceUI':{Button:'Button'},
 }).default;
 try{
  await act(async()=>{tree=create(React.createElement(Photo,{postId:'post',image:{path:'posts/shop/image',bucket:'showcase-images'}}));});
  assert.equal(tree.root.findAllByType('Image').length,0);assert.match(tree.root.findByType('Text').props.children,/expired/);
  await act(async()=>tree.root.findByType('Button').props.onPress());assert.equal(calls,2);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

function requestFixture({mode='dark'}={}){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const state={uid:'owner',offline:false,focused:true,selected:[],picks:0,uploads:0,busy:[],drafts:[],uncertain:true};
 const file={uri:'file:///synthetic.png',name:'synthetic.png',mimeType:'image/png',size:92};
 const Component=loadUI('src/features/marketplace/components/RequestPhotoUploads.js',{
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode]})},
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:state.uid},offline:state.offline})},
  '@react-navigation/native':{useIsFocused:()=>state.focused},'./MarketplaceUI':{Button:'Button'},'./PrivatePhoto':()=>null,
  '../services/postsApi':{pickPostPhotos:async maximum=>{assert.equal(maximum,1);state.picks++;return [file];}},
  '../services/photoApi':{listPhotos:async()=>({version:3,items:[]}),uploadRequestPhoto:async(vehicle,version,photo,uid)=>{state.uploads++;assert.equal(vehicle,'car');assert.equal(version,3);assert.equal(photo,file);assert.equal(uid,'owner');if(state.late)return new Promise(resolve=>{state.resolve=resolve;});if(state.uncertain)throw Error('Unknown upload outcome');return {id:'request-photo'};}},
 }).default;
 const props=()=>({vehicleId:'car',selectedIds:state.selected,onSelectionChange:ids=>{state.selected=ids;},onBusyChange:value=>state.busy.push(value),onDraftChange:value=>state.drafts.push(value)});
 return {state,Component,props,palette:palettes[mode]};
}

test('direct attachment retries keep the chosen file, attach only a confirmed ID, and never publish a false success',async()=>{
 const {state,Component,props}=requestFixture();let tree;
 try{
  await act(async()=>{tree=create(React.createElement(Component,props()));});
  await act(async()=>tree.root.findByType('Button').props.onPress());assert.deepEqual(state.selected,[]);assert.equal(state.picks,1);assert.equal(state.uploads,0);
  assert.equal(tree.root.findByType('Image').props.accessibilityLabel,'Selected request attachment preview');
  const add=()=>tree.root.findAllByType('Button').find(button=>button.props.title==='Upload attachment');
  await act(async()=>add().props.onPress());
  assert.ok(tree.root.findAllByType('Text').some(n=>String(n.props.children).includes('Unknown')));
  state.uncertain=false;await act(async()=>add().props.onPress());
  assert.deepEqual(state.selected,['request-photo']);assert.equal(state.picks,1);assert.equal(state.uploads,2);
  assert.deepEqual(state.busy,[true,false,true,false,true,false]);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('an attachment acknowledgement after account change cannot enter the new account draft',async()=>{
 const {state,Component,props}=requestFixture();let tree;
 try{
  state.late=true;await act(async()=>{tree=create(React.createElement(Component,props()));});
  await act(async()=>tree.root.findByType('Button').props.onPress());
  await act(async()=>tree.root.findAllByType('Button').find(n=>n.props.title==='Upload attachment').props.onPress());
  await act(async()=>{state.uid='other';tree.update(React.createElement(Component,props()));});
  await act(async()=>state.resolve({id:'old-account-photo'}));assert.deepEqual(state.selected,[]);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('request attachment preparation is cancellable and preserves the five-photo cap without any upload',async()=>{
 const {state,Component,props}=requestFixture();let tree;
 try{
  await act(async()=>{tree=create(React.createElement(Component,props()));});await act(async()=>tree.root.findByType('Button').props.onPress());assert.equal(state.uploads,0);
  await act(async()=>tree.root.findAllByType('Button').find(n=>n.props.title==='Cancel attachment').props.onPress());assert.equal(tree.root.findAllByType('Image').length,0);assert.deepEqual(state.selected,[]);
  state.selected=['1','2','3','4','5'];await act(async()=>tree.update(React.createElement(Component,props())));assert.equal(tree.root.findByType('Button').props.disabled,true);await act(async()=>tree.root.findByType('Button').props.onPress());assert.equal(state.picks,1);assert.equal(state.uploads,0);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('an unuploaded attachment reports an unsaved draft until explicit cancellation or disposal',async()=>{
 const {state,Component,props}=requestFixture();let tree;
 try{
  await act(async()=>{tree=create(React.createElement(Component,props()));});assert.equal(state.drafts.at(-1),false);
  await act(async()=>tree.root.findByType('Button').props.onPress());assert.equal(state.drafts.at(-1),true);assert.equal(state.uploads,0);
  await act(async()=>tree.root.findAllByType('Button').find(n=>n.props.title==='Upload attachment').props.onPress());assert.equal(state.drafts.at(-1),true,'Failed upload retains its local draft');
  await act(async()=>tree.root.findAllByType('Button').find(n=>n.props.title==='Cancel attachment').props.onPress());assert.equal(state.drafts.at(-1),false);
 }finally{if(tree)await act(async()=>tree.unmount());assert.equal(state.drafts.at(-1),false);}
});

test('selected and uploaded attachment captions remain readable in both themes',async()=>{
 const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 for(const mode of ['light','dark']){
  const {state,Component,props,palette}=requestFixture({mode});let tree;
  try{
   await act(async()=>{tree=create(React.createElement(Component,props()));});await act(async()=>tree.root.findByType('Button').props.onPress());
   const caption=()=>tree.root.findAllByType('Text').find(n=>n.props.children==='synthetic.png');assert.ok(contrast(caption().props.style.color,palette.surfaceCard)>=4.5);
   state.uncertain=false;await act(async()=>tree.root.findAllByType('Button').find(n=>n.props.title==='Upload attachment').props.onPress());await act(async()=>tree.update(React.createElement(Component,props())));assert.ok(contrast(caption().props.style.color,palette.surfaceCard)>=4.5);
  }finally{if(tree)await act(async()=>tree.unmount());}
 }
});
