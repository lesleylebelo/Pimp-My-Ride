const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const {act} = Renderer;

const shops = [
  {id: 'shop-one', shopName: 'Powerpipes AutoART', city: 'Johannesburg', province: 'Gauteng', services: 'Body Kit, Paint', verified: true},
  {id: 'shop-two', shopName: 'Cape Customs', city: 'Cape Town', province: 'Western Cape', services: 'Paint', verified: true},
];
const categories = [{id: 'body-kit', name: 'Body Kit'}, {id: 'paint', name: 'Paint'}];

function setup() {
  const PrimaryButton = ({title, children, ...props}) => React.createElement('Pressable', {accessibilityLabel: title, ...props}, children || React.createElement('Text', null, title));
  const landing = {
    LandingText: 'Text',
    LandingShell: ({children}) => React.createElement('View', null, children),
    LandingButton: PrimaryButton,
    ownerTabs: [],
    ui: {muted: {}, error: {}},
    useLandingFeedback: () => ({showFeature() {}, onClose() {}}),
  };
  const screens = loadUI('src/features/customer/screens/OwnerHomeScreen.js', {
    '../../../shared/components/landing/LandingUI': landing,
    '../../marketplace/components/MarketplaceUI': {ownerRoutes: {Discover: 'Discover'}},
    '../../../../assets/landing/discover.png': 'discover.png',
    '../../marketplace/hooks/useMarketData': {
      useMarketData: op => op === 'shops'
        ? {data: {items: shops, cursor: null}, busy: false, error: ''}
        : {data: {items: categories, cursor: null}, busy: false, error: ''},
    },
  });
  return {screens, navigation: {navigate() {}}};
}

const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === title);
const text = tree => tree.root.findAllByType('Text').map(node => String(node.props.children || '')).join('\n');
const input = tree => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === 'Search workshops or services');

test('discover presents community build inspiration beside verified workshop showcases', async () => {
  const {screens, navigation} = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(screens.default, {navigation})); });
  assert.match(text(tree), /Community builds/);
  assert.ok(tree.root.findAllByType('Image').some(node => node.props.accessibilityLabel === 'Example community build inspiration'));
  assert.match(text(tree), /Workshop showcases/);
  assert.match(text(tree), /Verified workshop/);
  await act(async () => tree.unmount());
});

test('community feed like and save controls reflect their local selected state', async () => {
  const {screens, navigation} = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(screens.default, {navigation})); });
  const like = button(tree, 'Like community build');
  const save = button(tree, 'Save community build');
  await act(async () => like.props.onPress());
  await act(async () => save.props.onPress());
  assert.equal(button(tree, 'Unlike community build').props.accessibilityState.selected, true);
  assert.equal(button(tree, 'Remove saved community build').props.accessibilityState.selected, true);
  assert.match(text(tree), /25/);
  await act(async () => tree.unmount());
});

test('location sheet filters shops and combines with search and category filters', async () => {
  const {screens, navigation} = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(screens.default, {navigation})); });
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.match(text(tree), /Cape Customs/);

  await act(async () => button(tree, 'All locations⌄').props.onPress());
  assert.ok(button(tree, 'Johannesburg · Gauteng'));
  await act(async () => button(tree, 'Johannesburg · Gauteng').props.onPress());
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.doesNotMatch(text(tree), /Cape Customs/);

  await act(async () => input(tree).props.onChangeText('body'));
  await act(async () => button(tree, 'Body Kit').props.onPress());
  assert.match(text(tree), /Powerpipes AutoART/);
  assert.doesNotMatch(text(tree), /Cape Customs/);

  await act(async () => button(tree, 'Johannesburg⌄').props.onPress());
  await act(async () => button(tree, 'All locations').props.onPress());
  await act(async () => input(tree).props.onChangeText(''));
  await act(async () => button(tree, 'All').props.onPress());
  assert.match(text(tree), /Cape Customs/);
  await act(async () => tree.unmount());
});

test('more filters updates the shared location and category filters', async () => {
  const {screens, navigation} = setup();
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(screens.default, {navigation})); });
  await act(async () => button(tree, 'All locations⌄').props.onPress());
  await act(async () => button(tree, 'Cape Town · Western Cape').props.onPress());
  await act(async () => button(tree, 'More filters').props.onPress());
  assert.ok(button(tree, 'Gauteng'));
  assert.ok(button(tree, 'Body Kit'));
  await act(async () => button(tree, 'Paint').props.onPress());
  assert.match(text(tree), /Cape Customs/);
  assert.doesNotMatch(text(tree), /Powerpipes AutoART/);
  await act(async () => input(tree).props.onChangeText('power'));
  assert.doesNotMatch(text(tree), /Cape Customs/);
  await act(async () => tree.unmount());
});
