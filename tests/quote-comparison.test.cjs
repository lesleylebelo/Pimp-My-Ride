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
function setup({api = async () => ({id: 'booking-one'})} = {}) {
  const calls = [], reads = [], moves = [];
  const request = {id: 'request-one', title: 'Paint the doors', status: 'open', budgetMinCents: 50000, budgetMaxCents: 100000};
  const quote = {id: 'quote-one', shopName: 'First Customs', status: 'submitted', scope: 'Prepare and paint both front doors', items: [{description: 'Paint and labour', amountCents: 75000}], totalCents: 75000, completionDays: 3, warranty: 'Six months', validUntil: Date.now() + 600000};
  const second = {...quote, id: 'quote-two', shopName: 'Second Customs', totalCents: 80000, warranty: ''};
  const state = {auth: {user: {uid: 'owner'}, profile: {role: 'owner'}, offline: false}, busy: false, error: '', refreshes: 0,
    first: {request, quotes: [quote, second], quotesCursor: 'page-two'}, second: {request, quotes: [{...quote, id: 'quote-three', shopName: 'Third Customs'}], quotesCursor: null}};
  const navigation = {navigate: (...args) => moves.push(['navigate', ...args]), replace: (...args) => moves.push(['replace', ...args])};
  const Primary = loadUI('src/shared/components/PrimaryButton.js').default;
  const {QuoteComparisonScreen} = loadUI('src/features/marketplace/screens/QuoteComparisonScreen.js', {
    '../../../shared/components/landing/LandingUI': {LandingText: props => React.createElement('Text', props), LandingShell: ({children}) => React.createElement('View', null, children), LandingButton: Primary, ui: {}, ownerTabs: [], shopTabs: [], useLandingFeedback: () => ({})},
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

test('owner compares real offer details and confirms one selected quote before navigating to its booking', async t => {
  const context = setup(), tree = await mount(context);
  t.after(() => unmount(tree));
  assert.ok(says(tree, 'First Customs')); assert.ok(says(tree, 'Paint and labour')); assert.ok(says(tree, 'R750.00'));
  assert.ok(says(tree, '3 working days')); assert.ok(says(tree, 'Warranty: Six months')); assert.ok(says(tree, 'Warranty: not specified'));
  assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await press(tree, 'Select: First Customs'); assert.equal(!!button(tree, 'Continue to book').props.disabled, false);
  await press(tree, 'Continue to book'); assert.ok(says(tree, 'Cancelling the booking does not reopen the request.'));
  await press(tree, 'Cancel'); assert.equal(context.calls.length, 0);
  await press(tree, 'Select: Second Customs'); assert.equal(button(tree, 'Selected: First Customs'), undefined);
  await press(tree, 'Continue to book'); await press(tree, 'Confirm');
  assert.deepEqual(context.calls, [['quoteAccept', {id: 'quote-two'}]]);
  assert.deepEqual(context.moves, [['replace', 'BookingDetail', {id: 'booking-one'}]]);
  assert.equal(context.state.refreshes, 0); await unmount(tree);
});

test('acceptance locks synchronous duplicate taps and preserves the selected offer after an uncertain failure', async () => {
  let reject, fail = true;
  const context = setup({api: async () => {if (fail) return new Promise((_, no) => {reject = no;}); return {id: 'recorded-booking'};}}), tree = await mount(context);
  await press(tree, 'Select: First Customs'); await press(tree, 'Continue to book');
  let pending;
  await act(async () => {const confirm = button(tree, 'Confirm').props.onPress; pending = confirm(); void confirm();});
  assert.equal(context.calls.length, 1);
  await act(async () => {reject(Error('Connection interrupted. Retry to recover your booking.')); await pending;});
  assert.ok(says(tree, 'Connection interrupted.')); assert.ok(button(tree, 'Selected: First Customs')); assert.deepEqual(context.moves, []);
  fail = false; await press(tree, 'Confirm');
  assert.deepEqual(context.calls, [['quoteAccept', {id: 'quote-one'}], ['quoteAccept', {id: 'quote-one'}]]);
  assert.deepEqual(context.moves, [['replace', 'BookingDetail', {id: 'recorded-booking'}]]); await unmount(tree);
});

test('expired, withdrawn and closed offers cannot be selected or accepted, including a quote expiring in its confirmation dialog', async t => {
  const clock = Date.now(); let current = clock;
  t.mock.method(Date, 'now', () => current);
  const context = setup();
  context.state.first.quotes[0].validUntil = clock - 1;
  context.state.first.quotes[1].status = 'withdrawn';
  let tree = await mount(context);
  for (const title of ['Select: First Customs', 'Select: Second Customs']) {assert.equal(button(tree, title).props.disabled, true); await press(tree, title);}
  assert.equal(button(tree, 'Continue to book').props.disabled, true); assert.equal(context.calls.length, 0);
  context.state.first = {...context.state.first, quotes: [{...context.state.first.quotes[0], validUntil: clock + 100000}]};
  await rerender(context, tree); await press(tree, 'Select: First Customs'); await press(tree, 'Continue to book');
  current = clock + 100001; await press(tree, 'Confirm'); assert.equal(context.calls.length, 0);
  await rerender(context, tree); assert.equal(button(tree, 'Continue to book').props.disabled, true); assert.ok(says(tree, 'This quotation has expired.'));
  context.state.first = {...context.state.first, request: {...context.state.first.request, status: 'closed'}};
  await rerender(context, tree); assert.ok(says(tree, 'This request is closed.')); assert.equal(button(tree, 'Continue to book'), undefined); await unmount(tree);
});

test('selection belongs to its page and is cleared by paging, refresh, offline or a new authoritative response', async () => {
  const context = setup(), tree = await mount(context);
  assert.equal(button(tree, 'Previous').props.disabled, true);
  await press(tree, 'Select: First Customs'); await press(tree, 'Next');
  assert.ok(says(tree, 'Third Customs')); assert.equal(button(tree, 'Continue to book').props.disabled, true); assert.equal(button(tree, 'Next').props.disabled, true);
  assert.ok(context.reads.some(([op, input]) => op === 'request' && input.quotesCursor === 'page-two'));
  await press(tree, 'Select: Third Customs'); await press(tree, 'Previous'); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await press(tree, 'Select: First Customs'); await press(tree, 'Refresh quotations'); assert.equal(context.state.refreshes, 1); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await press(tree, 'Select: First Customs'); context.state.first = {...context.state.first}; await rerender(context, tree); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await press(tree, 'Select: First Customs'); context.state.auth.offline = true; await rerender(context, tree);
  assert.equal(button(tree, 'Continue to book').props.disabled, true); assert.ok(says(tree, 'Connect to compare'));
  await press(tree, 'Select: Second Customs'); assert.equal(context.calls.length, 0);
  context.state.auth.offline = false; await rerender(context, tree); assert.equal(button(tree, 'Continue to book').props.disabled, true); await unmount(tree);
});

test('refresh errors and loading invalidate a selection and disable acceptance until current offers load', async () => {
  const context = setup(), tree = await mount(context);
  await press(tree, 'Select: First Customs'); context.state.busy = true; await rerender(context, tree);
  assert.equal(button(tree, 'Continue to book').props.disabled, true);
  context.state.busy = false; context.state.error = 'This request is no longer available.'; await rerender(context, tree);
  assert.ok(says(tree, 'This request is no longer available.')); await press(tree, 'Select: First Customs'); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  assert.equal(!!button(tree, 'Refresh quotations').props.disabled, false); await press(tree, 'Refresh quotations'); assert.equal(context.state.refreshes, 1);
  context.state.error = ''; await rerender(context, tree); assert.equal(button(tree, 'Continue to book').props.disabled, true); await unmount(tree);
});

test('request and account switches reset selection and page history and discard an old acceptance result', async () => {
  let release;
  const context = setup({api: async () => new Promise(resolve => {release = resolve;})}), tree = await mount(context);
  await press(tree, 'Next'); await press(tree, 'Select: Third Customs'); await rerender(context, tree, 'another-request');
  assert.ok(says(tree, 'Page 1')); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await press(tree, 'Select: First Customs'); await press(tree, 'Continue to book');
  let pending; await act(async () => {pending = button(tree, 'Confirm').props.onPress();});
  context.state.auth.user = {uid: 'other-owner'}; await rerender(context, tree, 'another-request'); assert.equal(button(tree, 'Continue to book').props.disabled, true);
  await act(async () => {release({id: 'old-owner-booking'}); await pending;}); assert.deepEqual(context.moves, []); await unmount(tree);
});

test('a booked request exposes its booking and cannot start another acceptance', async () => {
  const context = setup(); context.state.first.request = {...context.state.first.request, status: 'booked', bookingId: 'existing-booking'};
  const tree = await mount(context); assert.ok(says(tree, 'already been accepted')); assert.equal(button(tree, 'Continue to book'), undefined);
  await press(tree, 'View booking'); assert.deepEqual(context.moves, [['navigate', 'BookingDetail', {id: 'existing-booking'}]]); assert.equal(context.calls.length, 0); await unmount(tree);
});
