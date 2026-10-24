const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act} = Renderer;
const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === title);
const says = (tree, text) => tree.root.findAllByType('Text').some(node => String([node.props.children].flat().join('')).includes(text));
const press = (tree, title) => act(async () => button(tree, title).props.onPress());
const unmount = tree => act(async () => tree.unmount());
const scrollToBottom=tree=>act(async()=>{const view=tree.root.findAllByType('ScrollView').find(node=>node.props.onScroll);view.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1400},layoutMeasurement:{height:500}}});});
function setup({api = async () => ({id: 'booking-one'}),platform='ios',width=390} = {}) {
  const calls = [], reads = [], moves = [];
  const request = {id: 'request-one', version: 1, termsVersion: 1, title: 'Paint the doors', status: 'open', budgetMinCents: 50000, budgetMaxCents: 100000};
  const quote = {id: 'quote-one', serviceRequestId:'request-one', requestVersion: 1, termsVersion: 1, shopName: 'First Customs', status: 'submitted', scope: 'Prepare and paint both front doors', items: [{description: 'Paint and labour', amountCents: 75000}], totalCents: 75000, completionDays: 3, warranty: 'Six months', validUntil: Date.now() + 600000};
  const second = {...quote, id: 'quote-two', shopName: 'Second Customs', totalCents: 80000, warranty: ''};
  const state = {auth: {user: {uid: 'owner'}, profile: {role: 'owner'}, offline: false}, busy: false, error: '', refreshes: 0,
    first: {request, quotes: [quote, second], quotesCursor: 'page-two'}, second: {request, quotes: [{...quote, id: 'quote-three', shopName: 'Third Customs'}], quotesCursor: null}};
  const navigation = {navigate: (...args) => moves.push(['navigate', ...args]), replace: (...args) => moves.push(['replace', ...args])};
  const Primary = loadUI('src/shared/components/PrimaryButton.js').default;
  const {QuoteComparisonScreen} = loadUI('src/features/marketplace/screens/QuoteComparisonScreen.js', {
    'react-native':{Platform:{OS:platform},useWindowDimensions:()=>({width,height:844,fontScale:1.5,scale:1})},
    '../../../shared/components/landing/LandingUI': {LandingText: props => React.createElement('Text', props), LandingShell: ({children,onScroll,onLayout,onContentSizeChange}) => React.createElement('View', {onScroll,onLayout,onContentSizeChange}, children), LandingButton: Primary, ui: {}, ownerTabs: [], shopTabs: [], useLandingFeedback: () => ({})},
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
    '../services/marketApi': {marketApi: async (...args) => {calls.push(args); return api(...args);}},
    '../hooks/useMarketData': {useMarketData: (op, input) => {reads.push([op, input]); return {data: input.quotesCursor ? state.second : state.first, busy: state.busy, error: state.error, refresh: async () => {state.refreshes += 1;}};}},
  });
  return {state, calls, reads, moves, navigation, Screen: QuoteComparisonScreen};
}
async function mount(context, id = 'request-one') {
  let tree;
  await act(async () => {tree = Renderer.create(React.createElement(context.Screen, {route: {params: {id}}, navigation: context.navigation}));});
  return tree;
}
const rerender = (context, tree, id = 'request-one') => act(async () => tree.update(React.createElement(context.Screen, {route: {params: {id}}, navigation: context.navigation})));

