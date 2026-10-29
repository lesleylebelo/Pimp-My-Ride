const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadUI}=require('./helpers/load-ui.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function storageFixture(){
 const data=new Map(),state={deletesFail:0,writesFail:false};
 const storage={getItem:async key=>data.get(key)||null,setItem:async(key,value)=>{if(state.writesFail)throw Error('Synthetic write failure');data.set(key,value);},removeItem:async key=>{if(state.deletesFail-->0)throw Error('Synthetic delete failure');data.delete(key);}};
 const load=()=>loadUI('src/shared/offline/profileCache.js',{'@react-native-async-storage/async-storage':storage});
 return {data,state,storage,load};
}
test('preview deletion retries a transient failure and preserves other UID records and device preferences',async()=>{
 const f=storageFixture(),cache=f.load();
 await cache.saveProfileCache('a',{role:'owner'});await cache.saveProfileCache('b',{role:'owner'});
 f.data.set('theme-mode:v1','light');f.data.set('feed-source:shop','shops');
 f.state.deletesFail=1;await cache.clearProfileCache('a');
 assert.equal(await cache.readProfileCache('a'),null);assert.ok(await cache.readProfileCache('b'));
 assert.equal(f.data.get('theme-mode:v1'),'light');assert.equal(f.data.get('feed-source:shop'),'shops');
});
test('persistent deletion failure replaces the preview with a restart-safe marker and later reads recover deletion',async()=>{
 const f=storageFixture(),cache=f.load();
 await cache.saveProfileCache('a',{role:'shop',verificationStatus:'approved',shop:{shopName:'Old protected workshop'}});
 f.state.deletesFail=Infinity;await assert.rejects(()=>cache.clearProfileCache('a'),/delete failure/);
 assert.deepEqual(JSON.parse(f.data.get('@pmr/landing/v1/a')),{cleanup:true,uid:'a'});
 assert.equal(await cache.readProfileCache('a'),null);
 const restarted=f.load();assert.equal(await restarted.readProfileCache('a'),null);
 f.state.deletesFail=0;await restarted.readProfileCache('a');assert.equal(f.data.has('@pmr/landing/v1/a'),false);
});
test('complete AsyncStorage failure denies preview reads in memory and retries only targeted cleanup after recovery',async()=>{
 const f=storageFixture(),cache=f.load();await cache.saveProfileCache('a',{role:'owner'});await cache.saveProfileCache('b',{role:'owner'});
 f.state.deletesFail=Infinity;f.state.writesFail=true;
 await assert.rejects(()=>cache.clearProfileCache('a'));assert.equal(await cache.readProfileCache('a'),null);
 f.state.deletesFail=0;f.state.writesFail=false;await cache.retryProfileCacheCleanup();
 assert.equal(f.data.has('@pmr/landing/v1/a'),false);assert.ok(await cache.readProfileCache('b'));
});
test('per-UID serialization prevents an earlier delayed save from restoring a cleared preview',async()=>{
 const f=storageFixture(),original=f.storage.setItem;let release;
 f.storage.setItem=async(key,value)=>{await new Promise(resolve=>{release=resolve;});return original(key,value);};
 const cache=f.load(),saved=cache.saveProfileCache('a',{role:'owner'});await turn();
 const cleared=cache.clearProfileCache('a');release();await Promise.all([saved,cleared]);
 assert.equal(await cache.readProfileCache('a'),null);assert.equal(f.data.has('@pmr/landing/v1/a'),false);
});
test('session cleanup immediately clears API results, bookmarks and profile media and rejects late work even with unchanged Firebase identity',async()=>{
 const registry=loadUI('src/shared/services/sessionCaches.js'),user={uid:'a'},auth={currentUser:user};
 const {createReadCoordinator}=loadUI('src/shared/services/readCoordinator.js',{'./sessionCaches':registry});
 const read=createReadCoordinator(()=>auth.currentUser);
 const bookmarks=loadUI('src/features/marketplace/services/bookmarkState.js',{'../../../shared/services/sessionCaches':registry});
 let mediaCalls=0,readCalls=0;
 const media=loadUI('src/features/auth/services/profilePhotos.js',{
  '../../../shared/services/sessionCaches':registry,'../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/api':{apiRequest:async()=>{mediaCalls++;return {version:mediaCalls};}},
 });
 await read('list',async()=>{readCalls++;return 'private';});
 bookmarks.bookmarkSession(user);bookmarks.publishBookmark('a','p',true);
 await media.profilePhotoStatus('a');await media.profilePhotoStatus('a');assert.equal(mediaCalls,1);
 let releaseRead,releaseBookmark;
 const pendingRead=read('late',()=>new Promise(resolve=>{releaseRead=resolve;}));
 const pendingBookmark=bookmarks.saveBookmark('a','p',false,()=>new Promise(resolve=>{releaseBookmark=resolve;}));
 await turn();registry.clearSessionCaches();assert.equal(bookmarks.bookmarkSnapshot('a','p'),undefined);
 const rejectedRead=assert.rejects(pendingRead,/account changed/),rejectedBookmark=assert.rejects(pendingBookmark,/account changed/);
 releaseRead('old');releaseBookmark({id:'p',saved:false});await Promise.all([rejectedRead,rejectedBookmark]);
 assert.equal(bookmarks.bookmarkSnapshot('a','p'),undefined);
 await read('list',async()=>{readCalls++;return 'fresh';});assert.equal(readCalls,2);
 await media.profilePhotoStatus('a');assert.equal(mediaCalls,2);
});
test('closing the local session clears memory and targets its preview even when Firebase sign-out fails',async()=>{
 const calls=[],user={uid:'a'},auth={currentUser:user};
 const {closeLocalSession}=loadUI('src/features/auth/services/accountManagement.js',{
  'firebase/auth':{signOut:async()=>{calls.push('signOut');throw Error('Synthetic auth failure');}},
  '../../../shared/services/firebase':{firebase:()=>({auth})},
  '../../../shared/services/sessionCaches':{clearSessionCaches:()=>calls.push('memory')},
  '../../../shared/offline/profileCache':{clearProfileCache:async uid=>calls.push(uid)},
 });
 await assert.rejects(closeLocalSession,/auth failure/);assert.deepEqual(calls,['memory','signOut','a']);
});
