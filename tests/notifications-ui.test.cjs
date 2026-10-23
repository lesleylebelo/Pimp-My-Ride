const {test} = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), {act, create} = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const label = (tree, value) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === value);
const texts = tree => tree.root.findAllByType('Text').map(node => node.props.children).join(' ');
const rowButton = tree => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityHint === 'Opens the related record');
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const sample = (id, extra = {}) => ({id, title: `Update ${id}`, body: 'Existing notification details', createdAt: Date.now(), readAt: null, target: {type: 'booking', id: 'booking-1'}, ...extra});
function setup(role = 'owner', mode = 'dark') {
  const {palettes} = loadUI('src/shared/theme/colors.js');
  const state = {offline: false, focused: true, moves: [], calls: [], refreshes: 0, pages: 0,
    feed: {items: [sample('one')], cursor: null, busy: false, refreshing: false, error: ''}};
  const mocks = {
    '../../../shared/components/landing/LandingUI': {LandingText: 'Text'},
    '../../auth/context/AuthContext': {useAuth: () => ({user: {uid: role}, profile: {role}, offline: state.offline})},
    '../../../shared/theme/ThemeContext': {useTheme: () => ({theme: palettes[mode], isDark: mode === 'dark'})},
    '@react-navigation/native': {useIsFocused: () => state.focused},
    '../hooks/useNotificationHistory': {useNotificationHistory: () => ({...state.feed, refresh: () => {state.refreshes++;}, loadNext: () => {state.pages++;}})},
    '../hooks/useMarketData': {useMarketData: () => ({data: null, busy: false, error: ''})},
    '../services/marketApi': {marketApi: async (op, data) => {state.calls.push({op, data}); return state.reply?.();}},
  };
  const Screen = loadUI('src/features/marketplace/screens/CommunicationScreens.js', mocks).NotificationsScreen;
  const navigation = {navigate: (...args) => state.moves.push(args), canGoBack: () => true, goBack: () => state.moves.push(['back'])};
  return {state, Screen, navigation};
}
async function mounted(s, run) {
  let tree;
  await act(async () => {tree = create(React.createElement(s.Screen, {navigation: s.navigation}));});
  const update = () => act(async () => tree.update(React.createElement(s.Screen, {navigation: s.navigation})));
  try {await run(tree, update);} finally {await act(async () => tree.unmount());}
}

test('calendar grouping and relative times handle midnight, missing dates and authoritative timestamp ties', () => {
  const {notificationSections, notificationTime} = loadUI('src/features/marketplace/utils/notificationPresentation.js');
  const now = new Date(2026, 9, 23, 0, 15).getTime();
  const items = [sample('a', {createdAt: now - 1000}), sample('z', {createdAt: now - 1000}), sample('y', {createdAt: now - 3600000}), sample('e', {createdAt: now - 3 * 86400000}), sample('missing', {createdAt: null})];
  const sections = notificationSections(items, now);
  assert.deepEqual(sections.map(s => s.title), ['Today', 'Yesterday', 'Earlier']);
  assert.deepEqual(sections.flatMap(s => s.data.map(i => i.id)), ['a', 'z', 'y', 'e', 'missing']);
  assert.equal(notificationTime(now - 1000, now), 'Just now');
  assert.equal(notificationTime(now - 120000, now), '2m ago');
  assert.equal(notificationTime(now - 7200000, now), '2h ago');
  assert.equal(notificationTime(null, now), 'Time unavailable');
  assert.equal(notificationTime(Infinity, now), 'Time unavailable');
  assert.match(notificationTime(new Date(2025, 0, 1).getTime(), now), /2025/);
});

test('customer and shop rows preserve destinations, explicit reads, back navigation and duplicate locks', async () => {
  for (const role of ['owner', 'shop']) {
    const s = setup(role); s.state.feed.items = [sample('one', {target: {type: 'quotation', id: 'request-1'}})];
    await mounted(s, async (tree, update) => {
      assert.match(texts(tree), /Notifications/); assert.equal(s.state.calls.length, 0);
      assert.ok(!label(tree, 'Mark all as read'));
      assert.equal(tree.root.findAllByProps({testID: 'notification-unread-dot'}).length, 1);
      assert.match(rowButton(tree).props.accessibilityLabel, /^Unread:/);
      await act(async () => {rowButton(tree).props.onPress(); rowButton(tree).props.onPress();});
      assert.deepEqual(s.state.moves, [[role === 'shop' ? 'ShopRequest' : 'QuoteComparison', {id: 'request-1'}]]);
      assert.equal(s.state.calls.length, 0);
      s.state.focused = false; await update(); s.state.focused = true; await update();
      let finish; s.state.reply = () => new Promise(resolve => {finish = resolve;});
      const read = label(tree, 'Mark as read: Update one');
      await act(async () => {read.props.onPress(); read.props.onPress();});
      assert.deepEqual(s.state.calls, [{op: 'notificationRead', data: {id: 'one'}}]);
      await act(async () => finish({read: true}));
      assert.equal(tree.root.findAllByProps({testID: 'notification-unread-dot'}).length, 0);
      assert.equal(label(tree, 'Mark as read: Update one'), undefined);
      assert.match(rowButton(tree).props.accessibilityLabel, /^Read:/);
      await act(async () => label(tree, 'Go back').props.onPress());
      assert.deepEqual(s.state.moves.at(-1), ['back']);
    });
    const fallback = setup(role); fallback.navigation.canGoBack = () => false;
    await mounted(fallback, async tree => {
      await act(async () => label(tree, 'Go back').props.onPress());
      assert.deepEqual(fallback.state.moves, [[role === 'shop' ? 'ShopJobs' : 'Discover']]);
    });
  }
});