test('owner compares quotation details and continues to the payment choice for the selected quote', async t => {
  const context = setup();context.state.first.quotes[0]={...context.state.first.quotes[0],depositType:'percentage',depositValue:20,depositAmountCents:15000};
  const tree = await mount(context);
  t.after(() => unmount(tree));
  assert.ok(says(tree, 'First Customs')); assert.ok(says(tree, 'Paint and labour')); assert.ok(says(tree, 'R750.00'));
  assert.ok(says(tree,'Required deposit'));assert.ok(says(tree,'20%'));assert.ok(says(tree,'R150.00'));
  assert.ok(says(tree, '3 working days'));
  const firstQuote=tree.root.find(node=>node.props.quote?.id==='quote-one');
  assert.ok(firstQuote.findAllByType('Text').some(node=>node.props.children==='Warranty'));
  assert.ok(firstQuote.findAllByType('Text').some(node=>node.props.children==='Six months'));
  assert.ok(says(tree, 'Warranty: not specified'));
  assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);
  await press(tree, 'Select: First Customs'); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, false);
  await press(tree, 'Continue to payment choice'); assert.deepEqual(context.moves, [['navigate','PaymentChoice',{quote:context.state.first.quotes[0]}]]); assert.equal(context.calls.length, 0);
  await press(tree, 'Select: Second Customs'); assert.equal(button(tree, 'Selected: First Customs'), undefined);
  await press(tree, 'Continue to payment choice');
  assert.deepEqual(context.moves[1], ['navigate','PaymentChoice',{quote:context.state.first.quotes[1]}]);
  assert.equal(context.calls.length,0);
  assert.equal(context.state.refreshes, 0); await unmount(tree);
});

test('continuing does not accept or book the quotation before payment method confirmation', async t => {
  const context = setup(),tree=await mount(context);
  t.after(()=>unmount(tree));
  await press(tree,'Select: First Customs');await press(tree,'Continue to payment choice');
  assert.equal(context.calls.length,0);
  assert.deepEqual(context.moves,[['navigate','PaymentChoice',{quote:context.state.first.quotes[0]}]]);
});

test('expired, withdrawn and closed offers cannot be selected or continued to payment', async t => {
  const clock = Date.now(); let current = clock;
  t.mock.method(Date, 'now', () => current);
  const context = setup();
  context.state.first.quotes[0].validUntil = clock - 1;
  context.state.first.quotes[1].status = 'withdrawn';
  let tree = await mount(context);
  for (const title of ['Select: First Customs', 'Select: Second Customs']) {assert.equal(button(tree, title).props.disabled, true); await press(tree, title);}
  assert.equal(button(tree, 'Continue to payment choice').props.disabled, true); assert.equal(context.calls.length, 0);
  context.state.first = {...context.state.first, quotes: [{...context.state.first.quotes[0], validUntil: clock + 100000}]};
  await rerender(context, tree); await press(tree, 'Select: First Customs'); await press(tree, 'Continue to payment choice');
  assert.equal(context.moves.length,1);
  current = clock + 100001; await rerender(context,tree);assert.equal(button(tree,'Continue to payment choice').props.disabled,true);assert.equal(context.calls.length,0);
  context.state.first = {...context.state.first, request: {...context.state.first.request, status: 'closed'}};
  await rerender(context, tree); assert.ok(says(tree, 'This request is closed.')); assert.equal(button(tree, 'Continue to payment choice'), undefined); await unmount(tree);
});

test('outdated and revisionless legacy quotations are visible but cannot be selected', async t => {
  const context = setup();
  context.state.first = {
    request: {...context.state.first.request, version: 2, termsVersion: 2},
    quotes: [
      {...context.state.first.quotes[0], requestVersion: 1, termsVersion: 1},
      {...context.state.first.quotes[1], requestVersion: undefined, termsVersion: undefined},
    ],
    quotesCursor: null,
  };
  const tree = await mount(context);
  t.after(() => unmount(tree));
  assert.ok(says(tree, 'has no verifiable revision for the current request terms'));
  for (const title of ['Select: First Customs', 'Select: Second Customs']) {
    assert.equal(button(tree, title).props.disabled, true);
    await press(tree, title);
  }
  assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);
  assert.equal(context.moves.length, 0);
});

