const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const babel = require('@babel/core');
const {API_URL, verifyTransport, verifyExport} = require('../scripts/verify-web-export.cjs');
const {validateEnvironment} = require('../scripts/build-web.cjs');
const inline = require('babel-preset-expo/build/plugins/inline-env-vars').expoInlineEnvVars;

function bundle(base) {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  try {
    if (base === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = base;
    const {code} = babel.transformSync(fs.readFileSync('src/shared/services/api.js', 'utf8'), {
      configFile: false, babelrc: false, caller: {name: 'metro', isDev: false},
      plugins: [inline, require.resolve('@babel/plugin-transform-modules-commonjs')],
    });
    // Decoy URL reproduces the deployed localDemo module: a string search passes.
    return `__d(function(g,require,i,a,module,exports,d){${code}},1,[]);\n__d(function(){const decoy=${JSON.stringify(API_URL)};},2,[]);`;
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
}

test('Expo production transform resolves API URL in actual POST/REST transport without runtime env', async () => {
  const report = await verifyTransport(bundle(API_URL));
  assert.equal(report.apiURL, API_URL);
  assert.equal(report.requests.length, 4);
});

test('a URL elsewhere in the bundle does not hide missing production transport configuration', async () => {
  const bad = bundle(undefined);
  assert.ok(bad.includes(API_URL));
  await assert.rejects(() => verifyTransport(bad), /Backend setup is missing/);
});

test('production verifier rejects local and alternate endpoints', async () => {
  await assert.rejects(() => verifyTransport(bundle('http://localhost:3000')), /HTTPS/);
  await assert.rejects(() => verifyTransport(bundle('https://wrong.example.test')), /existing production backend/);
});

test('release preflight rejects missing, disabled, local and demo configuration; explicit CI env works', () => {
  for (const env of [{}, {EXPO_PUBLIC_API_URL: 'http://localhost:3000'}, {EXPO_PUBLIC_API_URL: API_URL, EXPO_NO_CLIENT_ENV_VARS: '1'}, {EXPO_PUBLIC_API_URL: API_URL, EXPO_PUBLIC_PMR_LOCAL_DEMO: 'true'}]) assert.throws(() => validateEnvironment(env));
  validateEnvironment({EXPO_PUBLIC_API_URL: API_URL});
  validateEnvironment({EXPO_PUBLIC_API_URL: API_URL, EXPO_NO_DOTENV: '1'});
});

test('release verification follows HTML script references and rejects stale or missing assets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmr-export-'));
  try {
    fs.writeFileSync(path.join(root, 'index.html'), '<script src="/app.js"></script>');
    fs.writeFileSync(path.join(root, 'app.js'), bundle(API_URL));
    assert.equal((await verifyExport(root)).bundle, '/app.js');
    fs.writeFileSync(path.join(root, 'app.js'), bundle(undefined));
    await assert.rejects(() => verifyExport(root), /Backend setup is missing/);
    fs.writeFileSync(path.join(root, 'app.js'), '<!doctype html><html>SPA fallback</html>');
    await assert.rejects(() => verifyExport(root), /HTML instead of JavaScript/);
    fs.unlinkSync(path.join(root, 'app.js'));
    await assert.rejects(() => verifyExport(root), /ENOENT/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
