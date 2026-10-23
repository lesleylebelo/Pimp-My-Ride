const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
const vehicle={id:'vehicle-one',version:3,make:'Toyota',model:'Corolla',year:2020,colour:'White',registration:'ABC123GP',archived:false};
const secondVehicle={...vehicle,id:'vehicle-two',make:'Ford',model:'Fiesta'};
const category={id:'paint',name:'Paint'};
const shop={id:'shop-one',shopName:'Demo Customs',city:'Pretoria'};
const request={id:'req-one',title:'Paint the doors',description:'Repair and paint both front doors.',vehicle,categoryName:'Paint',city:'Pretoria',budgetMinCents:50000,budgetMaxCents:100000,visibility:'open',status:'open'};
const field=(tree,label)=>tree.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel===label);
const buttons=(tree,title)=>tree.root.findAllByType('Pressable').filter(node=>node.props.accessibilityLabel===title);
const button=(tree,title)=>buttons(tree,title)[0];
const says=(tree,text)=>tree.root.findAllByType('Text').some(node=>String([node.props.children].flat().join('')).includes(text));
const change=(tree,label,value)=>act(async()=>field(tree,label).props.onChangeText(value));
const press=(tree,title)=>act(async()=>button(tree,title).props.onPress());
const unmount=tree=>act(async()=>tree.unmount());
const scrollToBottom=tree=>act(async()=>{const view=[...tree.root.findAllByType('View'),...tree.root.findAllByType('ScrollView')].find(node=>node.props.onScroll);assert.ok(view,'Scrollable page must expose onScroll for pagination');view.props.onScroll({nativeEvent:{contentOffset:{y:500},contentSize:{height:1200},layoutMeasurement:{height:600}}});});
function setup({api=async()=>({id:'saved'}),read,auth={user:{uid:'owner'},profile:{role:'owner'},offline:false},aiComponent}={}){
  const calls=[],reads=[],moves=[];
  const navigation={navigate:(...args)=>moves.push(['navigate',...args]),replace:(...args)=>moves.push(['replace',...args]),goBack:()=>moves.push(['back'])};
  const Primary=loadUI('src/shared/components/PrimaryButton.js').default;
  const screens=loadUI('src/features/marketplace/screens/OwnerMarketplaceScreens.js',{
    '../../../shared/components/landing/LandingUI':{LandingText:props=>React.createElement('Text',props),LandingShell:({children,...props})=>React.createElement('View',props,children),LandingButton:Primary,ui:{},ownerTabs:[],shopTabs:[],useLandingFeedback:()=>({})},
    '../../auth/context/AuthContext':{useAuth:()=>auth},
    '../components/PhotoGallery':props=>React.createElement('PhotoGallery',props),
    '../components/PrivatePhoto':props=>React.createElement('PrivatePhoto',props),
    ...(aiComponent?{'../components/AIAssistButton':aiComponent}:{}),
    '../services/marketApi':{marketApi:async(...args)=>{calls.push(args);return api(...args);}},
    '../hooks/useMarketData':{useMarketData:(op,input)=>{reads.push([op,input]);return {data:read?read(op,input):{items:[]},busy:false,error:'',refresh:async()=>{}};}},
  });
  return {screens,calls,reads,moves,navigation,auth};
}
async function mount(context,name,params={}){
  let tree;await act(async()=>{tree=Renderer.create(React.createElement(context.screens[name],{route:{params},navigation:context.navigation}));});return tree;
}
async function fillRequest(tree){
  for(const [label,value] of [['Request title','Paint the doors'],['Description','Repair and paint both front doors.'],['City','Pretoria'],['Minimum budget (ZAR)','500.10'],['Maximum budget (ZAR)','1000.25']])await change(tree,label,value);
}

