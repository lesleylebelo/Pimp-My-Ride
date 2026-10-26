const {test} = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {act, create} = require('react-test-renderer');
const {loadUI} = require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const role of ['owner', 'shop']) test(`${role} presents configuration and network failures distinctly, then clears the error on recovery`, async () => {
  let state, failure = Error('Backend setup is missing. Set EXPO_PUBLIC_API_URL using docs/OPERATIONS.md and restart Expo.');
  const {useMarketData} = loadUI('src/features/marketplace/hooks/useMarketData.js', {
    '../../auth/context/AuthContext': {useAuth: () => ({user: {uid: role}, offline: false})},
    '../services/marketApi': {marketApi: async () => {if (failure) throw failure; return {items: []};}},
  });
  function Screen() { state = useMarketData('dashboard'); return null; }
  let tree;
  try {
    await act(async () => {tree = create(React.createElement(Screen));});
    assert.match(state.error, /Backend setup is missing/);
    failure = Object.assign(Error('Cannot reach the server. Check your connection and try again.'), {code: 'api/network-request-failed'});
    await act(async () => {await assert.rejects(() => state.refresh());});
    assert.equal(state.error, failure.message);
    assert.doesNotMatch(state.error, /setup is missing/);
    failure = null;
    await act(async () => {await state.refresh();});
    assert.equal(state.error, '');
    assert.deepEqual(state.data, {items: []});
  } finally {if (tree) await act(async () => tree.unmount());}
});

test('Admin preserves setup, connectivity and backend failures while distinguishing expired auth', () => {
  const {adminError} = loadUI('src/features/admin/services/adminApi.js', {
    '../../../shared/services/firebase': {firebase: () => ({auth: {currentUser: null}})},
    '../../../shared/services/api': {apiRequest: async () => {}},
  });
  for (const message of ['Backend setup is missing.', 'Cannot reach the server.', 'The backend is unavailable. Please try again shortly.']) assert.equal(adminError(Error(message)), message);
  assert.match(adminError({code: 'api/unauthenticated', message: 'Denied'}), /session expired/);
});
