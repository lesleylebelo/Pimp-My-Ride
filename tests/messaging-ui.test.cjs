const {test} = require('node:test'), assert = require('node:assert/strict');
const React = require('react'), {act, create} = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const button = (tree, name) => tree.root.findAllByType('Pressable').find(node => node.props.accessibilityLabel === name);
const text = tree => tree.root.findAllByType('Text').map(node => [node.props.children].flat().join('')).join('\n');
const input = tree => tree.root.findByType('TextInput');
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const press = (tree, name) => act(async () => button(tree, name).props.onPress());
const timestamp = new Date(2026, 9, 23, 12).getTime();
const conversation = {id: 'thread', shopName: 'Fixture Workshop', requestTitle: 'Fixture request', serviceRequestId: 'request-1', canSend: true, consent: 'approved', vehicle: {make: 'Fixture make'}, unreadCount: 1, bookingId: 'booking-1', reason: 'Current authorised quotation.'};
const message = (id, senderId = 'shop', createdAt = timestamp, extra = {}) => ({id, text: `Fixture message ${id}`, senderId, sequence: Number(id), createdAt, recipientOrdinal: Number(id), ...extra});
function setup(role = 'owner', platform = 'ios', mode = 'dark') {
  const {palettes} = loadUI('src/shared/theme/colors.js');
  const state = {auth: {user: {uid: role}, profile: {role}, offline: false}, appState: {currentState: 'active'}, focused: true, calls: [], avatarCalls: [], moves: [], refreshes: 0, pages: 0,
    feed: {data: conversation, items: [message('1'), message('2', 'owner')], busy: false, cursor: 'older', error: ''}};
  const mocks = {
    'react-native': {Platform: {OS: platform}, AppState: state.appState},
    '../../../shared/components/landing/LandingUI': {LandingText: 'Text'},
    '../../../shared/theme/ThemeContext': {useTheme: () => ({theme: palettes[mode], isDark: mode === 'dark'})},
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
    '../../auth/services/profilePhotos':{onProfilePhotoChange:()=>()=>{},viewProfilePhoto:async(...args)=>{state.avatarCalls.push(args);return {url:'https://private.example.invalid/customer-avatar',expiresAt:Date.now()+60000};}},
    '@react-navigation/native': {useIsFocused: () => state.focused},
    '../hooks/useMessages': {useMessages: () => ({...state.feed, refresh: async () => {state.refreshes++;}, loadMore: async () => {state.pages++;}})},
    '../services/messageApi': {messageApi: async (op, data) => {state.calls.push({op, data}); return state.reply?.(op, data);}},
  };
  const screens = loadUI('src/features/marketplace/screens/MessagingScreens.js', mocks);
  const navigation = {navigate: (...args) => state.moves.push(args), canGoBack: () => true, goBack: () => state.moves.push(['back'])};
  return {state, screens, navigation};
}
async function mounted(s, screen, run) {
  const Component = s.screens[screen]; let tree;
  const props = {navigation: s.navigation, route: {params: {id: 'thread'}}};
  await act(async () => {tree = create(React.createElement(Component, props));});
  const update = () => act(async () => tree.update(React.createElement(Component, props)));
  try {await run(tree, update);} finally {await act(async () => tree.unmount());}
}

test('both role inboxes show supplied identities, previews, timestamps and accessible unread counts', async () => {
  for (const role of ['owner', 'shop']) {
    const s = setup(role);
    s.state.feed.items = [{...conversation, updatedAt: timestamp, lastMessage: 'Latest supplied message', unreadCount: 102}, {...conversation, id: 'read-thread', updatedAt: timestamp - 1, unreadCount: 0, lastMessage: '', enquiry: 'Supplied enquiry'}];
    await mounted(s, 'MessagesScreen', async (tree, update) => {
      const name = role === 'shop' ? conversation.requestTitle : conversation.shopName;
      assert.ok(button(tree, `Open conversation: ${name}`));
      assert.match(text(tree), /Latest supplied message/); assert.match(text(tree), /Supplied enquiry/);
      assert.match(text(tree), /99\+/); assert.doesNotMatch(text(tree), /undefined|Invalid Date/);
      assert.equal(tree.root.findAllByProps({testID: 'conversation-unread-thread'}).length, 1);
      assert.equal(tree.root.findAllByProps({testID: 'conversation-unread-read-thread'}).length, 0);
      const rows = tree.root.findAllByType('Pressable').filter(n => n.props.accessibilityLabel?.startsWith('Open conversation:'));
      assert.equal(rows[0].props.accessibilityValue.text, '102 unread messages');
      assert.equal(rows[0].findByType('Icon').props.name, role === 'shop' ? 'person-outline' : 'storefront-outline');
      await act(async () => {rows[0].props.onPress(); rows[0].props.onPress();}); assert.deepEqual(s.state.moves, [['Chat', {id: 'thread'}]]);
      s.state.focused = false; await update(); s.state.focused = true; await update();
      await press(tree, 'Go back'); assert.deepEqual(s.state.moves.at(-1), ['back']);
      assert.equal(s.state.calls.length, 0);
    });
  }
});

