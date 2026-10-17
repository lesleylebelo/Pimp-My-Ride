const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react'), Renderer = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const act = Renderer.act;
const booking = {id: 'booking-1', ownerId: 'owner-1', shopId: 'shop-1', serviceRequestId: 'request-1', quoteId: 'quote-1', shopName: 'Approved shop', requestTitle: 'Restore bonnet', vehicle: {make: 'Ford', model: 'Fiesta', year: 2015, colour: 'Blue'}, categoryName: 'Paint', city: 'Pretoria', scope: 'Prepare and repaint bonnet', items: [{description: 'Materials and labour', amountCents: 12345}], totalCents: 12345, currency: 'ZAR', completionDays: 7, warranty: 'Six months on paint', status: 'pending_confirmation'};
function setup(overrides = {}) {
  const state = {auth: {user: {uid: 'shop-1'}, profile: {role: 'shop'}, offline: false}, data: {booking}, busy: false, error: '', calls: [], reads: [], navigations: [], api: async op => ({id: booking.id,...(['paymentRetry','paymentStart'].includes(op)?{paymentAttemptId:'attempt-2'}:{})}), refresh: async () => ({}), ...overrides};
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
const lastRead = (state, op) => state.reads.filter(read => read.op === op).at(-1);
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
  assert.deepEqual(lastRead(state, 'bookings'), {op: 'bookings', input: {cursor: null}});
  assert.match(text(tree), /Awaiting shop confirmation/);
  assert.match(text(tree), /Accepted total: R123.45/);
  await act(async () => button(tree, 'View booking').props.onPress());
  assert.deepEqual(state.navigations, [['BookingDetail', {id: booking.id}]]);
  const scroller=tree.root.findAllByType('View').find(node=>node.props.onScroll);
  await act(async()=>scroller.props.onScroll({nativeEvent:{contentOffset:{y:900},contentSize:{height:1200},layoutMeasurement:{height:500}}}));
  assert.equal(lastRead(state, 'bookings').input.cursor,'page-2');
  assert.equal(button(tree,'Next'),undefined);
  state.data = {items: [], cursor: null};
  state.auth = {...state.auth, user: {uid: 'shop-2'}};
  await act(async () => tree.update(React.createElement(screens.BookingsScreen, props)));
  assert.equal(lastRead(state, 'bookings').input.cursor, null);
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
  assert.match(text(tree), /Simulated amount paid: R0.00/);
  assert.match(text(tree), /Outstanding balance: R123.45/);
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

test('failed online simulations retry through the test API with an explicit attempt and no client amount', async () => {
  const failedBooking = {...booking, status: 'pending_payment', paymentMethod: 'pay_now', paymentStatus: 'failed',currentPaymentAttemptId:'attempt-1'};
  const {state, screens, navigation} = setup({
    auth: {user: {uid: 'owner-1'}, profile: {role: 'owner'}, offline: false},
    data: {booking: failedBooking, paymentAttempts: [{id:'attempt-1',status:'failed',amountCents:12345}], testEmailEvents: []},
  });
  const tree = await mount(screens.BookingDetailScreen, detailProps(navigation));
  await act(async () => button(tree, 'Retry simulated payment').props.onPress());
  assert.deepEqual(state.calls, [
    {op: 'paymentRetry', input: {id: booking.id}},
  ]);
  assert.match(text(tree), /Test payment attempt opened/);
  state.data={booking:{...failedBooking,currentPaymentAttemptId:'attempt-2'},currentPaymentAttempt:{id:'attempt-2',status:'pending',amountCents:12345,currency:'ZAR'},paymentAttempts:[]};
  await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,detailProps(navigation))));
  await act(async()=>button(tree,'Simulate successful payment').props.onPress());
  assert.deepEqual(state.calls.at(-1),{op:'paymentMockResult',input:{id:booking.id,paymentAttemptId:'attempt-2',expectedBookingId:booking.id,expectedAmountCents:12345,expectedCurrency:'ZAR',outcome:'successful'}});
  assert.match(text(tree), /no real payment was processed/i);
  await act(async () => tree.unmount());
});

