const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const act = Renderer.act;
const request = {id: 'request-1', title: 'Restore paint', description: 'Repaint the bonnet', categoryName: 'Paint', city: 'Pretoria', vehicle: {make: 'Ford', model: 'Fiesta', year: 2015, colour: 'Blue'}, status: 'open', visibility: 'open', budgetMinCents: 10000, budgetMaxCents: 50000};
const quote = {id: 'quote-1', serviceRequestId: request.id, requestTitle: request.title, shopName: 'Test shop', scope: 'Prepare and repaint', items: [{description: 'Labour', amountCents: 10000}], totalCents: 10000, completionDays: 7, validUntil: Date.now() + 86400000, status: 'submitted'};
function setup(overrides = {}) {
  const state = {auth: {user: {uid: 'shop-1'}, profile: {role: 'shop'}, offline: false}, data: {request, quotes: []}, busy: false, error: '', calls: [], reads: [], navigations: [], api: async () => ({id: 'quote-1'}), refresh: async () => ({}), ...overrides};
  const PrimaryButton = loadUI('src/shared/components/PrimaryButton.js').default;
  const landing = {LandingText: 'Text', LandingShell: ({children}) => React.createElement('View', null, children), LandingButton: PrimaryButton, ownerTabs: [], shopTabs: [], ui: {}, useLandingFeedback: () => ({showFeature() {}})};
  const screens = loadUI('src/features/marketplace/screens/ShopMarketplaceScreens.js', {
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
    '../../../shared/components/landing/LandingUI': landing,
    '../hooks/useMarketData': {useMarketData: (op, input) => { state.reads.push({op, input}); return {data: state.data, busy: state.busy, error: state.error, refresh: (...args) => state.refresh(...args)}; }},
    '../services/marketApi': {marketApi: async (op, input) => { state.calls.push({op, input}); return state.api(op, input); }},
  });
  const navigation = {navigate: (...args) => state.navigations.push(args)};
  return {state, screens, navigation};
}
const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.findAllByType('Text').some(text => text.props.children === title));
const input = (tree, label) => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label);
const text = tree => tree.root.findAllByType('Text').map(node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children).join('\n');
async function change(tree, label, value) { await act(async () => input(tree, label).props.onChangeText(value)); }
async function mount(Screen, props) { let tree; await act(async () => { tree = Renderer.create(React.createElement(Screen, props)); }); return tree; }
async function validQuote(tree) {
  await change(tree, 'Work included', 'Prepare and repaint bonnet');
  await change(tree, 'Item 1 description', 'Materials and labour');
  await change(tree, 'Item 1 amount (R)', '123.45');
}

test('shop feeds send the correct audience and navigate with a request identifier', async () => {
  for (const [screen, feed] of [['ShopJobsScreen', 'open'], ['ShopRequestsScreen', 'direct']]) {
    const {state, screens, navigation} = setup({data: {items: [request], cursor: 'next-page'}});
    const tree = await mount(screens[screen], {navigation});
    assert.deepEqual(state.reads.at(-1), {op: 'requests', input: {feed, cursor: null}});
    await act(async () => button(tree, 'View request').props.onPress());
    assert.deepEqual(state.navigations, [['ShopRequest', {id: request.id}]]);
    await act(async () => button(tree, 'Next').props.onPress());
    assert.equal(state.reads.at(-1).input.cursor, 'next-page');
    await act(async () => button(tree, 'Previous').props.onPress());
    assert.equal(state.reads.at(-1).input.cursor, null);
    await act(async () => tree.unmount());
  }
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
  assert.match(text(tree), /already been submitted/);
  await act(async () => tree.unmount());
  const detail = await mount(screens.ShopRequestScreen, {navigation, route: {params: {id: request.id}}});
  assert.equal(button(detail, 'Prepare quotation'), undefined);
  assert.ok(button(detail, 'My quotations'));
  await act(async () => detail.unmount());
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
  let pending;
  await act(async () => { const send = button(tree, 'Send quotation').props.onPress; pending = send(); void send(); });
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0], {op: 'quoteSubmit', input: {serviceRequestId: request.id, scope: 'Prepare and repaint bonnet', items: [{description: 'Materials and labour', amountCents: 12345}, {description: 'Finishing', amountCents: 55}], completionDays: 7, warranty: '', validForDays: 14}});
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
