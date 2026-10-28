const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {act, create} = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const button = (tree, label) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === label);
const fixture = {
  id: 'social-post', authorRole: 'shop', type: 'showcase',
  shop: {id: 'fixture-shop', name: 'Fixture Wheels'}, city: 'Pretoria',
  title: 'A new set of wheels', description: 'New wheels, fitted and aligned.',
  serviceCategory: 'Wheels', vehicle: {year: 2024, make: 'Toyota', model: 'Hilux'},
  images: [{url: 'https://fixture.invalid/photo.png'}], createdAt: Date.now(),
};

function setup(width = 390, platform = 'web') {
  const state = {moves: [], saves: [], offline: false, save: async () => ({}), feed: {items: [fixture, {...fixture, id: 'second', title: 'Second post'}], busy: false, refreshing: false, error: '', cursor: null, refresh() {}, loadNext() {}}};
  const {palettes} = loadUI('src/shared/theme/colors.js');
  const mocks = {
    '@expo-google-fonts/space-grotesk': {},
    '@expo-google-fonts/manrope': {},
    'react-native': {Platform: {OS: platform}, useWindowDimensions: () => ({width, height: 900, fontScale: 1, scale: 1})},
    '../../auth/context/AuthContext': {useAuth: () => ({user: {uid: 'fixture-owner'}, profile: {role: 'owner'}, offline: state.offline})},
    '../../../shared/theme/ThemeContext': {useTheme: () => ({theme: palettes.dark, isDark: true})},
    '../../../shared/components/ProfileAvatar': () => React.createElement('View', {testID: 'workshop-avatar'}),
    '../../marketplace/components/ShowcasePhoto': {
      __esModule: true,
      default: ({style}) => React.createElement('Image', {style, accessibilityLabel: 'Showcase photo'}),
      hasPostImage: image => !!(image?.path || image?.url),
    },
    '../../marketplace/components/MessagesHeaderButton': () => React.createElement('Pressable', {accessibilityLabel: 'Messages'}),
    '../../marketplace/components/NotificationsHeaderButton': () => React.createElement('Pressable', {accessibilityLabel: 'Notifications'}),
    '../../marketplace/hooks/usePostsFeed': {usePostsFeed: () => state.feed},
    '../services/postsApi': {postsApi: async (...args) => { state.saves.push(args); return state.save(); }},
  };
  return {state, load: file => loadUI(file, mocks), navigation: {navigate: (...args) => state.moves.push(args)}};
}

async function mount(Component, props, fn) {
  let tree;
  await act(async () => { tree = create(React.createElement(Component, props)); });
  try { await fn(tree); } finally { await act(async () => tree.unmount()); }
}

test('Discover stacks full-width feed posts in one bounded column at phone, tablet and desktop widths', async () => {
  for (const width of [320, 390, 768, 1440]) {
    const s = setup(width), Screen = s.load('src/features/customer/screens/CustomerDiscoverScreen.js').default;
    await mount(Screen, {navigation: s.navigation}, async tree => {
      const first = button(tree, `View ${fixture.title}`), second = button(tree, 'View Second post');
      assert.ok(first && second);
      const columns = tree.root.findAllByType('View').filter(node => {
        const style = flatten(node.props.style);
        return style.maxWidth === 680 && style.width === '100%';
      });
      assert.equal(columns.length, 1);
      assert.equal(columns[0].findAllByType('Image').length, 2);
      assert.notEqual(flatten(columns[0].props.style).flexDirection, 'row');
      await act(async () => first.props.onPress());
      assert.deepEqual(s.state.moves, [['PostDetail', {id: fixture.id}]]);
    });
  }
});