test('loading, empty, network errors, offline and refreshing states provide truthful controls', async () => {
  const s = setup(); s.state.feed = {...s.state.feed, items: [], busy: true, refreshing: true};
  await mounted(s, async (tree, update) => {
    assert.match(texts(tree), /Loading notifications/); assert.doesNotMatch(texts(tree), /No notifications yet/);
    s.state.feed.busy = false; s.state.feed.refreshing = false; await update();
    assert.match(texts(tree), /No notifications yet/);
    s.state.feed.error = 'Connection interrupted'; await update();
    assert.match(texts(tree), /Connection interrupted/); assert.doesNotMatch(texts(tree), /No notifications yet/);
    await act(async () => label(tree, 'Refresh notifications').props.onPress()); assert.equal(s.state.refreshes, 1);
    s.state.feed.items = [sample('one')]; s.state.feed.error = ''; s.state.feed.refreshing = true; s.state.feed.busy = true; await update();
    assert.match(texts(tree), /Refreshing notifications/); assert.equal(label(tree, 'Refresh notifications').props.disabled, true);
    s.state.offline = true; await update();
    assert.match(texts(tree), /Connect to view/); assert.equal(rowButton(tree), undefined);
    await act(async () => tree.root.findByType('SectionList').props.onRefresh()); assert.equal(s.state.refreshes, 1);
  });
});

test('large lists use section virtualization and cursor pagination; long descriptions remain readable', async () => {
  const s = setup(); s.state.feed.items = Array.from({length: 600}, (_, i) => sample(String(i), {body: 'Long description. '.repeat(60)})); s.state.feed.cursor = 'next';
  await mounted(s, async (tree, update) => {
    const list = tree.root.findByType('SectionList');
    assert.equal(list.props.initialNumToRender, 12); assert.equal(list.props.windowSize, 7);
    assert.equal(list.props.style.flex, 1);
    assert.equal(tree.root.findAllByType('ScrollView').length, 0);
    assert.ok(tree.root.findAllByType('Text').some(t => t.props.children === s.state.feed.items[0].body && t.props.numberOfLines === undefined));
    await act(async () => list.props.onEndReached()); assert.equal(s.state.pages, 1);
    s.state.feed.busy = true; await update(); await act(async () => tree.root.findByType('SectionList').props.onEndReached()); assert.equal(s.state.pages, 1);
    s.state.feed.busy = false; s.state.feed.error = 'Page failed'; await update();
    await act(async () => tree.root.findByType('SectionList').props.onEndReached()); assert.equal(s.state.pages, 1);
    await act(async () => label(tree, 'Load more notifications').props.onPress()); assert.equal(s.state.pages, 2);
  });
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
test('both themes have readable text contrast, read-state contrast, 44pt actions and safe areas', async () => {
  for (const mode of ['dark', 'light']) {
    const s = setup('owner', mode);
    await mounted(s, async tree => {
      assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges, ['top', 'bottom', 'left', 'right']);
      const background = flatten(tree.root.findByProps({testID: 'notification-one'}).props.style).backgroundColor;
      const title = tree.root.findAllByType('Text').find(t => t.props.children === 'Update one');
      const body = tree.root.findAllByType('Text').find(t => t.props.children === 'Existing notification details');
      assert.ok(contrast(flatten(title.props.style).color, background) >= 4.5);
      assert.ok(contrast(flatten(body.props.style).color, background) >= 4.5);
      const read = label(tree, 'Mark as read: Update one');
      assert.equal(read.props.style({pressed: false})[0].minHeight, 44);
      assert.ok(contrast(flatten(read.findByType('Text').props.style).color, background) >= 4.5);
      assert.equal(label(tree, 'Go back').props.style({pressed: false})[0].width, 44);
    });
  }
});

test('icons use supported targets and missing destinations never invent navigation', async () => {
  const {notificationIcon} = loadUI('src/features/marketplace/utils/notificationPresentation.js');
  for (const [type, icon] of Object.entries({conversation: 'chatbubble-ellipses-outline', receipt: 'receipt-outline', quotation: 'document-text-outline', booking: 'calendar-outline', request: 'construct-outline'})) {
    assert.equal(notificationIcon({target: {type}}), icon);
  }
  assert.equal(notificationIcon({event: 'unknown'}), 'notifications-outline');
  const s = setup(); s.state.feed.items = [sample('one', {target: {type: 'unknown', id: 'no-route'}, body: ''})];
  await mounted(s, async tree => {assert.equal(rowButton(tree), undefined); assert.equal(s.state.moves.length, 0); assert.doesNotMatch(texts(tree), /Simulated marketplace update/);});
});
