const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react');
const {act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const selected=(name='selected.jpg')=>({uri:`file:///photos/${name}`,name,mimeType:'image/jpeg',size:1024});
const photo=(slot='1')=>({id:`photo-${slot}`,slot,name:`saved-${slot}.jpg`,size:2048,uploadedAt:Date.now()});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function screen(options={}){
 const state={auth:{user:{uid:'owner'},offline:false},focused:true,items:options.items||[],version:options.version??2,canManage:options.canManage??true,
  calls:{list:[],view:[],upload:[],remove:[],picker:[]},selection:[],...options.state};
 let props={target:'vehicle',id:'car',editable:true,...options.props},tree;
 const Button=loadUI('src/shared/components/PrimaryButton.js').default;
 const Gallery=loadUI('src/features/marketplace/components/PhotoGallery.js',{
  '../../auth/context/AuthContext':{useAuth:()=>state.auth},'@react-navigation/native':{useIsFocused:()=>state.focused},
  'expo-document-picker':{getDocumentAsync:async input=>{state.calls.picker.push(input);return options.pick?options.pick():{canceled:false,assets:[selected()]};}},
  './MarketplaceUI':{Button,Card:({children,...rest})=>React.createElement('View',rest,children),Notice:({busy,error})=>React.createElement('Text',null,busy?'Loading...':error)},
  '../services/photoApi':{
   listPhotos:async(...args)=>{state.calls.list.push(args);return options.list?options.list(...args):{items:state.items,version:state.version,canManage:state.canManage};},
   viewPhoto:async(...args)=>{state.calls.view.push(args);return options.view?options.view(...args):{url:'https://example.invalid/private-preview',expiresAt:Date.now()+60000};},
   uploadVehiclePhoto:async(...args)=>{state.calls.upload.push(args);return options.upload?options.upload(...args):{ok:true};},
   removeVehiclePhoto:async(...args)=>{state.calls.remove.push(args);return options.remove?options.remove(...args):{ok:true};},
  },
 }).default;
 if(options.selection){props.selectedIds=options.selection;props.onSelectionChange=ids=>{state.selection.push(ids);props.selectedIds=ids;tree.update(render());};}
 const render=()=>React.createElement(Gallery,props);
 await act(async()=>{tree=create(render());});
 const card=slot=>tree.root.findAllByType('View').find(node=>node.props.testID===`photo-${slot}`||node.props.testID===`photo-photo-${slot}`);
 const button=(title,slot)=>{
  const root=slot===undefined?tree.root:card(slot);
  return root?.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===title);
 };
 return {state,tree,button,text:()=>tree.root.findAllByType('Text').map(node=>[node.props.children].flat().join('')).join('\n'),images:()=>tree.root.findAllByType('Image'),
  press:async (title,slot)=>act(async()=>{assert.ok(button(title,slot),`Missing button: ${title} in photo ${slot ?? 'gallery'}`);await button(title,slot).props.onPress();}),
  update:async next=>act(async()=>{if(Object.hasOwn(next,'uid'))state.auth.user=next.uid?{uid:next.uid}:null;if(Object.hasOwn(next,'offline'))state.auth.offline=next.offline;if(Object.hasOwn(next,'focused'))state.focused=next.focused;props={...props,...next.props};tree.update(render());}),
  close:async()=>act(async()=>tree.unmount()),
 };
}

test('photo metadata loads independently and only View mints a short-lived preview',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:1800000000000});
 const pending=deferred(),s=await screen({items:[photo()],view:()=>pending.promise});
 assert.match(s.text(),/saved-1\.jpg/);assert.equal(s.state.calls.view.length,0);assert.equal(s.images().length,0);
 let viewing;await act(async()=>{const press=s.button('View photo','1').props.onPress;viewing=press();void press();});assert.equal(s.state.calls.view.length,1);
 await act(async()=>{pending.resolve({url:'https://example.invalid/temporary',expiresAt:Date.now()+900000});await viewing;});
 assert.equal(s.images()[0].props.source.uri,'https://example.invalid/temporary');assert.equal(s.images()[0].props.source.cache,'reload');
 await act(async()=>t.mock.timers.tick(60000));assert.equal(s.images().length,0);assert.match(s.text(),/preview expired/);assert.equal(s.state.calls.view.length,1);await s.close();
});

