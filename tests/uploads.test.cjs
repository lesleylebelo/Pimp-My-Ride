const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),babel=require('@babel/core'),React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');

global.IS_REACT_ACT_ENVIRONMENT=true;
const act=Renderer.act;
const file=name=>({uri:`file:///samples/${name}`,name,mimeType:'application/pdf',size:1024});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function accountService({platform='android',fetchFile,items=[]}={}) {
 const calls=[],auth={currentUser:{uid:'shop-1',emailVerified:true}};
 const mocks={
  'react-native':{Platform:{OS:platform}},'firebase/auth':{},'firebase/firestore':{},
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/network':{requireConnection:async()=>{}},'./loginCooldown':{},
  '../utils/registration':loadUI('src/features/auth/utils/registration.js'),
  '../../../shared/services/api':{apiRequest:async(...args)=>{calls.push(args);return args[0]==='documents/list'?{items}:{ok:true,kind:args[0].split('/')[1]};}},
 };
 const {code}=babel.transformSync(fs.readFileSync('src/features/auth/services/accounts.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});
 const mod={exports:{}};
 class Multipart { constructor(){this.fields=[];} append(...args){this.fields.push(args);} }
 new Function('require','module','exports','FormData','fetch',code)(name=>{assert.ok(Object.hasOwn(mocks,name),name);return mocks[name];},mod,mod.exports,Multipart,fetchFile||(async()=>assert.fail('Native uploads must not fetch local files.')));
 return {...mod.exports,calls,auth};
}

test('single native upload sends only the chosen document with its expected account',async()=>{
 const s=accountService(),selected=file('cipc.pdf');
 assert.deepEqual(await s.uploadDocument('cipcCert',selected,'shop-1'),{ok:true,kind:'cipcCert'});
 assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],'documents/cipcCert');
 assert.deepEqual(s.calls[0][1].fields,[['file',{uri:selected.uri,name:selected.name,type:selected.mimeType}]]);
 assert.deepEqual(s.calls[0][2],{multipart:true,expectedUid:'shop-1'});
});

test('upload guards reject invalid kind, missing file, unverified user, and changed account before requests',async()=>{
 const s=accountService();
 await assert.rejects(()=>s.uploadDocument('avatar',file('a.pdf')),/supported verification/);
 await assert.rejects(()=>s.uploadDocument('ownerId',null),/Choose a document/);
 await assert.rejects(()=>s.uploadDocument('ownerId',file('a.pdf'),'other-account'),/account changed/);
 s.auth.currentUser.emailVerified=false;
 await assert.rejects(()=>s.uploadDocument('ownerId',file('a.pdf')),/Verify your email/);
 assert.equal(s.calls.length,0);
});

test('web file read failures and account changes cannot upload a selected file',async()=>{
 const unreadable=accountService({platform:'web',fetchFile:async()=>({ok:false})});
 await assert.rejects(()=>unreadable.uploadDocument('ownerId',file('a.pdf')),/choose it again/);
 assert.equal(unreadable.calls.length,0);
 let s;s=accountService({platform:'web',fetchFile:async()=>({ok:true,blob:async()=>{s.auth.currentUser={uid:'shop-2',emailVerified:true};return {};}})});
 await assert.rejects(()=>s.uploadDocument('ownerId',file('a.pdf')),/account changed/);
 assert.equal(s.calls.length,0);
});

test('document listing exposes only known verification metadata without storage paths',async()=>{
 const s=accountService({items:[{id:'ownerId',name:'id.pdf',size:100,contentType:'application/pdf',uploadedAt:'2026-09-22T10:00:00Z',path:'private/path',url:'private-url'},{id:'other',name:'other'}]});
 assert.deepEqual(await s.listDocuments('shop-1'),[{id:'ownerId',name:'id.pdf',size:100,contentType:'application/pdf',uploadedAt:'2026-09-22T10:00:00Z'}]);
 assert.deepEqual(s.calls[0],['documents/list',{}, {expectedUid:'shop-1'}]);
});