test('AI Apply changes only request text and optional category while retaining photos, location and terms until normal save',async()=>{
 const original={...request,vehicleId:vehicle.id,categoryId:category.id,version:4,budgetMinCents:50000,budgetMaxCents:100000,photoIds:['attached-a','attached-b'],mandatoryServices:['Keep original finish'],serviceLocation:{latitude:-26.1,longitude:28.1}};
 const c=setup({aiComponent:props=>React.createElement('AIAssist',props),read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[]})});
 const tree=await mount(c,'RequestFormScreen',{request:original});
 try{
  const ai=tree.root.findByType('AIAssist');assert.equal(ai.props.kind,'request');assert.equal(c.calls.length,0);
  await act(async()=>ai.props.onApply({title:'Updated paint request',description:'Paint both front doors.',category:{id:'paint',name:'Paint'}}));
  assert.equal(field(tree,'Request title').props.value,'Updated paint request');assert.equal(c.calls.length,0);assert.deepEqual(tree.root.findByType('PhotoGallery').props.selectedIds,original.photoIds);
  await press(tree,'Save request');const [op,data]=c.calls[0];assert.equal(op,'requestUpdate');assert.deepEqual(data.photoIds,original.photoIds);assert.deepEqual(data.serviceLocation,original.serviceLocation);
  assert.deepEqual(data.mandatoryServices,original.mandatoryServices);assert.equal(data.vehicleId,vehicle.id);assert.equal(data.budgetMinCents,50000);assert.equal(data.version,4);
 }finally{await unmount(tree);}
});

test('vehicle form validates live, keeps a failed draft, submits once and includes the optimistic version',async()=>{
  let reject,fail=true;
  const context=setup({api:async()=>{if(fail)await new Promise((_,r)=>{reject=r;});return {id:vehicle.id};}});
  const tree=await mount(context,'VehicleFormScreen',{vehicle});
  await change(tree,'Year','189');assert.equal(button(tree,'Save vehicle').props.disabled,true);assert.ok(says(tree,'Enter a valid vehicle year.'));
  await press(tree,'Save vehicle');assert.equal(context.calls.length,0);
  await change(tree,'Year','2024');await change(tree,'Colour','Blue');
  let first;await act(async()=>{const submit=button(tree,'Save vehicle').props.onPress;first=submit();void submit();});
  assert.equal(context.calls.length,1);assert.equal(context.calls[0][0],'vehicleSave');
  assert.equal(context.calls[0][1].version,3);assert.equal(context.calls[0][1].year,2024);
  await act(async()=>{reject(Error('A newer vehicle version exists. Reload your garage.'));await first;});
  assert.equal(field(tree,'Colour').props.value,'Blue');assert.ok(says(tree,'A newer vehicle version exists.'));assert.deepEqual(context.moves,[]);
  fail=false;await press(tree,'Save vehicle');assert.deepEqual(context.moves,[['back']]);await unmount(tree);
});
test('switching vehicle or account resets a draft instead of saving old fields to another vehicle',async()=>{
 const context=setup(),tree=await mount(context,'VehicleFormScreen',{vehicle});await change(tree,'Colour','Unsaved green');
 await act(async()=>tree.update(React.createElement(context.screens.VehicleFormScreen,{route:{params:{vehicle:secondVehicle}},navigation:context.navigation})));
 assert.equal(field(tree,'Make').props.value,'Ford');assert.equal(field(tree,'Colour').props.value,'White');
 await change(tree,'Colour','Unsaved orange');context.auth.user={uid:'another-owner'};
 await act(async()=>tree.update(React.createElement(context.screens.VehicleFormScreen,{route:{params:{vehicle:secondVehicle}},navigation:context.navigation})));
 assert.equal(field(tree,'Colour').props.value,'White');assert.equal(context.calls.length,0);await unmount(tree);
});

test('offline owner forms block actions and an unmounted request does not navigate another session',async()=>{
  let release;
  const context=setup({auth:{user:{uid:'owner'},profile:{role:'owner'},offline:true},api:async()=>new Promise(resolve=>{release=resolve;})});
  let tree=await mount(context,'VehicleFormScreen',{vehicle});
  assert.equal(field(tree,'Make').props.editable,false);await press(tree,'Save vehicle');assert.equal(context.calls.length,0);
  context.auth.offline=false;await act(async()=>tree.update(React.createElement(context.screens.VehicleFormScreen,{route:{params:{vehicle}},navigation:context.navigation})));
  let pending;await act(async()=>{pending=button(tree,'Save vehicle').props.onPress();});await unmount(tree);
  await act(async()=>{release({id:vehicle.id});await pending;});assert.deepEqual(context.moves,[]);
});

