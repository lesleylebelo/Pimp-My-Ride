const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;

async function renderForm({pickPostPhotos,uploadPostPhoto,postsApi,post}){
 const {PostFormScreen}=loadUI('src/features/marketplace/screens/PostScreens.js',{
  'react-native':{Pressable:({children,...props})=>React.createElement('Pressable',props,children)},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'shop-1'},profile:{role:'shop',verificationStatus:'approved'},offline:false})},
  '../services/postsApi':{postsApi,pickPostPhotos,uploadPostPhoto},
  '../hooks/usePostsFeed':{usePostsFeed:()=>({items:[],busy:false,error:'',refresh:async()=>{}})},
  '../components/PostCard':{PostCard:'PostCard'},
  '../components/MarketplaceUI':{
   Page:({children})=>React.createElement('View',null,children),
   Card:({children})=>React.createElement('View',null,children),
   Field:'TextInput',
   Button:({title,onPress,disabled})=>React.createElement('Pressable',{accessibilityLabel:title,onPress,disabled},React.createElement('Text',null,title)),
   Notice:({error})=>error?React.createElement('Text',{accessibilityRole:'alert'},error):null,
   useInfiniteCursor:()=>({items:[]}),
  },
  '../hooks/useMarketData':{useMarketData:()=>({data:null,busy:false,error:'',refresh:async()=>{}})},
 });
 let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(PostFormScreen,{navigation:{goBack(){}},route:{params:{type:'showcase',post}}}));});
 return {tree,unmount:()=>act(async()=>tree.unmount())};
}

const photo=name=>({uri:`file:///${name}.jpg`,name:`${name}.jpg`,size:128,mimeType:'image/jpeg'});

test('retrying a showcase save reuses confirmed uploaded paths instead of changing the publication payload',async()=>{
 let uploads=0;const payloads=[];
 const form=await renderForm({pickPostPhotos:async()=>[photo('stable-upload')],uploadPostPhoto:async()=>({path:`posts/shop-1/upload-${++uploads}`}),postsApi:async(op,data)=>{payloads.push(data);if(payloads.length===1)throw Error('Synthetic lost publication acknowledgement');return {post:{id:'saved'}};}});
 try{
  await act(async()=>form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel?.startsWith('Add photos (')).props.onPress());
  await act(async()=>form.tree.root.findAllByType('TextInput').find(node=>node.props.label==='Title').props.onChangeText('Retry safely'));
  for(let i=0;i<2;i++)await act(async()=>form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Post').props.onPress());
  assert.equal(uploads,1);assert.deepEqual(payloads[0],payloads[1]);
 }finally{await form.unmount();}
});

test('malformed and URL-only historical post media cannot crash editing or silently lose saved references',async()=>{
 for(const images of [{invalid:true},[null],['https://legacy.example.invalid/photo.jpg']]){
  let saves=0;const form=await renderForm({post:{id:'legacy',title:'Legacy showcase',images},pickPostPhotos:async()=>[],uploadPostPhoto:async()=>assert.fail('No upload expected'),postsApi:async()=>{saves++;}});
  try{
   await act(async()=>form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Save changes').props.onPress());
   assert.equal(saves,0);assert.ok(form.tree.root.findAllByType('Text').some(node=>String(node.props.children).includes('published media has been retained')));
  }finally{await form.unmount();}
 }
});

test('an unconfirmed upload response cannot publish a false successful showcase',async()=>{
 for(const response of [{},{path:'posts/another-shop/foreign'},null]){
  let saves=0;
  const form=await renderForm({pickPostPhotos:async()=>[photo('unconfirmed')],uploadPostPhoto:async()=>response,postsApi:async()=>{saves++;}});
  try{
   await act(async()=>form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel?.startsWith('Add photos (')).props.onPress());
   await act(async()=>form.tree.root.findAllByType('TextInput').find(node=>node.props.label==='Title').props.onChangeText('Unconfirmed upload'));
   await act(async()=>form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Post').props.onPress());
   assert.equal(saves,0);assert.ok(form.tree.root.findAllByType('Text').some(node=>node.props.children==='The photo upload could not be confirmed. Try again.'));
  }finally{await form.unmount();}
 }
});

test('a lost save acknowledgement never triggers destructive cleanup of uploaded showcase photos',async()=>{
 let committed=false,cleanupCalls=0;
 const form=await renderForm({
  pickPostPhotos:async()=>[photo('saved-before-timeout')],
  uploadPostPhoto:async()=>({path:'posts/shop-1/ambiguous-save'}),
  postsApi:async(op)=>{if(op==='create'){committed=true;throw new Error('Request outcome is unknown.');}if(op==='removeImage')cleanupCalls++;},
 });
 try{
  const add=form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel?.startsWith('Add photos ('));
  await act(async()=>add.props.onPress());
  const title=form.tree.root.findAllByType('TextInput').find(node=>node.props.label==='Title');
  await act(async()=>title.props.onChangeText('Committed showcase'));
  const submit=form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Post');
  await act(async()=>submit.props.onPress());
  assert.equal(committed,true);assert.equal(cleanupCalls,0);
  assert.ok(form.tree.root.findAllByType('Text').some(node=>node.props.children==='Request outcome is unknown.'));
 }finally{await form.unmount();}
});

test('a later photo-upload failure does not delete earlier uploaded showcase photos',async()=>{
 let uploads=0,saveCalls=0,cleanupCalls=0;
 const form=await renderForm({
  pickPostPhotos:async()=>[photo('first'),photo('second')],
  uploadPostPhoto:async()=>{uploads++;if(uploads===2)throw new Error('Upload connection lost.');return {path:'posts/shop-1/first-upload'};},
  postsApi:async op=>{saveCalls++;if(op==='removeImage')cleanupCalls++;},
 });
 try{
  const add=form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel?.startsWith('Add photos ('));
  await act(async()=>add.props.onPress());
  const title=form.tree.root.findAllByType('TextInput').find(node=>node.props.label==='Title');
  await act(async()=>title.props.onChangeText('Retry showcase'));
  const submit=form.tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Post');
  await act(async()=>submit.props.onPress());
  assert.equal(uploads,2);assert.equal(saveCalls,0);assert.equal(cleanupCalls,0);
  assert.ok(form.tree.root.findAllByType('Text').some(node=>node.props.children==='Upload connection lost.'));
 }finally{await form.unmount();}
});
