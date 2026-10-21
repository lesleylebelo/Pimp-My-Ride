// Pure advisory scoring. Input must come from the authorised request read, never a client score.
const weights = Object.freeze({price: 0.40, distance: 0.25, compatibility: 0.35});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const version = request => Number.isSafeInteger(request.termsVersion) && request.termsVersion > 0 ? request.termsVersion : Number.isSafeInteger(request.version) && request.version > 0 ? request.version : 1;
const millis = value => typeof value?.toMillis === 'function' ? value.toMillis() : value;
function coordinates(value) {
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number' ||
      !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
      Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null;
  return {latitude: value.latitude, longitude: value.longitude};
}
function distanceKm(origin, destination) {
  const a = coordinates(origin), b = coordinates(destination);
  if (!a || !b) return null;
  const rad = degrees => degrees * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
function assess(request, quote, context, now) {
  const mandatory = request.mandatoryServices || [], covered = quote.coveredServices || [];
  const matched = Array.isArray(covered) && Array.isArray(mandatory) ? mandatory.filter(service => covered.includes(service)).length : 0;
  const coverage = {matched, required: mandatory.length, scopeConfirmed: quote.scopeConfirmed === true};
  const distance = distanceKm(request.serviceLocation, context.location);
  let reason = null;
  if (quote.serviceRequestId !== request.id) reason = 'Different service request';
  else if (request.status !== 'open' || quote.status !== 'submitted') reason = 'Quotation is no longer available';
  else if (!Number.isFinite(millis(quote.validUntil)) || millis(quote.validUntil) <= now) reason = 'Quotation has expired';
  else if ((own(quote, 'termsVersion') ? quote.termsVersion : quote.requestVersion) !== version(request)) reason = 'Outdated or unverifiable request terms';
  else if (context.current !== true) reason = 'Not a verifiable current quotation';
  else if (context.available !== true) reason = 'Shop, vehicle or service is unavailable';
  else if (request.visibility === 'direct' && request.shopId !== quote.shopId) reason = 'Shop does not match the direct request';
  else if (quote.currency !== 'ZAR' || !Number.isSafeInteger(quote.totalCents) || quote.totalCents <= 0 || quote.totalCents > 100000000 ||
      !Array.isArray(quote.items) || !quote.items.length || quote.items.some(item => !Number.isSafeInteger(item.amountCents) || item.amountCents <= 0) ||
      quote.items.reduce((sum, item) => sum + item.amountCents, 0) !== quote.totalCents) reason = 'Full quotation total cannot be verified';
  else if (quote.allChargesIncluded !== true) reason = 'All required charges have not been confirmed';
  else if (!coverage.scopeConfirmed || matched !== mandatory.length) reason = 'Full requested service coverage has not been confirmed';
  return {id: quote.id, shopName: quote.shopName || 'Shop', eligible: reason === null, reason, totalCents: quote.totalCents, distanceKm: distance, coverage};
}
function recommendQuotations({request, quotes, contexts = {}, now}) {
  if (!Number.isFinite(now)) throw new TypeError('An explicit comparison time is required.');
  const entries = quotes.map(quote => assess(request, quote, contexts[quote.id] || {}, now));
  const eligible = entries.filter(entry => entry.eligible);
  // Drop distance for the entire comparison if ANY eligible shop has unknown location.
  // This avoids rewarding or penalising a shop merely for missing coordinates.
  const distanceUsed = eligible.length > 0 && eligible.every(entry => entry.distanceKm !== null);
  const activeWeight = distanceUsed ? 1 : weights.price + weights.compatibility;
  const minimum = Math.min(...eligible.map(entry => entry.totalCents));
  const minDistance = Math.min(...eligible.map(entry => entry.distanceKm));
  const maxDistance = Math.max(...eligible.map(entry => entry.distanceKm));
  for (const entry of eligible) {
    const price = minimum / entry.totalCents;
    const distance = !distanceUsed ? null : maxDistance === minDistance ? 1 : (maxDistance - entry.distanceKm) / (maxDistance - minDistance);
    const compatibility = 1; // Mandatory full coverage is a gate; partial scope can never win on price.
    entry.components = {price, distance, compatibility};
    entry.score = Math.round(1000000 * (weights.price * price + weights.compatibility * compatibility + (distanceUsed ? weights.distance * distance : 0)) / activeWeight) / 10000;
  }
  eligible.sort((a, b) => b.score - a.score || a.totalCents - b.totalCents || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const comparative = eligible.length >= 2;
  if (comparative) eligible.forEach((entry, index) => {entry.rank = index + 1;});
  const winner = comparative ? eligible[0] : null;
  if (winner) {
    winner.explanations = ['Best overall value', 'Fully matches requested services (shop confirmed)'];
    if (winner.totalCents === minimum) winner.explanations.push('Lowest eligible price');
    if (distanceUsed && winner.distanceKm === minDistance) winner.explanations.push('Closest eligible shop');
  }
  return {entries, rankedIds: comparative ? eligible.map(entry => entry.id) : [], recommendedId: winner?.id || null,
    eligibleCount: eligible.length, distanceUsed,
    distanceNote: distanceUsed ? 'Straight-line distance from the service-request location; road distance may differ.' : 'Distance unavailable for one or more eligible quotations. Distance is excluded from every score.',
    evaluatedAt: now, nextExpiry: eligible.length ? Math.min(...quotes.filter(quote => eligible.some(entry => entry.id === quote.id)).map(quote => millis(quote.validUntil))) : null};
}
module.exports = {weights, coordinates, distanceKm, recommendQuotations};
