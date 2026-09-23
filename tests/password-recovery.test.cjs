const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const error=code=>Object.assign(new Error('Synthetic test error'),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
const change=(tree,value)=>act(async()=>field(tree,'Email Address').props.onChangeText(value));
const send=tree=>act(async()=>button(tree,'Send Reset Link').props.onPress());
async function setup({send:sendRequest=async()=>{},connection=async()=>{}}={}){
 const auth={},calls={send:[],navigation:[],connection:0};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image','KeyboardAvoidingView'].map(n=>[n,n]));
 native.StyleSheet={create:value=>value};native.Platform={OS:'web'};
 const Screen=loadUI('src/features/auth/screens/ForgotPasswordScreen.js',{
  'react-native':native,
  'firebase/auth':{sendPasswordResetEmail:async(...args)=>{calls.send.push(args);return sendRequest(...args);}},
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/network':{requireConnection:async()=>{calls.connection++;await connection();}},
 }).default;
 const navigation={reset:(...args)=>calls.navigation.push(['reset',...args])};
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(Screen,{navigation}));});
 return {tree,calls,auth,close:async()=>act(async()=>tree.unmount())};
}

test('forgot password validates email live and before requesting a hosted link',async()=>{
 const s=await setup();
 await send(s.tree);assert.match(text(s.tree),/Email address is required/);
 await change(s.tree,'invalid');assert.match(text(s.tree),/Enter a valid email address/);
 await send(s.tree);assert.deepEqual(s.calls.send,[]);assert.equal(s.calls.connection,0);
 await change(s.tree,'  demo@example.test  ');await send(s.tree);
 assert.deepEqual(s.calls.send,[[s.auth,'demo@example.test']]);
 assert.match(text(s.tree),/If an account exists/);assert.match(text(s.tree),/Open the link in your browser/);
 assert.match(text(s.tree),/return to this app and sign in/);assert.deepEqual(s.calls.navigation,[]);
 await s.close();
});

test('hosted-link request blocks concurrent taps and another send after confirmation',async()=>{
 const wait=deferred(),s=await setup({send:()=>wait.promise});
 await change(s.tree,'demo@example.test');let pending;
 await act(async()=>{const request=button(s.tree,'Send Reset Link').props.onPress;pending=request();void request();});
 assert.equal(s.calls.send.length,1);assert.equal(button(s.tree,'Send Reset Link').props.disabled,true);
 assert.equal(field(s.tree,'Email Address').props.editable,false);
 await act(async()=>{wait.resolve();await pending;});
 assert.equal(button(s.tree,'Email requested').props.disabled,true);
 await act(async()=>button(s.tree,'Email requested').props.onPress());assert.equal(s.calls.send.length,1);
 await s.close();
});

test('unknown and disabled accounts receive the same non-enumerating confirmation',async()=>{
 let expected;
 for(const code of [null,'auth/user-not-found','auth/user-disabled']){
  const s=await setup({send:async()=>{if(code)throw error(code);}});
  await change(s.tree,'demo@example.test');await send(s.tree);
  const actual=text(s.tree);if(!expected)expected=actual;else assert.equal(actual,expected);
  assert.match(actual,/If an account exists/);assert.doesNotMatch(actual,/has been disabled|incorrect/);
  assert.equal(button(s.tree,'Email requested').props.disabled,true);await s.close();
 }
});

test('offline request makes no Auth call and can be retried after reconnection',async()=>{
 let offline=true;const s=await setup({connection:async()=>{if(offline)throw Error('Connect to the internet.');}});
 await change(s.tree,'demo@example.test');await send(s.tree);
 assert.equal(s.calls.send.length,0);assert.match(text(s.tree),/Connect to the internet/);
 assert.equal(!!button(s.tree,'Send Reset Link').props.disabled,false);
 offline=false;await send(s.tree);assert.equal(s.calls.send.length,1);assert.match(text(s.tree),/If an account exists/);
 await s.close();
});

test('network and rate-limit errors stay retryable without claiming the email was requested',async()=>{
 for(const code of ['auth/network-request-failed','auth/too-many-requests']){
  let fail=true;const s=await setup({send:async()=>{if(fail)throw error(code);}});
  await change(s.tree,'demo@example.test');await send(s.tree);
  assert.match(text(s.tree),code==='auth/network-request-failed'?/internet connection/:/Please wait/);
  assert.doesNotMatch(text(s.tree),/If an account exists/);assert.equal(field(s.tree,'Email Address').props.value,'demo@example.test');
  fail=false;await send(s.tree);assert.equal(s.calls.send.length,2);assert.match(text(s.tree),/If an account exists/);
  await s.close();
 }
});

test('editing a confirmed address clears its confirmation and validates the next address',async()=>{
 const s=await setup();await change(s.tree,'first@example.test');await send(s.tree);
 await change(s.tree,'invalid');assert.doesNotMatch(text(s.tree),/If an account exists/);
 await send(s.tree);assert.equal(s.calls.send.length,1);
 await change(s.tree,'second@example.test');await send(s.tree);
 assert.deepEqual(s.calls.send,[[s.auth,'first@example.test'],[s.auth,'second@example.test']]);await s.close();
});

test('hosted recovery returns to a clean shared sign-in stack',async()=>{
 const s=await setup();await change(s.tree,'demo@example.test');await send(s.tree);
 await act(async()=>button(s.tree,'Back to Sign In').props.onPress());
 assert.deepEqual(s.calls.navigation,[['reset',{index:0,routes:[{name:'SignIn'}]}]]);await s.close();
});

test('guest navigation exposes email recovery without custom password-reset routes',async()=>{
 const placeholder=()=>null;
 const screenMocks=Object.fromEntries([
  '../features/auth/screens/AccountScreen','../features/customer/screens/OwnerHomeScreen',
  '../features/shop/screens/ShopHomeScreen','../features/admin/AdminNavigator',
  '../features/auth/screens/LegalScreen','../features/auth/screens/SplashScreen',
  '../features/auth/screens/SignInScreen','../features/auth/screens/SignUpScreen',
  '../features/auth/screens/ForgotPasswordScreen','../shared/components/BackendStatus',
 ].map(name=>[name,placeholder]));
 const Navigator=loadUI('src/navigation/AppNavigator.js',{
  ...screenMocks,
  '../features/auth/context/AuthContext':{useAuth:()=>({user:null,profile:null,initializing:false,working:false})},
  '@react-navigation/native':{NavigationContainer:'NavigationContainer'},
  '@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'StackNavigator',Screen:'StackScreen'})},
  'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'expo-status-bar':{StatusBar:'StatusBar'},
 }).default;
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(Navigator));});
 assert.deepEqual(tree.root.findAllByType('StackScreen').map(n=>n.props.name),['Legal','Splash','SignIn','SignUp','ForgotPassword']);
 await act(async()=>tree.unmount());
});
