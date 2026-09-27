const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act} = Renderer;

const shops = [
  {id: 'shop-one', shopName: 'Powerpipes AutoART', city: 'Johannesburg', province: 'Gauteng', services: 'Body Kit, Paint', verified: true},
  {id: 'shop-two', shopName: 'Cape Customs', city: 'Cape Town', province: 'Western Cape', services: 'Paint', verified: true},
  {id: 'shop-three', shopName: 'Durban Tuning', city: 'Durban', province: 'KwaZulu-Natal', services: 'Tuning', verified: true},
];
const categories = [{id: 'body-kit', name: 'Body Kit'}, {id: 'paint', name: 'Paint'}, {id: 'tuning', name: 'Tuning'}];
const firstShopPage = {data: {items: shops.slice(0, 2), cursor: 'shop-page-2'}, busy: false, error: ''};
const secondShopPage = {data: {items: shops.slice(2), cursor: null}, busy: false, error: ''};
const categoryPage = {data: {items: categories, cursor: null}, busy: false, error: ''};

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
  const screens = loadUI('src/features/customer/screens/OwnerHomeScreen.js', {
    '../../../shared/components/landing/LandingUI': landing,
    '../../marketplace/components/MarketplaceUI': {ownerRoutes: {Discover: 'Discover'}},
    '../../marketplace/hooks/useMarketData': {
      useMarketData: (op, input = {}) => {
        if (op === 'categories') return categoryPage;
        return input.cursor === 'shop-page-2' ? secondShopPage : firstShopPage;
      },
    },
  });
  return {screens, navigation: {navigate() {}}};
}

const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === title);
const text = tree => tree.root.findAllByType('Text').map(node => String(node.props.children || '')).join('\n');
const input = tree => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'Search workshops or services');
const scrollContainer = tree => tree.root.findAllByType('View').find(node => node.props.onScroll);

async function mount() {
  const {screens, navigation} = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(screens.default, {navigation})); });
  return tree;
}

test('discover has one feed below search and service filters with consistent workshop cards', async () => {
  const tree = await mount();
  assert.ok(input(tree));
  assert.equal(input(tree).props.placeholder, 'Search workshops or services');
  assert.match(text(tree), /Explore workshops and their services/);
  assert.match(text(tree), /Browse by service/);
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.match(text(tree), /Cape Customs/);
  assert.match(text(tree), /Verified workshop/);
  assert.doesNotMatch(text(tree), /Create service request|Community builds|Fresh ideas from the scene|Workshop showcases|First|Page 1|Like community|comments/);
  assert.equal(tree.root.findAllByType('Image').length, 0);
  await act(async () => tree.unmount());
});

test('View opens workshop details and each workshop can be saved independently', async () => {
  const tree = await mount();
  await act(async () => button(tree, 'View Powerpipes AutoART').props.onPress());
  assert.match(text(tree), /Johannesburg/);
  assert.match(text(tree), /Services/);
  assert.match(text(tree), /Body Kit, Paint/);
  await act(async () => button(tree, 'Close').props.onPress());

  await act(async () => button(tree, 'Save Powerpipes AutoART').props.onPress());
  await act(async () => button(tree, 'Save Cape Customs').props.onPress());
  assert.equal(button(tree, 'Unsave Powerpipes AutoART').props.accessibilityState.selected, true);
  assert.equal(button(tree, 'Unsave Cape Customs').props.accessibilityState.selected, true);
  await act(async () => tree.unmount());
});

test('search, service, and location filters apply to the same feed', async () => {
  const tree = await mount();
  await act(async () => input(tree).props.onChangeText('power'));
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.doesNotMatch(text(tree), /Cape Customs/);
  await act(async () => input(tree).props.onChangeText(''));
  await act(async () => button(tree, 'Paint').props.onPress());
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.match(text(tree), /Cape Customs/);
  assert.doesNotMatch(text(tree), /Durban Tuning/);
  await act(async () => button(tree, 'More filters').props.onPress());
  await act(async () => button(tree, 'Gauteng').props.onPress());
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.doesNotMatch(text(tree), /Cape Customs/);
  await act(async () => tree.unmount());
});

test('feed loads the next workshop page when scrolled near the bottom without pagination controls', async () => {
  const tree = await mount();
  const scroller = scrollContainer(tree);
  await act(async () => scroller.props.onScroll({nativeEvent: {
    contentOffset: {y: 900},
    contentSize: {height: 1200},
    layoutMeasurement: {height: 500},
  }}));
  assert.match(text(tree), /Durban Tuning/);
  assert.doesNotMatch(text(tree), /Previous|Next|Page \d/);
  await act(async () => tree.unmount());
});
