const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const suggestion={title:'Black wrap request',description:'Wrap the doors in black.',category:{id:'paint',name:'Paint'},missingDetails:['What details would you like to provide?']};
async function setup(kind='request',platform='ios',initialAppState='active'){
 const state={auth:{user:{uid:kind==='request'?'owner':'shop'},offline:false},focused:true,calls:[],applied:[],reply:async()=>structuredClone(suggestion)};
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const Component=loadUI('src/features/marketplace/components/AIAssistButton.js',{
  'react-native':{KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:platform},AppState:{currentState:initialAppState,addEventListener:(_,listener)=>{state.appState=listener;return {remove(){state.appState=null;}};}}},
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
  s.state.reply=async()=>{throw Error('PimpPilot is temporarily unavailable. Please try again. Your draft is unchanged.');};await s.press('Optimise with PimpPilot');assert.match(text(s.tree),/unavailable/);assert.equal(s.state.applied.length,0);
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
 assert.match(calls[0][1].requestId,/^ai_[A-Za-z0-9_]+$/);const {requestId,...body}=calls[0][1];assert.deepEqual([calls[0][0],body,calls[0][2]],['ai/assist',{kind:'request',title:'Black wrap',description:'Wrap doors.',categoryId:'paint'},{expectedUid:'owner'}]);
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
  [503,'api/unavailable','AI Assist is unavailable.','PimpPilot is temporarily unavailable. Please try again. Your draft is unchanged.'],
  [429,'api/resource-exhausted','The initial AI test allowance has been used.','PimpPilot is temporarily busy. Please try again shortly. Your draft is unchanged.'],
  [403,'api/permission-denied','AI Assist is restricted to designated test accounts.','PimpPilot access could not be authorised. Refresh your session or contact support. Your draft is unchanged.'],
  [undefined,'api/network-request-failed','Connection failed.',"Couldn't connect to PimpPilot. Check your connection and try again. Your draft is unchanged."],
  [undefined,'api/connection-timeout','Connection timed out.','PimpPilot took too long to respond. Please try again. Your draft is unchanged.'],
  [400,'api/invalid-argument','Enter a title or description.','Enter a title or description.'],
 ]){
  let calls=0;const {aiAssist}=loadUI('src/features/marketplace/services/aiAssistApi.js',{'../../../shared/services/api':{apiRequest:async()=>{calls++;throw Object.assign(Error(message),{status,code});}}});
  await assert.rejects(()=>aiAssist(input,'owner'),error=>error.message===expected&&error.status===status&&error.code===code);
  assert.equal(calls,1);assert.equal(JSON.stringify(input),before);
 }
 const s=await setup();try{
  s.state.reply=async()=>{throw Object.assign(Error('AI Assist is unavailable.'),{status:503});};await s.press('Optimise with PimpPilot');
  assert.match(text(s.tree),/PimpPilot is temporarily unavailable\. Please try again\. Your draft is unchanged\./);assert.doesNotMatch(text(s.tree),/AI Assist/);assert.equal(s.state.applied.length,0);
 }finally{await s.close();}
});

test('Dismiss and focus/offline transitions retain the pending lock until settlement, then recover',async()=>{
 for(const transition of ['dismiss','focus','offline']){
  const s=await setup();let resolve;
  try{
   s.state.reply=()=>new Promise(done=>{resolve=done;});
   await s.press('Optimise with PimpPilot');
   if(transition==='dismiss')await s.press('Dismiss');
   else if(transition==='focus'){s.state.focused=false;await s.update({});s.state.focused=true;await s.update({});}
   else{s.state.auth.offline=true;await s.update({});s.state.auth.offline=false;await s.update({});}
   await s.press('Optimise with PimpPilot');assert.equal(s.state.calls.length,1);
   assert.equal(button(s.tree,'Optimise with PimpPilot').props.disabled,true);
   await act(async()=>{resolve(suggestion);await new Promise(done=>setImmediate(done));});
   assert.equal(s.tree.root.findAllByType('Modal').length,0);assert.equal(s.state.applied.length,0);
   s.state.reply=async()=>suggestion;await s.press('Optimise with PimpPilot');assert.equal(s.state.calls.length,2);
   await s.press('Apply');assert.equal(s.state.applied.length,1);
  }finally{await s.close();}
 }
});

