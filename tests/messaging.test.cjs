const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const button=(tree,title)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===title);
const says=(tree,text)=>tree.root.findAllByType('Text').some(node=>String([node.props.children].flat().join('')).includes(text));
const input=tree=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Message');
const press=(tree,title)=>act(async()=>button(tree,title).props.onPress());
const unmount=tree=>act(async()=>tree.unmount());
async function mount(Component,props={}){let tree;await act(async()=>{tree=Renderer.create(React.createElement(Component,props));});return tree;}
const conversation={id:'c',serviceRequestId:'request',shopId:'shop',shopName:'Approved Motors',requestTitle:'Paint doors',vehicle:{make:'Toyota'},consent:'none',canSend:true,unreadCount:1,reason:'Current authorised quotation.'};
function screens(){
 const calls=[],moves=[],state={auth:{user:{uid:'owner'},profile:{role:'owner'},offline:false},focused:true,feed:{data:conversation,items:[{id:'one',sequence:1,senderId:'shop',recipientOrdinal:1,text:'Please confirm the finish.',createdAt:1000}],cursor:'older',busy:false,error:'',refresh:async()=>{},loadMore:async()=>{}},api:async()=>({id:'c'})};
 const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
 const landing={LandingText:'Text',LandingShell:({children,title})=>React.createElement('View',null,React.createElement('Text',null,title),children),LandingButton:Primary,useLandingFeedback:()=>({}),ownerTabs:[],shopTabs:[]};
 const mocks={'../../../shared/components/landing/LandingUI':landing,'../../auth/context/AuthContext':{useAuth:()=>state.auth},'@react-navigation/native':{useIsFocused:()=>state.focused},'../hooks/useMessages':{useMessages:()=>state.feed},'../services/messageApi':{messageApi:async(op,data)=>{calls.push({op,data});return state.api(op,data);}}};
 const exports=loadUI('src/features/marketplace/screens/MessagingScreens.js',mocks);
 return {state,calls,moves,exports,mocks,navigation:{navigate:(...args)=>moves.push(args)}};
}

