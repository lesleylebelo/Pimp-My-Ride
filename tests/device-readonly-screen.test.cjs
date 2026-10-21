const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const keys=['EXPO_PUBLIC_PMR_DEVICE_READ_ONLY','EXPO_PUBLIC_API_URL','EXPO_PUBLIC_FIREBASE_PROJECT_ID','EXPO_PUBLIC_PMR_DEVICE_TEST_SIGN_IN','EXPO_PUBLIC_PMR_DEVICE_TEST_CUSTOMER_EMAIL'];
function environment(t){const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]])),dev=global.__DEV__;t.after(()=>{for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];if(dev===undefined)delete global.__DEV__;else global.__DEV__=dev;});process.env.EXPO_PUBLIC_PMR_DEVICE_READ_ONLY='true';process.env.EXPO_PUBLIC_API_URL='http://192.168.1.10:3102';process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID='pimp-my-ride-a26fc';global.__DEV__=true;}
test('normal app entry ignores retired device flags and retains auth, presence and navigation',t=>{
 environment(t);const Auth=()=>null,Theme=()=>null,Presence=()=>null,Navigator=()=>null;
 const App=loadUI('App.js',{
  './src/features/auth/context/AuthContext':{AuthProvider:Auth},'./src/shared/theme/ThemeContext':{ThemeProvider:Theme},'./src/features/activity/PresenceTracker':Presence,'./src/navigation/AppNavigator':Navigator,
  './src/features/marketplace/components/DeviceReadOnlyCheck':{default:()=>assert.fail('Retired diagnostic entry must not load.')},
 }).default;
 for(const dev of [true,false]){
  global.__DEV__=dev;
  for(const origin of ['https://pimp-my-ride.onrender.com','http://192.168.1.10:3102']){
   process.env.EXPO_PUBLIC_API_URL=origin;const tree=App();assert.equal(tree.type,Theme);assert.equal(tree.props.children.type,Auth);
   assert.deepEqual(React.Children.toArray(tree.props.children.props.children).map(child=>child.type),[Presence,Navigator]);
  }
 }
});
test('device screen uses existing test session for list only, never signs in or requests previews',async t=>{
 environment(t);let calls=0,authCallback;const auth={};
 const Screen=loadUI('src/features/marketplace/components/DeviceReadOnlyCheck.js',{
  'react-native':{Button:'NativeButton'},'firebase/auth':{onAuthStateChanged:(value,fn)=>{assert.equal(value,auth);authCallback=fn;fn({uid:'aT6RWRl4AtQjtJKYIiD39eaR3x73'});return()=>{};}},
  '../../../shared/services/firebase':{firebase:()=>({auth})},'../services/photoApi':{listPhotos:async(...args)=>{calls++;assert.deepEqual(args,['vehicle','78gG6bPHbGvCTOCuZAwR','aT6RWRl4AtQjtJKYIiD39eaR3x73']);return {items:[],version:0};}},
 }).default;
 let tree;try{
  await act(async()=>{tree=create(React.createElement(Screen));});
  assert.equal(calls,0);await act(async()=>tree.root.findByType('NativeButton').props.onPress());assert.equal(calls,1);
  assert.ok(tree.root.findAllByType('Text').some(node=>String(node.props.children).includes('Authenticated metadata read passed')));
  await act(async()=>authCallback({uid:'JbUoD5CEHHgyzlxjDFFvGnTvUot2'}));
  await act(async()=>tree.root.findByType('NativeButton').props.onPress());assert.equal(calls,1);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('empty saved session stops waiting and sign-in stays disabled without explicit configuration',async t=>{
 environment(t);delete process.env.EXPO_PUBLIC_PMR_DEVICE_TEST_SIGN_IN;
 const Screen=loadUI('src/features/marketplace/components/DeviceReadOnlyCheck.js',{
  'react-native':{Button:'NativeButton'},'firebase/auth':{onAuthStateChanged:(_auth,fn)=>{fn(null);return()=>{};},signInWithEmailAndPassword:()=>assert.fail('Unapproved sign-in')},
  '../../../shared/services/firebase':{firebase:()=>({auth:{}})},'../services/photoApi':{listPhotos:()=>assert.fail('No session means no metadata request')},'../../../shared/services/api':{apiRequest:()=>assert.fail('No request permitted')},
 }).default;
 let tree;try{await act(async()=>{tree=create(React.createElement(Screen));});
  assert.ok(tree.root.findAllByType('Text').some(node=>String(node.props.children).includes('No saved test session')));
  assert.equal(tree.root.findAllByType('TextInput').length,0);assert.equal(tree.root.findByType('NativeButton').props.disabled,true);
 }finally{if(tree)await act(async()=>tree.unmount());}
});

test('approved isolated customer check keeps password memory-only and uses only the scoped metadata operation',async t=>{
 environment(t);process.env.EXPO_PUBLIC_PMR_DEVICE_TEST_SIGN_IN='true';process.env.EXPO_PUBLIC_PMR_DEVICE_TEST_CUSTOMER_EMAIL='test@example.invalid';
 const auth={},calls=[],password='synthetic-test-password';let closed=false,uid='aT6RWRl4AtQjtJKYIiD39eaR3x73',metadataCalls=0;
 const Screen=loadUI('src/features/marketplace/components/DeviceReadOnlyCheck.js',{
  'react-native':{Button:'NativeButton'},'firebase/auth':{onAuthStateChanged:(_auth,fn)=>{fn(null);return()=>{};},signInWithEmailAndPassword:async(...args)=>{calls.push(args);return {user:{uid,emailVerified:true}};}},
  '../../../shared/services/firebase':{firebase:()=>({auth:{}}),withIsolatedAuth:async fn=>{try{return await fn({auth});}finally{closed=true;}}},'../services/photoApi':{listPhotos:()=>assert.fail('Main account must not be used')},
  '../../../shared/services/api':{apiRequest:async(...args)=>{metadataCalls++;assert.deepEqual(args,['photos',{op:'list',target:'vehicle',id:'78gG6bPHbGvCTOCuZAwR'},{authClient:auth,expectedUid:'aT6RWRl4AtQjtJKYIiD39eaR3x73'}]);return {items:[],version:0};}},
 }).default;
 let tree;try{await act(async()=>{tree=create(React.createElement(Screen));});
  const input=()=>tree.root.findAllByType('TextInput').find(node=>node.props.secureTextEntry);
  await act(async()=>input().props.onChangeText(password));
  await act(async()=>tree.root.findAllByType('NativeButton').find(node=>node.props.title==='Sign in for isolated read-only check').props.onPress());
  assert.deepEqual(calls,[[auth,'test@example.invalid',password]]);assert.equal(input().props.value,'');assert.equal(closed,true);
  uid='JbUoD5CEHHgyzlxjDFFvGnTvUot2';closed=false;
  await act(async()=>input().props.onChangeText(password));
  await act(async()=>tree.root.findAllByType('NativeButton').find(node=>node.props.title==='Sign in for isolated read-only check').props.onPress());
  assert.equal(metadataCalls,1);assert.equal(closed,true);assert.equal(input().props.value,'');
 }finally{if(tree)await act(async()=>tree.unmount());}
});