test('classified server failures survive client and component presentation without retries or draft changes',async()=>{
 const {pimpPilotErrorMessage}=loadUI('src/features/marketplace/services/pimpPilotPresentation.js');
 const cases=[
  [429,'daily_allowance',/temporarily unavailable/],
  [429,'rate_limit',/busy/],[429,'busy',/busy/],
  [403,'tester_required',/temporarily unavailable/],[403,'account_access',/current status/],
  [403,'account_eligibility',/current status/],[403,'draft_type',/draft type/],[403,'account_changed',/account access changed/],
  [503,'configuration',/temporarily unavailable/],[503,'provider_limit',/temporarily busy/],
  [503,'provider_billing',/billing review/],[503,'provider_timeout',/too long/],[503,'provider_network',/could not reach its AI provider/],
  [503,'service_unavailable',/temporarily unavailable/],
  [503,'suggestion_rejected',/couldn't prepare a reliable suggestion/],
 ];
 for(const [status,aiReason,expected] of cases){
  let calls=0;const fields={aiReason,resetAt:Date.parse('2026-10-27T00:00:00Z')};
  const {aiAssist}=loadUI('src/features/marketplace/services/aiAssistApi.js',{'../../../shared/services/api':{apiRequest:async()=>{calls++;throw Object.assign(Error('The server could not complete this request.'),{status,code:status===503?'api/unavailable':status===429?'api/resource-exhausted':'api/permission-denied',responseBody:{fields}});}}});
  let presented;try{await aiAssist({kind:'request',title:'Draft',description:'Original text'},'owner');assert.fail('must reject');}catch(error){presented=error;}
  assert.equal(calls,1);assert.match(presented.message,expected);assert.equal(pimpPilotErrorMessage(presented),presented.message);
  const s=await setup();try{s.state.reply=async()=>{throw presented;};await s.press('Optimise with PimpPilot');assert.match(text(s.tree),expected);assert.equal(s.state.applied.length,0);}finally{await s.close();}
 }
 for(const resetAt of ['tomorrow',NaN,Infinity,1e99])assert.doesNotMatch(pimpPilotErrorMessage({aiReason:'daily_allowance',resetAt}),/resets at/);
 assert.match(pimpPilotErrorMessage({status:401}),/Sign in again/);
});

test('account switching discards an older in-flight suggestion and isolates the new preview',async()=>{
 const s=await setup();let resolve;
 try{
  s.state.reply=()=>new Promise(done=>{resolve=done;});await s.press('Optimise with PimpPilot');
  s.state.auth.user={uid:'new-owner'};await s.update({});
  s.state.reply=async()=>({...suggestion,title:'New account draft'});await s.press('Optimise with PimpPilot');
  await act(async()=>{resolve(suggestion);await new Promise(done=>setImmediate(done));});
  assert.match(text(s.tree),/New account draft/);assert.doesNotMatch(text(s.tree),/Suggested title: Black wrap request/);
  assert.equal(s.state.calls[0][1],'owner');assert.equal(s.state.calls[1][1],'new-owner');assert.equal(s.state.applied.length,0);
 }finally{await s.close();}
});


test('background/foreground invalidates late results without launching another generation',async()=>{
 for(const platform of ['ios','android','web']){
  const s=await setup('request',platform);let resolve;
  try{
   s.state.reply=()=>new Promise(done=>{resolve=done;});await s.press('Optimise with PimpPilot');
   await act(async()=>s.state.appState('background'));assert.equal(s.tree.root.findAllByType('Modal').length,0);
   await act(async()=>s.state.appState('active'));await s.press('Optimise with PimpPilot');assert.equal(s.state.calls.length,1);
   await act(async()=>{resolve(suggestion);await new Promise(done=>setImmediate(done));});assert.equal(s.state.applied.length,0);
   s.state.reply=async()=>suggestion;await s.press('Optimise with PimpPilot');assert.equal(s.state.calls.length,2);
   await s.press('Apply');assert.equal(s.state.applied.length,1);
  }finally{await s.close();}
 }
});

test('old experimental classifications never claim a personal allowance or credit balance',()=>{
 const {pimpPilotErrorMessage}=loadUI('src/features/marketplace/services/pimpPilotPresentation.js');
 for(const aiReason of ['daily_allowance','tester_required',undefined]){
  const message=pimpPilotErrorMessage({status:429,aiReason,responseBody:{fields:{resetAt:Date.now()+100000}}});
  assert.doesNotMatch(message,/usage limit|allowance|credit|tester|resets at/i);
 }
 assert.match(pimpPilotErrorMessage({code:'auth/network-request-failed'}),/Couldn't connect/);
 assert.doesNotMatch(pimpPilotErrorMessage({status:503,message:'secret provider details'}),/secret/);
});


test('both roles can preview ten successive generations on every platform without automatic Apply',async()=>{
 for(const kind of ['request','showcase'])for(const platform of ['ios','android','web']){
  const s=await setup(kind,platform);try{
   for(let i=0;i<10;i++){await s.press('Optimise with PimpPilot');assert.ok(button(s.tree,'Apply'));await s.press('Dismiss');}
   assert.equal(s.state.calls.length,10);assert.equal(s.state.applied.length,0);
   assert.ok(s.state.calls.every(([draft])=>draft.title==='Black wrap'&&draft.description==='Wrap doors in black.'));
  }finally{await s.close();}
 }
});

test('unknown initial browser/native AppState does not block otherwise eligible generation',async()=>{
 for(const initial of ['unknown',null]){
  const s=await setup('request','web',initial);try{
   assert.equal(button(s.tree,'Optimise with PimpPilot').props.disabled,false);
   await s.press('Optimise with PimpPilot');assert.equal(s.state.calls.length,1);assert.equal(s.state.applied.length,0);
  }finally{await s.close();}
 }
});
