const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const act = Renderer.act;
const booking = {id: 'booking-1', ownerId: 'owner-1', shopId: 'shop-1', serviceRequestId: 'request-1', quoteId: 'quote-1', shopName: 'Approved shop', requestTitle: 'Restore bonnet', vehicle: {make: 'Ford', model: 'Fiesta', year: 2015, colour: 'Blue'}, categoryName: 'Paint', city: 'Pretoria', scope: 'Prepare and repaint bonnet', items: [{description: 'Materials and labour', amountCents: 12345}], totalCents: 12345, currency: 'ZAR', completionDays: 7, warranty: 'Six months on paint', status: 'pending_confirmation'};
function setup(overrides = {}) {
  const state = {auth: {user: {uid: 'shop-1'}, profile: {role: 'shop'}, offline: false}, data: {booking}, busy: false, error: '', calls: [], reads: [], navigations: [], api: async () => ({id: booking.id}), refresh: async () => ({}), ...overrides};
  const PrimaryButton = loadUI('src/shared/components/PrimaryButton.js').default;
  const landing = {LandingText: 'Text', LandingShell: ({children, onScroll, onLayout, onContentSizeChange}) => React.createElement('View', {onScroll, onLayout, onContentSizeChange}, children), LandingButton: PrimaryButton, ownerTabs: [], shopTabs: [], ui: {}, useLandingFeedback: () => ({showFeature() {}})};
  const screens = loadUI('src/features/marketplace/screens/BookingScreens.js', {
    '../../auth/context/AuthContext': {useAuth: () => state.auth},
    '../components/PhotoGallery': props => React.createElement('PhotoGallery', props),
    '../../../shared/components/landing/LandingUI': landing,
    '../hooks/useMarketData': {useMarketData: (op, input) => {state.reads.push({op, input}); return {data: state.data, busy: state.busy, error: state.error, refresh: (...args) => state.refresh(...args)};}},
    '../services/marketApi': {marketApi: async (op, input) => {state.calls.push({op, input}); return state.api(op, input);}},
  });
  const navigation = {navigate: (...args) => state.navigations.push(args)};
  return {state, screens, navigation};
}
const button = (tree, title) => tree.root.findAllByType('Pressable').find(node => node.findAllByType('Text').some(text => text.props.children === title));
const input = (tree, label) => tree.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label);
const text = tree => tree.root.findAllByType('Text').map(node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children).join('\n');
async function change(tree, label, value) {await act(async () => input(tree, label).props.onChangeText(value));}
async function mount(Screen, props) {let tree; await act(async () => {tree = Renderer.create(React.createElement(Screen, props));}); return tree;}
const detailProps = navigation => ({navigation, route: {params: {id: booking.id}}});
async function appointment(tree) {
  await change(tree, 'Appointment date (YYYY-MM-DD)', '2099-01-02');
  await change(tree, 'Appointment time (HH:mm, SAST)', '14:30');
}

test('bookings list loads on scroll, navigates by identifier, resets across accounts and handles empty, offline, loading and retry', async () => {
  let refreshes = 0;
  const {state, screens, navigation} = setup({data: {items: [booking], cursor: 'page-2'}, refresh: async () => {refreshes++; throw Error('Retry unavailable');}});
  const props = {navigation}, tree = await mount(screens.BookingsScreen, props);
  assert.deepEqual(state.reads.at(-1), {op: 'bookings', input: {cursor: null}});
  assert.match(text(tree), /Awaiting shop confirmation/);
  assert.match(text(tree), /Accepted total: R123.45/);
  await act(async () => button(tree, 'View booking').props.onPress());
  assert.deepEqual(state.navigations, [['BookingDetail', {id: booking.id}]]);
  const scroller=tree.root.findAllByType('View').find(node=>node.props.onScroll);
  await act(async()=>scroller.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:500}}}));
  assert.equal(state.reads.at(-1).input.cursor,'page-2');
  assert.equal(button(tree,'Next'),undefined);
  state.data = {items: [], cursor: null};
  state.auth = {...state.auth, user: {uid: 'shop-2'}};
  await act(async () => tree.update(React.createElement(screens.BookingsScreen, props)));
  assert.equal(state.reads.at(-1).input.cursor, null);
  assert.match(text(tree), /No bookings yet/);
  await act(async () => button(tree, 'Refresh bookings').props.onPress());
  assert.equal(refreshes, 1);
  state.data = null; state.error = 'Could not load bookings';
  await act(async () => tree.update(React.createElement(screens.BookingsScreen, props)));
  assert.match(text(tree), /Could not load bookings/);
  state.busy = true;
  await act(async () => tree.update(React.createElement(screens.BookingsScreen, props)));
  assert.equal(button(tree, 'Refresh bookings').props.disabled, true);
  assert.match(text(tree), /Loading/);
  state.auth = {...state.auth, offline: true}; state.data = {items: [booking], cursor: 'page-2'}; state.busy = false;
  await act(async () => tree.update(React.createElement(screens.BookingsScreen, props)));
  assert.match(text(tree), /Connect to the internet/);
  assert.equal(button(tree, 'View booking'), undefined);
  assert.equal(button(tree, 'Next'),undefined);
  await act(async () => tree.unmount());
});

