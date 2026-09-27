const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label||n.findAllByType('Text').some(t=>t.props.children===label));
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label);
const says=(tree,text)=>tree.root.findAllByType('Text').some(n=>n.props.children===text||(Array.isArray(n.props.children)&&n.props.children.filter(v=>typeof v==='string').join('')===text));
const change=(tree,label,value)=>act(async()=>field(tree,label).props.onChangeText(value));
const press=(tree,label)=>act(async()=>button(tree,label).props.onPress());
const scrollToBottom=tree=>act(async()=>{const scroll=tree.root.findByType('ScrollView');scroll.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1400},layoutMeasurement:{height:500}}});});
const navigation={navigate(){},goBack(){}};
function screens(mocks={}){
 return loadUI('src/features/admin/screens/AdminScreens.js',{
  '@react-navigation/native':{useIsFocused:()=>true},'firebase/auth':{},'../../../shared/services/firebase':{},
  '../../auth/services/loginCooldown':{},'../../auth/hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0})},
  '../services/adminApi':{adminError:e=>e.message},'../services/useAdminData':{useAdminData:()=>({data:null,refresh:async()=>{}})},...mocks,
 });
}
async function mount(Component,props={}){let tree;await act(async()=>{tree=Renderer.create(React.createElement(Component,{navigation,...props}));});return tree;}

test('admin validation matches required, length, phone and complete-shop constraints',()=>{
 const {accountErrors,categoryErrors,hasErrors,shopFields}=loadUI('src/features/admin/utils/validation.js');
 assert.equal(hasErrors(accountErrors({fullName:'  Mo ',phone:'+27 (82) 123-4567'},'owner')),false);
 for(const phone of ['', '123456789', '+278212345678', '082123456a'])assert.ok(accountErrors({fullName:'Mo',phone},'owner').phone);
 assert.ok(accountErrors({fullName:' '.repeat(2),phone:'0821234567'},'owner').fullName);
 assert.ok(accountErrors({fullName:'x'.repeat(201),phone:'0821234567'},'owner').fullName);
 const shop=Object.fromEntries(Object.keys(shopFields).map(key=>[key,'Value']));
 assert.equal(hasErrors(accountErrors({fullName:'Mo',phone:'0821234567',shop},'shop')),false);
 for(const key of Object.keys(shopFields)){
  assert.ok(accountErrors({fullName:'Mo',phone:'0821234567',shop:{...shop,[key]:' '}},'shop')[`shop.${key}`]);
  assert.ok(accountErrors({fullName:'Mo',phone:'0821234567',shop:{...shop,[key]:'x'.repeat(501)}},'shop')[`shop.${key}`]);
 }
 assert.equal(hasErrors(categoryErrors({name:'x'.repeat(80),description:'x'.repeat(500)})),false);
 assert.ok(categoryErrors({name:'x'.repeat(81),description:' '}).name);
 assert.ok(categoryErrors({name:'Paint',description:'x'.repeat(501)}).description);
});

test('account live errors block invalid submissions and preserve a failed draft with one request',async()=>{
 let data={role:'owner',fullName:'Original',phone:'0821234567'},release;
 const calls=[];
 const {AccountDetailScreen}=screens({
  '../services/useAdminData':{useAdminData:()=>({data,refresh:async()=>{}})},
  '../services/adminApi':{adminError:e=>e.message,adminApi:async(...args)=>{calls.push(args);await new Promise(r=>{release=r;});throw Error('Server unavailable');}},
 });
 const props={route:{params:{uid:'owner'}}},tree=await mount(AccountDetailScreen,props);
 await change(tree,'Full name','');await change(tree,'Phone','123');
 assert.ok(says(tree,'Full name is required.'));assert.ok(says(tree,'Enter a valid South African phone number.'));
 assert.equal(button(tree,'Save profile').props.disabled,true);
 await press(tree,'Save profile');assert.equal(calls.length,0);
 await change(tree,'Full name','Unsaved name');await change(tree,'Phone','0821234567');
 assert.equal(button(tree,'Save profile').props.disabled,false);
 await act(async()=>{const submit=button(tree,'Save profile').props.onPress;submit();submit();});
 assert.equal(calls.length,1);assert.equal(button(tree,'Save profile').props.disabled,true);
 await act(async()=>release());assert.ok(says(tree,'Server unavailable'));
 data={...data,fullName:'Refetched server name'};
 await act(async()=>tree.update(React.createElement(AccountDetailScreen,{navigation,...props})));
 assert.equal(field(tree,'Full name').props.value,'Unsaved name');
 await act(async()=>tree.unmount());
});

