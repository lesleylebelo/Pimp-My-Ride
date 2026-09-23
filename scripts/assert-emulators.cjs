const PROJECT='demo-pmr-security';
function assertEmulators({auth=false,env=process.env}={}){
 for(const name of ['FIRESTORE_EMULATOR_HOST',...(auth?['FIREBASE_AUTH_EMULATOR_HOST']:[])]){
  const host=env[name]||'';
  if(!/^(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(host))throw Error(`${name} must name a local emulator; refusing to run data-writing tests.`);
  const port=Number(host.slice(host.lastIndexOf(':')+1));
  if(port<1||port>65535)throw Error(`Invalid emulator port in ${name}.`);
 }
 for(const name of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'])if(env[name]&&env[name]!==PROJECT)throw Error(`${name} must be ${PROJECT} for these tests.`);
 return PROJECT;
}
module.exports={assertEmulators,PROJECT};
