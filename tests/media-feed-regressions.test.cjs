const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const photos=loadUI('src/features/marketplace/utils/photos.js');

test('media URLs allow only HTTPS normally and the configured synthetic endpoint in explicit demo mode',()=>{
 const {isMediaUrl}=loadUI('src/shared/services/mediaUrl.js');
 assert.equal(isMediaUrl('https://images.example.invalid/photo',null),true);
 for(const url of ['http://images.example.invalid/photo','file:///photo','javascript:alert(1)',null,'https://user:password@images.example.invalid/photo'])assert.equal(isMediaUrl(url,null),false);
 const demo={apiURL:'http://127.0.0.1:3000'};
 assert.equal(isMediaUrl(demo.apiURL+'/__demo/media/photos?signature=synthetic',demo),true);
 assert.equal(isMediaUrl(demo.apiURL+'/__demo/media/posts?path=synthetic',demo),true);
 for(const url of ['https://production.example/photo','http://127.0.0.1:3001/__demo/media/photos','http://127.0.0.1:3000/other','http://127.0.0.1:3000.evil.invalid/__demo/media/photos'])assert.equal(isMediaUrl(url,demo),false);
});

test('HEIC converts before upload validation and uses the actual converted byte count',async()=>{
 let options;
 const file=await photos.preparePhoto({uri:'file:///photo.heic',name:'photo.heic',mimeType:'image/heic',size:1000},{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(uri,actions,value)=>{options=value;return {uri:'file:///converted.jpg',base64:'YWJjZA=='};}});
 assert.equal(options.base64,true);assert.equal(file.size,4);assert.equal(file.mimeType,'image/jpeg');assert.equal(file.name,'photo.jpg');assert.equal(photos.photoFileError(file),'');
});

test('unknown converted size, oversized conversion, unsupported input and oversized source fail closed',async()=>{
 const asset={uri:'file:///photo.png',name:'photo.png',mimeType:'image/png'};
 for(const result of [{uri:'file:///out.jpg'},{uri:'file:///out.jpg',fileSize:photos.PHOTO_MAX_BYTES+1}])await assert.rejects(()=>photos.preparePhoto(asset,{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>result}),/size|5 MB/);
 const noDecode={SaveFormat:{JPEG:'jpeg'},manipulateAsync:async()=>assert.fail('Invalid input must not be decoded')};
 await assert.rejects(()=>photos.preparePhoto({...asset,mimeType:'image/gif'},noDecode),/Choose/);
 await assert.rejects(()=>photos.preparePhoto({...asset,size:photos.PHOTO_MAX_BYTES+1},noDecode),/5 MB/);
});

test('a full showcase never launches an unlimited zero-selection picker',async()=>{
 const api=loadUI('src/features/marketplace/services/postsApi.js',{'react-native':{Platform:{OS:'ios'}},'../utils/photos':photos});
 assert.deepEqual(await api.pickPostPhotos(0,{loadImagePicker:async()=>assert.fail('Picker must stay closed')}),[]);
});