test('shop fields require complete details and an explicit reason before admin actions',async()=>{
 const data={role:'shop',fullName:'Demo',phone:'0821234567',shop:{},accountStatus:'active',verificationStatus:'pending'};
 const {AccountDetailScreen}=screens({'../services/useAdminData':{useAdminData:()=>({data,refresh:async()=>{}})}});
 const tree=await mount(AccountDetailScreen,{route:{params:{uid:'shop'}}});
 assert.equal(button(tree,'Save profile').props.disabled,true);
 for(const label of ['Shop name','Registration number','Address','City','Province','Services']){
  await act(async()=>field(tree,label).props.onBlur());assert.ok(says(tree,`${label} is required.`));
  await change(tree,label,'Example');
 }
 assert.equal(button(tree,'Save profile').props.disabled,false);
 assert.equal(button(tree,'Approve shop').props.disabled,true);
 await change(tree,'Reason for review or account status change',' ');
 assert.ok(says(tree,'Reason is required.'));assert.equal(button(tree,'Approve shop').props.disabled,true);
 await change(tree,'Reason for review or account status change','Reviewed documents');
 assert.equal(!!button(tree,'Approve shop').props.disabled,false);
 await act(async()=>tree.unmount());
});

test('category live validation, failure retry and archive keep the draft until a successful save',async()=>{
 let mode='fail',release;const calls=[];
 const {CategoriesScreen}=screens({
  '../services/useAdminData':{useAdminData:()=>({data:{items:[{id:'paint',name:'Paint',description:'Existing category'}]},refresh:async()=>{}})},
  '../services/adminApi':{adminError:e=>e.message,adminApi:async(op,input)=>{calls.push([op,input]);if(op==='categorySave'){await new Promise(r=>{release=r;});if(mode==='fail')throw Error('Retry later');}}},
 });
 const tree=await mount(CategoriesScreen);
 await change(tree,'Name',' ');await change(tree,'Description','');
 assert.ok(says(tree,'Category name is required.'));assert.ok(says(tree,'Description is required.'));
 await press(tree,'Save category');assert.equal(calls.length,0);
 await change(tree,'Name','Draft service');await change(tree,'Description','Draft description');
 await press(tree,'Archive category');await press(tree,'Confirm');
 assert.equal(field(tree,'Name').props.value,'Draft service');
 await act(async()=>{const submit=button(tree,'Save category').props.onPress;submit();submit();});
 assert.equal(calls.filter(([op])=>op==='categorySave').length,1);
 await act(async()=>release());assert.ok(says(tree,'Retry later'));assert.equal(field(tree,'Description').props.value,'Draft description');
 mode='success';await press(tree,'Save category');await act(async()=>release());
 assert.equal(field(tree,'Name').props.value,'');assert.equal(field(tree,'Description').props.value,'');
 await act(async()=>tree.unmount());
});

