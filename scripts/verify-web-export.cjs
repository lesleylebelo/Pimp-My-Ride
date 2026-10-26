// Execute only the exported Metro API module, with isolated auth/network mocks.
// Never execute the app bootstrap or contact a service during release validation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {parse} = require('@babel/parser');
const API_URL = 'https://pimp-my-ride.onrender.com';
const MARKER = 'Backend setup is missing';

function transportFromBundle(source) {
  const ast = parse(source, {sourceType: 'script'});
  const factories = [];
  for (const statement of ast.program.body) {
    const call = statement.expression;
    if (call?.type !== 'CallExpression' || call.callee?.name !== '__d') continue;
    const factory = call.arguments[0];
    if (factory?.type !== 'FunctionExpression') continue;
    const code = source.slice(factory.start, factory.end);
    if (code.includes(MARKER)) factories.push({code, deps: call.arguments[2]?.elements?.length || 0});
  }
  if (factories.length !== 1) throw Error('Expected exactly one shared API transport in exported JavaScript.');
  const {code, deps} = factories[0];
  const calls = [], auth = {currentUser: {uid: 'release-check', getIdToken: async () => 'synthetic-token'}};
  const mocks = {firebase: () => ({auth}), localDemo: null, requireConnection: async () => {}};
  const context = vm.createContext({
    process: {env: {}}, __DEV__: false, URL, AbortController, setTimeout, clearTimeout,
    console: {warn() {}, error() {}},
    fetch: async (url, options) => {
      calls.push({url, options});
      return {ok: true, status: 200, text: async () => JSON.stringify(url.endsWith('/health') ? {ok: true} : {data: {verified: true}})};
    },
  });
  const mod = {exports: {}};
  Object.assign(context, {mod, mockRequire: () => mocks, deps: Array.from({length: deps}, (_, i) => i)});
  vm.runInContext(`(${code})(globalThis,mockRequire,mockRequire,mockRequire,mod,mod.exports,deps)`, context, {timeout: 3000});
  return {api: mod.exports, calls, auth};
}

async function verifyTransport(source) {
  const {api, calls, auth} = transportFromBundle(source);
  assert.equal(typeof api.apiRequest, 'function', 'Shared API POST export is missing.');
  assert.equal(typeof api.apiMethodRequest, 'function', 'Shared API REST export is missing.');
  await api.apiRequest('admin', {op: 'dashboard'});
  await api.apiRequest('marketplace', {op: 'dashboard'});
  await api.apiMethodRequest('posts');
  assert.deepEqual(calls.map(c => c.url), [
    `${API_URL}/health`, `${API_URL}/api/admin`, `${API_URL}/api/marketplace`, `${API_URL}/api/posts`,
  ], 'The built transport must resolve the existing production backend without runtime process.env.');
  assert.equal(calls[0].options.headers, undefined, 'Health must not send a token.');
  for (const call of calls.slice(1)) assert.equal(call.options.headers.Authorization, 'Bearer synthetic-token');
  auth.currentUser = null;
  await assert.rejects(() => api.apiRequest('admin', {}), /Please sign in again/);
  assert.equal(calls.length, 4, 'Unauthenticated calls must not reach the network.');
  return {apiURL: API_URL, requests: calls.map(c => ({url: c.url, method: c.options.method || 'GET'}))};
}

async function verifyExport(directory) {
  const root = path.resolve(directory);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  if (!scripts.length) throw Error('Exported HTML references no JavaScript.');
  const bundles = scripts.map(src => {
    if (/^(?:[a-z]+:)?\/\//i.test(src)) throw Error('Export references an external script.');
    const file = path.resolve(root, '.' + (src.startsWith('/') ? src : '/' + src));
    if (!file.startsWith(root + path.sep)) throw Error('Export script escapes the output directory.');
    const source = fs.readFileSync(file, 'utf8');
    if (/^\s*</.test(source)) throw Error('Export script contains HTML instead of JavaScript.');
    return {src, source, sha256: createHash('sha256').update(source).digest('hex')};
  });
  const candidates = bundles.filter(b => b.source.includes(MARKER));
  if (candidates.length !== 1) throw Error('Cannot uniquely locate the shared API bundle referenced by index.html.');
  const bundle = candidates[0];
  return {bundle: bundle.src, sha256: bundle.sha256, ...await verifyTransport(bundle.source)};
}

module.exports = {API_URL, transportFromBundle, verifyTransport, verifyExport};
if (require.main === module) verifyExport(process.argv[2] || 'dist').then(
  report => console.log(JSON.stringify(report, null, 2)),
  error => {console.error(`Web release verification failed: ${error.message}`); process.exitCode = 1;},
);
