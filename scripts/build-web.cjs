const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {API_URL, verifyExport} = require('./verify-web-export.cjs');

function validateEnvironment(env) {
  if (env.EXPO_NO_CLIENT_ENV_VARS && env.EXPO_NO_CLIENT_ENV_VARS !== '0') throw Error('EXPO_NO_CLIENT_ENV_VARS disables production API inlining.');
  if ((env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '') !== API_URL) throw Error(`Production EXPO_PUBLIC_API_URL must resolve to ${API_URL}. Check the build environment and dotenv settings.`);
  if (env.EXPO_PUBLIC_PMR_LOCAL_DEMO === '1' || env.EXPO_PUBLIC_PMR_LOCAL_DEMO === 'true') throw Error('Local demo mode must be disabled for a production release.');
}

async function build() {
  const root = path.resolve(__dirname, '..');
  process.chdir(root);
  process.env.NODE_ENV = 'production';
  require('@expo/env').load(root);
  validateEnvironment(process.env);
  // Clear Metro transforms: modules compiled without env must never be reused.
  const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'export', '--platform', 'web', '--clear', '--max-workers', '2', '--output-dir', 'dist'], {cwd: root, env: process.env, stdio: 'inherit', windowsHide: true});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Expo export failed (${result.status}).`);
  console.log(JSON.stringify(await verifyExport(path.join(root, 'dist')), null, 2));
}
module.exports = {validateEnvironment};
if (require.main === module) build().catch(error => {console.error(`Web build failed: ${error.message}`); process.exitCode = 1;});
