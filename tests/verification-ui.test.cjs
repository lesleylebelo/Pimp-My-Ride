const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const password='Synthetic test password';
const error=(code,message='Synthetic account error')=>Object.assign(new Error(message),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
const change=(tree,label,value)=>act(async()=>field(tree,label).props.onChangeText(value));
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());

async function setup(screen,{params={},offline=false,register=async()=>{},login=async()=>{},resend=async()=>{}}={}){
 const calls={register:[],login:[],resend:[],navigation:[],run:0,alerts:[]};
 const context={offline,run:async operation=>{calls.run++;return operation();}};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image','KeyboardAvoidingView'].map(n=>[n,n]));
 native.StyleSheet={create:value=>value};native.Platform={OS:'ios'};
 native.BackHandler={addEventListener:()=>({remove(){}})};
 native.Alert={alert:(...args)=>calls.alerts.push(args)};
 const Screen=loadUI(`src/features/auth/screens/${screen}.js`,{
  'react-native':native,
  '@react-navigation/native':{useFocusEffect:callback=>React.useEffect(callback,[callback])},
  '../context/AuthContext':{useAuth:()=>context},
  '../hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0,error:''})},
  '../services/accounts':{
   register:async(...args)=>{calls.register.push(args);return register(...args);},
   login:async(...args)=>{calls.login.push(args);return login(...args);},
   resendVerification:async(...args)=>{calls.resend.push(args);return resend(...args);},
  },
 }).default;
 const navigation=Object.fromEntries(['navigate','replace','reset','goBack'].map(method=>[method,(...args)=>calls.navigation.push([method,...args])]));
 const element=()=>React.createElement(Screen,{navigation,route:{params}});
 let tree;await act(async()=>{tree=Renderer.create(element());});
 return {tree,calls,context,rerender:()=>act(async()=>tree.update(element())),close:()=>act(async()=>tree.unmount())};
}

async function completeRegistration(s,role='owner'){
 for(const [label,value] of [[role==='shop'?'Owner/representative':'Full name','Demo User'],['Email address','  demo@example.test  '],['Phone number','0821234567'],['Password',password],['Confirm password',password]])await change(s.tree,label,value);
 await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityRole==='checkbox').props.onPress());
 if(role==='shop'){
  await press(s.tree,'Next');
  for(const [label,value] of [['Shop name','Demo workshop'],['Business registration number','Synthetic registration'],['Physical address','Example street'],['City','Johannesburg'],['Province','Gauteng'],['Services offered','Synthetic service']])await change(s.tree,label,value);
 }
}

test('owner and shop registration route only email and delivery status to signed-out verification',async()=>{
 for(const role of ['owner','shop'])for(const delivered of [true,false]){
  const s=await setup('SignUpScreen',{params:{role},register:async()=>{if(!delivered)throw error('auth/verification-email-failed','Account created, but the verification email was not sent.');}});
  await completeRegistration(s,role);await press(s.tree,role==='shop'?'Create shop account':'Create account');
  assert.equal(s.calls.register.length,1);assert.equal(s.calls.register[0][1],role);
  assert.equal(s.calls.register[0][0].fullName,'Demo User');assert.equal(s.calls.register[0][0].agreed,true);
  assert.equal(s.calls.register[0][0].password,password);assert.equal(s.calls.register[0][0].confirmPassword,password);
  assert.deepEqual(s.calls.navigation,[['replace','VerifyEmail',{email:'demo@example.test',emailSent:delivered}]]);
  assert.doesNotMatch(JSON.stringify(s.calls.navigation),/password|Synthetic test/);
  if(role==='shop')await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.findAllByType('Text').some(t=>t.props.children==='Back')).props.onPress());
  assert.equal(field(s.tree,'Password').props.value,'');assert.equal(field(s.tree,'Confirm password').props.value,'');
  assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.resend,[]);await s.close();
 }
});

test('registration validates all required details and blocks offline or duplicate creation',async()=>{
 const pending=deferred(),s=await setup('SignUpScreen',{register:()=>pending.promise});
 await press(s.tree,'Create account');assert.equal(s.calls.register.length,0);assert.match(text(s.tree),/Full name is required/);
 await completeRegistration(s);s.context.offline=true;await s.rerender();await press(s.tree,'Create account');
 assert.equal(s.calls.register.length,0);assert.equal(button(s.tree,'Create account').props.disabled,true);
 s.context.offline=false;await s.rerender();let request;
 await act(async()=>{const submit=button(s.tree,'Create account').props.onPress;request=submit();void submit();});
 assert.equal(s.calls.register.length,1);assert.equal(button(s.tree,'Create account').props.disabled,true);assert.deepEqual(s.calls.navigation,[]);
 await act(async()=>{pending.resolve();await request;});assert.equal(s.calls.navigation.length,1);await s.close();
});

