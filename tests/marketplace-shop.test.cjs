const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const act = Renderer.act;
const request = {id: 'request-1', version: 1, termsVersion: 1, title: 'Restore paint', description: 'Repaint the bonnet', categoryName: 'Paint', city: 'Pretoria', vehicle: {make: 'Ford', model: 'Fiesta', year: 2015, colour: 'Blue'}, status: 'open', visibility: 'open', budgetMinCents: 10000, budgetMaxCents: 50000};
const quote = {id: 'quote-1', serviceRequestId: request.id, requestVersion: 1, termsVersion: 1, requestTitle: request.title, shopName: 'Test shop', scope: 'Prepare and repaint', items: [{description: 'Labour', amountCents: 10000}], totalCents: 10000, completionDays: 7, validUntil: Date.now() + 86400000, status: 'submitted'};
function setup(overrides = {}) {
  const state = {auth: {user: {uid: 'shop-1'}, profile: {role: 'shop'}, offline: false}, data: {request, quotes: []}, posts: [], busy: false, error: '', calls: [], photoCalls: [], reads: [], navigations: [], api: async () => ({id: 'quote-1'}), refresh: async () => ({}), ...overrides};
  const PrimaryButton = loadUI('src/shared/components/PrimaryButton.js').default;
  const landing = {LandingText: 'Text', LandingShell: ({children, onScroll, onLayout, onContentSizeChange}) => React.createElement('View', {onScroll, onLayout, onContentSizeChange}, children), LandingButton: PrimaryButton, ownerTabs: [], shopTabs: [], ui: {}, useLandingFeedback: () => ({showFeature() {}})};
  const marketplace = loadUI('src/features/marketplace/components/MarketplaceUI.js', {
    '../../../shared/components/landing/LandingUI': landing,
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
  });
  const screens = loadUI('src/features/marketplace/screens/ShopMarketplaceScreens.js', {
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
    '../components/PhotoGallery': props => React.createElement('PhotoGallery', props),
    '../services/photoApi': {viewPhoto: async (...args) => {state.photoCalls.push(args);return {url:`https://private.example.invalid/${args[2]}`,expiresAt:Date.now()+60000};}},
    '../components/PostCard': {PostCard: props => React.createElement('PostCard', props, React.createElement('Text', null, props.post.title))},
    '../hooks/usePostsFeed': {usePostsFeed: () => ({items: state.posts, busy: false, error: '', refresh: async () => {}, loadNext() {}})},
    '../components/MarketplaceUI': marketplace,
    '../../../shared/components/landing/LandingUI': landing,
    '../../../shared/components/landing/FeedControls': {
      FeedSearchInput: props => React.createElement('TextInput', props),
      FeedSourceSelector: props => React.createElement('FeedSourceSelector', props),
      FeedServicePill: ({title, selected, onPress, disabled}) => React.createElement('Pressable', {accessibilityLabel: title, accessibilityState: {selected}, onPress, disabled}, React.createElement('Text', null, title)),
    },
    '../hooks/useMarketData': {useMarketData: (op, input) => { state.reads.push({op, input}); const data = op === 'requests' && state.readRequests ? state.readRequests(input) : state.data; return {data, busy: state.busy, error: state.error, refresh: (...args) => state.refresh(...args)}; }},
    '../services/marketApi': {marketApi: async (op, input) => { state.calls.push({op, input}); return state.api(op, input); }},
  });
  const navigation = {navigate: (...args) => state.navigations.push(args)};
  return {state, screens, navigation};
}
const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.findAllByType('Text').some(text => text.props.children === title));
const action = (tree, prefix) => tree.root.findAllByType('Pressable').find(node => String(node.props.accessibilityLabel || '').startsWith(prefix));
const input = (tree, label) => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label);
const text = tree => tree.root.findAllByType('Text').map(node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children).join('\n');
async function change(tree, label, value) { await act(async () => input(tree, label).props.onChangeText(value)); }
async function mount(Screen, props) { let tree; await act(async () => { tree = Renderer.create(React.createElement(Screen, props)); }); return tree; }
async function validQuote(tree) {
  await change(tree, 'Work included', 'Prepare and repaint bonnet');
  await change(tree, 'Item 1 description', 'Materials and labour');
  await change(tree, 'Item 1 amount (R)', '123.45');
}

