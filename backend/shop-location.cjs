const {FieldValue} = require('firebase-admin/firestore');
const D = require('./domain.cjs');
const {coordinates} = require('./quote-recommendations.cjs');
const {mutation} = require('./mutations.cjs');

const same = (a, b) => a === null && b === null || !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;
function location(value) {
  if (value === null) return null;
  const result = coordinates(value);
  if (!result) D.fail('Choose a valid latitude and longitude.');
  return result;
}
async function saveShopLocation({db, actor, request}) {
  const input = request.data || {};
  if (Object.keys(input).some(key => !['op','coordinates','expectedCoordinates','requestId'].includes(key))) D.fail('This location update contains unsupported fields.');
  D.id(input.requestId);
  const selected = location(input.coordinates), expected = location(input.expectedCoordinates);
  const account = await actor(request);
  if (account.profile.role !== 'shop') D.fail('Only a shop can update its business location.', 'permission-denied');
  const ref = db.doc(`users/${account.uid}`);
  return mutation(db, account.uid, 'shopLocationSave', input).atomic(async tx => {
    const profile = (await tx.get(ref)).data();
    if (profile?.role !== 'shop' || !D.active(profile)) D.fail('Shop account access is unavailable.', 'permission-denied');
    if (profile.reviewOperation || profile.statusOperation || profile.provisioningOperation) D.fail('Wait for the account operation to finish before updating location.', 'failed-precondition');
    if (!same(coordinates(profile.shop?.coordinates), expected)) D.fail('Your business location changed. Refresh your account before saving.', 'failed-precondition');
    // Recheck live Auth before queuing writes; transaction retries also repeat this check.
    await actor(request);
    tx.update(ref, {shop: {...profile.shop, coordinates: selected}, updatedAt: FieldValue.serverTimestamp()});
    tx.create(db.collection('auditLogs').doc(), {actor: account.uid, action: 'shop.locationUpdated', target: account.uid, createdAt: FieldValue.serverTimestamp()});
    return {ok: true, coordinates: selected};
  });
}
module.exports = {saveShopLocation};
