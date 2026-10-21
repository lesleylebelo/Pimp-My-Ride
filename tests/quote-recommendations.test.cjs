const {test} = require('node:test');
const assert = require('node:assert/strict');
const {recommendQuotations, distanceKm} = require('../backend/quote-recommendations.cjs');
const now = 1000000;
const request = {id:'r',status:'open',version:1,termsVersion:1,mandatoryServices:['Paint','Preparation'],serviceLocation:{latitude:-26.2,longitude:28.04}};
const quote = (id, totalCents=10000, changes={}) => ({id,serviceRequestId:'r',shopId:id,status:'submitted',termsVersion:1,validUntil:now+1000,totalCents,currency:'ZAR',items:[{amountCents:totalCents}],scopeConfirmed:true,allChargesIncluded:true,coveredServices:['Paint','Preparation'],...changes});
function compare(quotes, changes={}, contexts) {
  return recommendQuotations({request:{...request,...changes},quotes,now,contexts:contexts || Object.fromEntries(quotes.map(q=>[q.id,{available:true,current:true,location:{latitude:-26.2,longitude:28.04}}]))});
}

test('different all-inclusive prices rank by the documented normalisation',()=>{
  const result=compare([quote('a'),quote('b',20000)]);
  assert.deepEqual(result.rankedIds,['a','b']);assert.equal(result.entries[0].score,100);assert.equal(result.entries[1].score,80);
  assert.ok(result.entries[0].explanations.includes('Lowest eligible price'));
});
test('distance uses geographical kilometres and can change the winner',()=>{
  assert.ok(Math.abs(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:1})-111.195)<0.01);
  assert.equal(distanceKm({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
  const result=compare([quote('cheap'),quote('near',11000)],{}, {cheap:{available:true,current:true,location:{latitude:-28,longitude:28}},near:{available:true,current:true,location:request.serviceLocation}});
  assert.equal(result.recommendedId,'near');assert.equal(result.distanceUsed,true);
});
test('partial service matches and unconfirmed free-text scope cannot beat complete offers',()=>{
  const result=compare([quote('cheap',1,{coveredServices:['Paint']}),quote('a'),quote('b',11000),quote('unknown',2,{scopeConfirmed:false})]);
  assert.equal(result.recommendedId,'a');assert.equal(result.entries[0].coverage.matched,1);assert.equal(result.entries[0].eligible,false);assert.equal(result.entries[3].eligible,false);
});
test('missing or malformed locations remove distance for every candidate without inventing zero',()=>{
  for(const location of [undefined,{latitude:'0',longitude:0},{latitude:91,longitude:0},{latitude:null,longitude:0}]) {
    const result=compare([quote('a'),quote('b',20000)],{}, {a:{available:true,current:true,location},b:{available:true,current:true,location:request.serviceLocation}});
    assert.equal(result.distanceUsed,false);assert.equal(result.entries[0].distanceKm,null);assert.equal(result.entries[1].distanceKm,0);
    assert.equal(result.entries[1].score,73.3333);assert.equal(result.entries[1].components.distance,null);
  }
  assert.equal(compare([quote('a'),quote('b')],{serviceLocation:null}).distanceUsed,false);
});
test('stable score and price ties resolve by quotation ID independently of input order',()=>{
  for(const quotes of [[quote('b'),quote('a')],[quote('a'),quote('b')]])assert.deepEqual(compare(quotes).rankedIds,['a','b']);
});
test('eligibility excludes expiry, withdrawn, superseded, rejected, accepted and obsolete terms',()=>{
  const invalid=[quote('expired',1,{validUntil:now}),...['withdrawn','superseded','rejected','accepted'].map(status=>quote(status,1,{status})),quote('old',1,{termsVersion:0}),quote('other',1,{serviceRequestId:'other'}),quote('legacy',1,{termsVersion:undefined})];
  const result=compare([...invalid,quote('a'),quote('b')]);assert.deepEqual(result.rankedIds,['a','b']);
  assert.ok(result.entries.slice(0,invalid.length).every(entry=>!entry.eligible));
  assert.equal(compare([quote('a'),quote('b')],{status:'booked'}).recommendedId,null);
});
test('price and coverage edits recompute, and invalid totals or unconfirmed fees cannot win',()=>{
  assert.equal(compare([quote('a'),quote('b',20000)]).recommendedId,'a');
  assert.equal(compare([quote('a',30000),quote('b',20000)]).recommendedId,'b');
  const changed=compare([quote('a'),quote('b')],{mandatoryServices:['Paint','Preparation','Finish']});assert.equal(changed.recommendedId,null);
  for(const change of [{totalCents:1},{currency:'USD'},{allChargesIncluded:false},{items:[]}])assert.equal(compare([quote('a',10000,change),quote('b')]).recommendedId,null);
});
test('fewer than two verifiably current and available offers never produces ranks or a winner',()=>{
  const result=compare([quote('a'),quote('b')],{}, {a:{available:true,current:true},b:{available:false,current:true}});
  assert.equal(result.recommendedId,null);assert.deepEqual(result.rankedIds,[]);assert.equal(result.entries[0].rank,undefined);
  assert.equal(compare([quote('a'),quote('b')],{},{}).recommendedId,null);
});