test('image errors clear the URL and do not automatically mint another preview',async()=>{
 const s=await screen({items:[photo()]});await s.press('View photo','1');
 await act(async()=>s.images()[0].props.onError());assert.equal(s.images().length,0);assert.match(s.text(),/Unable to load this preview/);assert.equal(s.state.calls.view.length,1);
 await s.press('View photo','1');assert.equal(s.state.calls.view.length,2);assert.equal(s.images().length,1);await s.close();
});

test('expired or non-HTTPS preview responses are rejected and a stale image error cannot clear a newer URL',async()=>{
 let response={url:'http://example.invalid/unsafe',expiresAt:Date.now()+60000};const s=await screen({items:[photo()],view:async()=>response});
 await s.press('View photo','1');assert.equal(s.images().length,0);assert.match(s.text(),/preview expired/);
 response={url:'https://example.invalid/expired',expiresAt:Date.now()-1};await s.press('View photo','1');assert.equal(s.images().length,0);
 response={url:'https://example.invalid/first',expiresAt:Date.now()+60000};await s.press('View photo','1');const oldError=s.images()[0].props.onError;
 response={url:'https://example.invalid/second',expiresAt:Date.now()+60000};await s.press('View photo','1');await act(async()=>oldError());
 assert.equal(s.images()[0].props.source.uri,'https://example.invalid/second');await s.close();
});

test('blur, offline and account changes clear previews and discard late signing responses',async()=>{
 for(const transition of [{focused:false},{offline:true},{uid:'other-owner'}]){
  const pending=deferred(),s=await screen({items:[photo()],view:()=>pending.promise});let viewing;
  await act(async()=>{viewing=s.button('View photo','1').props.onPress();});await s.update(transition);
  await act(async()=>{pending.resolve({url:'https://example.invalid/old-private-preview',expiresAt:Date.now()+60000});await viewing;});
  assert.equal(s.images().length,0);assert.doesNotMatch(s.text(),/old-private-preview/);await s.close();
 }
 const s=await screen({items:[photo()]});await s.press('View photo','1');await s.update({focused:false});assert.equal(s.images().length,0);
 await s.update({focused:true});assert.equal(s.state.calls.list.length,2);assert.equal(s.images().length,0);await s.update({offline:true});assert.doesNotMatch(s.text(),/saved-1.jpg/);await s.close();
});

test('late list responses never repopulate metadata after an account change',async()=>{
 const old=deferred(),s=await screen({list:async(_target,_id,uid)=>uid==='owner'?old.promise:{items:[],version:0,canManage:true}});
 assert.match(s.text(),/Loading/);await s.update({uid:'other-owner'});await act(async()=>old.resolve({items:[{...photo(),name:'previous-owner.jpg'}],version:5,canManage:true}));
 assert.doesNotMatch(s.text(),/previous-owner/);assert.equal(s.state.calls.list.length,2);assert.deepEqual(s.state.calls.list[1],['vehicle','car','other-owner']);await s.close();
});

test('picker cancellation and invalid file types or sizes keep uploads unavailable',async t=>{
 let choice={canceled:true};const s=await screen({pick:async()=>choice});await s.press('Choose photo','1');assert.equal(s.button('Upload photo','1'),undefined);
 t.after(()=>s.close());
 for(const [asset,message] of [[{...selected(),mimeType:'application/pdf'},'Choose a JPEG, PNG or WebP photo'],[{...selected(),size:5*1024*1024+1},'5 MB'],[{...selected(),size:null},'size could not be read']]){
  choice={canceled:false,assets:[asset]};await s.press('Choose photo','1');assert.match(s.text(),new RegExp(message));assert.equal(s.button('Upload photo','1'),undefined);
 }
 choice={canceled:false,assets:[selected()]};await s.press('Choose photo','1');assert.ok(s.button('Upload photo','1'));assert.equal(s.state.calls.upload.length,0);
 await s.press('Discard selection','1');assert.equal(s.button('Upload photo','1'),undefined);
 assert.deepEqual(s.state.calls.picker[0],{type:['image/jpeg','image/png'],multiple:false,copyToCacheDirectory:true});
});