test('selection remains available while scrolling more quotations and clears on refresh, offline or a new request', async t => {
  const context = setup(), tree = await mount(context);
  t.after(()=>unmount(tree));
  assert.equal(button(tree, 'Next'),undefined);
  await press(tree, 'Select: First Customs'); await scrollToBottom(tree);
  assert.ok(says(tree, 'Third Customs')); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, false); assert.equal(button(tree, 'Next'),undefined);
  assert.ok(context.reads.some(([op, input]) => op === 'request' && input.quotesCursor === 'page-two'));
  await press(tree, 'Select: Third Customs'); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, false);
  await press(tree, 'Select: First Customs'); await press(tree, 'Refresh quotations'); assert.equal(context.state.refreshes, 0);assert.equal(context.reads.at(-1)[1].quotesCursor,null); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, true);
  await press(tree, 'Select: First Customs'); context.state.first = {...context.state.first,quotes:context.state.first.quotes.map(quote=>({...quote,totalCents:quote.totalCents+100}))}; await rerender(context, tree); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, true);
  await press(tree, 'Select: First Customs'); context.state.auth.offline = true; await rerender(context, tree);
  assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, true); assert.ok(says(tree, 'Connect to compare'));
  await press(tree, 'Select: Second Customs'); assert.equal(context.calls.length, 0);
  context.state.auth.offline = false; await rerender(context, tree); assert.equal(!!button(tree, 'Continue to payment choice').props.disabled, true); await unmount(tree);
});

test('refresh errors and loading invalidate a selection and disable acceptance until current offers load', async () => {
  const context = setup(), tree = await mount(context);
  await press(tree, 'Select: First Customs'); context.state.busy = true; await rerender(context, tree);
  assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);
  context.state.busy = false; context.state.error = 'This request is no longer available.'; await rerender(context, tree);
  assert.ok(says(tree, 'This request is no longer available.')); await press(tree, 'Select: First Customs'); assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);
  assert.equal(!!button(tree, 'Refresh quotations').props.disabled, false); await press(tree, 'Refresh quotations'); assert.equal(context.state.refreshes, 1);
  context.state.error = ''; await rerender(context, tree); assert.equal(button(tree, 'Continue to payment choice').props.disabled, true); await unmount(tree);
});

test('request and account switches reset selection and page history before a payment choice', async t => {
  const context = setup(), tree = await mount(context);
  t.after(()=>unmount(tree));
  await scrollToBottom(tree); await press(tree, 'Select: Third Customs'); await rerender(context, tree, 'another-request');
  assert.equal(button(tree, 'Next'),undefined); assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);
  assert.equal(button(tree,'Select: First Customs'),undefined);
  context.state.first={...context.state.first,request:{...context.state.first.request,id:'another-request'},quotes:context.state.first.quotes.map(quote=>({...quote,serviceRequestId:'another-request'}))};
  await rerender(context,tree,'another-request');await press(tree, 'Select: First Customs'); await press(tree, 'Continue to payment choice');
  assert.equal(context.moves.length,1);assert.equal(context.calls.length,0);
  context.state.auth.user = {uid: 'other-owner'}; await rerender(context, tree, 'another-request');
  assert.equal(button(tree, 'Continue to payment choice').props.disabled, true);await unmount(tree);
});

test('a booked request exposes its booking and cannot start another acceptance', async () => {
  const context = setup(); context.state.first.request = {...context.state.first.request, status: 'booked', bookingId: 'existing-booking'};
  const tree = await mount(context); assert.ok(says(tree, 'already been accepted')); assert.equal(button(tree, 'Continue to payment choice'), undefined);
  await press(tree, 'View booking'); assert.deepEqual(context.moves, [['navigate', 'BookingDetail', {id: 'existing-booking'}]]); assert.equal(context.calls.length, 0); await unmount(tree);
});


