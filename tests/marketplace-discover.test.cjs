const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act} = Renderer;

const posts = [
  {id: 'post-one', authorName: 'Powerpipes AutoART', authorRole: 'shop', type: 'showcase', title: 'Body kit conversion', category: 'Body Kit', serviceCategory: 'Body Kit', city: 'Johannesburg', province: 'Gauteng', createdAt: Date.now()},
  {id: 'post-two', authorName: 'Cape Customs', authorRole: 'shop', type: 'showcase', title: 'Custom wrap', category: 'Wrap & Paint', serviceCategory: 'Wrap & Paint', city: 'Cape Town', province: 'Western Cape', createdAt: Date.now()},
  {id: 'post-three', authorName: 'Durban Tuning', authorRole: 'shop', type: 'showcase', title: 'Stage 2 tuning', category: 'Tuning', serviceCategory: 'Tuning', city: 'Durban', province: 'KwaZulu-Natal', createdAt: Date.now()},
];

function setup() {
  const PrimaryButton = ({title, children, ...props}) => React.createElement('Pressable', {accessibilityLabel: title, ...props}, children || React.createElement('Text', null, title));
  const landing = {
    LandingText: 'Text',
    LandingShell: ({children, onScroll, onLayout, onContentSizeChange}) => React.createElement('View', {onScroll, onLayout, onContentSizeChange}, children),
    LandingButton: PrimaryButton,
    ownerTabs: [],
    ui: {muted: {}, error: {}},
    useLandingFeedback: () => ({showFeature() {}, onClose() {}}),
  };
  const feedCalls = [];
  const screens = loadUI('src/features/customer/screens/OwnerHomeScreen.js', {
    '../../../shared/components/landing/LandingUI': landing,
    '../../../shared/components/landing/FeedControls': {
      FeedSearchInput: props => React.createElement('TextInput', props),
      FeedServicePill: ({title, selected, onPress, disabled}) => React.createElement('Pressable', {accessibilityLabel: title, accessibilityState: {selected}, onPress, disabled}, React.createElement('Text', null, title)),
    },
    '../../auth/context/AuthContext': {useAuth: () => ({user: {uid: 'customer-one'}})},
    '../../marketplace/hooks/usePostsFeed': {usePostsFeed: options => {
      feedCalls.push(options);
      const [items, setItems] = React.useState(posts.slice(0, 2));
      return {items, busy: false, refreshing: false, error: '', refresh: async () => {}, loadNext: () => setItems(posts)};
    }},
    '../../marketplace/components/PostCard': {
      PostCard: ({post, onOpen}) => React.createElement('View', null,
        React.createElement('Text', null, post.authorName),
        React.createElement('Text', null, post.title),
        React.createElement('Pressable', {accessibilityLabel: `View ${post.title}`, onPress: onOpen}, React.createElement('Text', null, 'View')),
      ),
    },
    '../../marketplace/components/MarketplaceUI': {ownerRoutes: {Discover: 'Discover'}},
  });
  return {screens, feedCalls, navigation: {navigate(...args) { this.lastNavigation = args; }}};
}

const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === title);
const text = tree => tree.root.findAllByType('Text').map(node => String(node.props.children || '')).join('\n');
const input = tree => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'Search workshops or services');
const scrollContainer = tree => tree.root.findAllByType('View').find(node => node.props.onScroll);

async function mount() {
  const setupResult = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(setupResult.screens.default, {navigation: setupResult.navigation})); });
  return {...setupResult, tree};
}

test('Discover displays showcase posts and starts with the All service filter', async () => {
  const {tree, feedCalls} = await mount();
  assert.ok(input(tree));
  assert.equal(input(tree).props.placeholder, 'Search workshops or services');
  assert.match(text(tree), /Browse by service/);
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.match(text(tree), /Cape Customs/);
  assert.equal(button(tree, 'All').props.accessibilityState.selected, true);
  assert.equal(feedCalls.at(-1).service, 'All');
  assert.equal(feedCalls.at(-1).q, '');
  await act(async () => tree.unmount());
});

test('Tapping a post navigates to its showcase detail screen', async () => {
  const {tree, navigation} = await mount();
  await act(async () => button(tree, 'View Body kit conversion').props.onPress());
  assert.deepEqual(navigation.lastNavigation, ['PostDetail', {id: 'post-one'}]);
  await act(async () => tree.unmount());
});

test('Search, service, and location filters narrow the same posts feed', async () => {
  const {tree, feedCalls} = await mount();
  await act(async () => input(tree).props.onChangeText('power'));
  await act(async () => new Promise(resolve => setTimeout(resolve, 220)));
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.doesNotMatch(text(tree), /Cape Customs/);
  assert.equal(feedCalls.at(-1).q, 'power');

  await act(async () => input(tree).props.onChangeText(''));
  await act(async () => new Promise(resolve => setTimeout(resolve, 220)));
  await act(async () => button(tree, 'Wrap & Paint').props.onPress());
  assert.match(text(tree), /Cape Customs/);
  assert.doesNotMatch(text(tree), /Powerpipes AutoART/);
  assert.equal(feedCalls.at(-1).service, 'Wrap & Paint');

  await act(async () => button(tree, 'More filters').props.onPress());
  await act(async () => button(tree, 'Cape Town').props.onPress());
  assert.match(text(tree), /Cape Customs/);
  assert.doesNotMatch(text(tree), /Powerpipes AutoART/);
  await act(async () => tree.unmount());
});

test('Feed requests another page only when scrolling near the bottom', async () => {
  const {tree} = await mount();
  const scroller = scrollContainer(tree);
  await act(async () => scroller.props.onScroll({nativeEvent: {
    contentOffset: {y: 0},
    contentSize: {height: 1200},
    layoutMeasurement: {height: 500},
  }}));
  assert.doesNotMatch(text(tree), /Durban Tuning/);
  await act(async () => scroller.props.onScroll({nativeEvent: {
    contentOffset: {y: 900},
    contentSize: {height: 1200},
    layoutMeasurement: {height: 500},
  }}));
  assert.match(text(tree), /Durban Tuning/);
  await act(async () => tree.unmount());
});