test('post feed retries a failed pagination cursor and refocus inserts newly published content',async()=>{
 const state={focused:true,calls:[],fail:true,fresh:false};let current,tree;
 const {usePostsFeed}=loadUI('src/features/marketplace/hooks/usePostsFeed.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'owner'},offline:false})},
  '@react-navigation/native':{useIsFocused:()=>state.focused},
  '../services/postsApi':{postsApi:async(op,input)=>{state.calls.push(input);if(input.cursor){if(state.fail)throw Error('Temporary outage');return {items:[{id:'older'}]};}return {items:[{id:state.fresh?'newly-published':'first'}],cursor:'next'};}},
 });
 function Screen(){current=usePostsFeed();return null;}
 try{
  await act(async()=>{tree=create(React.createElement(Screen));});
  await act(async()=>current.loadNext());assert.match(current.error,/outage/);
  state.fail=false;await act(async()=>current.loadNext());assert.deepEqual(current.items.map(p=>p.id),['first','older']);
  await act(async()=>{state.focused=false;tree.update(React.createElement(Screen));});
  await act(async()=>{state.focused=true;state.fresh=true;tree.update(React.createElement(Screen));});
  assert.deepEqual(current.items.map(p=>p.id),['newly-published']);assert.equal(state.calls.at(-1).cursor,undefined);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('Find Jobs refresh and refocus reset pagination to the first page and remove stale rows',async()=>{
 const state={focused:true,calls:[],fresh:false};let current,tree;
 const mocks={'../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'shop'},profile:{role:'shop'},offline:false})},'@react-navigation/native':{useIsFocused:()=>state.focused},'../services/marketApi':{marketApi:async(op,input)=>{state.calls.push(input);return input.cursor?{items:[{id:'older'}],cursor:null}:{items:[{id:state.fresh?'new-job':'first'}],cursor:'next'};}},'../../../shared/components/landing/LandingUI':{LandingShell:'View'}};
 const {useMarketData}=loadUI('src/features/marketplace/hooks/useMarketData.js',mocks);
 const {useInfiniteCursor}=loadUI('src/features/marketplace/components/MarketplaceUI.js',mocks);
 function Screen(){const [cursor,setCursor]=React.useState(null);const read=useMarketData('requests',{feed:'open',cursor},setCursor);const feed=useInfiniteCursor(read.data,read.busy,setCursor,{pageCursor:cursor});current={...read,...feed};return null;}
 try{
  await act(async()=>{tree=create(React.createElement(Screen));});await act(async()=>current.loadNext());assert.deepEqual(current.items.map(p=>p.id),['first','older']);
  state.fresh=true;await act(async()=>current.refresh());assert.deepEqual(current.items.map(p=>p.id),['new-job']);assert.equal(state.calls.at(-1).cursor,null);
  await act(async()=>current.loadNext());await act(async()=>{state.focused=false;tree.update(React.createElement(Screen));});await act(async()=>{state.focused=true;tree.update(React.createElement(Screen));});
  assert.equal(state.calls.at(-1).cursor,null);assert.deepEqual(current.items.map(p=>p.id),['new-job']);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('Garage resolves persisted asset IDs, renews authorised URLs and discards a previous account response',async t=>{
 const state={uid:'owner',focused:true,calls:0};let tree,renew;
 const realTimeout=global.setTimeout,realClear=global.clearTimeout;
 global.setTimeout=(fn,ms)=>{if(ms>=1000&&ms<=55000){renew=fn;return 123;}return realTimeout(fn,ms);};
 global.clearTimeout=id=>{if(id!==123)realClear(id);};
 const Photo=loadUI('src/features/marketplace/components/PrivatePhoto.js',{
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:state.uid},offline:false})},'@react-navigation/native':{useIsFocused:()=>state.focused},
  '../services/photoApi':{listPhotos:async()=>({items:[{id:'saved-id'}]}),viewPhoto:async(target,id,photoId,uid)=>{assert.equal(photoId,'saved-id');state.calls++;return {url:`https://private.example.invalid/${uid}/${state.calls}`,expiresAt:Date.now()+60000};}},'./MarketplaceUI':{Button:'Button'},
 }).default;
 try{
  await act(async()=>{tree=create(React.createElement(Photo,{target:'vehicle',id:'car'}));});assert.equal(tree.root.findByType('Image').props.source.uri,'https://private.example.invalid/owner/1');
  await act(async()=>renew());assert.equal(state.calls,2);assert.match(tree.root.findByType('Image').props.source.uri,/owner\/2/);
  await act(async()=>{state.uid='other';tree.update(React.createElement(Photo,{target:'vehicle',id:'car'}));});assert.match(tree.root.findByType('Image').props.source.uri,/other\/3/);
  await act(async()=>{state.focused=false;tree.update(React.createElement(Photo,{target:'vehicle',id:'car'}));});assert.equal(tree.root.findAllByType('Image').length,0);
 }finally{if(tree)await act(async()=>tree.unmount());global.setTimeout=realTimeout;global.clearTimeout=realClear;}
});
