const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const act=Renderer.act;
const button=(root,label)=>root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===label||n.findAllByType('Text').some(t=>t.props.children===label));
test('actual admin confirmation path cancels, submits once, and exposes failures',async()=>{
 for(const [title,op,status] of [['Approve shop','review','approved'],['Reject application','review','rejected'],['Request resubmission','review','pending'],['Suspend account','status','suspended'],['Archive account','status','archived'],['Restore account','status','active']]){
  const calls=[];let failure=false,release;
  const data={id:'shop',role:'shop',fullName:'Demo',phone:'0821234567',shop:{},verificationStatus:'pending',accountStatus:title==='Restore account'?'suspended':'active'};
  const {AccountDetailScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{
   '@react-navigation/native':{useIsFocused:()=>true},'firebase/auth':{},'../../../shared/services/firebase':{},
   '../../auth/services/loginCooldown':{},'../../auth/hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0})},
   '../services/useAdminData':{useAdminData:()=>({data,busy:false,error:'',refresh:async()=>{}})},
   '../services/adminApi':{adminError:e=>e.message,adminApi:async(operation,payload)=>{calls.push({operation,payload});if(failure)throw Error('Request denied');await new Promise(r=>{release=r;});}},
  });
  let tree;await act(async()=>{tree=Renderer.create(React.createElement(AccountDetailScreen,{route:{params:{uid:'shop'}},navigation:{navigate(){}}}));});
  await act(async()=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Reason for review or account status change').props.onChangeText('Reviewed samples'));
  await act(async()=>button(tree.root,title).props.onPress());await act(async()=>button(tree.root,'Cancel').props.onPress());assert.equal(calls.length,0);
  await act(async()=>button(tree.root,title).props.onPress());let pending;
  await act(async()=>{const confirm=button(tree.root,'Confirm').props.onPress;pending=confirm();void confirm();});assert.equal(calls.length,1);assert.equal(calls[0].operation,op);assert.equal(calls[0].payload.status,status);assert.equal(calls[0].payload.reason,'Reviewed samples');
  await act(async()=>{release();await pending;});assert.equal(tree.root.findAllByType('Modal').length,0);
  failure=true;await act(async()=>button(tree.root,title).props.onPress());await act(async()=>button(tree.root,'Confirm').props.onPress());assert.ok(tree.root.findAllByType('Text').some(n=>n.props.children==='Request denied'));assert.equal(tree.root.findAllByType('Modal').length,1);await act(async()=>tree.unmount());
 }
});
test('document picker errors are rendered inline on web/native',async()=>{
 const Picker=loadUI('src/features/auth/components/DocumentPickerField.js',{'expo-document-picker':{getDocumentAsync:async()=>({assets:[{uri:'test',size:1,mimeType:'text/plain'}]})}}).default;
 let tree;await act(async()=>{tree=Renderer.create(React.createElement(Picker,{label:'Document',onChange:()=>assert.fail('invalid file accepted')}));});await act(async()=>tree.root.findByType('Pressable').props.onPress());assert.ok(tree.root.findAllByType('Text').some(n=>n.props.children==='Choose a PDF, JPG or PNG file.'));await act(async()=>tree.unmount());
});
test('category archive and restore confirmation reach the API',async()=>{
 for(const archived of [false,true]){
  const calls=[];const {CategoriesScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{
   '@react-navigation/native':{useIsFocused:()=>true},'firebase/auth':{},'../../../shared/services/firebase':{},
   '../../auth/services/loginCooldown':{},'../../auth/hooks/useLoginCooldown':{},
   '../services/useAdminData':{useAdminData:()=>({data:{items:[{id:'paint',name:'Paint',description:'Paint',archived}]},refresh:async()=>{}})},
   '../services/adminApi':{adminError:e=>e.message,adminApi:async(...args)=>calls.push(args)},
  });let tree;await act(async()=>{tree=Renderer.create(React.createElement(CategoriesScreen,{navigation:{navigate(){}}}));});
  await act(async()=>button(tree.root,archived?'Restore category':'Archive category').props.onPress());
  await act(async()=>button(tree.root,'Confirm').props.onPress());assert.deepEqual(calls,[['categoryArchive',{id:'paint',archived:!archived}]]);await act(async()=>tree.unmount());
 }
});
test('dirty account edit survives refetched data after reauthentication',async()=>{
 let data={role:'owner',fullName:'Original',phone:'0821234567'};
 const {AccountDetailScreen}=loadUI('src/features/admin/screens/AdminScreens.js',{
  '@react-navigation/native':{useIsFocused:()=>true},'firebase/auth':{},'../../../shared/services/firebase':{},
  '../../auth/services/loginCooldown':{},'../../auth/hooks/useLoginCooldown':{},
  '../services/useAdminData':{useAdminData:()=>({data,refresh:async()=>{}})},'../services/adminApi':{adminError:e=>e.message},
 });let tree;const props={route:{params:{uid:'owner'}},navigation:{navigate(){}}};
 await act(async()=>{tree=Renderer.create(React.createElement(AccountDetailScreen,props));});
 await act(async()=>tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Full name').props.onChangeText('Unsaved edit'));
 data={...data,fullName:'Server refresh'};await act(async()=>tree.update(React.createElement(AccountDetailScreen,props)));
 assert.equal(tree.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Full name').props.value,'Unsaved edit');await act(async()=>tree.unmount());
});
