const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const suggestion={title:'Black wrap request',description:'Wrap the doors in black.',category:{id:'paint',name:'Paint'},missingDetails:['What details would you like to provide?']};
async function setup(kind='request',platform='ios'){
 const state={auth:{user:{uid:kind==='request'?'owner':'shop'},offline:false},focused:true,calls:[],applied:[],reply:async()=>structuredClone(suggestion)};
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const Component=loadUI('src/features/marketplace/components/AIAssistButton.js',{
  'react-native':{KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:platform}},
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},'@react-navigation/native':{useIsFocused:()=>state.focused},
  '../services/aiAssistApi':{aiAssist:async(...args)=>{state.calls.push(args);return state.reply(...args);}},
  './MarketplaceUI':{Button:Primary,Field:props=>React.createElement('TextInput',{...props,accessibilityLabel:props.label}),Notice:({busy,error})=>React.createElement('Text',null,error|| (busy?'Loading':''))},
 }).default;
 let props={kind,title:'Black wrap',description:'Wrap doors in black.',categoryId:'current',onApply:value=>state.applied.push(value)},tree;
 const render=()=>React.createElement(Component,props);await act(async()=>{tree=create(render());});
 return {state,tree,update:async next=>act(async()=>{props={...props,...next};tree.update(render());}),press:label=>act(async()=>button(tree,label).props.onPress()),close:()=>act(async()=>tree.unmount())};
}

