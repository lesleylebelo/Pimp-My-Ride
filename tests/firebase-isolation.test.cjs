const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),babel=require('@babel/core');

function setup(options={}){
 const calls=[],apps=[...(options.apps||[])],auths=new Map();
 const inMemoryPersistence={kind:'memory'},securePersistence={kind:'secure'},nativePersistence={kind:'native'};
 const authFor=app=>{if(!auths.has(app))auths.set(app,{app,currentUser:null});return auths.get(app);};
 const mocks={
  'firebase/app':{
   initializeApp:(_config,name='[DEFAULT]')=>{const app={name};apps.push(app);calls.push(['initializeApp',app]);return app;},
   getApps:()=>apps,
   getApp:()=>{calls.push(['getApp']);const app=apps.find(item=>item.name==='[DEFAULT]');assert.ok(app,'Only an existing default app can be reused.');return app;},
   deleteApp:async app=>{calls.push(['deleteApp',app]);apps.splice(apps.indexOf(app),1);if(options.deleteError)throw options.deleteError;},
  },
  'firebase/auth':{
   initializeAuth:(app,dependencies)=>{calls.push(['initializeAuth',app,dependencies]);if(options.authError)throw options.authError;return authFor(app);},
   getAuth:app=>{calls.push(['getAuth',app]);return authFor(app);},
   getReactNativePersistence:storage=>{assert.equal(storage,securePersistence);calls.push(['nativePersistence']);return nativePersistence;},
   inMemoryPersistence,
   signOut:async auth=>{calls.push(['signOut',auth.app]);auth.currentUser=null;if(options.signOutError)throw options.signOutError;},
  },
  'firebase/firestore':{getFirestore:app=>{calls.push(['getFirestore',app]);if(options.firestoreError)throw options.firestoreError;return {app};}},
  './securePersistence':{securePersistence},
  'react-native':{Platform:{OS:options.platform||'android'}},
 };
 const code=babel.transformSync(fs.readFileSync(path.resolve(__dirname,'../src/shared/services/firebase.js'),'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const env=Object.fromEntries(['API_KEY','AUTH_DOMAIN','PROJECT_ID','MESSAGING_SENDER_ID','APP_ID'].map(name=>[`EXPO_PUBLIC_FIREBASE_${name}`,'mock-only']));
 const mod={exports:{}};new Function('require','module','exports','process',code)(name=>{assert.ok(mocks[name],name);return mocks[name];},mod,mod.exports,{env:options.unconfigured?{}:env});
 return {...mod.exports,calls,apps,auths,inMemoryPersistence,nativePersistence};
}

test('isolated auth uses a named memory-only app and its own Firestore identity',async()=>{
 const s=setup();let temporaryAuth;
 const result=await s.withIsolatedAuth(async({auth,db})=>{
  temporaryAuth=auth;assert.equal(auth.app,db.app);assert.match(auth.app.name,/^pmr-verification-/);
  auth.currentUser={uid:'unverified-account',emailVerified:false};
  assert.ok(!s.calls.some(([name])=>['nativePersistence','getAuth','getApp'].includes(name)));
  return 'profile-saved';
 });
 assert.equal(result,'profile-saved');assert.equal(temporaryAuth.currentUser,null);assert.equal(s.apps.length,0);
 const initialization=s.calls.find(([name])=>name==='initializeAuth');assert.equal(initialization[2].persistence,s.inMemoryPersistence);
 assert.deepEqual(s.calls.slice(-2).map(([name])=>name),['signOut','deleteApp']);
});

test('isolated operations always sign out and delete their temporary app when an operation fails',async()=>{
 const s=setup(),error=new Error('Profile save failed.');let temporaryAuth;
 await assert.rejects(()=>s.withIsolatedAuth(async({auth})=>{temporaryAuth=auth;auth.currentUser={uid:'new-account'};throw error;}),error);
 assert.equal(temporaryAuth.currentUser,null);assert.equal(s.apps.length,0);
 assert.deepEqual(s.calls.slice(-2).map(([name])=>name),['signOut','deleteApp']);
});

test('temporary app deletion still runs when signing out fails',async()=>{
 const error=new Error('Sign out unavailable.'),s=setup({signOutError:error});
 await assert.rejects(()=>s.withIsolatedAuth(async()=> 'done'),error);
 assert.equal(s.apps.length,0);assert.deepEqual(s.calls.slice(-2).map(([name])=>name),['signOut','deleteApp']);
});

test('failed Auth or Firestore initialization still cleans up the temporary app',async()=>{
 for(const stage of ['authError','firestoreError']){
  const error=new Error(`${stage} unavailable.`),s=setup({[stage]:error});
  await assert.rejects(()=>s.withIsolatedAuth(async()=>assert.fail('Initialization must finish first.')),error);
  assert.equal(s.apps.length,0);assert.equal(s.calls.at(-1)[0],'deleteApp');
  assert.equal(s.calls.some(([name])=>name==='signOut'),stage==='firestoreError');
 }
});

test('overlapping isolated clients use distinct apps without signing out the main session',async()=>{
 const s=setup(),main=s.firebase();main.auth.currentUser={uid:'verified-main',emailVerified:true};
 const visited=[];
 await Promise.all([1,2].map(async number=>s.withIsolatedAuth(async({auth})=>{
  visited.push(auth.app);auth.currentUser={uid:`temporary-${number}`};
  await Promise.resolve();assert.equal(main.auth.currentUser.uid,'verified-main');
 })));
 assert.notEqual(visited[0].name,visited[1].name);
 assert.equal(main.auth.currentUser.uid,'verified-main');assert.deepEqual(s.apps,[main.auth.app]);
 assert.ok(s.calls.filter(([name])=>name==='signOut').every(([,app])=>app!==main.auth.app));
});

test('a temporary app cannot be mistaken for an existing default app',async()=>{
 const s=setup();
 await s.withIsolatedAuth(async({auth:temporary})=>{
  const main=s.firebase();assert.equal(main.auth.app.name,'[DEFAULT]');assert.notEqual(main.auth.app,temporary.app);
  assert.equal(s.firebase(),main,'The main Firebase instance should still be cached.');
  assert.ok(!s.calls.some(([name])=>name==='getApp'));
 });
 assert.deepEqual(s.apps.map(app=>app.name),['[DEFAULT]']);
 const nativeInitialization=s.calls.find(([name,app])=>name==='initializeAuth'&&app.name==='[DEFAULT]');
 assert.equal(nativeInitialization[2].persistence,s.nativePersistence);
});

test('existing default apps retain native or web persistence behavior',()=>{
 for(const platform of ['android','web']){
  const app={name:'[DEFAULT]'},s=setup({apps:[app],platform});const main=s.firebase();
  assert.equal(main.auth.app,app);assert.equal(main.db.app,app);assert.equal(s.firebase(),main);
  assert.ok(!s.calls.some(([name])=>name==='initializeApp'));
  assert.equal(s.calls.filter(([name])=>name==='getApp').length,1);
  assert.equal(s.calls.some(([name])=>name==='nativePersistence'),platform==='android');
  assert.equal(s.calls.some(([name])=>name==='getAuth'),platform==='web');
 }
});

test('missing Firebase configuration cannot create either type of session',async()=>{
 const s=setup({unconfigured:true});assert.equal(s.configured,false);
 assert.throws(()=>s.firebase(),/Firebase setup is missing/);
 await assert.rejects(()=>s.withIsolatedAuth(async()=>assert.fail('No operation may run.')),/Firebase setup is missing/);
 assert.deepEqual(s.calls,[]);
});