test('garage appends vehicles while scrolling',async t=>{
  const context=setup({read:(op,input)=>({items:input.archived?[{...vehicle,archived:true}]:input.cursor?[secondVehicle]:[vehicle],cursor:input.cursor?null:'next-vehicles'})});
  const tree=await mount(context,'GarageScreen');
  t.after(()=>unmount(tree));
  assert.equal(button(tree,'Next'),undefined);await scrollToBottom(tree);assert.ok(context.reads.some(([op,input])=>op==='vehicles'&&input.cursor==='next-vehicles'));
  assert.ok(says(tree,'Toyota Corolla'));assert.ok(says(tree,'Ford Fiesta'));
  const reads=context.reads.length;await scrollToBottom(tree);assert.equal(context.reads.length,reads);
});

test('garage loads another page when its content does not fill the viewport',async t=>{
  const context=setup({read:(_op,input)=>({items:input.cursor?[secondVehicle]:[vehicle],cursor:input.cursor?null:'short-garage-page'})});
  const tree=await mount(context,'GarageScreen');t.after(()=>unmount(tree));
  const page=tree.root.findAllByType('ScrollView').find(node=>node.props.onScroll);
  assert.equal(typeof page.props.onLayout,'function');assert.equal(typeof page.props.onContentSizeChange,'function');
  await act(async()=>page.props.onContentSizeChange(400,900));
  assert.equal(context.reads.some(([_op,input])=>input.cursor),false);
  await act(async()=>page.props.onLayout({nativeEvent:{layout:{height:800}}}));
  assert.ok(context.reads.some(([_op,input])=>input.cursor==='short-garage-page'));
  assert.ok(says(tree,'Toyota Corolla'));assert.ok(says(tree,'Ford Fiesta'));
});

test('garage archive/restore require confirmation with the displayed version',async t=>{
  const context=setup({read:(op,input)=>({items:input.archived?[{...vehicle,archived:true}]:[secondVehicle],cursor:null})});
  const tree=await mount(context,'GarageScreen');
  t.after(()=>unmount(tree));
  await press(tree,'Remove Ford Fiesta');await press(tree,'Cancel');assert.equal(context.calls.length,0);
  await press(tree,'Remove Ford Fiesta');await press(tree,'Confirm');assert.deepEqual(context.calls,[['vehicleArchive',{id:'vehicle-two',version:3,archived:true}]]);assert.ok(says(tree,'Ford Fiesta removed from your active garage.'));
  await press(tree,'Archived vehicles');assert.ok(context.reads.some(([op,input])=>op==='vehicles'&&input.archived===true&&input.cursor===null));
  await press(tree,'Restore Toyota Corolla');await press(tree,'Confirm');assert.deepEqual(context.calls[1],['vehicleArchive',{id:'vehicle-one',version:3,archived:false}]);
});

