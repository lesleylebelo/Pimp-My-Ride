const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
async function startup(t,{reduced=false,ready=false,failedNative=false,pendingPreference=false}={}) {
 t.mock.timers.enable({apis:['setTimeout']});
 const calls={dismiss:0,hide:0,hold:0,animations:[],removed:0};let preference,resolvePreference;
 const Splash=loadUI('src/shared/components/StartupSplash.js',{
  'expo-splash-screen':{preventAutoHideAsync:async()=>{calls.hold++;if(failedNative)throw Error('unavailable');},hideAsync:async()=>{calls.hide++;if(failedNative)throw Error('unavailable');}},
  'react-native':{AccessibilityInfo:{isReduceMotionEnabled:()=>pendingPreference?new Promise(resolve=>{resolvePreference=resolve;}):Promise.resolve(reduced),addEventListener:(event,fn)=>{preference=fn;return {remove:()=>calls.removed++};}},Animated:{Value:class{constructor(v){this.value=v;}setValue(v){this.value=v;}},View:'AnimatedView',timing:(value,config)=>{const record={value,config,stopped:false};calls.animations.push(record);return {start(cb){record.finish=cb;},stop(){record.stopped=true;}};}}},
 }).default;
 const onDismiss=()=>calls.dismiss++;let tree;
 await act(async()=>{tree=create(React.createElement(Splash,{ready,onDismiss}));});
 return {tree,calls,preference,resolvePreference,update:async ready=>act(async()=>tree.update(React.createElement(Splash,{ready,onDismiss}))),close:async()=>act(async()=>tree.unmount())};
}
test('startup holds native splash until matching image and layout are ready, once only',async t=>{
 const s=await startup(t);t.after(s.close);assert.equal(s.calls.hold,1);
 const overlay=s.tree.root.findByProps({testID:'startup-splash'});assert.equal(overlay.props.pointerEvents,'none');
 await act(async()=>overlay.props.onLayout());assert.equal(s.calls.hide,0);
 await act(async()=>s.tree.root.findByType('Image').props.onLoadEnd());assert.equal(s.calls.hide,1);
 await act(async()=>overlay.props.onLayout());assert.equal(s.calls.hide,1);
 assert.equal(s.tree.root.findByType('Text').props.children,'Connect. Customize. Drive your style.');
});
test('short native-driver animations never delay ready handoff and have an independent exit fallback',async t=>{
 const s=await startup(t);t.after(s.close);assert.deepEqual(s.calls.animations.map(a=>a.config.duration),[280,220]);
 assert.ok(s.calls.animations.every(a=>a.config.useNativeDriver));
 await s.update(false);assert.equal(s.calls.animations.length,2);
 await s.update(true);assert.ok(s.calls.animations.slice(0,2).every(a=>a.stopped));
 assert.equal(s.calls.animations.at(-1).config.duration,120);
 await act(async()=>t.mock.timers.tick(180));assert.equal(s.calls.dismiss,1);
 await act(async()=>s.calls.animations.at(-1).finish({finished:true}));assert.equal(s.calls.dismiss,1);
});
test('reduced motion skips entrance and immediately dismisses on readiness',async t=>{
 const s=await startup(t,{reduced:true});t.after(s.close);assert.equal(s.calls.animations.length,0);
 await s.update(true);assert.equal(s.calls.dismiss,1);
});
test('live reduced-motion changes stop entrance motion',async t=>{
 const s=await startup(t);t.after(s.close);
 await act(async()=>s.preference(true));assert.ok(s.calls.animations.every(a=>a.stopped));
 await s.update(true);assert.equal(s.calls.dismiss,1);
});
test('native API failures and stalled initialization cannot indefinitely trap splash',async t=>{
 const s=await startup(t,{failedNative:true});t.after(s.close);
 await act(async()=>t.mock.timers.tick(12000));assert.equal(s.calls.dismiss,1);
});
test('unmount cancels startup timers, animations and accessibility subscriptions',async t=>{
 const s=await startup(t);await s.close();await act(async()=>t.mock.timers.tick(20000));
 assert.equal(s.calls.dismiss,0);assert.equal(s.calls.removed,1);assert.ok(s.calls.animations.every(a=>a.stopped));
});
test('legacy Splash routes reuse SignIn without dispatching a replacement into a changed auth navigator',async()=>{
 const SignIn=()=>null;
 const Screen=loadUI('src/features/auth/screens/SplashScreen.js',{'./SignInScreen':SignIn}).default,moves=[];let tree;
 assert.equal(Screen,SignIn);
 await act(async()=>{tree=create(React.createElement(Screen,{navigation:{replace:r=>moves.push(r),getState:()=>({routeNames:['AdminHome']})},route:{params:{email:'saved@example.invalid'}}}));});
 assert.deepEqual(moves,[]);assert.equal(tree.root.findByType(SignIn).props.route.params.email,'saved@example.invalid');await act(async()=>tree.unmount());
});