test('account creation failure stays on registration without claiming a verification email was sent',async()=>{
 const s=await setup('SignUpScreen',{register:async()=>{throw error('api/unavailable','Cannot save the account.');}});
 await completeRegistration(s);await press(s.tree,'Create account');
 assert.deepEqual(s.calls.navigation,[]);assert.match(text(s.tree),/Cannot save the account/);
 assert.deepEqual(s.calls.alerts,[['Account creation failed','Cannot save the account.']]);await s.close();
});

test('recovering an already verified account returns to sign in without claiming a verification email was sent',async()=>{
 const s=await setup('SignUpScreen',{register:async()=>({emailVerified:true})});
 await completeRegistration(s);await press(s.tree,'Create account');
 assert.deepEqual(s.calls.navigation,[['reset',{index:0,routes:[{name:'SignIn',params:{email:'demo@example.test'}}]}]]);
 assert.equal(field(s.tree,'Password').props.value,'');assert.equal(field(s.tree,'Confirm password').props.value,'');
 assert.doesNotMatch(text(s.tree),/Verification email sent/);assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.resend,[]);await s.close();
});

test('unverified login clears its password and offers a signed-out resend screen without app navigation',async()=>{
 const s=await setup('SignInScreen',{params:{email:'demo@example.test'},login:async()=>{throw error('auth/email-not-verified','Please verify your email before signing in.');}});
 assert.equal(field(s.tree,'Email address').props.value,'demo@example.test');
 await change(s.tree,'Password',password);await press(s.tree,'Sign in');
 assert.deepEqual(s.calls.login,[['demo@example.test',password]]);assert.equal(field(s.tree,'Password').props.value,'');
 assert.match(text(s.tree),/Please verify your email before signing in/);assert.deepEqual(s.calls.navigation,[]);
 await press(s.tree,'Resend verification email');assert.deepEqual(s.calls.navigation,[['navigate','VerifyEmail',{email:'demo@example.test'}]]);
 assert.deepEqual(s.calls.resend,[]);assert.doesNotMatch(JSON.stringify(s.calls.navigation),/password|Synthetic test/);
 await change(s.tree,'Email address','other@example.test');assert.equal(button(s.tree,'Resend verification email'),undefined);
 await s.close();
});

test('verification screen waits signed out and never sends or logs in just by opening it',async()=>{
 for(const emailSent of [true,false,undefined]){
  const s=await setup('VerifyEmailScreen',{params:{email:'demo@example.test',emailSent}});
  assert.equal(field(s.tree,'Email address').props.value,'demo@example.test');assert.equal(field(s.tree,'Password').props.value,'');
  assert.match(text(s.tree),/You are signed out/);assert.match(text(s.tree),/Resending a link does not sign you in/);
  if(emailSent===true)assert.match(text(s.tree),/Verification email sent/);
  if(emailSent===false)assert.match(text(s.tree),/account was created, but the verification email could not be sent/);
  assert.equal(s.calls.run,0);assert.deepEqual(s.calls.resend,[]);assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.navigation,[]);await s.close();
 }
});

test('verification resend validates credentials, clears the password and returns only email to sign in',async()=>{
 const s=await setup('VerifyEmailScreen');
 await press(s.tree,'Resend verification email');assert.match(text(s.tree),/Email address is required/);assert.match(text(s.tree),/Password is required to resend/);assert.equal(s.calls.run,0);
 await change(s.tree,'Email address','invalid');await change(s.tree,'Password',password);await press(s.tree,'Resend verification email');
 assert.match(text(s.tree),/Enter a valid email address/);assert.deepEqual(s.calls.resend,[]);
 await change(s.tree,'Email address','  demo@example.test  ');await press(s.tree,'Resend verification email');
 assert.deepEqual(s.calls.resend,[['demo@example.test',password]]);assert.equal(field(s.tree,'Password').props.value,'');
 assert.match(text(s.tree),/Verification email sent/);assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.navigation,[]);
 await press(s.tree,'Back to sign in');assert.deepEqual(s.calls.navigation,[['reset',{index:0,routes:[{name:'SignIn',params:{email:'demo@example.test'}}]}]]);
 await s.close();
});