test('inbox state feedback and refresh/pagination controls follow the existing hook', async () => {
  const s = setup(); s.state.feed = {...s.state.feed, items: [], busy: true};
  await mounted(s, 'MessagesScreen', async (tree, update) => {
    assert.match(text(tree), /Loading conversations/); assert.doesNotMatch(text(tree), /No conversations yet/);
    s.state.feed.busy = false; await update(); assert.match(text(tree), /No conversations yet/);
    s.state.feed.error = 'Permission denied'; await update(); assert.match(text(tree), /Permission denied/); assert.doesNotMatch(text(tree), /No conversations yet/);
    await press(tree, 'Refresh messages'); assert.equal(s.state.refreshes, 1);
    s.state.feed.error = ''; s.state.feed.items = [{...conversation, updatedAt: timestamp}]; await update();
    const list = tree.root.findByType('FlatList');
    assert.equal(list.props.initialNumToRender, 14); assert.equal(list.props.windowSize, 7);
    await act(async () => list.props.onRefresh()); assert.equal(s.state.refreshes, 2);
    await act(async () => list.props.onEndReached()); assert.equal(s.state.pages, 1);
    s.state.feed.busy = true; await update(); assert.equal(tree.root.findByType('FlatList').props.refreshing, true);
    s.state.auth.offline = true; await update(); assert.match(text(tree), /Connect to view messages/);
    assert.equal(tree.root.findAllByType('Pressable').filter(n => n.props.accessibilityLabel?.startsWith('Open conversation:')).length, 0);
    assert.equal(button(tree, 'Refresh messages').props.disabled, true);
  });
});

test('incoming and outgoing bubbles group consecutive dates without truncating long messages', async () => {
  for (const role of ['owner', 'shop']) {
    const s = setup(role);
    const long = 'Long fixture description. '.repeat(80);
    s.state.feed.items = [message('1', 'other', timestamp - 86400000), message('2', role, timestamp, {text: long}), message('3', 'other', timestamp + 1000)];
    await mounted(s, 'ChatScreen', async tree => {
      const list = tree.root.findByType('FlatList');
      assert.equal(list.props.inverted, true); assert.deepEqual(list.props.maintainVisibleContentPosition, {minIndexForVisible: 0, autoscrollToTopThreshold: 80});
      assert.equal(tree.root.findAllByProps({testID: 'outgoing-bubble'}).length, 1); assert.equal(tree.root.findAllByProps({testID: 'incoming-bubble'}).length, 2);
      const outgoing = tree.root.findByProps({testID: 'outgoing-bubble'}), incoming = tree.root.findAllByProps({testID: 'incoming-bubble'})[0];
      assert.notEqual(style(outgoing.props.style).backgroundColor, style(incoming.props.style).backgroundColor);
      assert.equal(outgoing.parent.props.style[1].alignItems, 'flex-end'); assert.equal(style(outgoing.props.style).maxWidth, '86%');
      assert.equal(tree.root.findAllByType('Text').find(n => n.props.children === long).props.numberOfLines, undefined);
      assert.equal(tree.root.findAllByType('Text').filter(n => n.props.accessibilityRole === 'header').length, 3);
      assert.match(text(tree), /SAST/); assert.equal(s.state.calls.length, 0);
    });
  }
});