test('comparison makes expired and superseded history ineligible while the renewed offer is selectable',async()=>{
 const c=setup(),old={...c.state.first.quotes[0],validUntil:Date.now()-1},renewed={...old,id:'renewed',shopName:'Renewed Customs',validUntil:Date.now()+86400000};c.state.first={...c.state.first,quotes:[old,renewed],quotesCursor:null};
 const tree=await mount(c);assert.ok(says(tree,'Ask the shop to submit a renewal'));assert.equal(button(tree,'Select: First Customs').props.disabled,true);assert.equal(!!button(tree,'Select: Renewed Customs').props.disabled,false);
 await press(tree,'Select: Renewed Customs');await press(tree,'Continue to payment choice');assert.equal(c.moves[0][2].quote.id,'renewed');
 c.state.first={...c.state.first,quotes:[{...old,status:'superseded'},renewed]};await act(async()=>tree.update(React.createElement(c.Screen,{route:{params:{id:'request-one'}},navigation:c.navigation})));assert.equal(button(tree,'Select: First Customs').props.disabled,true);await unmount(tree);
});

test('recommendations show server rankings, total price, distance, coverage and preserve free choice',async()=>{
 const c=setup();
 c.state.first.recommendations={recommendedId:'quote-two',eligibleCount:2,distanceUsed:false,distanceNote:'Distance excluded for every score.',nextExpiry:Date.now()+600000,entries:[
  {id:'quote-one',shopName:'First Customs',eligible:true,rank:2,totalCents:75000,distanceKm:null,coverage:{matched:1,required:1}},
  {id:'quote-two',shopName:'Second Customs',eligible:true,rank:1,totalCents:80000,distanceKm:2.34,coverage:{matched:1,required:1},explanations:['Best overall value','Fully matches requested services (shop confirmed)']},
 ]};
 const tree=await mount(c);
 assert.ok(says(tree,'Recommended quotation: Second Customs'));assert.ok(says(tree,'Rank 1 of 2'));assert.ok(says(tree,'R800.00'));assert.ok(says(tree,'2.3 km (straight-line)'));assert.ok(says(tree,'Distance unavailable'));assert.ok(says(tree,'1/1 mandatory services'));assert.ok(says(tree,'Advisory only'));
 assert.equal(button(tree,'Continue to payment choice').props.disabled,true);
 await press(tree,'Select: First Customs');await press(tree,'Continue to payment choice');
 assert.equal(c.moves[0][2].quote.id,'quote-one');assert.equal(c.calls.length,0);
 c.state.first={...c.state.first,recommendations:{...c.state.first.recommendations,recommendedId:null,eligibleCount:1,entries:[]}};
 await rerender(c,tree);assert.equal(says(tree,'Recommended quotation:'),false);await unmount(tree);
});

test('stale, offline and failed comparisons suppress recommendation badges',async()=>{
 const c=setup();const entry={id:'quote-one',shopName:'First Customs',rank:1,explanations:['Best overall value'],totalCents:75000,coverage:{required:0,matched:0}};
 c.state.first.recommendations={recommendedId:'quote-one',eligibleCount:2,nextExpiry:Date.now()-1,entries:[entry]};
 const tree=await mount(c);assert.equal(says(tree,'Recommended quotation:'),false);
 c.state.first.recommendations={...c.state.first.recommendations,nextExpiry:Date.now()+600000};
 await rerender(c,tree);assert.ok(says(tree,'Recommended quotation:'));
 c.state.auth.offline=true;await rerender(c,tree);assert.equal(says(tree,'Recommended quotation:'),false);
 c.state.auth.offline=false;c.state.error='Refresh failed';await rerender(c,tree);assert.equal(says(tree,'Recommended quotation:'),false);await unmount(tree);
});

test('zero, single and insufficient comparisons explain why no overall winner is shown',async t=>{
 for(const [quotes,status,limitation] of [[[],'empty','No current eligible quotations are available'],[null,'single','Only one current quotation is available'],[null,'insufficient','Insufficient confirmed scope and all-charge information']]){
  const c=setup();c.state.first={...c.state.first,quotes:quotes||c.state.first.quotes.slice(0,status==='single'?1:2),quotesCursor:null,recommendations:{status,limitation,entries:(quotes||c.state.first.quotes.slice(0,status==='single'?1:2)).map(q=>({id:q.id,comparable:true,eligible:false,coverage:{required:0,matched:0}}))}};
  const tree=await mount(c);t.after(()=>unmount(tree));assert.ok(says(tree,limitation));assert.equal(says(tree,'Recommended quotation:'),false);assert.equal(c.calls.length,0);await unmount(tree);
 }
});

