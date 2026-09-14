const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function load(file) {
  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    name => load(path.resolve(path.dirname(file), name + '.js')), mod, mod.exports,
  );
  return mod.exports;
}
const { getAuthenticatedRoute } = load(path.resolve(__dirname, '../src/navigation/landingRoute.js'));
const verified = { uid: 'example-user', emailVerified: true };

test('verified profiles reach only their matching role landing page', () => {
  assert.equal(getAuthenticatedRoute(verified, { role: 'owner' }), 'OwnerHome');
  assert.equal(getAuthenticatedRoute(verified, { role: 'shop', verificationStatus: 'approved' }), 'ShopHome');
  assert.equal(getAuthenticatedRoute(verified, { role: 'admin' }), 'AdminHome');
});
test('unverified accounts stay in the existing email-verification flow for every role', () => {
  for (const role of ['owner', 'shop', 'admin']) {
    assert.equal(getAuthenticatedRoute({ ...verified, emailVerified: false }, { role, verificationStatus: 'approved' }), 'Account');
  }
});
test('pending, rejected and unknown shop approvals cannot enter Find Jobs', () => {
  for (const verificationStatus of ['pending', 'rejected', 'unexpected', undefined]) {
    assert.equal(getAuthenticatedRoute(verified, { role: 'shop', verificationStatus }), 'Account');
  }
});
test('missing or invalid profiles and profile-load errors fail closed', () => {
  assert.equal(getAuthenticatedRoute(null, { role: 'admin' }), 'Account');
  assert.equal(getAuthenticatedRoute(verified, null), 'Account');
  assert.equal(getAuthenticatedRoute(verified, { role: 'root' }), 'Account');
  assert.equal(getAuthenticatedRoute(verified, { role: 'admin' }, 'Administrator authorization is missing.'), 'Account');
});
test('verification and approval refreshes promote an account to its landing route', () => {
  const profile = { role: 'shop', verificationStatus: 'pending' };
  assert.equal(getAuthenticatedRoute(verified, profile), 'Account');
  assert.equal(getAuthenticatedRoute(verified, { ...profile, verificationStatus: 'approved' }), 'ShopHome');
  assert.equal(getAuthenticatedRoute({ ...verified, emailVerified: false }, { role: 'owner' }), 'Account');
  assert.equal(getAuthenticatedRoute(verified, { role: 'owner' }), 'OwnerHome');
});