test('booking detail reloads the identifier, presents accepted terms, and gives appointment controls only to the shop', async () => {
  const {state, screens, navigation} = setup({auth: {user: {uid: 'owner-1'}, profile: {role: 'owner'}, offline: false}});
  const props = {...detailProps(navigation), route: {params: {id: booking.id, booking: {...booking, status: 'confirmed'}}}};
  const tree = await mount(screens.BookingDetailScreen, props);
  assert.deepEqual(state.reads.at(-1), {op: 'booking', input: {id: booking.id}});
  assert.match(text(tree), /Awaiting shop confirmation/);
  assert.match(text(tree), /Prepare and repaint bonnet/);
  assert.match(text(tree), /Materials and labour/);
  assert.match(text(tree), /Total: R123.45/);
  assert.match(text(tree), /7 working days/);
  assert.match(text(tree), /Six months on paint/);
  assert.equal(button(tree, 'Confirm booking'), undefined);
  assert.ok(button(tree, 'Cancel booking'));
  state.auth = {...state.auth, user: {uid: 'shop-1'}, profile: {role: 'shop'}};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  assert.ok(button(tree, 'Confirm booking'));
  state.data = {booking: {...booking, status: 'confirmed', appointmentDate: '2099-01-02', appointmentTime: '14:30'}};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  assert.equal(button(tree, 'Confirm booking'), undefined);
  assert.match(text(tree), /2099-01-02 at 14:30 SAST \(UTC\+02:00\)/);
  await act(async () => tree.unmount());
});

test('appointment confirmation validates calendar, time and future SAST instant, locks duplicates, and preserves a failed draft', async () => {
  let reject;
  const {state, screens, navigation} = setup({api: () => new Promise((_, fail) => {reject = fail;})});
  const tree = await mount(screens.BookingDetailScreen, detailProps(navigation));
  await act(async () => button(tree, 'Confirm booking').props.onPress());
  assert.equal(state.calls.length, 0);
  assert.match(text(tree), /Appointment date is required/);
  assert.match(text(tree), /Appointment time is required/);
  await change(tree, 'Appointment date (YYYY-MM-DD)', '2099-02-30');
  await change(tree, 'Appointment time (HH:mm, SAST)', '25:61');
  assert.match(text(tree), /Enter a valid date/);
  assert.match(text(tree), /valid 24-hour time/);
  await act(async () => button(tree, 'Confirm booking').props.onPress());
  assert.equal(state.calls.length, 0);
  await change(tree, 'Appointment date (YYYY-MM-DD)', '2000-01-01');
  await change(tree, 'Appointment time (HH:mm, SAST)', '14:30');
  assert.match(text(tree), /Choose a future appointment/);
  await act(async () => button(tree, 'Confirm booking').props.onPress());
  assert.equal(state.calls.length, 0);
  await appointment(tree);
  let pending;
  await act(async () => {const confirm = button(tree, 'Confirm booking').props.onPress; pending = confirm(); void confirm();});
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0], {op: 'bookingConfirm', input: {id: booking.id, appointmentDate: '2099-01-02', appointmentTime: '14:30'}});
  assert.equal(input(tree, 'Cancellation reason').props.editable, false);
  await act(async () => {reject(Error('The other account is unavailable.')); await pending;});
  assert.match(text(tree), /The other account is unavailable/);
  assert.equal(input(tree, 'Appointment date (YYYY-MM-DD)').props.value, '2099-01-02');
  assert.equal(input(tree, 'Appointment time (HH:mm, SAST)').props.value, '14:30');
  state.api = async () => ({id: booking.id});
  state.refresh = async () => {state.data = null; throw Error('Reload failed');};
  await act(async () => button(tree, 'Confirm booking').props.onPress());
  assert.equal(state.calls.length, 2);
  assert.match(text(tree), /Booking confirmed. Refresh to load the latest details/);
  assert.match(text(tree), /2099-01-02 at 14:30 SAST/);
  assert.equal(button(tree, 'Confirm booking'), undefined);
  assert.ok(button(tree, 'Cancel booking'));
  await act(async () => tree.unmount());
});

