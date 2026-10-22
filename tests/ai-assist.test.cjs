const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const suggestion={title:'Black wrap request',description:'Wrap the doors in black.',category:{id:'paint',name:'Paint'},missingDetails:['What details would you like to provide?']};
async function setup(kind='request'){
 const state={auth:{user:{uid:kind==='request'?'owner':'shop'},offline:false},focused:true,calls:[],applied:[],reply:async()=>structuredClone(suggestion)};
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const Component=loadUI('src/features/marketplace/components/AIAssistButton.js',{
  'react-native':{KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'ios'}},
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
   assert.equal(button(s.tree,'Optimise with AI').findByType('Icon').props.name,'sparkles-outline');
   await s.press('Optimise with AI');assert.match(text(s.tree),/Suggested title/);assert.equal(s.state.applied.length,0);
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
  await s.press('Optimise with AI');await s.press('Regenerate');assert.equal(s.state.calls.length,2);assert.deepEqual(s.state.calls[0],s.state.calls[1]);
  await s.press('Dismiss');assert.equal(s.state.applied.length,0);
  await s.press('Optimise with AI');await s.press('Apply');assert.equal(s.state.applied[0].category,null);
 }finally{await s.close();}
});

test('loading locks duplicate generation, errors preserve draft, and Dismiss ignores late responses',async()=>{
 const s=await setup();let resolve;
 try{
  s.state.reply=()=>new Promise(done=>{resolve=done;});let pending;
  await act(async()=>{const run=button(s.tree,'Optimise with AI').props.onPress;pending=run();void run();});
  assert.match(text(s.tree),/Preparing suggestions/);assert.equal(s.state.calls.length,1);
  await s.press('Dismiss');await act(async()=>{resolve(suggestion);await pending;});assert.equal(s.tree.root.findAllByType('Modal').length,0);assert.equal(s.state.applied.length,0);
  s.state.reply=async()=>{throw Error('AI Assist is unavailable. Your draft is unchanged.');};await s.press('Optimise with AI');assert.match(text(s.tree),/unavailable/);assert.equal(s.state.applied.length,0);
 }finally{await s.close();}
});

test('a changed original draft disables Apply; account, offline and focus changes discard private previews',async()=>{
 const s=await setup();try{
  await s.press('Optimise with AI');await s.update({title:'Changed title'});assert.equal(!!button(s.tree,'Apply').props.disabled,true);await s.press('Apply');assert.equal(s.state.applied.length,0);
  s.state.auth.user={uid:'another'};await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
  await s.press('Optimise with AI');s.state.auth.offline=true;await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
  s.state.auth.offline=false;await s.update({});await s.press('Optimise with AI');s.state.focused=false;await s.update({});assert.equal(s.tree.root.findAllByType('Modal').length,0);
 }finally{await s.close();}
});

test('AI client sends text/category only, keeps expected identity and rejects malformed structured output',async()=>{
 const calls=[];let result=suggestion;
 const {aiAssist}=loadUI('src/features/marketplace/services/aiAssistApi.js',{'../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);return result;}}});
 await aiAssist({kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint',photos:['private'],serviceLocation:{latitude:1},budget:100},'owner');
 assert.deepEqual(calls[0],['ai/assist',{kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint'},{expectedUid:'owner'}]);
 result={...suggestion,title:'x'.repeat(101)};await assert.rejects(()=>aiAssist({kind:'request'},'owner'),/invalid suggestion/);
});