test('request form scrolls vehicle choices independently, validates amounts and dates, and preserves a failed direct draft',async()=>{
  let fail=true,release;
  const context=setup({read:(op,input)=>op==='vehicles'?{items:input.cursor?[secondVehicle]:[vehicle],cursor:input.cursor?null:'vehicle-page-two'}:op==='categories'?{items:[category]}:{items:[shop]},api:async()=>{if(fail){await new Promise(resolve=>{release=resolve;});throw Error('Network interrupted. Retry this request.');}return {id:'new-request'};}});
  const tree=await mount(context,'RequestFormScreen');
  const selector=tree.root.find(node=>node.props.title==='01  /  YOUR VEHICLE'&&typeof node.props.onLayout==='function');
  assert.ok(selector);await act(async()=>selector.props.onLayout({nativeEvent:{layout:{y:0,height:180}}}));
  assert.ok(context.reads.some(([op,input])=>op==='vehicles'&&input.cursor==='vehicle-page-two'));
  assert.equal(button(tree,'Next'),undefined);await press(tree,'Ford Fiesta (2020)');await press(tree,'Paint');
  await fillRequest(tree);await change(tree,'Maximum budget (ZAR)','40');assert.ok(says(tree,'Maximum budget must be at least the minimum.'));
  await press(tree,'Submit request');assert.equal(context.calls.length,0);
  await change(tree,'Maximum budget (ZAR)','1000.25');await change(tree,'Preferred date (optional, YYYY-MM-DD)','2026-02-30');assert.equal(button(tree,'Submit request').props.disabled,true);
  await change(tree,'Preferred date (optional, YYYY-MM-DD)','');await press(tree,'One approved shop');assert.equal(button(tree,'Submit request').props.disabled,true);
  await press(tree,'Demo Customs · Pretoria');let pending;
  await act(async()=>{const submit=button(tree,'Submit request').props.onPress;pending=submit();void submit();});
  assert.equal(context.calls.length,1);assert.deepEqual(context.calls[0],['requestCreate',{vehicleId:'vehicle-two',categoryId:'paint',title:'Paint the doors',description:'Repair and paint both front doors.',city:'Pretoria',preferredDate:'',visibility:'direct',shopId:'shop-one',budgetMinCents:50010,budgetMaxCents:100025}]);
  await act(async()=>{release();await pending;});assert.equal(field(tree,'Description').props.value,'Repair and paint both front doors.');assert.ok(says(tree,'Selected shop: Demo Customs'));assert.ok(says(tree,'Network interrupted.'));
  fail=false;await press(tree,'Submit request');assert.deepEqual(context.moves,[['replace','OwnerRequest',{id:'new-request'}]]);await unmount(tree);
});

test('untouched empty request form exposes all validation errors through the summary affordance',async()=>{
 const context=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]})});
 const tree=await mount(context,'RequestFormScreen');
 assert.equal(button(tree,'Submit request').props.disabled,true);
 assert.ok(says(tree,'Complete these fields before submitting:'));
 assert.ok(says(tree,'Vehicle is required.'));
 assert.ok(says(tree,'Service category is required.'));
 assert.ok(says(tree,'Title is required.'));
 assert.ok(says(tree,'Description is required.'));
 assert.ok(says(tree,'City is required.'));
 assert.ok(says(tree,'Enter an amount up to R1,000,000 with at most two decimal places.'));
 await press(tree,'Show required fields');
 assert.ok(says(tree,'Vehicle is required.'));
 assert.ok(says(tree,'Title is required.'));
 await unmount(tree);
});

test('switching a request from direct to open omits the old shop selection from the payload',async()=>{
  const context=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]})});
  const tree=await mount(context,'RequestFormScreen',{vehicleId:vehicle.id,vehicle});
  await press(tree,'Paint');await fillRequest(tree);await press(tree,'One approved shop');await press(tree,'Demo Customs · Pretoria');await press(tree,'Any approved shop');await press(tree,'Submit request');
  assert.equal(context.calls[0][1].visibility,'open');assert.equal(Object.hasOwn(context.calls[0][1],'shopId'),false);
  await unmount(tree);
});

test('owner detail scrolls private quotations and closes only through a confirmed action',async()=>{
  const quote={id:'quote-one',shopName:'Demo Customs',scope:'Paint both doors',items:[{description:'Labour and paint',amountCents:75000}],totalCents:75000,status:'submitted',completionDays:3,validUntil:Date.now()+10000};
  const context=setup({read:(op,input)=>({request,quotes:input.quotesCursor?[]:[quote],quotesCursor:input.quotesCursor?null:'quote-page-two'})});
  const tree=await mount(context,'OwnerRequestScreen',{id:request.id});
  assert.ok(says(tree,'Demo Customs'));assert.ok(says(tree,'R750.00'));
  assert.equal(button(tree,'Next'),undefined);await scrollToBottom(tree);assert.ok(context.reads.some(([op,input])=>op==='request'&&input.quotesCursor==='quote-page-two'));
  await press(tree,'Close request');await press(tree,'Cancel');assert.equal(context.calls.length,0);
  await press(tree,'Close request');await press(tree,'Confirm');assert.deepEqual(context.calls,[['requestClose',{id:'req-one'}]]);
  await unmount(tree);
});