async function screen({items=[],upload,read,uid='shop-1',offline=false,canUpload=true}={}) {
 let currentItems=items,props={uid,offline,canUpload},listCalls=0,focused=true;
 const uploads=[],busy=[];
 const Component=loadUI('src/features/auth/components/VerificationDocuments.js',{
  '@react-navigation/native':{useFocusEffect:callback=>React.useEffect(()=>focused?callback():undefined,[callback,focused])},
  './DocumentPickerField':{default:props=>React.createElement('PickerField',props),__esModule:true},
  '../services/accounts':{
   listDocuments:async(account)=>{++listCalls;return read?read(account,listCalls):currentItems;},
   uploadDocument:async(kind,selected,account)=>{
    uploads.push({kind,file:selected,uid:account});
    if(upload)await upload(kind,selected,account);
    currentItems=[...currentItems.filter(item=>item.id!==kind),{id:kind,name:selected.name,size:selected.size,contentType:selected.mimeType}];
   },
  },
 }).default;
 const onBusyChange=value=>busy.push(value);
 let tree;
 const render=()=>React.createElement(Component,{...props,onBusyChange});
 await act(async()=>{tree=Renderer.create(render());await flush();});
 const button=id=>tree.root.findAllByType('Pressable').find(node=>node.props.testID===id);
 return {
  uploads,busy,get listCalls(){return listCalls;},
  text:()=>JSON.stringify(tree.toJSON()),
  metadata:kind=>tree.root.findByProps({testID:`document-${kind}`}).findAllByType('Text').flatMap(node=>node.props.children).join(' '),
  file:kind=>tree.root.findByProps({testID:`document-${kind}`}).findByType('PickerField').props.value,
  choose:async(kind,selected)=>act(async()=>tree.root.findByProps({testID:`document-${kind}`}).findByType('PickerField').props.onChange(selected)),
  press:async id=>act(async()=>{await button(id).props.onPress();await flush();}),
  rawPress:id=>button(id).props.onPress,
  buttons:()=>tree.root.findAllByType('Pressable'),
  update:async next=>act(async()=>{props={...props,...next};tree.update(render());await flush();}),
  focus:async next=>act(async()=>{focused=next;tree.update(render());await flush();}),
  close:async()=>act(async()=>tree.unmount()),
 };
}

test('saved metadata is displayed and a failed individual upload retries without reuploading successful files',async()=>{
 let fail=true;
 const s=await screen({items:[{id:'cipcCert',name:'existing.pdf',size:1024}],upload:async kind=>{if(kind==='ownerId'&&fail)throw Error('Server unavailable');}});
 assert.match(s.metadata('cipcCert'),/existing\.pdf/);
 await s.choose('proofOfAddress',file('address.pdf'));await s.press('upload-proofOfAddress');
 assert.equal(s.file('proofOfAddress'),null);assert.match(s.metadata('proofOfAddress'),/address\.pdf/);
 await s.choose('ownerId',file('id.pdf'));await s.press('upload-ownerId');
 assert.equal(s.file('ownerId').name,'id.pdf');assert.match(s.text(),/Server unavailable/);
 fail=false;await s.press('upload-ownerId');
 assert.deepEqual(s.uploads.map(value=>value.kind),['proofOfAddress','ownerId','ownerId']);
 assert.equal(s.file('ownerId'),null);assert.match(s.metadata('ownerId'),/id\.pdf/);
 await s.close();
});

test('rapid duplicate submissions share a ref lock and retain successful status after refresh fails',async()=>{
 let release;const barrier=new Promise(resolve=>{release=resolve;});
 const s=await screen({upload:async()=>barrier,read:async(_,count)=>{if(count>1)throw Error('Status unavailable');return [];}});
 await s.choose('ownerId',file('id.pdf'));
 const press=s.rawPress('upload-ownerId');let pending;
 await act(async()=>{pending=press();void press();});
 assert.equal(s.uploads.length,1);assert.deepEqual(s.busy,[true]);
 await act(async()=>{release();await pending;});
 assert.match(s.metadata('ownerId'),/id\.pdf/);assert.match(s.text(),/Uploaded successfully/);assert.match(s.text(),/Could not refresh saved documents/);
 assert.equal(s.file('ownerId'),null);assert.deepEqual(s.busy,[true,false]);await s.close();
});

test('offline and rejected shops cannot upload; reconnect and navigation focus refresh server metadata',async()=>{
 const s=await screen({offline:true});assert.equal(s.listCalls,0);assert.equal(s.buttons().length,0);
 await s.update({offline:false});assert.equal(s.listCalls,1);
 await s.focus(false);await s.focus(true);assert.equal(s.listCalls,2);
 await s.update({canUpload:false});assert.equal(s.buttons().filter(button=>button.props.testID?.startsWith('upload-')).length,0);
 await s.update({offline:true});assert.match(s.text(),/Connect to view current document status/);assert.equal(s.uploads.length,0);await s.close();
});

test('account switches clear selections and ignore metadata returned for the previous account',async()=>{
 let oldRead;const oldResult=new Promise(resolve=>{oldRead=resolve;});
 const s=await screen({read:async uid=>uid==='shop-1'?oldResult:[]});
 await s.choose('ownerId',file('private-selected.pdf'));
 await s.update({uid:'shop-2'});assert.equal(s.file('ownerId'),undefined);
 await act(async()=>{oldRead([{id:'ownerId',name:'previous-account.pdf',size:1024}]);await flush();});
 assert.doesNotMatch(s.text(),/previous-account\.pdf|private-selected\.pdf/);
 assert.equal(s.listCalls,2);await s.close();
});