test('Find Jobs renders both attached request photos in saved order and opens a private preview',async()=>{
 const job={...request,photoIds:['second','first'],photos:[{id:'first',name:'First.jpg'},{id:'second',name:'Second.jpg'}]};
 const {state,screens,navigation}=setup({data:{items:[job],cursor:null}}),tree=await mount(screens.ShopJobsScreen,{navigation});
 try{
  assert.deepEqual(tree.root.findAllByType('Image').map(image=>image.props.source.uri),['https://private.example.invalid/second','https://private.example.invalid/first']);
  assert.deepEqual(state.photoCalls,[['request',request.id,'second','shop-1'],['request',request.id,'first','shop-1']]);
  await act(async()=>action(tree,'Preview attached photo 1').props.onPress());assert.equal(tree.root.findAllByType('Modal').length,1);
  await act(async()=>button(tree,'Close photo').props.onPress());assert.equal(tree.root.findAllByType('Modal').length,0);
  state.data={items:[{...job,photos:job.photos.map(photo=>({...photo}))}],cursor:null};
  await act(async()=>tree.update(React.createElement(screens.ShopJobsScreen,{navigation})));
  assert.equal(tree.root.findAllByType('Image').length,2);assert.equal(state.photoCalls.length,2);
 }finally{await act(async()=>tree.unmount());}
});

test('Find Jobs without attachments renders normally without private-media requests',async()=>{
 const {state,screens,navigation}=setup({data:{items:[{...request,photoIds:[]}],cursor:null}}),tree=await mount(screens.ShopJobsScreen,{navigation});
 try{assert.match(text(tree),/Restore paint/);assert.equal(tree.root.findAllByType('Image').length,0);assert.equal(state.photoCalls.length,0);}
 finally{await act(async()=>tree.unmount());}
});

test('Find Jobs pagination and a fresh mount retain attachment IDs without refetching existing page images',async()=>{
 const first={items:[{...request,photoIds:['attached-a','attached-b']}],cursor:'next'},second={items:[{...request,id:'next-job',photoIds:['attached-c']}],cursor:null};
 const {state,screens,navigation}=setup({readRequests:input=>input.cursor?second:first});let tree=await mount(screens.ShopJobsScreen,{navigation});
 try{
  const scroller=tree.root.findAllByType('View').find(node=>node.props.onScroll);
  await act(async()=>scroller.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:500}}}));
  assert.equal(tree.root.findAllByType('Image').length,3);assert.equal(state.photoCalls.length,3);
  await act(async()=>tree.unmount());tree=await mount(screens.ShopJobsScreen,{navigation});
  assert.equal(tree.root.findAllByType('Image').length,2);assert.deepEqual(state.photoCalls.slice(-2).map(call=>call[2]),first.items[0].photoIds);
 }finally{await act(async()=>tree.unmount());}
});

test('merged shop feed sorts requests and showcases newest first and preserves navigation', async () => {
  const older = {...request, id:'older', title:'Older request', createdAt:1700000000000};
  const newer = {...request, id:'newer', title:'Newer request', createdAt:'2023-11-16T02:00:00.000Z'};
  const post = {id:'showcase', authorId:'other-shop', title:'Middle showcase', createdAt:{toMillis:()=>1700050000000}};
  const {state, screens, navigation} = setup({data:{items:[older,newer],cursor:null},posts:[post]});
  const tree = await mount(screens.ShopJobsScreen,{navigation});
  const titles = tree.root.findAllByType('Text').map(node=>node.props.children).filter(value=>[older.title,newer.title,post.title].includes(value));
  assert.deepEqual(titles,[newer.title,post.title,older.title]);
  await act(async()=>action(tree,'View request: Newer request').props.onPress());
  await act(async()=>tree.root.findByType('PostCard').props.onOpen());
  assert.deepEqual(state.navigations,[['ShopRequest',{id:newer.id}],['PostDetail',{id:post.id}]]);
  await act(async()=>tree.unmount());
});

test('merged shop feed keeps missing and invalid dates behind dated items without crashing', async () => {
  const undated = {...request,id:'undated',title:'Undated request'};
  const invalid = {...request,id:'invalid',title:'Invalid date request',createdAt:'not-a-date'};
  const post = {id:'showcase',authorId:'other-shop',title:'Dated showcase',createdAt:1700050000000};
  const {screens,navigation} = setup({data:{items:[undated,invalid],cursor:null},posts:[post]});
  const tree = await mount(screens.ShopJobsScreen,{navigation});
  const titles = tree.root.findAllByType('Text').map(node=>node.props.children).filter(value=>[undated.title,invalid.title,post.title].includes(value));
  assert.deepEqual(titles,[post.title,undated.title,invalid.title]);
  await act(async()=>tree.unmount());
});