test('accounts append on scroll without duplicate cursors and reset for filters',async()=>{
 let current,busy=false;
 const {AccountsScreen}=screens({'../services/useAdminData':{useAdminData:(op,args)=>{
  current={op,args};return {busy,refresh:async()=>{},data:{items:[{id:args.cursor?'b':'a',fullName:'Demo',role:'owner'}],cursor:args.cursor?null:'a'}};
 }}});
 const props={route:{params:{}}},tree=await mount(AccountsScreen,props);
 assert.deepEqual(current.args,{filter:'all',cursor:null});assert.equal(button(tree,'Next page'),undefined);
 await scrollToBottom(tree);
 assert.equal(current.args.cursor,'a');assert.equal(button(tree,'Next page'),undefined);assert.ok(says(tree,'Demo'));
 await press(tree,'shop');
 assert.deepEqual(current.args,{filter:'shop',cursor:null});
 busy=true;await act(async()=>tree.update(React.createElement(AccountsScreen,{navigation,...props})));
 assert.equal(button(tree,'Next page'),undefined);
 await scrollToBottom(tree);assert.equal(current.args.cursor,null);
 assert.ok(field(tree,'Search accounts by name, email or UID'));
 await act(async()=>tree.unmount());
});

test('category lists append on scroll and search across loaded results while preserving the draft',async()=>{
 let args;
 const {CategoriesScreen}=screens({'../services/useAdminData':{useAdminData:(op,input)=>{
  args=input;return {refresh:async()=>{},data:{items:[input.cursor?{id:'wheels',name:'Wheels',description:'Wheel service'}:{id:'paint',name:'Paint',description:'Paint service'}],cursor:input.cursor?null:'paint'}};
 }}});
 const tree=await mount(CategoriesScreen);
 await change(tree,'Name','Draft');await change(tree,'Description','Unsubmitted details');
 await change(tree,'Search categories by name or description','Wheels');
 assert.ok(says(tree,'No matching categories loaded yet.'));
 assert.equal(button(tree,'Next page'),undefined);await scrollToBottom(tree);assert.equal(args.cursor,'paint');assert.ok(says(tree,'Wheels'));
 assert.equal(field(tree,'Name').props.value,'Draft');assert.equal(button(tree,'Next page'),undefined);
 await change(tree,'Search categories by name or description','');
 assert.equal(args.cursor,'paint');
 assert.equal(field(tree,'Description').props.value,'Unsubmitted details');
 await act(async()=>tree.unmount());
});

test('document requests use the same synchronous account action lock',async()=>{
 let release;const calls=[];
 const data={role:'shop',fullName:'Demo',phone:'0821234567',documents:[{id:'ownerId'}]};
 const {AccountDetailScreen}=screens({
  '../services/useAdminData':{useAdminData:()=>({data,refresh:async()=>{}})},
  '../services/adminApi':{adminError:e=>e.message,adminApi:async(...args)=>{calls.push(args);await new Promise(r=>{release=r;});throw Error('Document unavailable');}},
 });
 const tree=await mount(AccountDetailScreen,{route:{params:{uid:'shop'}}});
 let pending;await act(async()=>{const view=button(tree,'View ownerId').props.onPress;pending=view();void view();});
 assert.equal(calls.length,1);assert.deepEqual(calls[0],['document',{uid:'shop',kind:'ownerId'}]);
 await act(async()=>{release();await pending;});assert.ok(says(tree,'Document unavailable'));
 await act(async()=>tree.unmount());
});

test('identity confirmation rejects duplicate taps and clears the password after failure',async()=>{
 let release,count=0;
 const {ConfirmIdentityScreen}=screens({
  'firebase/auth':{EmailAuthProvider:{credential:(email,password)=>({email,password})},reauthenticateWithCredential:async()=>{count++;await new Promise(r=>{release=r;});throw Error('Wrong password');}},
  '../../../shared/services/firebase':{firebase:()=>({auth:{currentUser:{email:'demo@example.test'}}})},
  '../../auth/services/loginCooldown':{guardedLogin:fn=>fn()},'../../auth/utils/authErrors':{authError:e=>e.message},
 });
 const tree=await mount(ConfirmIdentityScreen);await change(tree,'Password','Sample password');
 let pending;await act(async()=>{const confirm=button(tree,'Confirm password').props.onPress;pending=confirm();void confirm();});
 assert.equal(count,1);await act(async()=>{release();await pending;});
 assert.equal(field(tree,'Password').props.value,'');assert.ok(says(tree,'Wrong password'));
 await act(async()=>tree.unmount());
});