test('composer uses platform keyboard layout, web Enter/Shift+Enter and composition safeguards', async () => {
  for (const platform of ['ios', 'android', 'web']) {
    const s = setup('owner', platform);
    await mounted(s, 'ChatScreen', async tree => {
      const keyboard = tree.root.findByType('KeyboardAvoidingView');
      assert.equal(keyboard.props.behavior, platform === 'ios' ? 'padding' : platform === 'android' ? 'height' : undefined);
      assert.equal(button(tree, 'Send message').props.disabled, true);
      assert.equal(input(tree).props.multiline, true); assert.equal(input(tree).props.maxLength, 2000);
      assert.equal(tree.root.findByType('FlatList').props.keyboardShouldPersistTaps, 'handled');
      await act(async () => input(tree).props.onFocus()); assert.ok(input(tree).props.style[1]);
      await act(async () => input(tree).props.onChangeText('  Fixture reply  '));
      const key = nativeEvent => ({nativeEvent, preventDefault() {this.prevented = true;}});
      for (const event of [{key: 'Enter', shiftKey: true}, {key: 'Enter', isComposing: true}, {key: 'Enter', keyCode: 229}]) {
        await act(async () => input(tree).props.onKeyPress(key(event))); assert.equal(s.state.calls.length, 0);
      }
      const enter = key({key: 'Enter'}); await act(async () => input(tree).props.onKeyPress(enter));
      if (platform === 'web') {assert.equal(enter.prevented, true); assert.equal(s.state.calls[0].data.text, 'Fixture reply'); assert.equal(input(tree).props.value, '');}
      else {assert.equal(s.state.calls.length, 0); await press(tree, 'Send message'); assert.equal(s.state.calls[0].data.text, 'Fixture reply');}
      assert.equal(button(tree, 'Send message').findByType('Icon').props.name, 'send');
    });
  }
});

test('chat keeps request and booking destinations, explicit read counters and role-specific consent controls', async () => {
  for (const role of ['owner', 'shop']) {
    const s = setup(role);
    await mounted(s, 'ChatScreen', async (tree, update) => {
      await press(tree, 'View related request'); assert.deepEqual(s.state.moves, [[role === 'shop' ? 'ShopRequest' : 'OwnerRequest', {id: 'request-1'}]]);
      s.state.focused = false; await update(); s.state.focused = true; await update();
      await press(tree, 'Conversation details'); assert.match(text(tree), /Fixture make/);
      assert.equal(!!button(tree, 'Revoke communication'), role === 'owner');
      await press(tree, 'Mark displayed messages read'); assert.equal(s.state.calls[0].op, 'read'); assert.equal(s.state.calls[0].data.through, role === 'owner' ? 1 : 2);
      await press(tree, 'View related booking'); assert.deepEqual(s.state.moves.at(-1), ['BookingDetail', {id: 'booking-1'}]);
      assert.equal(button(tree, 'Revoke communication'), undefined);
    });
  }
});

test('offline, rejected, revoked, expired, denied, background and blur states reject sends', async () => {
  for (const restriction of ['offline', 'rejected', 'revoked', 'expired', 'denied', 'background', 'blur']) {
    const s = setup();
    if (restriction === 'offline') s.state.auth.offline = true;
    if (restriction === 'blur') s.state.focused = false;
    if (restriction === 'background') s.state.appState.currentState = 'background';
    if (restriction === 'expired') s.state.feed.data = {...conversation, expiresAt: Date.now() - 1};
    if (restriction === 'denied') s.state.feed.error = 'Permission denied';
    if (['revoked', 'rejected'].includes(restriction)) s.state.feed.data = {...conversation, consent: restriction, canSend: false};
    await mounted(s, 'ChatScreen', async tree => {
      if (restriction !== 'background') assert.equal(input(tree).props.editable, false);
      await act(async () => input(tree).props.onChangeText('Cannot send')); await press(tree, 'Send message'); assert.equal(s.state.calls.length, 0);
    });
  }
});

test('chat loading and denied responses keep feedback and retry available without a composer', async () => {
  const s = setup(); s.state.feed = {...s.state.feed, data: null, items: [], busy: true};
  await mounted(s, 'ChatScreen', async (tree, update) => {
    assert.match(text(tree), /Loading conversation/); assert.equal(tree.root.findAllByType('TextInput').length, 0);
    s.state.feed.busy = false; s.state.feed.error = 'Permission denied for this conversation'; await update();
    assert.match(text(tree), /Permission denied/); assert.equal(tree.root.findAllByType('TextInput').length, 0);
    assert.doesNotMatch(text(tree), /No messages yet/);
    await press(tree, 'Refresh conversation'); assert.equal(s.state.refreshes, 1);
    s.state.feed.error = ''; s.state.feed.data = conversation; await update(); assert.match(text(tree), /No messages yet/);
  });
});

test('consent failures remain visible inside details and failed operations never change permissions locally', async () => {
  const s = setup(); s.state.feed.data = {...conversation, canSend: false, consent: 'pending'};
  s.state.reply = async () => {throw Error('Approval was not saved');};
  await mounted(s, 'ChatScreen', async tree => {
    await press(tree, 'Conversation details'); await press(tree, 'Approve communication');
    const modal = tree.root.findByType('Modal');
    assert.ok(modal.findAllByType('Text').some(t => t.props.children === 'Approval was not saved'));
    assert.equal(input(tree).props.editable, false); assert.equal(s.state.calls[0].data.decision, 'approved');
  });
});