test('shop feeds send the correct audience and navigate with a request identifier', async () => {
  for (const [screen, feed] of [['ShopJobsScreen', 'open'], ['ShopRequestsScreen', 'direct']]) {
    const {state, screens, navigation} = setup({data: {items: [request], cursor: 'next-page'}});
    const tree = await mount(screens[screen], {navigation});
    assert.deepEqual(state.reads.at(-1), {op: 'requests', input: {feed, cursor: null}});
    await act(async () => (feed === 'open' ? action(tree, 'View request:') : button(tree, 'View request')).props.onPress());
    assert.deepEqual(state.navigations, [['ShopRequest', {id: request.id}]]);
    assert.equal(button(tree, 'Next'), undefined);
    const scroller = tree.root.findAllByType('View').find(node => node.props.onScroll);
    await act(async () => scroller.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:500}}}));
    assert.ok(state.reads.some(read => read.op === 'requests' && read.input.cursor === 'next-page'));
    await act(async () => tree.unmount());
  }
});

test('Find Jobs uses one request-card feed and loads the next cursor on scroll', async () => {
  const nextRequest = {...request, id: 'request-2', title: 'Upgrade suspension', categoryName: 'Suspension', createdAt: new Date(Date.now() - 7200000).toISOString()};
  const firstPage = {items: [request], cursor: 'next-page'}, secondPage = {items: [nextRequest], cursor: null};
  const {state, screens, navigation} = setup({
    data: firstPage,
    readRequests: input => input.cursor ? secondPage : firstPage,
  });
  const tree = await mount(screens.ShopJobsScreen, {navigation});
  assert.match(text(tree), /Restore paint/);
  assert.match(text(tree), /Paint/);
  assert.match(text(tree), /Ford Fiesta/);
  assert.match(text(tree), /R100\.00/);
  assert.doesNotMatch(text(tree), /Page \d|Previous|Next|Refresh requests/);
  const scroller = tree.root.findAllByType('View').find(node => node.props.onScroll);
  await act(async () => scroller.props.onScroll({nativeEvent: {
    contentOffset: {y: 900},
    contentSize: {height: 1200},
    layoutMeasurement: {height: 500},
  }}));
  assert.match(text(tree), /Upgrade suspension/);
  assert.ok(state.reads.some(read => read.op === 'requests' && read.input.cursor === 'next-page'));
  await act(async () => tree.unmount());
});

test('Find Jobs View request action opens the matching request detail', async () => {
  const {state, screens, navigation} = setup({data: {items: [request], cursor: null}});
  const tree = await mount(screens.ShopJobsScreen, {navigation});
  await act(async () => action(tree, 'View request:').props.onPress());
  assert.deepEqual(state.navigations, [['ShopRequest', {id: request.id}]]);
  await act(async () => tree.unmount());
});

test('Find Jobs provides customer-style search, one selected category, More filters, and searchable request cards', async () => {
  const first = {...request, id: 'one', customerName: 'Lesley Lebelo.', quotationCount: 3, quotedByMe: true};
  const second = {...request, id: 'two', title: 'Install lights', categoryName: 'Lighting', city: 'Mbombela', customerName: 'Customer', quotationCount: 0, quotedByMe: false};
  const {screens, navigation} = setup({data: {items: [first, second], cursor: null}});
  const tree = await mount(screens.ShopJobsScreen, {navigation});
  assert.equal(input(tree, 'Search requests, vehicles or services').props.placeholder, 'Search requests, vehicles or services');
  assert.match(text(tree), /Browse open customer requests for work your shop can complete\./);
  assert.match(text(tree), /Browse by service/);
  assert.equal(button(tree, 'All').props.accessibilityState.selected, true);
  assert.equal(button(tree, 'Tuning').props.accessibilityState.selected, false);
  assert.match(text(tree), /Lesley Lebelo\./);
  assert.match(text(tree), /LL/);
  assert.match(text(tree), /3 quotes/);
  assert.match(text(tree), /No quotes yet/);
  assert.match(text(tree), /View your quote/);
  assert.match(text(tree), /Quoted/);
  assert.doesNotMatch(text(tree), /0821234567|lesley@example/);
  assert.deepEqual(screens.filterJobRequests([first, second], {category: 'Lighting'}).map(item => item.id), ['two']);
  assert.deepEqual(screens.filterJobRequests([first, second], {query: 'mbombela'}).map(item => item.id), ['two']);
  assert.deepEqual(screens.filterJobRequests([first, second], {category: 'Lighting', query: 'lesley'}), []);
  assert.deepEqual(screens.filterJobRequests([first, second], {notQuoted: true}).map(item => item.id), ['two']);
  await act(async () => button(tree, 'Lighting').props.onPress());
  assert.equal(button(tree, 'Lighting').props.accessibilityState.selected, true);
  assert.match(text(tree), /Install lights/);
  await act(async () => button(tree, 'All').props.onPress());
  await act(async () => { input(tree, 'Search requests, vehicles or services').props.onChangeText('mbombela'); await new Promise(resolve => setTimeout(resolve, 220)); });
  assert.equal(input(tree, 'Search requests, vehicles or services').props.value, 'mbombela');
  await act(async () => button(tree, 'More filters').props.onPress());
  assert.match(text(tree), /Not yet quoted by me/);
  assert.match(text(tree), /Minimum budget \(R\)/);
  await act(async () => tree.unmount());
});