test('Discover Studio header action follows notifications and messages, leaves search first in the feed and opens the existing route', async () => {
  for (const [width, platform] of [[320, 'web'], [390, 'web'], [768, 'web'], [1440, 'web'], [320, 'ios'], [390, 'android']]) {
    const s = setup(width, platform), Screen = s.load('src/features/customer/screens/CustomerDiscoverScreen.js').default;
    await mount(Screen, {navigation: s.navigation}, async tree => {
      const studio = button(tree, 'Open PimpPilot Studio');
      assert.ok(studio);
      // CustomerPressable supplies hover, keyboard focus and pressed feedback.
      const style = flatten(studio.props.style({pressed: false}));
      assert.deepEqual([style.width, style.height, style.borderRadius, style.flexShrink], [44, 44, 22, 0]);
      const icon = studio.findByType('Icon');
      assert.equal(icon.props.name, 'sparkles-outline');
      assert.equal(icon.props.size, 24);
      assert.equal(icon.props.color, style.borderColor);
      assert.equal(studio.props.accessibilityRole, 'button');
      assert.equal(studio.findAllByType('Text').length, 0);
      const header = tree.root.findAllByType('View').find(node => {
        const labels = node.findAllByType('Pressable').map(item => item.props.accessibilityLabel);
        return labels.join('|') === 'Notifications|Messages|Open PimpPilot Studio';
      });
      assert.ok(header, 'all three controls share the header row in the required order');
      const scroll = tree.root.findAllByType('ScrollView').find(node => node.findAllByType('TextInput').some(input => input.props.accessibilityLabel === 'Search workshops or services'));
      assert.equal(scroll.findAllByType('Pressable').includes(studio), false);
      assert.equal(scroll.children[0].findByType('TextInput').props.accessibilityLabel, 'Search workshops or services');
      const copy = tree.root.findAllByType('Text').map(node => node.props.children).join(' ');
      assert.doesNotMatch(copy, /PimpPilot Studio|Plan your next build|Your next build starts with an idea/);
      if (platform === 'web') {
        const attributes = {};
        studio.props.ref({setAttribute: (key, value) => { attributes[key] = value; }});
        assert.equal(attributes.title, 'Open PimpPilot Studio');
        studio.props.ref(null);
        await act(async () => studio.props.onFocus({}));
        assert.equal(flatten(studio.props.style({pressed: false})).outlineStyle, 'solid');
      } else assert.equal(studio.props.ref, undefined);
      await act(async () => studio.props.onPress());
      assert.deepEqual(s.state.moves, [['PimpPilotStudio']]);
    });
  }
});

test('Discover post order is identity, category, title, description, vehicle, image, then bottom-right bookmark', async () => {
  const s = setup(), {PostCard} = s.load('src/features/marketplace/components/PostCard.js');
  await mount(PostCard, {post: fixture, presentation: 'feed'}, async tree => {
    const output = JSON.stringify(tree.toJSON());
    const fields = ['workshop-avatar', 'Fixture Wheels', 'Pretoria', 'SHOWCASE / Wheels', fixture.title, fixture.description, '2024 Toyota Hilux', 'Showcase photo', 'Save post'];
    let previous = -1;
    for (const field of fields) {
      // Accessibility labels can repeat the title before visible copy.
      const index = output.indexOf(field, previous + 1);
      assert.ok(index > previous, `${field} follows the preceding field`);
      previous = index;
    }
    const save = button(tree, 'Save post');
    const footer = tree.root.findAllByType('View').find(node => flatten(node.props.style).justifyContent === 'space-between');
    assert.equal(flatten(footer.props.style).justifyContent, 'space-between');
    assert.equal(footer.findAllByType('Pressable').at(-1), save);
    assert.ok(!button(tree, `View ${fixture.title}`).findAllByType('Pressable').includes(save));
    assert.equal(tree.root.findAllByType('Text').find(n => n.props.children === fixture.description).props.numberOfLines, undefined);
    assert.equal(flatten(tree.root.findByType('Image').props.style).aspectRatio, 4 / 3);
    assert.ok(!output.includes('Verified workshop'));
  });
});

