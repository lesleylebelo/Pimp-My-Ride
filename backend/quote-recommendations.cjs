// Pure advisory scoring over the authorised request read; no client scores or AI.
const weights=Object.freeze({price:0.35,distance:0.15,compatibility:0.30,rating:0.20});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
const version=request=>Number.isSafeInteger(request.termsVersion)&&request.termsVersion>0?request.termsVersion:Number.isSafeInteger(request.version)&&request.version>0?request.version:1;
const millis=value=>typeof value?.toMillis==='function'?value.toMillis():value;
const text=value=>typeof value==='string'?value.trim():'';
function coordinates(value){
 if(!value||typeof value.latitude!=='number'||typeof value.longitude!=='number'||!Number.isFinite(value.latitude)||!Number.isFinite(value.longitude)||Math.abs(value.latitude)>90||Math.abs(value.longitude)>180)return null;
 return {latitude:value.latitude,longitude:value.longitude};
}
function distanceKm(origin,destination){
 const a=coordinates(origin),b=coordinates(destination);if(!a||!b)return null;
 const rad=degrees=>degrees*Math.PI/180;
 const h=Math.sin(rad(b.latitude-a.latitude)/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(rad(b.longitude-a.longitude)/2)**2;
 return 6371.0088*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
function deposit(quote){
 if(quote.depositType===undefined)return {specified:false,valid:true,cents:null};
 if(quote.depositType==='none')return {specified:true,valid:quote.depositAmountCents==null&&quote.depositValue==null,cents:0};
 const value=quote.depositValue,amount=quote.depositAmountCents;
 const expected=quote.depositType==='fixed'?value:quote.depositType==='percentage'&&Number.isSafeInteger(value)&&value>0&&value<100?Math.round(quote.totalCents*value/100):null;
 const valid=Number.isSafeInteger(expected)&&expected>0&&expected<quote.totalCents&&expected===amount;
 return {specified:true,valid,cents:valid?amount:null};
}
function reputation(summary){
 const count=summary?.count,average=summary?.average;
 const rated=Number.isSafeInteger(count)&&count>0&&typeof average==='number'&&Number.isFinite(average)&&average>=1&&average<=5;
 // Five prior observations at 3.5/5. This does not alter the public count/average.
 return {average:rated?average:null,count:rated?count:0,adjusted:rated?(count*average+5*3.5)/(count+5):3.5};
}
function assess(request,quote,context,now){
 const mandatory=Array.isArray(request.mandatoryServices)?request.mandatoryServices:[],covered=Array.isArray(quote.coveredServices)?quote.coveredServices:[];
 const coverage={matched:mandatory.filter(service=>covered.includes(service)).length,required:mandatory.length,scopeConfirmed:quote.scopeConfirmed===true};
 const upfront=deposit(quote);let unavailableReason=null;
 if(quote.serviceRequestId!==request.id)unavailableReason='Different service request';
 else if(request.status!=='open'||quote.status!=='submitted')unavailableReason='Quotation is no longer available';
 else if(!Number.isFinite(millis(quote.validUntil))||millis(quote.validUntil)<=now)unavailableReason='Quotation has expired';
 else if((own(quote,'termsVersion')?quote.termsVersion:quote.requestVersion)!==version(request))unavailableReason='Outdated or unverifiable request terms';
 else if(context.current!==true)unavailableReason='Not a verifiable current quotation';
 else if(context.available!==true)unavailableReason='Shop, vehicle or service is unavailable';
 else if(request.visibility==='direct'&&request.shopId!==quote.shopId)unavailableReason='Shop does not match the direct request';
 else if(quote.currency!=='ZAR'||!Number.isSafeInteger(quote.totalCents)||quote.totalCents<=0||quote.totalCents>100000000||!Array.isArray(quote.items)||!quote.items.length||quote.items.some(item=>!item||!Number.isSafeInteger(item.amountCents)||item.amountCents<=0)||quote.items.reduce((sum,item)=>sum+item.amountCents,0)!==quote.totalCents)unavailableReason='Full quotation total cannot be verified';
 else if(!upfront.valid)unavailableReason='Quotation deposit cannot be verified';
 let reason=unavailableReason;
 if(!reason&&quote.allChargesIncluded!==true)reason='All required charges have not been confirmed';
 if(!reason&&(!coverage.scopeConfirmed||coverage.matched!==mandatory.length))reason='Full requested service coverage has not been confirmed';
 return {id:quote.id,shopName:text(quote.shopName)||'Shop',comparable:unavailableReason===null,eligible:reason===null,reason,unavailableReason,totalCents:quote.totalCents,distanceKm:distanceKm(request.serviceLocation,context.location),coverage,
  rating:reputation(context.ratingSummary),depositCents:upfront.cents,remainingAfterDepositCents:upfront.cents===null?null:quote.totalCents-upfront.cents,
  completionDays:Number.isSafeInteger(quote.completionDays)&&quote.completionDays>0&&quote.completionDays<=365?quote.completionDays:null,scope:text(quote.scope)||null,warranty:text(quote.warranty)||null,highlights:[],tradeoffs:[]};
}
function recommendQuotations({request,quotes,contexts={},now}){
 if(!Number.isFinite(now))throw new TypeError('An explicit comparison time is required.');
 const entries=quotes.map(quote=>assess(request,quote,contexts[quote.id]||{},now));
 const comparable=entries.filter(entry=>entry.comparable),eligible=entries.filter(entry=>entry.eligible);
 const distanceUsed=eligible.length>0&&eligible.every(entry=>entry.distanceKm!==null),ratingUsed=eligible.some(entry=>entry.rating.count>0),activeWeight=weights.price+weights.compatibility+(distanceUsed?weights.distance:0)+(ratingUsed?weights.rating:0);
 const minimum=Math.min(...eligible.map(entry=>entry.totalCents)),minDistance=Math.min(...eligible.map(entry=>entry.distanceKm)),maxDistance=Math.max(...eligible.map(entry=>entry.distanceKm));
 for(const entry of eligible){
  const price=minimum/entry.totalCents,distance=!distanceUsed?null:maxDistance===minDistance?1:(maxDistance-entry.distanceKm)/(maxDistance-minDistance),compatibility=1;
  const rating=ratingUsed?(entry.rating.adjusted-1)/4:null;
  entry.components={price,distance,compatibility,rating};
  entry.score=Math.round(1000000*(weights.price*price+weights.compatibility*compatibility+(distanceUsed?weights.distance*distance:0)+(ratingUsed?weights.rating*rating:0))/activeWeight)/10000;
 }
 eligible.sort((a,b)=>b.score-a.score||a.totalCents-b.totalCents||(a.id<b.id?-1:a.id>b.id?1:0));
 const comparative=eligible.length>=2;
 if(comparative)eligible.forEach((entry,index)=>{entry.rank=index&&entry.score===eligible[index-1].score?eligible[index-1].rank:index+1;});
 const tied=comparative&&eligible[0].score===eligible[1].score,winner=comparative&&!tied?eligible[0]:null;
 const cheapest=Math.min(...comparable.map(entry=>entry.totalCents)),deposits=comparable.filter(entry=>entry.depositCents!==null),upfront=Math.min(...deposits.map(entry=>entry.depositCents));
 const turnarounds=comparable.filter(entry=>entry.completionDays!==null),fastest=Math.min(...turnarounds.map(entry=>entry.completionDays));
 const scopeDiffers=new Set(comparable.map(entry=>entry.scope?.toLowerCase().replace(/\s+/g,' ')||'')).size>1;
 for(const entry of comparable){
  if(entry.totalCents===cheapest)entry.highlights.push('Lowest quoted price among current offers');
  if(entry.depositCents!==null&&entry.depositCents===upfront)entry.highlights.push(deposits.length===comparable.length?'Lowest stated upfront deposit':'Lowest upfront deposit among offers that specify one');
  if(entry.completionDays!==null&&entry.completionDays===fastest)entry.highlights.push('Shortest stated turnaround');
  if(scopeDiffers)entry.tradeoffs.push('Service scopes differ. Review inclusions before choosing; equal coverage claims do not establish equal work or quality.');
  entry.ratingExplanation=entry.rating.count?`Workshop rating: ${entry.rating.average.toFixed(1)}/5 from ${entry.rating.count} verified ${entry.rating.count===1?'review':'reviews'}. Comparison accounts for review volume (${entry.rating.adjusted.toFixed(2)}/5 adjusted).`:'Workshop rating: Not yet rated. A neutral 3.5/5 prior is used when ratings are scored.';
  if(!entry.warranty)entry.tradeoffs.push('Warranty: Not specified');
  if(entry.depositCents===null)entry.tradeoffs.push('Deposit: Not specified');
  if(entry.completionDays===null)entry.tradeoffs.push('Turnaround: Not specified');
  if(!entry.eligible)entry.tradeoffs.push(entry.reason);
  else if(entry.totalCents>cheapest)entry.tradeoffs.push('A lower priced current offer exists; its scope and confirmations may differ.');
 }
 if(winner){
  winner.explanations=['Highest score for confirmed scope, verified price'+(ratingUsed?', confidence-adjusted customer rating':'')+(distanceUsed?' and straight-line distance':''),'Fully matches requested services (shop confirmed)'];
  if(winner.totalCents===minimum)winner.explanations.push('Lowest eligible price');
  if(distanceUsed&&winner.distanceKm===minDistance)winner.explanations.push('Closest eligible shop');
 }
 const status=!comparable.length?'empty':comparable.length===1?'single':eligible.length<2?'insufficient':tied?'tie':'recommended';
 const limitation={empty:'No current eligible quotations are available for comparison. Expired, withdrawn, stale or unavailable offers are excluded.',single:'Only one current quotation is available. Review its terms; there is not enough information to recommend an overall winner.',insufficient:'Insufficient confirmed scope and all-charge information to recommend an overall winner. Compare the available terms below.',tie:'The highest scoring quotations are tied. No overall winner is recommended; compare deposits, turnaround, scope and warranty.'}[status]||null;
 return {entries,rankedIds:comparative?eligible.map(entry=>entry.id):[],recommendedId:winner?.id||null,eligibleCount:eligible.length,comparisonCount:comparable.length,status,limitation,distanceUsed,ratingUsed,scopeDiffers,
  scoringNote:'Advisory score uses verified price (35%), shop-confirmed full coverage (30%), verified customer rating (20%) and straight-line distance (15%). Rating confidence uses five prior observations at 3.5/5; unrated shops use that neutral prior. If all shops are unrated, rating is excluded for all. If any scored offer lacks distance, distance is excluded for all. Remaining weights are normalised. Customer ratings do not certify mechanical quality or safety. Deposits, turnaround and warranty remain trade-offs.',
  distanceNote:distanceUsed?'Straight-line distance from the service-request location; road distance may differ.':'Distance unavailable for one or more eligible quotations. Distance is excluded from every score.',
  evaluatedAt:now,nextExpiry:comparable.length?Math.min(...quotes.filter(quote=>comparable.some(entry=>entry.id===quote.id)).map(quote=>millis(quote.validUntil))):null};
}
module.exports={weights,coordinates,distanceKm,recommendQuotations};