test('verification resend is locked while pending and does not authenticate on completion',async()=>{
 const pending=deferred(),s=await setup('VerifyEmailScreen',{params:{email:'demo@example.test'},resend:()=>pending.promise});
 await change(s.tree,'Password',password);let request;
 await act(async()=>{const submit=button(s.tree,'Resend verification email').props.onPress;request=submit();void submit();});
 assert.equal(s.calls.resend.length,1);assert.equal(s.calls.run,1);
 assert.equal(button(s.tree,'Resend verification email').props.disabled,true);assert.equal(button(s.tree,'Back to sign in').props.disabled,true);
 assert.equal(field(s.tree,'Email address').props.editable,false);assert.equal(field(s.tree,'Password').props.editable,false);
 await act(async()=>{pending.resolve();await request;});
 assert.equal(field(s.tree,'Password').props.value,'');assert.equal(!!button(s.tree,'Resend verification email').props.disabled,false);
 assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.navigation,[]);await s.close();
});

test('offline verification resend makes no account calls and can be retried after reconnection',async()=>{
 const s=await setup('VerifyEmailScreen',{params:{email:'demo@example.test'},offline:true});await change(s.tree,'Password',password);
 assert.equal(button(s.tree,'Resend verification email').props.disabled,true);await press(s.tree,'Resend verification email');
 assert.equal(s.calls.run,0);assert.deepEqual(s.calls.resend,[]);assert.match(text(s.tree),/Connect to the internet to resend/);
 s.context.offline=false;await s.rerender();await press(s.tree,'Resend verification email');
 assert.equal(s.calls.resend.length,1);assert.equal(field(s.tree,'Password').props.value,'');assert.deepEqual(s.calls.login,[]);await s.close();
});

test('verification resend failures clear entered passwords and never claim successful delivery or sign in',async()=>{
 for(const code of ['auth/invalid-credential','auth/network-request-failed','auth/email-already-verified']){
  const s=await setup('VerifyEmailScreen',{params:{email:'demo@example.test',emailSent:true},resend:async()=>{throw error(code);}});
  await change(s.tree,'Password',password);await press(s.tree,'Resend verification email');
  assert.equal(field(s.tree,'Password').props.value,'');assert.doesNotMatch(text(s.tree),/Verification email sent/);
  assert.match(text(s.tree),code==='auth/invalid-credential'?/Email or password is incorrect/:code==='auth/network-request-failed'?/internet connection/:/already verified. Return to sign in/);
  assert.deepEqual(s.calls.login,[]);assert.deepEqual(s.calls.navigation,[]);
  await press(s.tree,'Resend verification email');assert.equal(s.calls.resend.length,1);assert.match(text(s.tree),/Password is required to resend/);await s.close();
 }
});

test('navigation refuses unverified user objects for every role and opens the sign-in stack',async()=>{
 const placeholder=()=>null;
 const screenMocks=Object.fromEntries([
  '../features/auth/screens/AccountScreen','../features/marketplace/OwnerNavigator',
  '../features/marketplace/ShopNavigator','../features/admin/AdminNavigator',
  '../features/auth/screens/LegalScreen','../features/auth/screens/SplashScreen',
  '../features/auth/screens/SignInScreen','../features/auth/screens/SignUpScreen',
  '../features/auth/screens/ForgotPasswordScreen','../features/auth/screens/VerifyEmailScreen','../shared/components/BackendStatus',
 ].map(name=>[name,placeholder]));
 const initialRoutes=[];
 for(const role of ['owner','shop','admin']){
  const Navigator=loadUI('src/navigation/AppNavigator.js',{
   ...screenMocks,
   '../features/auth/context/AuthContext':{useAuth:()=>({user:{uid:'synthetic',emailVerified:false},profile:{role,verificationStatus:'approved'},initializing:false,working:false})},
   '@react-navigation/native':{NavigationContainer:'NavigationContainer'},
   '@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'StackNavigator',Screen:'StackScreen'})},
   'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'expo-status-bar':{StatusBar:'StatusBar'},
  }).default;
  let tree;await act(async()=>{tree=Renderer.create(React.createElement(Navigator));});
  try{
   assert.deepEqual(tree.root.findAllByType('StackScreen').map(n=>n.props.name),['Legal','Splash','SignIn','SignUp','ForgotPassword','VerifyEmail']);
   initialRoutes.push(tree.root.findByType('StackNavigator').props.initialRouteName);
  }finally{await act(async()=>tree.unmount());}
 }
 assert.deepEqual(initialRoutes,['SignIn','SignIn','SignIn']);
});