test('owner requests scroll through the mine feed and disable opening or creating requests while offline',async()=>{
  const context=setup({read:(op,input)=>({items:[request],cursor:input.cursor?null:'request-page-two'})});
  const tree=await mount(context,'OwnerRequestsScreen');assert.equal(button(tree,'Next'),undefined);await scrollToBottom(tree);assert.ok(context.reads.some(([op,input])=>op==='requests'&&input.feed==='mine'&&input.cursor==='request-page-two'));
  await press(tree,'View Paint the doors');assert.deepEqual(context.moves,[['navigate','OwnerRequest',{id:'req-one'}]]);
  context.auth.offline=true;await act(async()=>tree.update(React.createElement(context.screens.OwnerRequestsScreen,{route:{params:{}},navigation:context.navigation})));
  await press(tree,'Create service request');await press(tree,'View Paint the doors');assert.equal(context.moves.length,1);await unmount(tree);
});

test('garage opens the correct vehicle photo library and blocks navigation offline',async()=>{
 const context=setup({read:()=>({items:[vehicle,secondVehicle],cursor:null})}),tree=await mount(context,'GarageScreen');
 await press(tree,'Photos for Ford Fiesta');assert.deepEqual(context.moves,[['navigate','VehiclePhotos',{id:secondVehicle.id}]]);
 context.auth.offline=true;await act(async()=>tree.update(React.createElement(context.screens.GarageScreen,{navigation:context.navigation})));
 assert.equal(button(tree,'Photos for Toyota Corolla').props.disabled,true);await press(tree,'Photos for Toyota Corolla');assert.equal(context.moves.length,1);await unmount(tree);
});

test('request photo selection follows the selected vehicle, resets when switching vehicles and submits only chosen IDs',async()=>{
 const context=setup({read:op=>({items:op==='vehicles'?[vehicle,secondVehicle]:op==='categories'?[category]:[shop]})});
 const tree=await mount(context,'RequestFormScreen'),gallery=()=>tree.root.findByType('PhotoGallery');assert.equal(tree.root.findAllByType('PhotoGallery').length,0);
 await press(tree,'Toyota Corolla (2020)');assert.equal(gallery().props.target,'vehicle');assert.equal(gallery().props.id,vehicle.id);assert.deepEqual(gallery().props.selectedIds,[]);assert.notEqual(gallery().props.editable,true);
 await act(async()=>gallery().props.onSelectionChange(['first-photo','second-photo']));assert.deepEqual(gallery().props.selectedIds,['first-photo','second-photo']);assert.ok(says(tree,'2 photos selected'));
 await press(tree,'Ford Fiesta (2020)');assert.equal(gallery().props.id,secondVehicle.id);assert.deepEqual(gallery().props.selectedIds,[]);
 await act(async()=>gallery().props.onSelectionChange(['ford-photo']));await press(tree,'Manage vehicle photos');assert.deepEqual(context.moves,[['navigate','VehiclePhotos',{id:secondVehicle.id}]]);
 await press(tree,'Paint');await fillRequest(tree);await press(tree,'Submit request');
 assert.equal(context.calls[0][0],'requestCreate');assert.equal(context.calls[0][1].vehicleId,secondVehicle.id);assert.deepEqual(context.calls[0][1].photoIds,['ford-photo']);assert.equal(Object.hasOwn(context.calls[0][1],'photos'),false);
 assert.deepEqual(context.moves.at(-1),['replace','OwnerRequest',{id:'saved'}]);await unmount(tree);
});

test('request photo selection is locked during submission, retained on failure and explicitly clearable',async()=>{
 let reject;const context=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]}),api:()=>new Promise((_,fail)=>{reject=fail;})});
 const tree=await mount(context,'RequestFormScreen',{vehicleId:vehicle.id,vehicle}),gallery=()=>tree.root.findByType('PhotoGallery');
 await act(async()=>gallery().props.onSelectionChange(['saved-photo']));await press(tree,'Paint');await fillRequest(tree);
 let pending;await act(async()=>{pending=button(tree,'Submit request').props.onPress();});assert.equal(gallery().props.disabled,true);assert.equal(button(tree,'Manage vehicle photos').props.disabled,true);
 await act(async()=>gallery().props.onSelectionChange(['wrong-photo']));assert.deepEqual(gallery().props.selectedIds,['saved-photo']);await press(tree,'Clear photo selection');assert.deepEqual(gallery().props.selectedIds,['saved-photo']);
 await act(async()=>{reject(Error('Request outcome unavailable'));await pending;});assert.ok(says(tree,'Request outcome unavailable'));assert.deepEqual(gallery().props.selectedIds,['saved-photo']);
 assert.deepEqual(context.calls[0][1].photoIds,['saved-photo']);await press(tree,'Clear photo selection');assert.deepEqual(gallery().props.selectedIds,[]);assert.equal(button(tree,'Clear photo selection'),undefined);await unmount(tree);
});

