import AsyncStorage from '@react-native-async-storage/async-storage';
const PREFIX = '@pmr/landing/v1/';
export const CACHE_AGE = 24 * 60 * 60 * 1000;
// Display hints only. Never use this cache for API authorization or admin access.
export function cacheRecord(uid, profile, now = Date.now()) {
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
export async function readProfileCache(uid) {return parseCache(await AsyncStorage.getItem(PREFIX+uid),uid);}
export async function saveProfileCache(uid,profile) {
 const record=cacheRecord(uid,profile);
 if(record) await AsyncStorage.setItem(PREFIX+uid,JSON.stringify(record));
 else await AsyncStorage.removeItem(PREFIX+uid);
}
export async function clearProfileCache(uid) {if(uid)await AsyncStorage.removeItem(PREFIX+uid);}