test('deposit balances, factual trade-offs and ties render without claiming an overall winner',async t=>{
 const c=setup();c.state.first.quotes[0]={...c.state.first.quotes[0],depositType:'fixed',depositValue:15000,depositAmountCents:15000};
 c.state.first.recommendations={status:'tie',recommendedId:null,eligibleCount:2,limitation:'The highest scoring quotations are tied. No overall winner is recommended.',entries:c.state.first.quotes.map(q=>({id:q.id,comparable:true,rank:1,coverage:{required:0,matched:0},remainingAfterDepositCents:q.id==='quote-one'?60000:null,highlights:['Shortest stated turnaround'],tradeoffs:['Service scopes differ. Review inclusions before choosing.']}))};
 const tree=await mount(c);t.after(()=>unmount(tree));assert.ok(says(tree,'No overall winner'));assert.ok(says(tree,'Tied'));assert.ok(says(tree,'R600.00'));assert.ok(says(tree,'Shortest stated turnaround'));assert.ok(says(tree,'Service scopes differ'));
 await press(tree,'View details: First Customs');assert.ok(says(tree,'Quotation details'));await press(tree,'Close quotation details');await press(tree,'Select: First Customs');await press(tree,'Continue to payment choice');assert.equal(c.moves[0][1],'PaymentChoice');assert.equal(c.calls.length,0);
});

test('an authoritative first-page refresh removes offers that were withdrawn or became unavailable',async t=>{
 const c=setup(),tree=await mount(c);t.after(()=>unmount(tree));await press(tree,'Select: First Customs');
 c.state.first={...c.state.first,quotes:[c.state.first.quotes[1]],quotesCursor:null};await rerender(c,tree);
 assert.equal(button(tree,'Select: First Customs'),undefined);assert.equal(button(tree,'Continue to payment choice').props.disabled,true);assert.ok(button(tree,'Select: Second Customs'));
 await unmount(tree);const reopened=await mount(c);t.after(()=>unmount(reopened));assert.equal(button(reopened,'Select: First Customs'),undefined);assert.ok(button(reopened,'Select: Second Customs'));
});

test('unavailable comparison data is retryable and foreign request quotations cannot be selected',async t=>{
 const c=setup();c.state.first.quotes=[{...c.state.first.quotes[0],serviceRequestId:'another-customer-request'}];c.state.first.recommendations={status:'unavailable',entries:[],limitation:'Recommendations are temporarily unavailable. Review individual quotations or refresh.'};
 const tree=await mount(c);t.after(()=>unmount(tree));assert.ok(says(tree,'temporarily unavailable'));assert.equal(button(tree,'Select: First Customs'),undefined);assert.equal(button(tree,'Continue to payment choice').props.disabled,true);await press(tree,'Refresh quotations');assert.equal(c.state.refreshes,1);assert.equal(c.calls.length,0);
});

test('mobile and desktop comparisons use the current backend view and offer explicit paging',async t=>{
 for(const [platform,width] of [['ios',390],['android',412],['web',1440]]){
  const c=setup({platform,width}),tree=await mount(c);t.after(()=>unmount(tree));assert.ok(c.reads.every(([op,input])=>op==='request'&&input.comparison===true));assert.equal(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');
  await press(tree,'Load more quotations');assert.ok(says(tree,'Third Customs'));assert.equal(c.reads.at(-1)[1].quotesCursor,'page-two');assert.equal(button(tree,'Load more quotations'),undefined);await unmount(tree);
 }
});
