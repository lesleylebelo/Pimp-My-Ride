const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label),field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label),text=tree=>tree.root.findAllByType('Text').flatMap(n=>n.props.children).join(' ');
const press=(tree,label)=>act(async()=>{assert.ok(button(tree,label),label);await button(tree,label).props.onPress();}),change=(tree,label,value)=>act(async()=>field(tree,label).props.onChangeText(value));
const failure=code=>Object.assign(Error('Synthetic failure'),{code});
async function setup(platform='web',width=320,mode='dark'){
 const {palettes}=loadUI('src/shared/theme/colors.js'),state={auth:{user:null,offline:false},calls:[],moves:[],login:async()=>{},recover:async()=>({reactivated:true})};
 const mocks={'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:900,fontScale:1,scale:1})},'../context/AuthContext':{useAuth:()=>({...state.auth,run:fn=>fn()})},'../hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0,error:''})},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},'../../../shared/components/landing/LandingUI':{LandingText:'Text'},'../components/GoogleSignIn':({disabled})=>React.createElement('Pressable',{accessibilityLabel:'Continue with Google',disabled}), '../services/accounts':{login:async(...args)=>{state.calls.push(['login',...args]);return state.login(...args);}},'../services/accountManagement':{recoverAccount:async(...args)=>{state.calls.push(['recover',...args]);return state.recover(...args);}}};
 const Screen=loadUI('src/features/auth/screens/SignInScreen.js',mocks).default,element=()=>React.createElement(Screen,{navigation:{navigate:(...args)=>state.moves.push(args)}});let tree;await act(async()=>{tree=create(element());});return {tree,state,update:()=>act(async()=>tree.update(element())),close:()=>act(async()=>tree.unmount())};
}
async function credentials(s){await change(s.tree,'Email address','synthetic@fixture.invalid');await change(s.tree,'Password','synthetic-password');}

test('normal Sign In keeps branding and standard controls without account-status UI across mobile/web themes',async()=>{
 for(const [platform,width,mode] of [['web',320,'dark'],['web',1440,'light'],['android',390,'dark']]){
  const s=await setup(platform,width,mode);try{
   assert.match(text(s.tree),/PimpMyRide/);assert.doesNotMatch(text(s.tree),/Self-deactivated account or pending deletion|Check account status|current password above|reactivate your account/i);assert.ok(button(s.tree,'Continue with Google'));assert.ok(button(s.tree,'Sign in'));assert.ok(field(s.tree,'Email address'));assert.ok(field(s.tree,'Password'));assert.ok(button(s.tree,'Show password'));
   await press(s.tree,'Show password');assert.equal(field(s.tree,'Password').props.secureTextEntry,false);await press(s.tree,'Hide password');assert.equal(field(s.tree,'Password').props.secureTextEntry,true);
   const styles=s.tree.root.findByType('ScrollView').props.contentContainerStyle;assert.equal(styles[1].width,'100%');assert.equal(styles[1].maxWidth,600);
   for(const [label,destination] of [['Forgot password?','ForgotPassword'],['Sign up','SignUp']]){const target=s.tree.root.findAllByType('Pressable').find(n=>n.findAllByType('Text').some(t=>t.props.children===label));assert.ok(target);await act(async()=>target.props.onPress());assert.equal(s.state.moves.at(-1)[0],destination);}
   await credentials(s);await press(s.tree,'Sign in');assert.equal(s.state.calls.length,1);assert.equal(s.state.calls[0][0],'login');assert.ok(!button(s.tree,'Reactivate my account'));
  }finally{await s.close();}
 }
});

test('verified self-deactivation offers explicit recovery, rechecks credentials, then requires another sign-in',async()=>{
 const s=await setup();try{await credentials(s);s.state.login=async()=>{throw failure('auth/self-deactivated');};await press(s.tree,'Sign in');assert.ok(button(s.tree,'Reactivate my account'));assert.equal(s.state.calls.filter(c=>c[0]==='recover').length,0);
  await press(s.tree,'Reactivate my account');assert.deepEqual(s.state.calls.at(-1),['recover','synthetic@fixture.invalid','synthetic-password',true]);assert.equal(field(s.tree,'Password').props.value,'');assert.match(text(s.tree),/Account reactivated. Sign in to continue/);assert.ok(!button(s.tree,'Reactivate my account'));assert.equal(s.state.calls.filter(c=>c[0]==='login').length,1);
 }finally{await s.close();}
});

test('wrong credentials, restrictions and network failures cannot offer recovery; editing or account changes clear eligibility',async()=>{
 for(const code of ['auth/invalid-credential','auth/account-restricted','auth/user-disabled','api/network-request-failed']){const s=await setup();try{await credentials(s);s.state.login=async()=>{throw failure(code);};await press(s.tree,'Sign in');assert.ok(!button(s.tree,'Reactivate my account'));}finally{await s.close();}}
 const s=await setup();try{await credentials(s);s.state.login=async()=>{throw failure('auth/self-deactivated');};await press(s.tree,'Sign in');await change(s.tree,'Password','changed-password');assert.ok(!button(s.tree,'Reactivate my account'));await press(s.tree,'Sign in');await change(s.tree,'Email address','another@fixture.invalid');assert.ok(!button(s.tree,'Reactivate my account'));await press(s.tree,'Sign in');s.state.auth.user={uid:'unrelated'};await s.update();assert.ok(!button(s.tree,'Reactivate my account'));}finally{await s.close();}
});

test('late eligibility for edited credentials is discarded and failed recovery stays explicit and retryable',async()=>{
 const s=await setup();try{await credentials(s);let reject;s.state.login=()=>new Promise((_,no)=>{reject=no;});await act(async()=>{button(s.tree,'Sign in').props.onPress();});await change(s.tree,'Email address','changed@fixture.invalid');await act(async()=>reject(failure('auth/self-deactivated')));assert.ok(!button(s.tree,'Reactivate my account'));
  s.state.login=async()=>{throw failure('auth/self-deactivated');};await press(s.tree,'Sign in');s.state.recover=async()=>{throw Error('Recovery unavailable. Retry after reconnecting.');};await press(s.tree,'Reactivate my account');assert.match(text(s.tree),/Recovery unavailable/);assert.ok(button(s.tree,'Reactivate my account'));assert.equal(s.state.calls.filter(c=>c[0]==='recover').length,1);
 }finally{await s.close();}
});
