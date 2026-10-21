const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react'),Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const {act}=Renderer;
function setup(){
 const calls=[],moves=[],state={offline:false};
 const Button=({title,onPress,disabled})=>React.createElement('Pressable',{accessibilityLabel:title,onPress,disabled},React.createElement('Text',null,title));
 const screens=loadUI('src/features/marketplace/screens/PaymentChoiceScreen.js',{
  '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
  '../../../shared/components/ConfirmationButton':({title,message,onConfirm,disabled})=>React.createElement('Pressable',{accessibilityLabel:title,onPress:onConfirm,disabled},React.createElement('Text',null,title),React.createElement('Text',null,message)),
  '../../auth/context/AuthContext':{useAuth:()=>state},
  '../services/marketApi':{marketApi:async(op,input)=>{calls.push([op,input]);return state.api?state.api(op,input):op==='quoteAccept'?{id:'booking-1',paymentAttemptId:'attempt-1',existingBooking:false,amountCents:input.paymentMethod==='pay_deposit'?quote.depositAmountCents:quote.totalCents,currency:quote.currency}:{paymentStatus:'paid'};}},
  '../components/MarketplaceUI':{
   Page:({children})=>React.createElement('View',null,children),
   Card:({children})=>React.createElement('View',null,children),
   Button,Notice:()=>null,formatMoney:cents=>`R${(cents/100).toFixed(2)}`,
  },
 });
 const navigation={replace:(...args)=>moves.push(args)};
 const quote={id:'quote-42',shopName:'Demo shop',totalCents:8450,currency:'ZAR',scope:'Test service'};
 let tree;
 return {calls,moves,state,screens,navigation,quote,mount:async()=>act(async()=>{tree=Renderer.create(React.createElement(screens.default,{route:{params:{quote}},navigation}));}),press:async label=>act(async()=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label).props.onPress()),tree:()=>tree,unmount:async()=>act(async()=>tree.unmount())};
}
const text=tree=>tree.root.findAllByType('Text').map(node=>String(node.props.children||'')).join('\n');

test('pay-in-full choice uses the server-selected quote and attempt; no card data is collected',async t=>{
 const s=setup();await s.mount();t.after(()=>s.unmount());
 assert.match(text(s.tree()),/SIMULATION ONLY/);assert.match(text(s.tree()),/R84.50/);
 await s.press('Pay in Full \u00b7 R84.50');
 await s.press('Selected: Simulate successful payment');
 await s.press('Confirm full payment and run simulation');
 assert.deepEqual(s.calls,[['quoteAccept',{id:'quote-42',paymentMethod:'pay_now'}],['paymentMockResult',{id:'booking-1',paymentAttemptId:'attempt-1',expectedBookingId:'booking-1',expectedAmountCents:8450,expectedCurrency:'ZAR',outcome:'successful'}]]);
 assert.deepEqual(s.moves,[['BookingDetail',{id:'booking-1'}]]);
 assert.doesNotMatch(JSON.stringify(s.calls),/cardNumber|cvv|bankPassword/);
});

test('pay-in-store choice requires explicit confirmation and starts unpaid without online payment',async t=>{
 const s=setup();await s.mount();t.after(()=>s.unmount());
 await s.press('Pay In-Store \u00b7 R84.50 due');
 assert.match(text(s.tree()),/Pay In-Store/);
 await s.press('Confirm Pay In-Store and create booking');
 assert.deepEqual(s.calls,[['quoteAccept',{id:'quote-42',paymentMethod:'pay_in_store'}]]);
 assert.deepEqual(s.moves,[['BookingDetail',{id:'booking-1'}]]);
});