test('booking detail displays the accepted deposit and lets an owner settle only the saved pending attempt',async()=>{
  const partial={...booking,status:'pending_confirmation',paymentStatus:'partially_paid',paymentMethod:'pay_deposit',depositType:'fixed',depositValue:2500,depositAmountCents:2500,paidCents:2500,balanceDueCents:9845,currentPaymentAttemptId:'balance-attempt'};
  const {state,screens,navigation}=setup({
    auth:{user:{uid:'owner-1'},profile:{role:'owner'},offline:false},
    data:{booking:partial,paymentAttempts:[{id:'balance-attempt',status:'pending',kind:'balance',amountCents:9845,currency:'ZAR'}],testEmailEvents:[]},
  });
  const tree=await mount(screens.BookingDetailScreen,detailProps(navigation));
  assert.match(text(tree),/Accepted required deposit/);assert.match(text(tree),/Simulated amount paid: R25.00/);
  assert.match(text(tree),/Outstanding balance: R98.45/);assert.match(text(tree),/Payment status: Partially paid/);
  await act(async()=>button(tree,'Simulate successful payment').props.onPress());
  assert.deepEqual(state.calls,[{op:'paymentMockResult',input:{id:booking.id,paymentAttemptId:'balance-attempt',expectedBookingId:booking.id,expectedAmountCents:9845,expectedCurrency:'ZAR',outcome:'successful'}}]);
  assert.doesNotMatch(JSON.stringify(state.calls),/amountCents/);
  await act(async()=>tree.unmount());
});

test('shop payment recording and service completion remain separate simulated actions', async () => {
  const dueBooking = {...booking, paymentMethod: 'pay_in_store', paymentStatus: 'due'};
  const {state, screens, navigation} = setup({
    auth: {user: {uid: 'shop-1'}, profile: {role: 'shop'}, offline: false},
    data: {booking: dueBooking, paymentAttempts: [], testEmailEvents: []},
  });
  const props = detailProps(navigation), tree = await mount(screens.BookingDetailScreen, props);
  await act(async () => button(tree, 'Record test cash').props.onPress());
  assert.deepEqual(state.calls.at(-1), {op: 'paymentRecordInStore', input: {id: booking.id, method: 'simulated_cash'}});
  assert.match(text(tree), /no real payment was processed/i);

  state.data = {booking: {...dueBooking, status: 'confirmed', serviceStatus: 'not_started'}, paymentAttempts: [], testEmailEvents: []};
  await act(async () => tree.update(React.createElement(screens.BookingDetailScreen, props)));
  await act(async () => button(tree, 'Mark service completed').props.onPress());
  assert.deepEqual(state.calls.at(-1), {op: 'bookingComplete', input: {id: booking.id}});
  assert.match(text(tree), /no real payment was processed/i);
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


test('current payment outside history remains actionable while history pages accumulate and reset',async()=>{
 const current={id:'z-current',status:'pending',kind:'balance',amountCents:9845,currency:'ZAR'};
 const partial={...booking,status:'confirmed',paymentStatus:'partially_paid',paidCents:2500,balanceDueCents:9845,currentPaymentAttemptId:current.id};
 const first=Array.from({length:20},(_,i)=>({id:'a'+String(i).padStart(2,'0'),status:'failed',amountCents:2500}));
 const {state,screens,navigation}=setup({auth:{user:{uid:'owner-1'},profile:{role:'owner'},offline:false},data:{booking:partial,currentPaymentAttempt:current,paymentAttempts:first,paymentCursor:'a19'}});
 const props=detailProps(navigation),tree=await mount(screens.BookingDetailScreen,props);
 assert.match(text(tree),/Attempt reference: z-current/);assert.ok(button(tree,'Simulate successful payment'));
 await act(async()=>button(tree,'Load more payment history').props.onPress());
 assert.deepEqual(lastRead(state,'booking').input,{id:booking.id,paymentCursor:'a19'});
 state.data={booking:partial,currentPaymentAttempt:current,paymentAttempts:[{id:'a20',status:'failed',amountCents:2500},current],paymentCursor:null};
 await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));
 assert.match(text(tree),/Attempt reference: a00/);assert.match(text(tree),/Attempt reference: a20/);
 assert.equal((text(tree).match(/Attempt reference: z-current/g)||[]).length,1);assert.equal(button(tree,'Load more payment history'),undefined);
 await act(async()=>button(tree,'Simulate successful payment').props.onPress());
 assert.deepEqual(state.calls,[{op:'paymentMockResult',input:{id:booking.id,paymentAttemptId:'z-current',expectedBookingId:booking.id,expectedAmountCents:9845,expectedCurrency:'ZAR',outcome:'successful'}}]);
 await act(async()=>button(tree,'Refresh booking').props.onPress());assert.deepEqual(lastRead(state,'booking').input,{id:booking.id});
 state.auth={...state.auth,user:{uid:'owner-2'}};state.data={booking:{...partial,currentPaymentAttemptId:'new-account'},currentPaymentAttempt:null,paymentAttempts:[],paymentCursor:null};
 await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));
 assert.doesNotMatch(text(tree),/Attempt reference: a00|Attempt reference: z-current/);
 await act(async()=>tree.unmount());
});