test('feed save waits for acknowledgement, remains separate from detail navigation, and exposes a failed save for retry', async () => {
  const s = setup(), {PostCard} = s.load('src/features/marketplace/components/PostCard.js');
  let acknowledge, stopped = 0;
  s.state.save = () => new Promise(resolve => { acknowledge = resolve; });
  await mount(PostCard, {post: fixture, presentation: 'feed', onOpen: () => s.state.moves.push(['detail'])}, async tree => {
    await act(async () => button(tree, 'Save post').props.onPress({stopPropagation() { stopped++; }}));
    assert.equal(button(tree, 'Save post').props.disabled, true);
    assert.equal(button(tree, 'Save post').props.accessibilityState.selected, false);
    assert.deepEqual(s.state.moves, []);
    await act(async () => acknowledge({}));
    assert.ok(button(tree, 'Unsave post'));
    assert.deepEqual(s.state.saves, [['save', {id: fixture.id, saved: true}, 'fixture-owner']]);
    s.state.save = async () => { throw Error('Network unavailable'); };
    await act(async () => button(tree, 'Unsave post').props.onPress({}));
    assert.equal(button(tree, 'Unsave post').props.disabled, false);
    assert.match(JSON.stringify(tree.toJSON()), /Network unavailable/);
    await act(async () => button(tree, 'View showcase').props.onPress());
    assert.equal(stopped, 1);
    assert.deepEqual(s.state.moves, [['detail']]);
  });
});

test('offline feed disables save and missing media has an honest placeholder; verification requires supplied state', async () => {
  const s = setup(), {PostCard} = s.load('src/features/marketplace/components/PostCard.js');
  s.state.offline = true;
  await mount(PostCard, {post: {...fixture, images: [], shop: {...fixture.shop, verificationStatus: 'approved'}}, presentation: 'feed'}, async tree => {
    assert.equal(button(tree, 'Save post').props.disabled, true);
    assert.match(JSON.stringify(tree.toJSON()), /No project photo available/);
    assert.match(JSON.stringify(tree.toJSON()), /Verified workshop/);
    assert.equal(tree.root.findAllByType('Image').length, 0);
    assert.deepEqual(s.state.saves, []);
  });
});

test('default Customer post presentation stays image-first for saved posts and workshop portfolios', async () => {
  const s = setup(), {PostCard} = s.load('src/features/marketplace/components/PostCard.js');
  await mount(PostCard, {post: fixture}, async tree => {
    const output = JSON.stringify(tree.toJSON());
    assert.ok(output.indexOf('Showcase photo') < output.indexOf('Fixture Wheels'));
    assert.ok(!button(tree, 'View showcase'));
  });
});

test('real posts transport sends only the existing save fields and keeps account checks on retry', async () => {
  let uid = 'fixture-owner', fail = true;
  const calls = [];
  const users = new Map();
  const {postsApi} = loadUI('src/features/marketplace/services/postsApi.js', {
    '../../../shared/services/firebase': {firebase: () => {if(uid&&!users.has(uid))users.set(uid,{uid});return {auth:{currentUser:users.get(uid)||null}};}},
    '../../../shared/services/api': {apiRequest: async (path, payload, options) => {
      assert.equal(path, 'posts');
      assert.deepEqual(Object.keys(payload).sort(), ['id', 'op', 'saved']);
      calls.push({payload, options});
      if (fail) { fail = false; throw Error('Temporary outage'); }
      return {id: payload.id, saved: payload.saved};
    }},
  });
  await assert.rejects(postsApi('save', {id: fixture.id, saved: true}, uid), /Temporary outage/);
  for (const saved of [true, true, false]) {
    assert.deepEqual(await postsApi('save', {id: fixture.id, saved}, uid), {id: fixture.id, saved});
  }
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], {payload: {id: fixture.id, saved: true, op: 'save'}, options: {expectedUid: 'fixture-owner'}});
  uid = 'another-owner';
  await assert.rejects(postsApi('save', {id: fixture.id, saved: true}, 'fixture-owner'), /account changed/);
  uid = null;
  await assert.rejects(postsApi('save', {id: fixture.id, saved: true}), /Sign in/);
  assert.equal(calls.length, 4);
});