test('Find Jobs combines search and service filters against request data', async () => {
  const first = {...request, id: 'one', customerName: 'Lesley Lebelo.', quotedByMe: false};
  const second = {...request, id: 'two', title: 'Fit exhaust', categoryName: 'Exhaust', customerName: 'Customer', quotedByMe: true};
  const {screens, navigation} = setup({data: {items: [first, second], cursor: null}});
  const tree = await mount(screens.ShopJobsScreen, {navigation});
  await act(async () => button(tree, 'Exhaust').props.onPress());
  assert.equal(button(tree, 'Exhaust').props.accessibilityState.selected, true);
  await act(async () => { input(tree, 'Search requests, vehicles or services').props.onChangeText('Lesley'); await new Promise(resolve => setTimeout(resolve, 220)); });
  assert.deepEqual(screens.filterJobRequests([first, second], {category: 'Exhaust', query: 'lesley'}), []);
  assert.match(text(tree), /Browse by service/);
  await act(async () => tree.unmount());
});

test('Find Jobs shows an empty state when no open requests are available', async () => {
  const {screens, navigation} = setup({data: {items: [], cursor: null}});
  const tree = await mount(screens.ShopJobsScreen, {navigation});
  assert.match(text(tree), /No open requests are available/);
  await act(async () => tree.unmount());
});

test('accepted quotations open their booking and cannot be withdrawn', async () => {
  const {state,screens,navigation}=setup({data:{items:[{...quote,status:'accepted',bookingId:'booking-1'}],cursor:null}});
  const tree=await mount(screens.ShopQuotesScreen,{navigation});
  assert.equal(button(tree,'Withdraw quotation'),undefined);
  await act(async()=>button(tree,'View booking').props.onPress());
  assert.deepEqual(state.navigations,[['BookingDetail',{id:'booking-1'}]]);
  assert.equal(state.calls.length,0);
  await act(async()=>tree.unmount());
});

test('fresh closed requests and existing quotations block submission despite open navigation data', async () => {
  const {state, screens, navigation} = setup({data: {request: {...request, status: 'closed'}, quotes: []}});
  const props = {navigation, route: {params: {request}}};
  const tree = await mount(screens.QuoteFormScreen, props);
  assert.deepEqual(state.reads.at(-1), {op: 'request', input: {id: request.id}});
  assert.equal(button(tree, 'Send quotation').props.disabled, true);
  await act(async () => button(tree, 'Send quotation').props.onPress());
  assert.equal(state.calls.length, 0);
  state.data = {request, quotes: [{...quote, status: 'withdrawn'}]};
  await act(async () => tree.update(React.createElement(screens.QuoteFormScreen, props)));
  assert.equal(button(tree, 'Send quotation').props.disabled, true);
  assert.match(text(tree), /cannot be resubmitted or replaced/);
  await act(async () => tree.unmount());
  const detail = await mount(screens.ShopRequestScreen, {navigation, route: {params: {id: request.id}}});
  assert.equal(button(detail, 'Prepare quotation'), undefined);
  assert.match(text(detail), /cannot be resubmitted or replaced/);
  assert.ok(button(detail, 'My quotations'));
  await act(async () => detail.unmount());
});

