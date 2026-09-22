const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const act=Renderer.act;
const error=code=>Object.assign(new Error('Synthetic test error'),{code});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
async function setup(name,{verify=async()=> 'verified@example.test',confirm=async()=>{},send=async()=>{},connection=async()=>{},code='synthetic-reset-code'}={}){
 const auth={};const calls={verify:[],confirm:[],send:[],navigation:[]};
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image','KeyboardAvoidingView'].map(n=>[n,n]));
 native.StyleSheet={create:value=>value};native.Platform={OS:'web'};
 const Screen=loadUI(`src/features/auth/screens/${name}.js`,{
  'react-native':native,
  'firebase/auth':{
   verifyPasswordResetCode:async(...args)=>{calls.verify.push(args);return verify(...args);},
   confirmPasswordReset:async(...args)=>{calls.confirm.push(args);return confirm(...args);},
   sendPasswordResetEmail:async(...args)=>{calls.send.push(args);return send(...args);},
  },
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/network':{requireConnection:connection},
 }).default;
 const navigation={replace:(...args)=>calls.navigation.push(['replace',...args]),navigate:(...args)=>calls.navigation.push(['navigate',...args]),reset:(...args)=>calls.navigation.push(['reset',...args])};
 let tree;
 const render=nextCode=>React.createElement(Screen,{navigation,route:{params:{oobCode:nextCode,email:'untrusted@example.test'}}});
 await act(async()=>{tree=Renderer.create(render(code));});
 return {tree,calls,auth,update:async nextCode=>act(async()=>tree.update(render(nextCode))),close:async()=>act(async()=>tree.unmount())};
}
async function fillPassword(tree,value='new-demo-password'){
 await act(async()=>field(tree,'New Password').props.onChangeText(value));
 await act(async()=>field(tree,'Confirm New Password').props.onChangeText(value));
}

test('missing reset code offers a new link without making an Auth request',async()=>{
 for(const code of [null,'',[],{},' '.repeat(2)]){
  const s=await setup('ResetPasswordScreen',{code});
  assert.equal(s.calls.verify.length,0);assert.equal(s.calls.confirm.length,0);
  assert.match(text(s.tree),/Open the reset link/);assert.equal(field(s.tree,'New Password'),undefined);
  await act(async()=>button(s.tree,'Request a New Link').props.onPress());
  assert.deepEqual(s.calls.navigation,[['replace','ForgotPassword']]);await s.close();
 }
});
test('invalid, expired and already-used codes are rejected before password entry',async()=>{
 for(const code of ['auth/invalid-action-code','auth/expired-action-code']){
  const s=await setup('ResetPasswordScreen',{verify:async()=>{throw error(code);}});
  assert.match(text(s.tree),code.includes('expired')?/expired/:/invalid or already used/);
  assert.equal(field(s.tree,'New Password'),undefined);assert.equal(s.calls.confirm.length,0);await s.close();
 }
});
test('offline link verification has an explicit retry and trusts only verified email',async()=>{
 let offline=true;
 const s=await setup('ResetPasswordScreen',{connection:async()=>{if(offline)throw Error('Connect to the internet.');}});
 assert.equal(s.calls.verify.length,0);assert.match(text(s.tree),/Connect to the internet/);
 offline=false;await act(async()=>button(s.tree,'Try Link Again').props.onPress());
 assert.equal(s.calls.verify.length,1);assert.match(text(s.tree),/verified@example.test/);assert.doesNotMatch(text(s.tree),/untrusted@example.test/);await s.close();
});
test('reset submission validates passwords, submits once, then removes code from success navigation',async()=>{
 const wait=deferred();const s=await setup('ResetPasswordScreen',{confirm:()=>wait.promise});
 await fillPassword(s.tree,'short');await act(async()=>button(s.tree,'Reset Password').props.onPress());assert.equal(s.calls.confirm.length,0);
 await fillPassword(s.tree);let pending;
 await act(async()=>{const submit=button(s.tree,'Reset Password').props.onPress;pending=submit();void submit();});
 assert.deepEqual(s.calls.confirm,[[s.auth,'synthetic-reset-code','new-demo-password']]);assert.equal(button(s.tree,'Reset Password').props.disabled,true);
 await act(async()=>{wait.resolve();await pending;});assert.deepEqual(s.calls.navigation,[['replace','ResetSuccess']]);
 assert.equal(field(s.tree,'New Password').props.value,'');await s.close();
});
test('code used elsewhere after verification cannot show reset success',async()=>{
 const s=await setup('ResetPasswordScreen',{confirm:async()=>{throw error('auth/invalid-action-code');}});
 await fillPassword(s.tree);await act(async()=>button(s.tree,'Reset Password').props.onPress());
 assert.match(text(s.tree),/invalid or already used/);assert.equal(field(s.tree,'New Password'),undefined);assert.deepEqual(s.calls.navigation,[]);await s.close();
});
test('network failure on confirmation remains retryable without claiming success',async()=>{
 let unavailable=true;const s=await setup('ResetPasswordScreen',{confirm:async()=>{if(unavailable)throw error('auth/network-request-failed');}});
 await fillPassword(s.tree);await act(async()=>button(s.tree,'Reset Password').props.onPress());
 assert.match(text(s.tree),/internet connection/);assert.deepEqual(s.calls.navigation,[]);
 unavailable=false;await act(async()=>button(s.tree,'Reset Password').props.onPress());assert.equal(s.calls.confirm.length,2);assert.deepEqual(s.calls.navigation,[['replace','ResetSuccess']]);await s.close();
});
test('late verification from a previous link cannot authorize the replacement link',async()=>{
 const old=deferred();const s=await setup('ResetPasswordScreen',{verify:async(_,code)=>code==='synthetic-reset-code'?old.promise:Promise.reject(error('auth/invalid-action-code'))});
 await s.update('replacement-code');await act(async()=>old.resolve('previous@example.test'));
 assert.match(text(s.tree),/invalid or already used/);assert.doesNotMatch(text(s.tree),/previous@example.test/);assert.equal(field(s.tree,'New Password'),undefined);await s.close();
});
test('forgot password blocks duplicate taps and preserves non-enumerating result',async()=>{
 const wait=deferred();const s=await setup('ForgotPasswordScreen',{send:()=>wait.promise});
 await act(async()=>field(s.tree,'Email Address').props.onChangeText('demo@example.test'));
 let pending;await act(async()=>{const send=button(s.tree,'Send Reset Link').props.onPress;pending=send();void send();});assert.equal(s.calls.send.length,1);
 await act(async()=>{wait.reject(error('auth/user-not-found'));await pending;});assert.match(text(s.tree),/If an account exists/);assert.equal(button(s.tree,'Email requested').props.disabled,true);await s.close();
});
test('success returns to a clean sign-in stack',async()=>{
 const s=await setup('ResetSuccessScreen');await act(async()=>button(s.tree,'Back to Sign In').props.onPress());
 assert.deepEqual(s.calls.navigation,[['reset',{index:0,routes:[{name:'SignIn'}]}]]);await s.close();
});
