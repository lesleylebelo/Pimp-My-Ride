import AsyncStorage from '@react-native-async-storage/async-storage';
const PREFIX = '@pmr/landing/v1/';
const pendingCleanup=new Set(),queues=new Map();
function serial(uid,operation){
 const next=(queues.get(uid)||Promise.resolve()).then(operation);
 const tail=next.catch(()=>{});queues.set(uid,tail);
 return next.finally(()=>{if(queues.get(uid)===tail)queues.delete(uid);});
}
export const CACHE_AGE = 24 * 60 * 60 * 1000;
export function cacheRecord(uid, profile, now = Date.now()) {
 if (profile?.accountStatus && profile.accountStatus !== 'active') return null;
 if (!uid || !['owner','shop'].includes(profile?.role)) return null;
 if (profile.role === 'shop' && profile.verificationStatus !== 'approved') return null;
 return {version:1, uid, savedAt:now, profile:{role:profile.role,
  ...(profile.role === 'shop' ? {verificationStatus:'approved', shop:{shopName:String(profile.shop?.shopName || '').slice(0,200)}} : {})}};
}
export function parseCache(raw, uid, now = Date.now()) {
 try {
  const record=JSON.parse(raw);
  if(record?.version!==1 || record.uid!==uid || !Number.isFinite(record.savedAt) || record.savedAt>now || now-record.savedAt>CACHE_AGE) return null;
  return cacheRecord(uid,record.profile,record.savedAt);
 } catch {return null;}
}
async function erase(uid){
 let failure;
 for(let attempt=0;attempt<2;attempt++){
  try{await AsyncStorage.removeItem(PREFIX+uid);pendingCleanup.delete(uid);return;}
  catch(error){failure=error;}
 }
 // An invalid record replaces the preview if deletion is temporarily unavailable.
 // It also carries the cleanup intent across process restarts, without profile data.
 await AsyncStorage.setItem(PREFIX+uid,JSON.stringify({cleanup:true,uid})).catch(()=>{});
 throw failure;
}
export function readProfileCache(uid){if(!uid)return Promise.resolve(null);return serial(uid,async()=>{
 if(pendingCleanup.has(uid)){await erase(uid).catch(()=>{});return null;}
 const raw=await AsyncStorage.getItem(PREFIX+uid),record=parseCache(raw,uid);
 if(pendingCleanup.has(uid))return null;
 if(raw&&!record){pendingCleanup.add(uid);await erase(uid).catch(()=>{});}
 return record;
});}
export function saveProfileCache(uid,profile){if(!uid)return Promise.resolve();return serial(uid,async()=>{
 const record=cacheRecord(uid,profile);
 if(record){await AsyncStorage.setItem(PREFIX+uid,JSON.stringify(record));pendingCleanup.delete(uid);}
 else {pendingCleanup.add(uid);await erase(uid);}
});}
export function clearProfileCache(uid){
 if(!uid)return Promise.resolve();
 pendingCleanup.add(uid); // Block reads immediately, before asynchronous deletion.
 return serial(uid,()=>erase(uid));
}
export async function retryProfileCacheCleanup(){
 await Promise.all([...pendingCleanup].map(uid=>clearProfileCache(uid).catch(()=>{})));
}
