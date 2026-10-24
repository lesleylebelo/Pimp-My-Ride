const {recommendQuotations} = require('./quote-recommendations.cjs');

// Called only after visibleRequest has verified ownership. Never returned to shops.
async function readRecommendations({db, request, quoteId, eligible, authEligible}) {
  const snapshot = await db.collection('quotations').where('serviceRequestId', '==', request.id).where('status', '==', 'submitted').limit(501).get();
  if (snapshot.docs.length > 500) return {entries: [], rankedIds: [], recommendedId: null, comparisonCount:0, status:'limited', comparisonQuotes:[], limitation: 'Too many quotations to compare safely. Inspect individual quotations.'};
  const quotes = snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
  const [vehicleDoc, categoryDoc] = await Promise.all([
    db.doc(`vehicles/${request.vehicleId}`).get(), db.doc(`serviceCategories/${request.categoryId}`).get(),
  ]);
  const vehicle = vehicleDoc.data();
  const requestAvailable = !!vehicle && vehicle.ownerId === request.ownerId && !vehicle.archived && categoryDoc.data()?.archived === false;
  const shops = new Map();
  for (const quote of quotes) if (typeof quote.shopId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(quote.shopId) && !shops.has(quote.shopId)) {
    shops.set(quote.shopId, (async () => {
      const legacyId = quoteId(request.id, quote.shopId);
      const [profileDoc, headDoc] = await Promise.all([db.doc(`users/${quote.shopId}`).get(), db.doc(`quotationHeads/${legacyId}`).get()]);
      const profile = profileDoc.data(), head = headDoc.data();
      return {available: requestAvailable && eligible(profile, 'shop') && await authEligible(quote.shopId),
        location: profile?.shop?.coordinates,
        currentId: headDoc.exists ? head?.serviceRequestId === request.id && head?.shopId === quote.shopId ? head.quoteId : null : legacyId};
    })());
  }
  await Promise.all(shops.values());
  const contexts = Object.create(null);
  for (const quote of quotes) {
    const shop = await shops.get(quote.shopId);
    contexts[quote.id] = {...shop, current: shop?.currentId === quote.id};
  }
  const analysis=recommendQuotations({request, quotes, contexts, now: Date.now()});
  const comparable=new Set(analysis.entries.filter(entry=>entry.comparable).map(entry=>entry.id));
  const order=new Map(analysis.rankedIds.map((id,index)=>[id,index]));
  return {...analysis,comparisonQuotes:quotes.filter(quote=>comparable.has(quote.id)).sort((a,b)=>((order.get(a.id)??Infinity)-(order.get(b.id)??Infinity))||(a.id<b.id?-1:a.id>b.id?1:0))};
}
module.exports = {readRecommendations};
