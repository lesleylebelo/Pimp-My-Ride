const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const content=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
async function setup({login=async()=>{},pick=async()=>({credential:'android-token',nonce:'n'.repeat(64)}),offline=false}={}){
 let attempt;const calls=[];
 const exchange=()=>{};
 const Component=loadUI('src/features/auth/components/GoogleSignIn.android.js',{
  '../context/AuthContext':{useAuth:()=>({offline,working:false,run:async fn=>fn()})},
  '../services/googleIdentity.android':{acquireAndroidGoogle:async signal=>{calls.push(['picker',signal]);return pick(signal);},exchangeAndroidGoogle:exchange},
  '../services/googleAccounts':{cancelled:()=>Object.assign(Error('Cancelled'),{code:'auth/google-cancelled'}),googleLogin:async args=>{calls.push(['login']);attempt=args;return login(args);}},
 }).default;
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(Component));});
 return {tree,calls,exchange,open:()=>act(async()=>{void button(tree,'Continue with Google').props.onPress();}),get attempt(){return attempt;},close:()=>act(async()=>tree.unmount())};
}
test('Android account picker feeds the shared authentication service with an Android exchange',async()=>{
 const s=await setup();await s.open();assert.equal(s.attempt.credential,'android-token');assert.equal(s.attempt.nonce,'n'.repeat(64));assert.equal(s.attempt.exchange,s.exchange);assert.match(content(s.tree),/completed/);await s.close();
});
test('Android Customer and Workshop onboarding validate consent and fields without adding passwords',async()=>{
 for(const role of ['owner','shop']){
  let result;const s=await setup({login:async args=>{result=await args.askProfile({email:'new@example.test'});}});await s.open();
  if(role==='shop')await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.findAllByType('Text').some(t=>t.props.children==='Workshop')).props.onPress());
  const label=role==='shop'?'Create pending workshop account':'Create customer account';
  await act(async()=>button(s.tree,label).props.onPress());assert.equal(result,undefined);assert.match(content(s.tree),/Full name is required/);
  await act(async()=>field(s.tree,role==='shop'?'Owner/representative':'Full name').props.onChangeText('New user'));
  await act(async()=>field(s.tree,'Phone number').props.onChangeText('0821234567'));
  if(role==='shop'){
   assert.match(content(s.tree),/wait for approval/);
   for(const fieldLabel of ['Shop name','Business registration number','Physical address','City','Province','Services offered'])await act(async()=>field(s.tree,fieldLabel).props.onChangeText('Synthetic'));
  }
  await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityRole==='checkbox').props.onPress());
  await act(async()=>button(s.tree,label).props.onPress());assert.equal(result.role,role);assert.equal(result.form.password,undefined);assert.equal(result.form.agreed,true);await s.close();
 }
});
test('Android linking requests explicit password ownership proof and clears the form after confirmation',async()=>{
 let password;const s=await setup({login:async args=>{password=await args.askPassword('existing@example.test');}});await s.open();
 assert.match(content(s.tree),/keeping your account and data/);await act(async()=>field(s.tree,'Existing account password').props.onChangeText('original-password'));
 await act(async()=>button(s.tree,'Confirm password and connect Google').props.onPress());assert.equal(password,'original-password');assert.equal(field(s.tree,'Existing account password'),undefined);await s.close();
});
test('Android native cancellation, native errors and backend restrictions never claim login success',async()=>{
 for(const [options,message] of [
  [{pick:async()=>{throw Object.assign(Error('cancelled'),{code:'auth/google-cancelled'});}},/cancelled/],
  [{pick:async()=>{throw Object.assign(Error('Google sign-in needs a new Android build.'),{code:'auth/google-native-unavailable'});}},/new Android build/],
  [{login:async()=>{throw Object.assign(Error('Account access is restricted.'),{code:'api/permission-denied'});}},/restricted/],
 ]){
  const s=await setup(options);await s.open();assert.match(content(s.tree),message);assert.doesNotMatch(content(s.tree),/sign-in completed/);await s.close();
 }
});
test('Android cancel during onboarding aborts the shared operation; offline taps cannot start a picker',async()=>{
 const s=await setup({login:async args=>args.askProfile({email:'new@example.test'})});await s.open();
 await act(async()=>button(s.tree,'Cancel Google sign-in').props.onPress());assert.equal(s.attempt.signal.aborted,true);assert.match(content(s.tree),/remain signed out/);await s.close();
 const offline=await setup({offline:true});assert.equal(button(offline.tree,'Continue with Google').props.disabled,true);await offline.open();assert.equal(offline.calls.length,0);await offline.close();
});
test('dismissing a still-open native picker prevents its late result from starting backend authentication',async()=>{
 let release;const s=await setup({pick:signal=>new Promise((resolve,reject)=>{release=()=>signal.aborted?reject(Object.assign(Error('cancelled'),{code:'auth/google-cancelled'})):resolve({credential:'late',nonce:'n'.repeat(64)});})});
 await s.open();await act(async()=>button(s.tree,'Cancel Google sign-in').props.onPress());await act(async()=>release());assert.equal(s.attempt,undefined);await s.close();
});