test('shop can start a clearly labelled replacement only when its prior quotation is outdated', async () => {
  const currentRequest = {...request, version: 2, termsVersion: 2};
  const outdated = {...quote, requestVersion: 1, termsVersion: 1};
  const {state, screens, navigation} = setup({data: {request: currentRequest, quotes: [outdated]}});
  const props = {navigation, route: {params: {id: request.id}}};
  const detail = await mount(screens.ShopRequestScreen, props);
  assert.match(text(detail), /outdated or has no revision record/);
  await act(async () => button(detail, 'Update outdated quotation').props.onPress());
  assert.deepEqual(state.navigations, [['QuoteForm', {request: currentRequest}]]);
  await act(async () => detail.unmount());

  const draft = await mount(screens.QuoteFormScreen, props);
  assert.match(text(draft), /previous quotation is outdated/);
  assert.notEqual(button(draft, 'Submit replacement quotation').props.disabled, true);
  await validQuote(draft);
  await act(async () => button(draft, 'Submit replacement quotation').props.onPress());
  assert.equal(state.calls.at(-1).input.termsVersion, 2);
  assert.equal(state.calls.at(-1).op, 'quoteSubmit');
  await act(async () => draft.unmount());
});

test('quote submission validates actual fields, computes cents, prevents duplicate taps and preserves a failed draft', async () => {
  let reject;
  const {state, screens, navigation} = setup({api: () => new Promise((_, fail) => { reject = fail; })});
  const tree = await mount(screens.QuoteFormScreen, {navigation, route: {params: {request}}});
  await act(async () => button(tree, 'Send quotation').props.onPress());
  assert.equal(state.calls.length, 0);
  assert.match(text(tree), /Scope of work is required/);
  await validQuote(tree);
  await change(tree, 'Item 1 amount (R)', '12.345');
  assert.match(text(tree), /positive amount with at most two decimal places/);
  await act(async () => button(tree, 'Send quotation').props.onPress());
  assert.equal(state.calls.length, 0);
  await change(tree, 'Item 1 amount (R)', '123.45');
  await act(async () => button(tree, 'Add line item').props.onPress());
  await change(tree, 'Item 2 description', 'Finishing');
  await change(tree, 'Item 2 amount (R)', '0.55');
  assert.match(text(tree), /Total: R124.00/);
  await act(async () => button(tree, 'Percentage deposit').props.onPress());
  await change(tree, 'Deposit percentage (whole %, 1–99)', '33');
  assert.match(text(tree), /Required deposit: R40.92/);
  let pending;
  await act(async () => { const send = button(tree, 'Send quotation').props.onPress; pending = send(); void send(); });
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0], {op: 'quoteSubmit', input: {serviceRequestId: request.id, termsVersion: 1, scope: 'Prepare and repaint bonnet', items: [{description: 'Materials and labour', amountCents: 12345}, {description: 'Finishing', amountCents: 55}], completionDays: 7, warranty: '', validForDays: 14,depositType:'percentage',depositValue:33,scopeConfirmed:false,allChargesIncluded:false,coveredServices:[]}});
  await act(async () => { reject(new Error('Connection lost. Please retry.')); await pending; });
  assert.match(text(tree), /Connection lost/);
  assert.equal(input(tree, 'Work included').props.value, 'Prepare and repaint bonnet');
  assert.equal(input(tree, 'Item 2 amount (R)').props.value, '0.55');
  state.api = async () => ({id: 'quote-1'});
  await act(async () => button(tree, 'Send quotation').props.onPress());
  assert.equal(state.calls.length, 2);
  assert.match(text(tree), /Quotation submitted/);
  assert.equal(input(tree, 'Work included'), undefined);
  assert.equal(button(tree, 'Send quotation'), undefined);
  await act(async () => button(tree, 'My quotations').props.onPress());
  assert.deepEqual(state.navigations, [['ShopQuotes']]);
  await act(async () => tree.unmount());
});