test('cancellation requires a reason, confirms once, preserves errors and retains acknowledged cancellation if refresh fails', async () => {
  let reject, resolve;
  const {state, screens, navigation} = setup({auth: {user: {uid: 'owner-1'}, profile: {role: 'owner'}, offline: false}, api: () => new Promise((success, fail) => {resolve = success; reject = fail;}), refresh: async () => {state.data = null; throw Error('Reload failed');}});
  const tree = await mount(screens.BookingDetailScreen, detailProps(navigation));
  await act(async () => button(tree, 'Cancel booking').props.onPress());
  await act(async () => button(tree, 'Cancel').props.onPress());
  assert.equal(state.calls.length, 0);
  await act(async () => button(tree, 'Cancel booking').props.onPress());
  await act(async () => button(tree, 'Confirm').props.onPress());
  assert.match(text(tree), /A cancellation reason is required/);
  assert.equal(state.calls.length, 0);
  await act(async () => button(tree, 'Cancel').props.onPress());
  await change(tree, 'Cancellation reason', 'x'.repeat(501));
  assert.match(text(tree), /500 characters or fewer/);
  await change(tree, 'Cancellation reason', '  Plans have changed  ');
  await act(async () => button(tree, 'Cancel booking').props.onPress());
  let pending;
  await act(async () => {const confirm = button(tree, 'Confirm').props.onPress; pending = confirm(); void confirm();});
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0], {op: 'bookingCancel', input: {id: booking.id, reason: 'Plans have changed'}});
  await act(async () => {reject(Error('Connection lost. Please retry.')); await pending;});
  assert.match(text(tree), /Connection lost/);
  assert.equal(tree.root.findAllByType('Modal').length, 1);
  assert.equal(input(tree, 'Cancellation reason').props.value, '  Plans have changed  ');
  await act(async () => {pending = button(tree, 'Confirm').props.onPress();});
  await act(async () => {resolve({id: booking.id}); await pending;});
  assert.match(text(tree), /Booking cancelled. Refresh to load the latest details/);
  assert.match(text(tree), /Cancelled by: Customer/);
  assert.match(text(tree), /Reason: Plans have changed/);
  assert.match(text(tree), /Total: R123.45/);
  assert.equal(button(tree, 'Cancel booking'), undefined);
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  assert.equal(state.calls.length, 2);
  await act(async () => tree.unmount());
});

test('confirmed booking cancellation is available to the shop, and cancelled bookings expose no mutation controls', async () => {
  const {state, screens, navigation} = setup({data: {booking: {...booking, status: 'confirmed', appointmentDate: '2099-01-02', appointmentTime: '14:30'}}});
  const props = detailProps(navigation), tree = await mount(screens.BookingDetailScreen, props);
  assert.equal(button(tree, 'Confirm booking'), undefined);
  await change(tree, 'Cancellation reason', 'Workshop unavailable');
  await act(async () => button(tree, 'Cancel booking').props.onPress());
  await act(async () => button(tree, 'Confirm').props.onPress());
  assert.match(text(tree), /Cancelled by: Shop/);
  assert.equal(button(tree, 'Cancel booking'), undefined);
  state.data = {booking: {...booking, status: 'cancelled', cancelledByRole: 'owner', cancellationReason: 'Changed requirements'}};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  assert.match(text(tree), /Changed requirements/);
  assert.equal(button(tree, 'Cancel booking'), undefined);
  assert.equal(button(tree, 'Confirm booking'), undefined);
  await act(async () => tree.unmount());
});