test('boot overlay hands off to existing role routes once, without resetting navigation state or replaying on auth changes',async()=>{
 for(const role of [null,'owner','shop','admin']){
  let auth={initializing:true,working:false,user:null,profile:null};
  const placeholder=()=>null;
  const screenMocks=Object.fromEntries([
   '../features/auth/screens/AccountScreen','../features/marketplace/OwnerNavigator','../features/marketplace/ShopNavigator','../features/admin/AdminNavigator',
   '../features/auth/screens/LegalScreen','../features/auth/screens/SplashScreen','../features/auth/screens/SignInScreen','../features/auth/screens/SignUpScreen',
   '../features/auth/screens/ForgotPasswordScreen','../features/auth/screens/VerifyEmailScreen','../shared/components/BackendStatus',
  ].map(name=>[name,placeholder]));
  const Navigator=loadUI('src/navigation/AppNavigator.js',{
   ...screenMocks,'../shared/components/StartupSplash':'BootSplash',
   '../features/auth/context/AuthContext':{useAuth:()=>auth},
   '@react-navigation/native':{NavigationContainer:'NavigationContainer'},
   '@react-navigation/native-stack':{createNativeStackNavigator:()=>({Navigator:'StackNavigator',Screen:'StackScreen'})},
   'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},
  }).default;
  let tree;await act(async()=>{tree=create(React.createElement(Navigator));});
  try{
   assert.equal(tree.root.findByType('BootSplash').props.ready,false);
   assert.equal(tree.root.findAllByType('NavigationContainer').length,0);
   auth={...auth,initializing:false,user:role?{uid:'test',emailVerified:true}:null,profile:role?{role,verificationStatus:'approved',termsAccepted:true}:null};
   await act(async()=>tree.update(React.createElement(Navigator)));
   const route=tree.root.findByType('StackNavigator').props.initialRouteName;
   assert.equal(route,role?{owner:'OwnerHome',shop:'ShopHome',admin:'AdminHome'}[role]:'SignIn');
   const navigation=tree.root.findByType('NavigationContainer');
   // Overlay only observes readiness: no reset, replacement, or linking props.
   assert.deepEqual(Object.keys(navigation.props).sort(),['children','onReady']);
   await act(async()=>navigation.props.onReady());assert.equal(tree.root.findByType('BootSplash').props.ready,true);
   await act(async()=>tree.root.findByType('BootSplash').props.onDismiss());
   assert.equal(tree.root.findAllByType('BootSplash').length,0);
   const instance=tree.root.findByType('NavigationContainer');
   auth={...auth,working:true};await act(async()=>tree.update(React.createElement(Navigator)));
   assert.equal(tree.root.findByType('NavigationContainer'),instance);
   auth={...auth,user:null,profile:null,working:false};await act(async()=>tree.update(React.createElement(Navigator)));
   assert.equal(tree.root.findAllByType('BootSplash').length,0);
   assert.equal(tree.root.findByType('StackNavigator').props.initialRouteName,'SignIn');
  }finally{await act(async()=>tree.unmount());}
 }
});

test('startup errors reveal existing restricted account route instead of bypassing permissions',async()=>{
 const {getAuthenticatedRoute}=loadUI('src/navigation/landingRoute.js');
 assert.equal(getAuthenticatedRoute({uid:'test',emailVerified:true},{role:'owner'},'Offline access unavailable'),'Account');
});


test('a slow accessibility preference never flashes the tagline before its entrance',async t=>{
 const s=await startup(t,{pendingPreference:true});t.after(s.close);
 const animated=s.tree.root.findAllByType('AnimatedView');
 assert.equal(animated.at(-1).props.style[1].opacity.value,0);
 assert.equal(s.calls.animations.length,0);
 await act(async()=>s.resolvePreference(false));
 assert.equal(s.calls.animations.length,2);
 assert.equal(s.calls.animations[1].value.value,0);
});