test('customer and shop preview suggestions without changing the original draft, then explicitly apply edited text/category',async()=>{
 for(const kind of ['request','showcase']){
  const s=await setup(kind);try{
   assert.equal(button(s.tree,'Optimise with PimpPilot').findByType('Icon').props.name,'sparkles-outline');
   assert.match(text(s.tree),/Your AI-powered automotive assistant/);
   await s.press('Optimise with PimpPilot');assert.match(text(s.tree),/PimpPilot Suggestions/);assert.match(text(s.tree),/Your PimpPilot suggestions are ready\./);assert.match(text(s.tree),/Suggested title/);assert.equal(s.state.applied.length,0);
   assert.equal(s.tree.root.findAllByType('ScrollView').length,1);assert.equal(s.tree.root.findAllByType('KeyboardAvoidingView').length,1);
   await s.press('Edit');await act(async()=>s.tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Suggested title').props.onChangeText('Edited title'));
   await s.press('Use suggested category');await s.press('Apply');
   assert.deepEqual(s.state.applied,[{title:'Edited title',description:suggestion.description,category:suggestion.category}]);assert.equal(s.tree.root.findAllByType('Modal').length,0);
   assert.deepEqual(Object.keys(s.state.calls[0][0]).sort(),['categoryId','description','kind','title']);
  }finally{await s.close();}
 }
});

test('Dismiss leaves draft untouched, regeneration reuses original text, and category changes are opt-in',async()=>{
 const s=await setup();try{
  await s.press('Optimise with PimpPilot');await s.press('Regenerate Suggestions');assert.equal(s.state.calls.length,2);assert.deepEqual(s.state.calls[0],s.state.calls[1]);
  await s.press('Dismiss');assert.equal(s.state.applied.length,0);
  await s.press('Optimise with PimpPilot');await s.press('Apply');assert.equal(s.state.applied[0].category,null);
 }finally{await s.close();}
});

test('loading locks duplicate generation, errors preserve draft, and Dismiss ignores late responses',async()=>{
 const s=await setup();let resolve;
 try{
  s.state.reply=()=>new Promise(done=>{resolve=done;});let pending;
  await act(async()=>{const run=button(s.tree,'Optimise with PimpPilot').props.onPress;pending=run();void run();});
  assert.match(text(s.tree),/PimpPilot is working on your description\.\.\./);assert.deepEqual(button(s.tree,'Optimise with PimpPilot').props.accessibilityState,{disabled:true,busy:true});assert.equal(s.state.calls.length,1);
  await s.press('Dismiss');await act(async()=>{resolve(suggestion);await pending;});assert.equal(s.tree.root.findAllByType('Modal').length,0);assert.equal(s.state.applied.length,0);
  s.state.reply=async()=>{throw Error('PimpPilot is temporarily unavailable. Your draft is unchanged.');};await s.press('Optimise with PimpPilot');assert.match(text(s.tree),/unavailable/);assert.equal(s.state.applied.length,0);
 }finally{await s.close();}
});

test('a changed original draft disables Apply; account, offline and focus changes discard private previews',async()=>{
 const s=await setup();try{
  await s.press('Optimise with PimpPilot');await s.update({title:'Changed title'});assert.equal(!!button(s.tree,'Apply').props.disabled,true);await s.press('Apply');assert.equal(s.state.applied.length,0);
  s.state.auth.user={uid:'another'};await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
  await s.press('Optimise with PimpPilot');s.state.auth.offline=true;await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
  s.state.auth.offline=false;await s.update({});await s.press('Optimise with PimpPilot');s.state.focused=false;await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
 }finally{await s.close();}
});

test('AI client sends text/category only, keeps expected identity and rejects malformed structured output',async()=>{
 const calls=[];let result=suggestion;
 const {aiAssist}=loadUI('src/features/marketplace/services/aiAssistApi.js',{'../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);return result;}}});
 await aiAssist({kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint',photos:['private'],serviceLocation:{latitude:1},budget:100},'owner');
 assert.deepEqual(calls[0],['ai/assist',{kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint'},{expectedUid:'owner'}]);
 result={...suggestion,title:'x'.repeat(101)};await assert.rejects(()=>aiAssist({kind:'request'},'owner'),/invalid suggestion/);
});

test('PimpPilot uses wrapping layout, accessible touch targets and platform keyboard behaviour',async()=>{
 for(const platform of ['ios','android','web']){
  const s=await setup('request',platform);try{
   const trigger=button(s.tree,'Optimise with PimpPilot');assert.equal(trigger.props.accessibilityRole,'button');assert.match(trigger.props.accessibilityHint,/Your AI-powered automotive assistant/);
   const style=trigger.props.style({pressed:false})[0];assert.equal(style.width,'100%');assert.ok(style.minHeight>=44);
   await s.press('Optimise with PimpPilot');
   assert.equal(s.tree.root.findByType('KeyboardAvoidingView').props.behavior,platform==='ios'?'padding':undefined);
   assert.equal(s.tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');
   const heading=s.tree.root.findAllByType('Text').find(node=>node.props.accessibilityRole==='header');assert.equal(heading.props.children,'PimpPilot Suggestions');
   assert.ok(button(s.tree,'Regenerate Suggestions'));assert.doesNotMatch(text(s.tree),/AI Assist|AI suggestions|Optimise with AI|Preparing suggestions/);
   await s.press('Dismiss');assert.equal(s.state.applied.length,0);
  }finally{await s.close();}
 }
});

test('legacy backend failures are presented as PimpPilot errors without changing status, code or draft data',async()=>{
 const input={kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint'},before=JSON.stringify(input);
 for(const [status,code,message,expected] of [
  [503,'api/unavailable','AI Assist is unavailable.','PimpPilot is temporarily unavailable. Your draft is unchanged.'],
  [429,'api/resource-exhausted','The initial AI test allowance has been used.',"PimpPilot's usage limit has been reached. Your draft is unchanged."],
  [403,'api/permission-denied','AI Assist is restricted to designated test accounts.','PimpPilot is not available for this account. Your draft is unchanged.'],
  [undefined,'api/network-request-failed','Connection failed.','PimpPilot is temporarily unavailable. Your draft is unchanged.'],
  [undefined,'api/connection-timeout','Connection timed out.','PimpPilot is temporarily unavailable. Your draft is unchanged.'],
  [400,'api/invalid-argument','Enter a title or description.','Enter a title or description.'],
 ]){
  let calls=0;const {aiAssist}=loadUI('src/features/marketplace/services/aiAssistApi.js',{'../../../shared/services/api':{apiRequest:async()=>{calls++;throw Object.assign(Error(message),{status,code});}}});
  await assert.rejects(()=>aiAssist(input,'owner'),error=>error.message===expected&&error.status===status&&error.code===code);
  assert.equal(calls,1);assert.equal(JSON.stringify(input),before);
 }
 const s=await setup();try{
  s.state.reply=async()=>{throw Object.assign(Error('AI Assist is unavailable.'),{status:503});};await s.press('Optimise with PimpPilot');
  assert.match(text(s.tree),/PimpPilot is temporarily unavailable\. Your draft is unchanged\./);assert.doesNotMatch(text(s.tree),/AI Assist/);assert.equal(s.state.applied.length,0);
 }finally{await s.close();}
});