test('offline details hide terms, block stale handlers, and recover the draft on reconnection', async () => {
  const {state, screens, navigation} = setup();
  const props = detailProps(navigation), tree = await mount(screens.BookingDetailScreen, props);
  await appointment(tree);
  await change(tree, 'Cancellation reason', 'Draft reason');
  state.auth = {...state.auth, offline: true};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  assert.match(text(tree), /Connect to the internet/);
  assert.doesNotMatch(text(tree), /Prepare and repaint bonnet/);
  assert.equal(button(tree, 'Confirm booking'), undefined);
  assert.equal(button(tree, 'Cancel booking'), undefined);
  assert.equal(button(tree, 'Refresh booking').props.disabled, true);
  assert.equal(state.calls.length, 0);
  state.auth = {...state.auth, offline: false};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  assert.equal(input(tree, 'Appointment date (YYYY-MM-DD)').props.value, '2099-01-02');
  assert.equal(input(tree, 'Cancellation reason').props.value, 'Draft reason');
  await act(async () => tree.unmount());
});

test('account and booking changes reset drafts and suppress a delayed mutation result', async () => {
  let release;
  const {state, screens, navigation} = setup({api: () => new Promise(resolve => {release = resolve;})});
  const props = detailProps(navigation), tree = await mount(screens.BookingDetailScreen, props);
  await appointment(tree);
  await change(tree, 'Cancellation reason', 'Old account draft');
  let pending;
  await act(async () => {pending = button(tree, 'Confirm booking').props.onPress();});
  state.auth = {...state.auth, user: {uid: 'another-shop'}};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  await act(async () => {release({id: booking.id}); await pending;});
  assert.equal(input(tree, 'Appointment date (YYYY-MM-DD)').props.value, '');
  assert.equal(input(tree, 'Cancellation reason').props.value, '');
  assert.doesNotMatch(text(tree), /Booking confirmed\./);
  await appointment(tree);
  await change(tree, 'Cancellation reason', 'Old booking draft');
  const another = {...props, route: {params: {id: 'booking-2'}}};
  state.data = {booking: {...booking, id: 'booking-2'}};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, another)));
  assert.equal(state.reads.at(-1).input.id, 'booking-2');
  assert.equal(input(tree, 'Appointment date (YYYY-MM-DD)').props.value, '');
  assert.equal(input(tree, 'Cancellation reason').props.value, '');
  await act(async () => tree.unmount());
});

test('appointment validation uses SAST at the exact current-time boundary rather than the device timezone', () => {
  const {appointmentErrors, cancellationError} = loadUI('src/features/marketplace/utils/bookingValidation.js');
  const now = Date.parse('2030-04-05T12:30:00Z');
  assert.deepEqual(appointmentErrors({appointmentDate: '2030-04-05', appointmentTime: '14:31'}, now), {});
  assert.match(appointmentErrors({appointmentDate: '2030-04-05', appointmentTime: '14:30'}, now).appointmentTime, /future/);
  assert.match(appointmentErrors({appointmentDate: '2030-04-05', appointmentTime: '14:29'}, now).appointmentTime, /future/);
  assert.match(appointmentErrors({appointmentDate: '2030-02-29', appointmentTime: '10:00'}, now).appointmentDate, /valid date/);
  assert.equal(appointmentErrors({appointmentDate: '2032-02-29', appointmentTime: '10:00'}, now).appointmentDate, undefined);
  assert.match(cancellationError('   '), /required/);
  assert.equal(cancellationError('x'.repeat(500)), '');
  assert.match(cancellationError('x'.repeat(501)), /500/);
});

test('booking photo galleries reference the accepted request for both parties and disappear offline',async()=>{
 for(const role of ['owner','shop']){
  const withPhotos={...booking,photoIds:['accepted-photo'],status:'cancelled'},auth={user:{uid:`${role}-1`},profile:{role},offline:false};
  const {state,screens,navigation}=setup({auth,data:{booking:withPhotos}}),props=detailProps(navigation),tree=await mount(screens.BookingDetailScreen,props);
  const gallery=tree.root.findByType('PhotoGallery');assert.equal(gallery.props.target,'request');assert.equal(gallery.props.id,booking.serviceRequestId);assert.notEqual(gallery.props.id,booking.id);assert.notEqual(gallery.props.editable,true);assert.equal(gallery.props.onSelectionChange,undefined);
  state.auth={...state.auth,offline:true};await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));assert.equal(tree.root.findAllByType('PhotoGallery').length,0);
  state.auth={...state.auth,offline:false};state.data={booking:{...booking,photoIds:[]}};await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));assert.equal(tree.root.findAllByType('PhotoGallery').length,0);
  assert.equal(state.calls.length,0);await act(async()=>tree.unmount());
 }
});