test('picker responses after blur/refocus, account changes or external disable cannot select a stale file',async()=>{
 for(const transition of ['focus','account','disable']){
  const pending=deferred(),s=await screen({pick:()=>pending.promise});let picking;
  await act(async()=>{const choose=s.button('Choose photo','1').props.onPress;picking=choose();void choose();});assert.equal(s.state.calls.picker.length,1);
  if(transition==='focus'){await s.update({focused:false});await s.update({focused:true});}
  if(transition==='account')await s.update({uid:'other-owner'});
  if(transition==='disable')await s.update({props:{disabled:true}});
  await act(async()=>{pending.resolve({canceled:false,assets:[selected('stale.jpg')]});await picking;});
  assert.doesNotMatch(s.text(),/Selected: stale/);assert.equal(s.state.calls.upload.length,0);await s.close();
 }
});

test('uploads require confirmation, block duplicate taps and preserve acknowledged success if refresh fails',async()=>{
 const pending=deferred();let reads=0;const s=await screen({upload:()=>pending.promise,list:async()=>{if(++reads>1)throw Error('Read unavailable');return {items:[],version:4,canManage:true};}});
 await s.press('Choose photo','1');await s.press('Upload photo','1');await s.press('Cancel');assert.equal(s.state.calls.upload.length,0);
 await s.press('Upload photo','1');let uploading;await act(async()=>{const confirm=s.button('Confirm').props.onPress;uploading=confirm();void confirm();});
 assert.equal(s.state.calls.upload.length,1);assert.deepEqual(s.state.calls.upload[0],['car','1',4,selected(),'owner']);assert.equal(s.button('Choose photo','2').props.disabled,true);
 await act(async()=>{pending.resolve({ok:true});await uploading;});
 assert.match(s.text(),/Photo uploaded successfully/);assert.match(s.text(),/change was saved, but photo status could not refresh/);assert.equal(s.button('Upload photo','1'),undefined);assert.equal(s.tree.root.findAllByType('Modal').length,0);await s.close();
});

test('upload errors remain in the confirmation and keep the selected file until refresh and manual retry',async()=>{
 let fail=true;const s=await screen({upload:async()=>{if(fail)throw Error('Unknown upload outcome');return {ok:true};}});
 await s.press('Choose photo','1');await s.press('Upload photo','1');await s.press('Confirm');
 assert.equal(s.tree.root.findAllByType('Modal').length,1);assert.match(s.text(),/Unknown upload outcome/);assert.match(s.text(),/Your selected photo is kept/);assert.equal(s.button('Confirm').props.disabled,true);
 await s.press('Cancel');assert.match(s.text(),/Selected: selected.jpg/);assert.equal(s.button('Upload photo','1').props.disabled,true);
 s.state.version=3;s.state.items=[photo()];await s.press('Refresh photos');assert.ok(s.button('Replace photo','1'));assert.match(s.text(),/Selected: selected.jpg/);
 fail=false;await s.press('Replace photo','1');await s.press('Confirm');assert.equal(s.state.calls.upload.length,2);assert.equal(s.state.calls.upload[1][2],3);assert.doesNotMatch(s.text(),/Selected: selected/);await s.close();
});

