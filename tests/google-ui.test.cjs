const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label);
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const content=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
async function setup({login=async()=>{},configured=true,offline=false}={}){
 const previous=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
 if(configured)process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='synthetic.apps.googleusercontent.com';else delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
 let callback,attempt;const calls=[];
 const Component=loadUI('src/features/auth/components/GoogleSignIn.web.js',{
  '../context/AuthContext':{useAuth:()=>({offline,working:false,run:async fn=>fn()})},
  '../services/googleIdentity':{googleNonce:()=> 'n'.repeat(64),loadGoogleIdentity:async()=>({initialize:options=>{callback=options.callback;calls.push(['initialize',options]);},renderButton(){},cancel(){}})},
  '../services/googleAccounts':{cancelled:()=>Object.assign(Error('Cancelled'),{code:'auth/google-cancelled'}),googleLogin:async args=>{attempt=args;return login(args);}},
 }).default;
 if(previous===undefined)delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;else process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=previous;
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(Component));});
 return {tree,calls,open:()=>act(async()=>button(tree,'Continue with Google').props.onPress()),credential:()=>act(async()=>{void callback({credential:'signed-google'});}),get attempt(){return attempt;},close:()=>act(async()=>tree.unmount())};
}
test('unconfigured web Google button gives a clear fallback without starting OAuth',async()=>{
 const s=await setup({configured:false});await s.open();assert.match(content(s.tree),/not configured yet.*email\/password/);assert.equal(s.calls.length,0);await s.close();
});
test('Google UI starts with a fresh nonce and cancellation aborts the operation',async()=>{
 const s=await setup({login:async({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled'))))});
 await s.open();assert.equal(s.calls[0][1].nonce,'n'.repeat(64));await s.credential();
 assert.match(content(s.tree),/Verifying your account/);
 await act(async()=>button(s.tree,'Cancel Google sign-in').props.onPress());assert.equal(s.attempt.signal.aborted,true);assert.match(content(s.tree),/cancelled.*signed out/);await s.close();
});
test('existing-account linking requires password confirmation and clears its password field',async()=>{
 let password;const s=await setup({login:async args=>{password=await args.askPassword('owner@example.test');}});
 await s.open();await s.credential();assert.match(content(s.tree),/keeping your account and data/);
 await act(async()=>button(s.tree,'Confirm password and connect Google').props.onPress());assert.match(content(s.tree),/Enter your existing account password/);
 await act(async()=>field(s.tree,'Existing account password').props.onChangeText('existing-password'));
 await act(async()=>button(s.tree,'Confirm password and connect Google').props.onPress());assert.equal(password,'existing-password');assert.equal(field(s.tree,'Existing account password'),undefined);await s.close();
});
test('Google signup validates phone, name and consent before submitting Customer onboarding',async()=>{
 let result;const s=await setup({login:async args=>{result=await args.askProfile({email:'new@example.test'});}});
 await s.open();await s.credential();await act(async()=>button(s.tree,'Create customer account').props.onPress());assert.equal(result,undefined);assert.match(content(s.tree),/Full name is required/);assert.match(content(s.tree),/accept the terms/);
 await act(async()=>field(s.tree,'Full name').props.onChangeText('Customer'));
 await act(async()=>field(s.tree,'Phone number').props.onChangeText('0821234567'));
 await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityRole==='checkbox').props.onPress());
 await act(async()=>button(s.tree,'Create customer account').props.onPress());assert.equal(result.role,'owner');assert.equal(result.form.agreed,true);assert.equal(result.form.password,undefined);await s.close();
});
test('Workshop onboarding exposes business fields and pending approval requirement',async()=>{
 const s=await setup({login:async args=>args.askProfile({email:'shop@example.test'})});await s.open();await s.credential();
 await act(async()=>s.tree.root.findAllByType('Pressable').find(n=>n.findAllByType('Text').some(t=>t.props.children==='Workshop')).props.onPress());
 assert.ok(field(s.tree,'Business registration number'));assert.match(content(s.tree),/wait for approval/);
 await act(async()=>button(s.tree,'Create pending workshop account').props.onPress());assert.match(content(s.tree),/This field is required/);await s.close();
});
test('Google conflict states explain failure and offer a safe retry',async()=>{
 const s=await setup({login:async()=>{throw Object.assign(Error('Google is linked elsewhere. Contact support.'),{code:'api/already-exists'});}});
 await s.open();await s.credential();assert.match(content(s.tree),/linked elsewhere/);assert.ok(button(s.tree,'Close and try again'));await s.close();
});
