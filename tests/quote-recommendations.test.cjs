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
  assert.deepEqual(result.rankedIds,['a','b']);assert.equal(result.entries[0].score,100);assert.equal(result.entries[1].score,78.125);
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
    assert.equal(result.entries[1].score,73.0769);assert.equal(result.entries[1].components.distance,null);
  }
  assert.equal(compare([quote('a'),quote('b')],{serviceLocation:null}).distanceUsed,false);
});
test('stable score and price ties resolve by quotation ID independently of input order',()=>{
  for(const quotes of [[quote('b'),quote('a')],[quote('a'),quote('b')]]){const result=compare(quotes);assert.deepEqual(result.rankedIds,['a','b']);assert.equal(result.recommendedId,null);assert.equal(result.status,'tie');assert.ok(result.entries.every(entry=>entry.rank===1));}
});

test('default confirmation fields give a transparent comparison rather than silently disappearing',()=>{
 const result=compare([quote('a',10000,{scopeConfirmed:false,allChargesIncluded:false}),quote('b',20000,{scopeConfirmed:false,allChargesIncluded:false})]);
 assert.equal(result.comparisonCount,2);assert.equal(result.eligibleCount,0);assert.equal(result.status,'insufficient');assert.equal(result.recommendedId,null);assert.match(result.limitation,/Insufficient confirmed scope/);assert.ok(result.entries.every(entry=>entry.comparable&&!entry.eligible));assert.ok(result.entries[0].highlights.includes('Lowest quoted price among current offers'));
});

test('fixed, percentage, none and missing deposit terms preserve exact stored cents and explicit unknowns',()=>{
 const quotes=[quote('fixed',10101,{depositType:'fixed',depositValue:2500,depositAmountCents:2500}),quote('percentage',10101,{depositType:'percentage',depositValue:25,depositAmountCents:2525}),quote('none',10101,{depositType:'none',depositValue:null,depositAmountCents:null}),quote('missing',10101)];
 const before=JSON.stringify(quotes),result=compare(quotes);
 assert.deepEqual(result.entries.map(entry=>[entry.depositCents,entry.remainingAfterDepositCents]),[[2500,7601],[2525,7576],[0,10101],[null,null]]);assert.equal(JSON.stringify(quotes),before);
 assert.ok(result.entries[3].tradeoffs.includes('Deposit: Not specified'));
 for(const patch of [{depositType:'fixed',depositValue:2000,depositAmountCents:2001},{depositType:'percentage',depositValue:25,depositAmountCents:2500},{depositType:'other'}])assert.equal(compare([quote('a',10101,patch)]).comparisonCount,0);
});

test('scope, turnaround and missing warranty trade-offs are factual and never fabricate quality',()=>{
 const result=compare([quote('a',10000,{scope:'Paint the doors',completionDays:5,warranty:''}),quote('b',11000,{scope:'Paint doors and blend adjacent panels',completionDays:2,warranty:'Six months'})]);
 assert.equal(result.scopeDiffers,true);assert.ok(result.entries[0].tradeoffs.some(note=>note.includes('Service scopes differ')));assert.ok(result.entries[0].tradeoffs.includes('Warranty: Not specified'));assert.ok(result.entries[1].highlights.includes('Shortest stated turnaround'));
 assert.ok(result.entries[0].explanations.every(note=>!note.includes('Best overall value')));assert.match(result.scoringNote,/do not certify mechanical quality or safety/);
});

test('zero and single offers return explicit reasons, with consistent results on reopening',()=>{
 assert.equal(compare([]).status,'empty');assert.match(compare([]).limitation,/No current eligible/);
 const single=compare([quote('a')]);assert.equal(single.status,'single');assert.equal(single.recommendedId,null);assert.deepEqual(single.rankedIds,[]);assert.match(single.limitation,/Only one/);assert.deepEqual(compare([quote('a')]),single);
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

test('ratings preserve raw facts while shrinking sparse reviews towards the documented prior',()=>{
 const contexts={a:{available:true,current:true,ratingSummary:{average:5,count:1}},b:{available:true,current:true,ratingSummary:{average:5,count:100}}};
 const result=compare([quote('a'),quote('b')],{},contexts),[a,b]=result.entries;
 assert.equal(result.recommendedId,'b');assert.equal(result.ratingUsed,true);
 assert.equal(a.rating.average,5);assert.equal(a.rating.count,1);assert.equal(a.rating.adjusted,3.75);
 assert.ok(b.rating.adjusted>a.rating.adjusted);assert.match(b.ratingExplanation,/100 verified reviews/);
 assert.match(result.scoringNote,/five prior observations at 3.5/);assert.match(result.scoringNote,/do not certify/);
});
test('unrated and malformed ratings remain eligible and receive explicit neutral treatment',()=>{
 for(const summary of [undefined,{average:0,count:0},{average:9,count:5},{average:'5',count:2}]){
  const result=compare([quote('a'),quote('b')],{}, {a:{available:true,current:true,ratingSummary:summary},b:{available:true,current:true,ratingSummary:{average:3.5,count:10}}});
  const a=result.entries[0];assert.equal(a.eligible,true);assert.equal(a.rating.average,null);assert.equal(a.rating.count,0);assert.equal(a.rating.adjusted,3.5);assert.equal(result.status,'tie');assert.match(a.ratingExplanation,/Not yet rated/);
 }
 const allUnrated=compare([quote('a'),quote('b')]);assert.equal(allUnrated.ratingUsed,false);assert.ok(allUnrated.entries.every(entry=>entry.components.rating===null));
});