test('removal is confirmed, uses the photo revision and blocks duplicate submissions',async()=>{
 const pending=deferred(),s=await screen({items:[photo()],version:7,remove:()=>pending.promise});
 await s.press('Remove photo','1');await s.press('Cancel');assert.equal(s.state.calls.remove.length,0);
 await s.press('Remove photo','1');let removing;await act(async()=>{const confirm=s.button('Confirm').props.onPress;removing=confirm();void confirm();});
 assert.deepEqual(s.state.calls.remove,[['car','1',7,'owner']]);s.state.items=[];s.state.version=8;
 await act(async()=>{pending.resolve({ok:true});await removing;});assert.match(s.text(),/Photo removed from this vehicle/);assert.match(s.text(),/Published requests keep their attached copy/);assert.equal(s.button('Remove photo','1'),undefined);await s.close();
});

test('failed removal stays visible and cannot be repeated until server metadata is refreshed',async()=>{
 let fail=true;const s=await screen({items:[photo()],remove:async()=>{if(fail)throw Error('Removal outcome unavailable');return {ok:true};}});
 await s.press('Remove photo','1');await s.press('Confirm');assert.match(s.text(),/Removal outcome unavailable/);assert.equal(s.tree.root.findAllByType('Modal').length,1);
 await s.press('Confirm');assert.equal(s.state.calls.remove.length,1);await s.press('Cancel');assert.equal(s.button('Remove photo','1').props.disabled,true);
 await s.press('Refresh photos');fail=false;await s.press('Remove photo','1');await s.press('Confirm');assert.equal(s.state.calls.remove.length,2);assert.match(s.text(),/Photo removed from this vehicle/);await s.close();
});

test('read-only attachment selection is bounded to five and respects disabled state',async()=>{
 const items=Array.from({length:6},(_,index)=>photo(String(index+1))),s=await screen({items,selection:[],props:{editable:false}});
 for(let slot=1;slot<=5;slot++)await s.press('Attach to request',String(slot));
 assert.deepEqual(s.state.selection.at(-1),items.slice(0,5).map(item=>item.id));assert.equal(s.button('Attach to request','6').props.disabled,true);
 await s.press('Attach to request','6');assert.equal(s.state.selection.length,5);
 await s.press('Detach from request','2');assert.equal(s.state.selection.at(-1).length,4);await s.press('Attach to request','6');assert.ok(s.state.selection.at(-1).includes('photo-6'));
 await s.update({props:{disabled:true}});await s.press('Detach from request','1');await s.press('View photo','1');await s.press('Refresh photos');
 assert.equal(s.state.selection.length,7);assert.equal(s.state.calls.view.length,0);assert.equal(s.state.calls.list.length,1);assert.equal(s.button('Choose photo','1'),undefined);await s.close();
});

test('offline, archived and request galleries prevent vehicle mutations and reconnect fetches fresh status',async()=>{
 const offline=await screen({state:{auth:{user:{uid:'owner'},offline:true}}});assert.equal(offline.state.calls.list.length,0);assert.match(offline.text(),/Connect to view or manage/);
 await offline.update({offline:false});assert.equal(offline.state.calls.list.length,1);await offline.close();
 const archived=await screen({items:[photo()],canManage:false});assert.equal(archived.button('Remove photo','1'),undefined);assert.equal(archived.button('Choose photo','1'),undefined);assert.match(archived.text(),/changes are not available/);await archived.close();
 const request=await screen({items:[photo()],props:{target:'request',editable:false}});await request.press('View photo','1');assert.deepEqual(request.state.calls.view,[['request','car','photo-1','owner']]);assert.equal(request.button('Remove photo','1'),undefined);await request.close();
});

test('a malformed vehicle revision or denied metadata keeps editing unavailable',async()=>{
 const s=await screen({list:async()=>({items:[photo()],version:null,canManage:true})});assert.match(s.text(),/current photo version/);assert.equal(s.button('Choose photo','1'),undefined);assert.equal(s.state.calls.view.length,0);await s.close();
 const denied=await screen({list:async()=>{throw Error('Vehicle not found');}});assert.match(denied.text(),/Vehicle not found/);assert.equal(denied.button('Remove photo','1'),undefined);await denied.close();
});