test('deposit checkout shows the shop amount and remaining balance and submits no client amount',async t=>{
 const s=setup();s.quote.depositType='percentage';s.quote.depositValue=25;s.quote.depositAmountCents=2113;
 await s.mount();t.after(()=>s.unmount());
 await s.press('Pay Deposit \u00b7 R21.13');
 assert.match(text(s.tree()),/Shop-required deposit.{0,20}R21.13/);
 assert.match(text(s.tree()),/Amount payable now:.{0,8}R21.13/);
 assert.match(text(s.tree()),/Remaining balance:.{0,8}R63.37/);
 await s.press('Selected: Simulate successful payment');
 await s.press('Confirm deposit and run simulation');
 assert.deepEqual(s.calls,[['quoteAccept',{id:'quote-42',paymentMethod:'pay_deposit'}],['paymentMockResult',{id:'booking-1',paymentAttemptId:'attempt-1',expectedBookingId:'booking-1',expectedAmountCents:2113,expectedCurrency:'ZAR',outcome:'successful'}]]);
 assert.doesNotMatch(JSON.stringify(s.calls),/amountCents/);
});

test('legacy quotation without deposit offers only pay in full and pay in store',async t=>{
 const s=setup();await s.mount();t.after(()=>s.unmount());
 const titles=s.tree().root.findAllByType('Pressable').map(node=>node.props.accessibilityLabel);
 assert.ok(titles.includes('Pay in Full \u00b7 R84.50'));
 assert.ok(titles.includes('Pay In-Store \u00b7 R84.50 due'));
 assert.ok(!titles.some(title=>String(title).startsWith('Pay Deposit')));
});


test('R250 stale deposit checkout opens the existing R750 booking attempt without resolving it',async t=>{
 const s=setup();s.quote.totalCents=100000;s.quote.depositType='fixed';s.quote.depositAmountCents=25000;
 s.state.api=async()=>({id:'booking-1',existingBooking:true,paymentAttemptId:'balance-750',amountCents:75000,currency:'ZAR'});
 await s.mount();t.after(()=>s.unmount());await s.press('Pay Deposit \u00b7 R250.00');await s.press('Confirm deposit and run simulation');
 assert.deepEqual(s.calls,[['quoteAccept',{id:'quote-42',paymentMethod:'pay_deposit'}]]);assert.deepEqual(s.moves,[['BookingDetail',{id:'booking-1'}]]);
});

test('unexpected amount or currency requires recovery and never posts a payment result',async t=>{
 for(const details of [{amountCents:75000,currency:'ZAR'},{amountCents:25000,currency:'USD'}]){
  const s=setup();s.quote.totalCents=100000;s.quote.depositType='fixed';s.quote.depositAmountCents=25000;
  s.state.api=async()=>({id:'booking-1',existingBooking:false,paymentAttemptId:'changed',...details});await s.mount();
  await s.press('Pay Deposit \u00b7 R250.00');await s.press('Confirm deposit and run simulation');
  assert.equal(s.calls.length,1);assert.deepEqual(s.moves,[]);await s.press('View existing booking');assert.deepEqual(s.moves,[['BookingDetail',{id:'booking-1'}]]);await s.unmount();
 }
});

test('lost acceptance acknowledgement has a request-scoped existing-booking recovery action',async t=>{
 const s=setup();s.quote.serviceRequestId='request-1';s.state.api=async op=>{if(op==='quoteAccept')throw Error('Connection interrupted');return {request:{bookingId:'durable-booking'}};};
 await s.mount();t.after(()=>s.unmount());await s.press('Pay in Full \u00b7 R84.50');await s.press('Confirm full payment and run simulation');await s.press('Check existing booking');
 assert.deepEqual(s.calls,[['quoteAccept',{id:'quote-42',paymentMethod:'pay_now'}],['request',{id:'request-1'}]]);assert.deepEqual(s.moves,[['BookingDetail',{id:'durable-booking'}]]);
});

test('an interrupted result keeps a recovery action and never starts another checkout automatically',async t=>{
 const s=setup();s.state.api=async op=>{if(op==='paymentMockResult')throw Error('Result acknowledgement lost');return {id:'booking-1',existingBooking:false,paymentAttemptId:'attempt-1',amountCents:8450,currency:'ZAR'};};
 await s.mount();t.after(()=>s.unmount());await s.press('Pay in Full \u00b7 R84.50');await s.press('Confirm full payment and run simulation');
 assert.equal(s.calls.length,2);await s.press('View existing booking');assert.equal(s.calls.length,2);assert.deepEqual(s.moves,[['BookingDetail',{id:'booking-1'}]]);
});