test('chat shows context and chronology, sends as the authenticated user and never acknowledges reads on opening',async()=>{
 const c=screens(),tree=await mount(c.exports.ChatScreen,{navigation:c.navigation,route:{params:{id:'c'}}});
 assert.ok(says(tree,'Approved Motors'));assert.ok(says(tree,'Please confirm the finish.'));assert.ok(says(tree,'SAST'));assert.equal(c.calls.length,0);
 await press(tree,'Conversation details');await press(tree,'Mark displayed messages read');await press(tree,'Close details');assert.deepEqual(c.calls[0],{op:'read',data:{id:'c',through:1}});
 await act(async()=>input(tree).props.onChangeText('Metallic silver, please.'));await press(tree,'Send message');
 assert.equal(c.calls[1].op,'send');assert.equal(c.calls[1].data.text,'Metallic silver, please.');assert.equal(Object.hasOwn(c.calls[1].data,'senderId'),false);assert.equal(input(tree).props.value,'');
 await press(tree,'View related request');assert.deepEqual(c.moves,[['OwnerRequest',{id:'request'}]]);await unmount(tree);
});
test('failed sends retain a draft and request ID, prevent double taps, and can retry exactly once',async()=>{
 const c=screens();let reject;c.state.api=()=>new Promise((_,fail)=>{reject=fail;});
 const tree=await mount(c.exports.ChatScreen,{navigation:c.navigation,route:{params:{id:'c'}}});await act(async()=>input(tree).props.onChangeText('Same message'));
 let pending;await act(async()=>{const send=button(tree,'Send message').props.onPress;pending=send();void send();});assert.equal(c.calls.length,1);assert.ok(button(tree,'Sending message…'));
 await act(async()=>input(tree).props.onChangeText('Queued edit while sending'));assert.equal(input(tree).props.value,'Same message');
 await act(async()=>{reject(Error('Connection lost'));await pending;});assert.equal(input(tree).props.value,'Same message');assert.ok(says(tree,'Connection lost'));
 c.state.api=async()=>({id:'c'});await press(tree,'Retry message');assert.equal(c.calls[0].data.requestId,c.calls[1].data.requestId);await unmount(tree);
});
test('pending, revoked, expired, offline and blurred chats cannot send; history remains visible when authorised to read',async()=>{
 const c=screens();c.state.feed={...c.state.feed,data:{...conversation,canSend:false,consent:'pending',reason:'Awaiting approval'}};
 const props={navigation:c.navigation,route:{params:{id:'c'}}},tree=await mount(c.exports.ChatScreen,props);
 await press(tree,'Conversation details');assert.ok(says(tree,'Please confirm the finish.'));assert.equal(input(tree).props.editable,false);assert.ok(button(tree,'Approve communication'));assert.ok(button(tree,'Reject enquiry'));
 await press(tree,'Reject enquiry');assert.equal(c.calls[0].op,'consent');assert.equal(c.calls[0].data.decision,'rejected');
 c.state.feed={...c.state.feed,data:{...conversation,expiresAt:Date.now()-1}};await act(async()=>tree.update(React.createElement(c.exports.ChatScreen,props)));assert.equal(input(tree).props.editable,false);
 c.state.feed={...c.state.feed,data:conversation};c.state.auth.offline=true;await act(async()=>tree.update(React.createElement(c.exports.ChatScreen,props)));assert.equal(input(tree).props.editable,false);
 c.state.auth.offline=false;c.state.focused=false;await act(async()=>tree.update(React.createElement(c.exports.ChatScreen,props)));assert.equal(input(tree).props.editable,false);await unmount(tree);
});
test('consent is customer-controlled and stale term approval can be renewed explicitly',async()=>{
 const c=screens();c.state.feed={...c.state.feed,data:{...conversation,consent:'approved',canSend:false}};
 const props={navigation:c.navigation,route:{params:{id:'c'}}},tree=await mount(c.exports.ChatScreen,props);await press(tree,'Conversation details');await press(tree,'Approve communication');assert.equal(c.calls[0].data.decision,'approved');
 c.state.auth={user:{uid:'shop'},profile:{role:'shop'},offline:false};await act(async()=>tree.update(React.createElement(c.exports.ChatScreen,props)));
 assert.equal(button(tree,'Approve communication'),undefined);assert.equal(button(tree,'Revoke communication'),undefined);await unmount(tree);
});
test('inbox exposes unread enquiries, pagination and private chat navigation',async()=>{
 const c=screens();let more=0;c.state.feed={...c.state.feed,data:null,items:[{...conversation,consent:'pending',canSend:false,lastMessage:'',enquiry:'May we talk?',unreadCount:2}],loadMore:async()=>{more++;}};
 const tree=await mount(c.exports.MessagesScreen,{navigation:c.navigation});assert.equal(button(tree,'Open conversation: Approved Motors').props.accessibilityValue.text,'2 unread messages');assert.ok(says(tree,'Awaiting customer approval'));assert.ok(says(tree,'May we talk?'));
 await press(tree,'Open conversation: Approved Motors');assert.deepEqual(c.moves,[['Chat',{id:'c'}]]);await press(tree,'Load more conversations');assert.equal(more,1);await unmount(tree);
});
test('shop enquiry action does not open chat until the backend creates its pending request',async()=>{
 const c=screens();c.state.auth={user:{uid:'shop'},profile:{role:'shop'},offline:false};
 const {ConversationAction}=loadUI('src/features/marketplace/components/ConversationAction.js',c.mocks);
 const tree=await mount(ConversationAction,{serviceRequestId:'request',navigation:c.navigation,askApproval:true});
 assert.ok(says(tree,'An enquiry does not allow chat'));assert.equal(c.calls.length,0);assert.equal(button(tree,'Request communication approval').props.disabled,true);
 const field=tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Communication enquiry');await act(async()=>field.props.onChangeText('May we discuss the finish?'));
 await press(tree,'Request communication approval');assert.deepEqual(c.calls[0],{op:'enquire',data:{serviceRequestId:'request',reason:'May we discuss the finish?'}});assert.deepEqual(c.moves,[['Chat',{id:'c'}]]);await unmount(tree);
});
test('message API reuses failed write keys and rejects account changes before exposing a response',async()=>{
 const auth={currentUser:{uid:'owner'}},calls=[];let fail=true;
 const {messageApi}=loadUI('src/features/marketplace/services/messageApi.js',{'../../../shared/services/firebase':{firebase:()=>({auth})},'../../../shared/services/api':{apiRequest:async(path,data,options)=>{calls.push({path,data,options});if(fail)throw Error('Lost connection');return {id:'c'};}}});
 await assert.rejects(()=>messageApi('send',{id:'c',text:'Hello'}));fail=false;await messageApi('send',{id:'c',text:'Hello'});
 assert.equal(calls[0].data.requestId,calls[1].data.requestId);assert.deepEqual(calls[1].options,{expectedUid:'owner'});
 auth.currentUser={uid:'other'};await messageApi('send',{id:'c',text:'Hello'});assert.notEqual(calls[1].data.requestId,calls[2].data.requestId);
});
test('active chat polling merges real-time messages and cleans up on blur and unmount',async t=>{
 let interval,cleared=0,removed=0,feed;const calls=[],state={auth:{user:{uid:'owner'},offline:false},focused:true};
 t.mock.method(global,'setInterval',fn=>{interval=fn;return 123;});t.mock.method(global,'clearInterval',()=>{cleared++;});
 let next={conversation,messages:[{id:'one',sequence:1,text:'First'}],cursor:'older'};
 const {useMessages}=loadUI('src/features/marketplace/hooks/useMessages.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},'@react-navigation/native':{useIsFocused:()=>state.focused},
  'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){removed++;}})}},
  '../services/messageApi':{messageApi:async(op,data)=>{calls.push({op,data});return next;}},
 });
 function Harness(){feed=useMessages('c');return null;}
 const tree=await mount(Harness);assert.equal(feed.items.length,1);
 next={conversation:{...conversation,canSend:false},messages:[{id:'one',sequence:1,text:'First'},{id:'two',sequence:2,text:'Live message'}],cursor:null};
 await act(async()=>interval());assert.deepEqual(feed.items.map(row=>row.id),['one','two']);assert.equal(feed.data.canSend,false);
 state.focused=false;await act(async()=>tree.update(React.createElement(Harness)));const count=calls.length;await act(async()=>interval());assert.equal(calls.length,count);assert.ok(cleared);assert.ok(removed);await unmount(tree);
});
test('stale polling responses after an account switch cannot expose the previous conversation',async()=>{
 let resolve,feed;const state={user:{uid:'owner'},offline:false};
 const {useMessages}=loadUI('src/features/marketplace/hooks/useMessages.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state},'../services/messageApi':{messageApi:()=>new Promise(done=>{resolve=done;})},
 });
 function Harness(){feed=useMessages('c');return null;}
 const tree=await mount(Harness),old=resolve;state.user={uid:'other'};await act(async()=>tree.update(React.createElement(Harness)));
 await act(async()=>old({conversation,messages:[{id:'secret',sequence:1,text:'Old account secret'}],cursor:null}));assert.deepEqual(feed.items,[]);assert.equal(feed.data,null);await unmount(tree);
});