test('offline quote draft cannot submit and account switching clears draft values', async () => {
  const {state, screens, navigation} = setup();
  const props = {navigation, route: {params: {request}}};
  const tree = await mount(screens.QuoteFormScreen, props);
  await validQuote(tree);
  state.auth = {...state.auth, offline: true};
  await act(async () => tree.update(React.createElement(screens.QuoteFormScreen, props)));
  await act(async () => button(tree, 'Send quotation').props.onPress());
  assert.equal(state.calls.length, 0);
  assert.equal(button(tree, 'Send quotation').props.disabled, true);
  assert.equal(input(tree, 'Work included').props.value, 'Prepare and repaint bonnet');
  state.auth = {...state.auth, offline: false, user: {uid: 'shop-2'}};
  await act(async () => tree.update(React.createElement(screens.QuoteFormScreen, props)));
  assert.equal(input(tree, 'Work included').props.value, '');
  assert.equal(input(tree, 'Item 1 amount (R)').props.value, '');
  await act(async () => tree.unmount());
});

test('withdrawal confirms once, exposes failures and retains confirmed success when refresh fails', async () => {
  let resolve, reject;
  const {state, screens, navigation} = setup({data: {items: [quote], cursor: null}, api: () => new Promise((success, fail) => {resolve = success; reject = fail;}), refresh: async () => {throw Error('Reload unavailable');}});
  const tree = await mount(screens.ShopQuotesScreen, {navigation});
  await act(async () => button(tree, 'Withdraw quotation').props.onPress());
  await act(async () => button(tree, 'Cancel').props.onPress());
  assert.equal(state.calls.length, 0);
  await act(async () => button(tree, 'Withdraw quotation').props.onPress());
  let pending;
  await act(async () => {const confirm = button(tree, 'Confirm').props.onPress; pending = confirm(); void confirm();});
  assert.equal(state.calls.length, 1);
  await act(async () => {reject(Error('Server unavailable')); await pending;});
  assert.match(text(tree), /Server unavailable/);
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  await act(async () => {pending = button(tree, 'Confirm').props.onPress();});
  await act(async () => {resolve({ok: true}); await pending;});
  assert.equal(state.calls.length, 2);
  assert.deepEqual(state.calls[0], {op: 'quoteWithdraw', input: {id: quote.id}});
  assert.match(text(tree), /Quotation withdrawn. Refresh to load the latest list/);
  assert.equal(button(tree, 'Withdraw quotation'), undefined);
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  await act(async () => tree.unmount());
});

test('a delayed quotation response cannot mark another account draft as submitted', async () => {
  let release;
  const {state, screens, navigation} = setup({api: () => new Promise(resolve => {release = resolve;})});
  const props = {navigation, route: {params: {request}}};
  const tree = await mount(screens.QuoteFormScreen, props);
  await validQuote(tree);
  let pending;
  await act(async () => {pending = button(tree, 'Send quotation').props.onPress();});
  state.auth = {...state.auth, user: {uid: 'another-shop'}};
  await act(async () => tree.update(React.createElement(screens.QuoteFormScreen, props)));
  await act(async () => {release({id: 'old-account-quote'}); await pending;});
  assert.equal(input(tree, 'Work included').props.value, '');
  assert.ok(button(tree, 'Send quotation'));
  assert.doesNotMatch(text(tree), /Quotation submitted/);
  assert.deepEqual(state.navigations, []);
  await act(async () => tree.unmount());
});

test('shop request photos use a read-only request target and closed requests require an accepted quotation',async()=>{
 const withPhotos={...request,photoIds:['attached-photo']};const {state,screens,navigation}=setup({data:{request:withPhotos,quotes:[]}});
 const props={navigation,route:{params:{id:request.id}}},tree=await mount(screens.ShopRequestScreen,props);
 let gallery=tree.root.findByType('PhotoGallery');assert.equal(gallery.props.target,'request');assert.equal(gallery.props.id,request.id);assert.notEqual(gallery.props.editable,true);assert.equal(gallery.props.onSelectionChange,undefined);
 state.data={request:{...withPhotos,status:'booked'},quotes:[quote]};await act(async()=>tree.update(React.createElement(screens.ShopRequestScreen,props)));assert.equal(tree.root.findAllByType('PhotoGallery').length,0);
 state.data={request:{...withPhotos,status:'booked'},quotes:[{...quote,status:'accepted'}]};await act(async()=>tree.update(React.createElement(screens.ShopRequestScreen,props)));gallery=tree.root.findByType('PhotoGallery');assert.equal(gallery.props.id,request.id);
 state.data={request:{...request,photoIds:[]},quotes:[]};await act(async()=>tree.update(React.createElement(screens.ShopRequestScreen,props)));assert.equal(tree.root.findAllByType('PhotoGallery').length,0);
 assert.equal(state.calls.length,0);await act(async()=>tree.unmount());
});


