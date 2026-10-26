const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const quote={id:'fixture-quote',shopName:'Fixture Workshop',serviceRequestId:'fixture-request',termsVersion:3,status:'submitted',scope:'Prepare and paint the bonnet.',items:[{description:'Materials',amountCents:12345},{description:'Labour',amountCents:6789}],totalCents:19134,completionDays:5,warranty:'Six months',depositType:'percentage',depositValue:25,depositAmountCents:4784,validUntil:Date.now()+600000,createdAt:1000,updatedAt:2000};
const request={title:'Fixture paint request',vehicle:{make:'Toyota',model:'Corolla',year:2024,colour:'Blue'}};
const label=(tree,name)=>tree.root.findAllByType('Pressable').find(n=>n.props.accessibilityLabel===name);
const text=tree=>tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join('\n');
const flatten=s=>Object.assign({},...[s].flat(Infinity).filter(Boolean));
function ui({mode='dark',role='owner',platform='ios'}={}){
 const {palettes}=loadUI('src/shared/theme/colors.js');
 const exports=loadUI('src/features/marketplace/components/QuotationUI.js',{
  'react-native':{Platform:{OS:platform}},
  '../../../shared/components/landing/LandingUI':{LandingText:'Text',ownerTabs:['Discover','Garage','My Requests','Bookings','Profile'].map(label=>({label})),shopTabs:['Find Jobs','Requests','Quotes','Bookings','My Shop'].map(label=>({label}))},
  '../../auth/context/AuthContext':{useAuth:()=>({profile:{role},user:{uid:role},offline:false})},
  '../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
 });return {exports,palette:palettes[mode]};
}
async function mounted(Component,props,run){let tree;await act(async()=>{tree=create(React.createElement(Component,props));});try{await run(tree);}finally{await act(async()=>tree.unmount());}}

test('quotation cards show exact stored ZAR values, deposit, turnaround and available timestamps',async()=>{
 const {exports}=ui();await mounted(exports.QuotationCard,{quote,request},async tree=>{
  for(const value of ['Fixture Workshop','R191.34','R123.45','R67.89','R47.84','25%','5 working days','Six months','Updated:'])assert.ok(text(tree).includes(value),value);
  assert.ok(label(tree,'View details: Fixture Workshop'));assert.equal(label(tree,'Decline quotation'),undefined);assert.equal(label(tree,'Accept quotation'),undefined);
  await act(async()=>label(tree,'View details: Fixture Workshop').props.onPress());
  assert.match(text(tree),/Quotation details/);assert.match(text(tree),/Fixture paint request/);assert.match(text(tree),/Toyota/);assert.match(text(tree),/Request terms revision: 3/);
  await act(async()=>label(tree,'Close quotation details').props.onPress());assert.equal(tree.root.findAllByType('Modal').length,0);
 });
});

test('quotation history accurately distinguishes existing states without offering unsupported actions',async()=>{
 const {exports}=ui();
 for(const [status,title] of [['submitted','Submitted'],['accepted','Accepted'],['withdrawn','Withdrawn'],['superseded','Superseded'],['rejected','Declined']]){
  await mounted(exports.QuotationCard,{quote:{...quote,status}},async tree=>{assert.ok(text(tree).includes(title));assert.equal(label(tree,'Withdraw quotation'),undefined);});
 }
 assert.equal(exports.quoteStatus({...quote,validUntil:Date.now()-1}),'Expired');
 assert.equal(exports.quoteStatus({...quote,status:'accepted',validUntil:0}),'Accepted');
});

test('missing optional data stays unspecified and long quote terms remain readable in details',async()=>{
 const {exports}=ui(),long='Detailed warranty terms. '.repeat(70);
 await mounted(exports.QuotationCard,{quote:{id:'missing',scope:'Existing scope',totalCents:10000,warranty:long},compact:true},async tree=>{
  assert.match(text(tree),/Not specified/);assert.doesNotMatch(text(tree),/NaN|Invalid Date|undefined|No deposit required/);
  await act(async()=>label(tree,'View details: Your quotation').props.onPress());
  const modal=tree.root.findByType('Modal');assert.ok(modal.findAllByType('Text').some(n=>n.props.children===long&&n.props.numberOfLines===undefined));
 });
});

test('both role quotation pages preserve existing tabs and provide keyboard-aware safe layouts',async()=>{
 for(const role of ['owner','shop'])for(const platform of ['ios','android','web']){
  const {exports}=ui({role,platform}),moves=[],navigation={navigate:(...args)=>moves.push(args),canGoBack:()=>false};
  await mounted(exports.QuotationPage,{title:'Quotations',navigation,keyboard:true},async tree=>{
   assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,['top','bottom','left','right']);
   assert.equal(tree.root.findByType('KeyboardAvoidingView').props.behavior,platform==='ios'?'padding':platform==='android'?'height':undefined);
   assert.equal(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');
   assert.equal(!!label(tree,'Messages'),role==='owner');assert.equal(!!label(tree,'Notifications'),role==='owner');
   assert.deepEqual(tree.root.findAllByType('Pressable').filter(n=>n.props.accessibilityRole==='tab').map(n=>n.props.accessibilityLabel),role==='owner'?['Discover','Garage','My Requests','Bookings','Profile']:['Find Jobs','Requests','Quotes','Bookings','My Shop']);
   await act(async()=>label(tree,'Go back').props.onPress());assert.deepEqual(moves,[[role==='shop'?'ShopQuotes':'OwnerRequests']]);
  });
 }
});

function luminance(hex){const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('quotation text and action contrast meet 4.5:1 in both themes with comfortable touch targets',async()=>{
 for(const mode of ['dark','light']){
  const {exports,palette}=ui({mode});await mounted(exports.QuotationCard,{quote},async tree=>{
   const card=tree.root.findByProps({testID:'quotation-fixture-quote'}),bg=flatten(card.props.style).backgroundColor;
   for(const value of ['R191.34','Total quotation · ZAR','Six months']){
    const node=tree.root.findAllByType('Text').find(n=>n.props.children===value);assert.ok(contrast(flatten(node.props.style).color,bg)>=4.5);
   }
   assert.equal(label(tree,'View details: Fixture Workshop').props.style({pressed:false})[0].minHeight,48);
   assert.equal(bg,palette.surfaceCard);
  });
  await mounted(exports.QuotationAction,{title:'Continue',onPress(){}},async tree=>{const action=label(tree,'Continue');assert.ok(contrast(flatten(action.findByType('Text').props.style).color,flatten(action.props.style({pressed:false})).backgroundColor)>=4.5);});
 }
});

test('review presentation never invents a submission status or validity timestamp',async()=>{
 const {exports}=ui();await mounted(exports.QuotationCard,{draft:true,quote:{...quote,status:undefined,validUntil:undefined,validForDays:14}},async tree=>{
  assert.match(text(tree),/14 days/);assert.doesNotMatch(text(tree),/Status unavailable|Submitted:|Valid until/);assert.equal(label(tree,'View details: Fixture Workshop'),undefined);
 });
 assert.equal(exports.quotationDate(null),null);assert.equal(exports.quotationDate(Infinity),null);
});