test('shop cannot offer in-store settlement when independently returned current attempt is pending',async()=>{
 const {screens,navigation}=setup({data:{booking:{...booking,currentPaymentAttemptId:'outside-page',paidCents:0,balanceDueCents:12345,paymentStatus:'pending'},currentPaymentAttempt:{id:'outside-page',status:'pending',amountCents:12345},paymentAttempts:[{id:'old',status:'failed',amountCents:12345}],paymentCursor:'old'}});
 const tree=await mount(screens.BookingDetailScreen,detailProps(navigation));
 assert.equal(button(tree,'Record test cash'),undefined);assert.equal(button(tree,'Record test card'),undefined);assert.equal(button(tree,'Record test eft'),undefined);
 assert.match(text(tree),/Attempt reference: outside-page/);await act(async()=>tree.unmount());
});


test('new balance attempt requires a fresh result action and mixed settlement labels describe initial choice',async()=>{
 const partial={...booking,status:'confirmed',paymentMethod:'pay_deposit',paymentStatus:'partially_paid',paidCents:2500,balanceDueCents:9845,currentPaymentAttemptId:'deposit'};
 const {state,screens,navigation}=setup({auth:{user:{uid:'owner-1'},profile:{role:'owner'},offline:false},data:{booking:partial,currentPaymentAttempt:{id:'deposit',status:'paid',amountCents:2500,currency:'ZAR'},paymentAttempts:[]}}),props=detailProps(navigation),tree=await mount(screens.BookingDetailScreen,props);
 await act(async()=>button(tree,'Start simulated balance payment').props.onPress());assert.deepEqual(state.calls,[{op:'paymentStart',input:{id:booking.id}}]);
 state.data={booking:{...partial,currentPaymentAttemptId:'balance'},currentPaymentAttempt:{id:'balance',status:'pending',amountCents:9845,currency:'ZAR'},paymentAttempts:[]};await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));
 assert.match(text(tree),/Confirm this attempt: R98.45 ZAR/);await act(async()=>button(tree,'Simulate failed payment').props.onPress());assert.deepEqual(state.calls.at(-1),{op:'paymentMockResult',input:{id:booking.id,paymentAttemptId:'balance',expectedBookingId:booking.id,expectedAmountCents:9845,expectedCurrency:'ZAR',outcome:'failed'}});
 state.auth={...state.auth,profile:{role:'shop'}};await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));assert.match(text(tree),/customer must resolve that attempt/);assert.equal(button(tree,'Record test cash'),undefined);
 state.data={booking:{...partial,paymentStatus:'paid',paidCents:12345,balanceDueCents:0},paymentAttempts:[{id:'cash',status:'paid',method:'simulated_cash',amountCents:9845,currency:'ZAR'}]};await act(async()=>tree.update(React.createElement(screens.BookingDetailScreen,props)));assert.match(text(tree),/Initial choice: Deposit online/);assert.match(text(tree),/Method: cash/);await act(async()=>tree.unmount());
});

test('booking history exposes notification history and issued receipts to both participant roles',async()=>{
 for(const role of ['owner','shop']){
  const {state,screens,navigation}=setup({auth:{user:{uid:role+'-1'},profile:{role},offline:false},data:{items:[booking],cursor:null}});
  let tree=await mount(screens.BookingsScreen,{navigation});await act(async()=>button(tree,'Notification history').props.onPress());assert.deepEqual(state.navigations.at(-1),['Notifications']);await act(async()=>tree.unmount());
  state.data={booking:{...booking,paymentStatus:'paid',paidCents:12345,balanceDueCents:0},paymentAttempts:[{id:'paid-attempt',amountCents:12345,currency:'ZAR',status:'paid',receiptIssued:true},{id:'failed-attempt',amountCents:12345,currency:'ZAR',status:'failed',receiptIssued:false}]};
  tree=await mount(screens.BookingDetailScreen,detailProps(navigation));assert.equal(tree.root.findAllByType('Pressable').filter(node=>node.findAllByType('Text').some(t=>t.props.children==='View simulated receipt')).length,1);await act(async()=>button(tree,'View simulated receipt').props.onPress());assert.deepEqual(state.navigations.at(-1),['ReceiptDetail',{id:'paid-attempt'}]);await act(async()=>tree.unmount());
 }
});
