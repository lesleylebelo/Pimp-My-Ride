import {Platform} from 'react-native';
import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
import {photoFileError} from '../utils/photos';

const pending = new Map();
let lastUid;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
 ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
function account(expectedUid) {
 const uid = firebase().auth.currentUser?.uid;
 if (uid !== lastUid) { pending.clear(); lastUid = uid; }
 if (!uid) throw new Error('Sign in to continue.');
 if (expectedUid && uid !== expectedUid) throw new Error('Your account changed. Choose the photo again.');
 return uid;
}
async function request(payload, expectedUid) {
 const uid = account(expectedUid);
 const result = await apiRequest('photos', payload, {expectedUid:uid});
 account(uid);
 return result;
}
async function mutate(identity, execute, expectedUid) {
 const uid = account(expectedUid), key = JSON.stringify([uid,canonical(identity)]);
 const requestId = pending.get(key) || `p${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
 pending.delete(key); pending.set(key,requestId);
 if (pending.size > 50) pending.delete(pending.keys().next().value);
 try {
  const result = await execute(uid,requestId);
  account(uid);
  if (pending.get(key) === requestId) pending.delete(key);
  return result;
 } catch (error) {
  // Only a terminal server outcome allows a new key for the next manual attempt.
  if (error.retryWithNewRequest === true && pending.get(key) === requestId) pending.delete(key);
  throw error;
 } finally {
  const current = firebase().auth.currentUser?.uid;
  if (current !== lastUid) { pending.clear(); lastUid = current; }
 }
}
export async function listPhotos(target,id,expectedUid) {
 const result = await request({op:'list',target,id},expectedUid);
 if (!Array.isArray(result?.items)) throw new Error('Unable to read photo status. Refresh and try again.');
 return result;
}
export function viewPhoto(target,id,photoId,expectedUid) {
 return request({op:'view',target,id,photoId},expectedUid);
}
export function removeVehiclePhoto(id,slot,version,expectedUid) {
 const payload = {op:'remove',target:'vehicle',id,slot:String(slot),version};
 return mutate(payload,(uid,requestId) => apiRequest('photos',{...payload,requestId},{expectedUid:uid}),expectedUid);
}
export async function uploadVehiclePhoto(id,slot,version,file,expectedUid) {
 const issue = photoFileError(file);
 if (issue) throw new Error(issue);
 if (Platform.OS === 'web' ? !/^(blob:|data:image\/(jpeg|png);base64,)/i.test(file.uri) : !/^(file|content):\/\//i.test(file.uri)) {
  throw new Error('Choose a photo from this device. Remote photo addresses are not supported.');
 }
 const identity = {op:'upload',id,slot:String(slot),version,file:{uri:file.uri,name:file.name,size:file.size,type:file.mimeType,lastModified:file.lastModified ?? file.file?.lastModified ?? null}};
 return mutate(identity,async (uid,requestId) => {
  const body = new FormData();
  if (Platform.OS === 'web') {
   const response = await fetch(file.uri);
   if (!response.ok) throw new Error('Unable to read the selected photo. Choose it again.');
   const blob = await response.blob();
   if (blob.size !== file.size) throw new Error('The selected photo changed. Choose it again.');
   body.append('file',blob,file.name);
  } else {
   body.append('file',{uri:file.uri,name:file.name,type:file.mimeType});
  }
  account(uid);
  return apiRequest(`photos/vehicles/${encodeURIComponent(id)}/${encodeURIComponent(slot)}?version=${encodeURIComponent(version)}&requestId=${encodeURIComponent(requestId)}`,body,{multipart:true,expectedUid:uid});
 },expectedUid);
}
