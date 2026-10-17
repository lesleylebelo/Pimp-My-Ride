const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

async function splash(t){
 t.mock.timers.enable({apis:['setTimeout']});
 const moves=[];
 // Native animation drivers are irrelevant to the real screen's navigation timer.
 const animation=()=>({start(){},stop(){}});
 const Screen=loadUI('src/features/auth/screens/SplashScreen.js',{
  '../../../shared/components/LogoMark':()=>null,
  'react-native':{
   Animated:{Value:class{constructor(value){this.value=value;}},View:'AnimatedView',timing:animation,sequence:animation,parallel:animation,loop:animation},
   Easing:{out:value=>value,cubic:()=>{}},
  },
 }).default;
 let tree;await act(async()=>{tree=create(React.createElement(Screen,{navigation:{replace:(...args)=>moves.push(args)}}));});
 return {moves,close:()=>act(async()=>tree.unmount())};
}

test('Splash replaces itself with SignIn after its delay without exposing an authenticated route',async t=>{
 const s=await splash(t);t.after(s.close);
 assert.deepEqual(s.moves,[]);
 await act(async()=>t.mock.timers.tick(2199));assert.deepEqual(s.moves,[]);
 await act(async()=>t.mock.timers.tick(1));assert.deepEqual(s.moves,[['SignIn']]);
 await act(async()=>t.mock.timers.tick(10000));assert.deepEqual(s.moves,[['SignIn']]);
});

test('leaving Splash cancels its pending SignIn navigation',async t=>{
 const s=await splash(t);await s.close();
 await act(async()=>t.mock.timers.tick(10000));assert.deepEqual(s.moves,[]);
});