test('switching account clears request photo selections and offline callbacks cannot change them',async()=>{
 const context=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]})}),params={vehicleId:vehicle.id,vehicle};
 const tree=await mount(context,'RequestFormScreen',params),gallery=()=>tree.root.findByType('PhotoGallery');await act(async()=>gallery().props.onSelectionChange(['old-account-photo']));
 context.auth.offline=true;await act(async()=>tree.update(React.createElement(context.screens.RequestFormScreen,{route:{params},navigation:context.navigation})));
 assert.equal(gallery().props.disabled,true);await act(async()=>gallery().props.onSelectionChange(['offline-photo']));assert.deepEqual(gallery().props.selectedIds,['old-account-photo']);
 context.auth.user={uid:'other-owner'};context.auth.offline=false;await act(async()=>tree.update(React.createElement(context.screens.RequestFormScreen,{route:{params},navigation:context.navigation})));
 assert.deepEqual(gallery().props.selectedIds,[]);assert.equal(context.calls.length,0);await unmount(tree);
});

test('owner request details use a read-only request gallery only when attachments exist',async()=>{
 let current={...request,photoIds:['request-photo']};const context=setup({read:()=>({request:current,quotes:[]})}),params={id:request.id};
 const tree=await mount(context,'OwnerRequestScreen',params),gallery=tree.root.findByType('PhotoGallery');assert.equal(gallery.props.target,'request');assert.equal(gallery.props.id,request.id);assert.notEqual(gallery.props.editable,true);assert.equal(gallery.props.onSelectionChange,undefined);
 current={...request,photoIds:[]};await act(async()=>tree.update(React.createElement(context.screens.OwnerRequestScreen,{route:{params},navigation:context.navigation})));assert.equal(tree.root.findAllByType('PhotoGallery').length,0);await unmount(tree);
});

test('customer enters exact mandatory services and duplicate requirements block submission',async()=>{
 const context=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]})});
 const tree=await mount(context,'RequestFormScreen',{vehicleId:vehicle.id,vehicle});
 await press(tree,'Paint');await fillRequest(tree);
 await change(tree,'Mandatory services (optional, one per line)','Preparation\npaint\nPaint');
 assert.equal(button(tree,'Submit request').props.disabled,true);
 await press(tree,'Submit request');assert.equal(context.calls.length,0);
 await change(tree,'Mandatory services (optional, one per line)','Preparation\nPaint');
 await press(tree,'Submit request');assert.deepEqual(context.calls[0][1].mandatoryServices,['Preparation','Paint']);
 await unmount(tree);
});

test('customer confirms a service location in the existing request form and can clear it on edit',async()=>{
 const c=setup({read:op=>({items:op==='vehicles'?[vehicle]:op==='categories'?[category]:[shop]})});
 const existing={...request,vehicleId:vehicle.id,categoryId:'paint',version:3,termsVersion:2,serviceLocation:{latitude:-25.7,longitude:28.2}};
 const tree=await mount(c,'RequestFormScreen',{request:existing});
 await press(tree,'Choose service location');await change(tree,'Service location latitude','-26.2');await change(tree,'Service location longitude','28.04');
 await press(tree,'Preview coordinates');assert.equal(c.calls.length,0);await press(tree,'Confirm selected location');await press(tree,'Save request');
 assert.equal(c.calls[0][0],'requestUpdate');assert.deepEqual(c.calls[0][1].serviceLocation,{latitude:-26.2,longitude:28.04});assert.equal(c.calls[0][1].version,3);assert.equal(c.calls[0][1].city,'Pretoria');
 await press(tree,'Remove service location');await press(tree,'Save request');assert.equal(c.calls[1][1].serviceLocation,null);await unmount(tree);
});
