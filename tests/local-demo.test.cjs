const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadUI}=require('./helpers/load-ui.cjs');
test('client demo rejects production builds, production Firebase values, public endpoints and implicit demo routing',()=>{
 const {demoConfiguration}=loadUI('src/shared/services/localDemo.js');
 const input={enabled:'true',project:'demo-pmr-security',host:'127.0.0.1',api:'http://127.0.0.1:3000'};
 assert.equal(demoConfiguration(input,true).authURL,'http://127.0.0.1:19099');
 assert.equal(demoConfiguration({...input,host:'10.0.2.2',api:'http://10.0.2.2:3000'},true).host,'10.0.2.2');
 for(const patch of [{project:'production'},{api:'https://pimp-my-ride.onrender.com'},{host:'8.8.8.8'},{firebase:{apiKey:'production-key'}},{host:'192.168.999.1'}])assert.throws(()=>demoConfiguration({...input,...patch},true));
 assert.throws(()=>demoConfiguration(input,false));assert.throws(()=>demoConfiguration({project:'demo-pmr-security'},true));assert.equal(demoConfiguration({project:'production'},false),null);
 assert.throws(()=>demoConfiguration({...input,enabled:'TRUE'},true),/fallback/);
});
test('normal and isolated Firebase clients connect both emulators before use, without duplicate main apps',async()=>{
 const keys={EXPO_PUBLIC_PMR_LOCAL_DEMO:'true',EXPO_PUBLIC_PMR_DEMO_HOST:'127.0.0.1',EXPO_PUBLIC_FIREBASE_PROJECT_ID:'demo-pmr-security',EXPO_PUBLIC_API_URL:'http://127.0.0.1:3000'};
 const saved={...process.env},previousDev=global.__DEV__,previousFetch=global.fetch;Object.assign(process.env,keys);global.__DEV__=true;
 const events=[],apps=[];global.fetch=async()=>({ok:true,json:async()=>({projectId:'demo-pmr-security',storage:'memory-fixtures',mockPayments:true,authPort:19099,firestorePort:18080})});
 try{
  const f=loadUI('src/shared/services/firebase.js',{'firebase/app':{initializeApp:(config,name)=>{assert.equal(config.projectId,'demo-pmr-security');events.push('app');const app={name};apps.push(app);return app;},getApps:()=>apps,getApp:name=>apps.find(a=>a.name===name),deleteApp:async()=>events.push('delete')},'firebase/auth':{initializeAuth:()=>{events.push('auth');return {};},connectAuthEmulator:(auth,url)=>{assert.equal(url,'http://127.0.0.1:19099');events.push('auth-emulator');},inMemoryPersistence:{},signOut:async()=>events.push('signout')},'firebase/firestore':{getFirestore:()=>{events.push('db');return {};},connectFirestoreEmulator:(db,host,port)=>{assert.equal(host,'127.0.0.1');assert.equal(port,18080);events.push('db-emulator');}}});
  assert.throws(()=>f.firebase(),/readiness/);assert.deepEqual(events,[]);
  await f.prepareLocalDemo();f.firebase();f.firebase();assert.deepEqual(events,['app','auth','auth-emulator','db','db-emulator']);
  await f.withIsolatedAuth(async()=>events.push('operation'));
  assert.deepEqual(events.slice(5),['app','auth','auth-emulator','db','db-emulator','operation','signout','delete']);
  global.fetch=async()=>{throw Error('offline');};await assert.rejects(()=>f.prepareLocalDemo(),/unavailable/);
  await assert.rejects(()=>f.withIsolatedAuth(()=>assert.fail('Unavailable demo must not initialize Auth.')),/unavailable/);
 }finally{for(const k of Object.keys(process.env))if(!Object.hasOwn(saved,k))delete process.env[k];Object.assign(process.env,saved);global.__DEV__=previousDev;global.fetch=previousFetch;}
});
test('demo upload body substitutes a synthetic PNG without reading selected content',async()=>{
 const old=global.fetch;const appended=[];const Form=global.FormData;global.FormData=class{append(...args){appended.push(args);}};
 global.fetch=async url=>{assert.equal(url,'http://127.0.0.1:3000/__demo/fixture.png');return {ok:true,blob:async()=>({synthetic:true})};};
 try{const {demoUploadBody}=loadUI('src/shared/services/demoMedia.js',{'react-native':{Platform:{OS:'web'}},'./localDemo':{localDemo:{apiURL:'http://127.0.0.1:3000'}}});await demoUploadBody({privateSelection:true});assert.deepEqual(appended,[['file',{synthetic:true},'synthetic.png']]);}finally{global.fetch=old;global.FormData=Form;}
});