test('expired current offer exposes renewal and submits a separate freshly validated quotation',async()=>{
 const expired={...quote,validUntil:Date.now()-1,depositType:'fixed',depositValue:1000,depositAmountCents:1000};
 const {state,screens,navigation}=setup({data:{request,quotes:[expired]}}),props={navigation,route:{params:{request,id:request.id}}};
 let tree=await mount(screens.ShopRequestScreen,props);assert.ok(button(tree,'Renew expired quotation'));assert.equal(!!button(tree,'Renew expired quotation').props.disabled,false);assert.match(text(tree),/Renew it with current pricing/);
 await act(async()=>button(tree,'Renew expired quotation').props.onPress());assert.equal(state.navigations[0][0],'QuoteForm');await act(async()=>tree.unmount());
 tree=await mount(screens.QuoteFormScreen,props);await validQuote(tree);await act(async()=>button(tree,'Submit renewal quotation').props.onPress());
 assert.equal(state.calls[0].op,'quoteSubmit');assert.equal(state.calls[0].input.termsVersion,1);assert.equal(state.calls[0].input.items[0].amountCents,12345);assert.equal(state.calls[0].input.depositType,'none');assert.match(text(tree),/Quotation submitted/);await act(async()=>tree.unmount());
 const zero=setup({data:{request,quotes:[{...quote,validUntil:0}]}}),zeroTree=await mount(zero.screens.ShopRequestScreen,{navigation:zero.navigation,route:{params:{id:request.id}}});assert.ok(button(zeroTree,'Renew expired quotation'));await act(async()=>zeroTree.unmount());
});

test('withdrawn and accepted offers never expose renewal even when their expiry has passed',async()=>{
 for(const status of ['withdrawn','accepted']){
  const {screens,navigation}=setup({data:{request,quotes:[{...quote,status,validUntil:Date.now()-1}]}}),tree=await mount(screens.ShopRequestScreen,{navigation,route:{params:{id:request.id}}});
  assert.equal(button(tree,'Renew expired quotation'),undefined);assert.equal(button(tree,'Prepare another quotation'),undefined);await act(async()=>tree.unmount());
 }
});

test('shop explicitly declares full scope, mandatory services and complete charges', async () => {
  const {state,screens,navigation}=setup({data:{request:{...request,mandatoryServices:['Preparation','Paint']},quotes:[]}});
  const tree=await mount(screens.QuoteFormScreen,{navigation,route:{params:{request}}});
  await validQuote(tree);
  await act(async()=>button(tree,'Confirm: full requested scope included').props.onPress());
  await act(async()=>button(tree,'Include: Preparation').props.onPress());
  await act(async()=>button(tree,'Confirm: total includes all required fees and taxes').props.onPress());
  await act(async()=>button(tree,'Send quotation').props.onPress());
  assert.equal(state.calls[0].input.scopeConfirmed,true);
  assert.equal(state.calls[0].input.allChargesIncluded,true);
  assert.deepEqual(state.calls[0].input.coveredServices,['Preparation']);
  await act(async()=>tree.unmount());
});

test('a material request refresh clears prior scope and fee confirmations before a shop submits',async()=>{
 const {state,screens,navigation}=setup({data:{request:{...request,mandatoryServices:['Paint']},quotes:[]}});
 const props={navigation,route:{params:{request}}};
 const tree=await mount(screens.QuoteFormScreen,props);await validQuote(tree);
 await act(async()=>button(tree,'Confirm: full requested scope included').props.onPress());
 await act(async()=>button(tree,'Include: Paint').props.onPress());
 await act(async()=>button(tree,'Confirm: total includes all required fees and taxes').props.onPress());
 state.data={request:{...request,version:2,termsVersion:2,mandatoryServices:['Paint','Preparation']},quotes:[]};
 await act(async()=>tree.update(React.createElement(screens.QuoteFormScreen,props)));
 assert.ok(button(tree,'Confirm: full requested scope included'));assert.ok(button(tree,'Include: Paint'));
 await act(async()=>button(tree,'Send quotation').props.onPress());
 assert.equal(state.calls[0].input.termsVersion,2);assert.equal(state.calls[0].input.scopeConfirmed,false);assert.equal(state.calls[0].input.allChargesIncluded,false);assert.deepEqual(state.calls[0].input.coveredServices,[]);
 await act(async()=>tree.unmount());
});