test('large histories paginate without allowing a second request while busy and preserve route isolation', async () => {
  const s = setup(); s.state.feed.items = Array.from({length: 400}, (_, i) => message(String(i + 1)));
  await mounted(s, 'ChatScreen', async (tree, update) => {
    assert.equal(tree.root.findByType('FlatList').props.initialNumToRender, 20);
    await act(async () => tree.root.findByType('FlatList').props.onEndReached()); assert.equal(s.state.pages, 1);
    s.state.feed.busy = true; await update(); await act(async () => tree.root.findByType('FlatList').props.onEndReached()); assert.equal(s.state.pages, 1);
    s.state.feed.busy = false; await update(); await press(tree, 'Load older messages'); assert.equal(s.state.pages, 2);
    await act(async () => input(tree).props.onChangeText('Private draft'));
    await act(async () => tree.update(React.createElement(s.screens.ChatScreen, {navigation: s.navigation, route: {params: {id: 'different-request-thread'}}})));
    assert.equal(input(tree).props.value, '');
  });
});

function luminance(hex) {const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
test('both themes retain accessible bubble contrast, safe areas and comfortable send/back targets', async () => {
  for (const mode of ['light', 'dark']) {
    const s = setup('owner', 'ios', mode);
    await mounted(s, 'ChatScreen', async tree => {
      assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges, ['top', 'bottom', 'left', 'right']);
      for (const type of ['incoming-bubble', 'outgoing-bubble']) {
        const bubble = tree.root.findByProps({testID: type}), bg = style(bubble.props.style).backgroundColor;
        for (const t of bubble.findAllByType('Text')) assert.ok(contrast(style(t.props.style).color, bg) >= 4.5);
      }
      const send = button(tree, 'Send message'); assert.equal(send.props.style({pressed: false})[0].minHeight, 48);
      assert.equal(button(tree, 'Go back').props.style({pressed: false})[0].width, 44);
      assert.equal(tree.root.findByType('FlatList').findAllByType('TextInput').length, 0);
      assert.equal(tree.root.findByType('KeyboardAvoidingView').findAllByType('TextInput').length, 1);
    });
  }
});

test('message date helpers identify calendar groups, missing dates and readable times', () => {
  const {messageDate, messageTime} = loadUI('src/features/marketplace/components/MessagingUI.js', {'../../../shared/components/landing/LandingUI': {LandingText: 'Text'}});
  assert.equal(messageDate(timestamp, timestamp), 'Today'); assert.equal(messageDate(timestamp - 86400000, timestamp), 'Yesterday');
  assert.match(messageDate(timestamp - 2 * 86400000, timestamp), /2026/);
  assert.equal(messageDate(null), 'Date unavailable'); assert.equal(messageTime(NaN), 'Time unavailable'); assert.match(messageTime(timestamp), /SAST/);
});

test('the existing polling hook orders inbox activity newest first while keeping separate request threads', async () => {
  let feed;
  const {useMessages} = loadUI('src/features/marketplace/hooks/useMessages.js', {
    '../../auth/context/AuthContext': {useAuth: () => ({user: {uid: 'owner'}, offline: false})},
    '../services/messageApi': {messageApi: async () => ({items: [{...conversation, id: 'older', updatedAt: 1}, {...conversation, id: 'newer', serviceRequestId: 'request-2', updatedAt: 3}, {...conversation, id: 'middle', updatedAt: 2}], cursor: null})},
  });
  function Harness() {feed = useMessages(); return null;}
  let tree; await act(async () => {tree = create(React.createElement(Harness));});
  try {assert.deepEqual(feed.items.map(i => i.id), ['newer', 'middle', 'older']); assert.equal(feed.items[0].serviceRequestId, 'request-2'); assert.equal(feed.items[1].serviceRequestId, 'request-1');}
  finally {await act(async () => tree.unmount());}
});

test('workshop inbox and chat use the authorized customer avatar and discard it when conversation permission is revoked',async()=>{
 const s=setup('shop'),author={...conversation,avatar:{context:'conversation',id:'thread',revision:2}};
 s.state.feed={...s.state.feed,data:author,items:[author]};
 await mounted(s,'MessagesScreen',async tree=>{assert.equal(tree.root.findAllByType('Image').length,1);assert.deepEqual(s.state.avatarCalls[0].slice(0,4),['conversation','thread','shop',2]);});
 s.state.feed={...s.state.feed,items:[message('1')]};
 await mounted(s,'ChatScreen',async(tree,update)=>{assert.equal(tree.root.findAllByType('Image').length,1);s.state.feed={...s.state.feed,data:{...author,canSend:false,consent:'revoked',avatar:null}};await update();assert.equal(tree.root.findAllByType('Image').length,0);});
});
