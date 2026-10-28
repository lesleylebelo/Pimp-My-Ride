import {Platform} from 'react-native';
import {firebase} from '../../../shared/services/firebase';
import {apiRequest,uploadRequest} from '../../../shared/services/api';
import {photoFileError} from '../../marketplace/utils/photos';

const pending=new Map(),cache=new Map(),inflight=new Map(),listeners=new Set();
let lastUid,lastUser,cooldown;
function account(expected){
 const user=firebase().auth.currentUser,uid=user?.uid;
 if(uid!==lastUid||user!==lastUser){pending.clear();cache.clear();inflight.clear();cooldown=null;lastUid=uid;lastUser=user;}
 if(!uid||expected&&uid!==expected)throw new Error('Your account changed. Sign in and choose the photo again.');
 return uid;
}
export const onProfilePhotoChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export function invalidateProfilePhotos(){cache.clear();inflight.clear();listeners.forEach(fn=>fn());}
function checkCooldown(){if(cooldown&&Date.now()<cooldown.until)throw cooldown.error;}
function rememberLimit(error,session){
 if(error.status===429&&firebase().auth.currentUser===session){
  const until=Number.isFinite(error.retryAt)?Math.max(Date.now(),error.retryAt):Date.now()+60000;
  if(!cooldown||until>cooldown.until)cooldown={error,until};
 }
}
async function readPhoto(key,uid,data){
 account(uid);const session=lastUser,saved=cache.get(key);
 if(inflight.has(key))return inflight.get(key);
 if(saved&&saved.until>Date.now()){if(saved.error)throw saved.error;return saved.value;}
 checkCooldown();
 const promise=Promise.resolve().then(async()=>{
  const value=await apiRequest('profile/photos',data,{expectedUid:uid});account(uid);
  if(lastUser!==session)throw new Error('Your account changed. Please try again.');
  if(inflight.get(key)===promise)cache.set(key,{value,until:data.op==='status'?Date.now()+10000:value.url?value.expiresAt-5000:Date.now()+45000});
  return value;
 }).catch(error=>{
  rememberLimit(error,session);
  // Briefly share failures between remounts. No timer retries a failed request.
  if(inflight.get(key)===promise)cache.set(key,{error,until:Date.now()+5000});
  throw error;
 });
 inflight.set(key,promise);try{return await promise;}finally{if(inflight.get(key)===promise)inflight.delete(key);if(cache.size>100)cache.delete(cache.keys().next().value);}
}
export function profilePhotoStatus(uid){return readPhoto(JSON.stringify([uid,'status']),uid,{op:'status'});}
export function viewProfilePhoto(context,id,uid,revision=0){
 return readPhoto(JSON.stringify([uid,context,id,revision]),uid,{op:'view',context,...(id?{id}:{})});
}
async function mutate(identity,uid,initial,execute){
 account(uid);checkCooldown();const session=lastUser,key=JSON.stringify([uid,identity]),intent=pending.get(key)||{...initial,requestId:`avatar_${Date.now()}_${Math.random().toString(36).slice(2)}`};
 pending.set(key,intent);if(pending.size>50)pending.delete(pending.keys().next().value);
 try{const result=await execute(intent);account(uid);pending.delete(key);invalidateProfilePhotos();return result;}
 catch(error){rememberLimit(error,session);if(error.retryWithNewRequest)pending.delete(key);throw error;}
}
export function removeProfilePhoto(version,uid){
 return mutate({op:'remove',version},uid,{},intent=>apiRequest('profile/photos',{op:'remove',version,requestId:intent.requestId},{expectedUid:uid}));
}
export async function uploadProfilePhoto(file,version,uid,onProgress){
 const issue=photoFileError(file);if(issue)throw new Error(issue);
 if(Platform.OS==='web'?!/^(blob:|data:image\/(jpeg|png|webp);base64,)/i.test(file.uri):!/^(file|content):\/\//i.test(file.uri))throw new Error('Choose a photo from this device.');
 const identity={op:'upload',uri:file.uri,name:file.name,size:file.size,type:file.mimeType};
 return mutate(identity,uid,{version},async intent=>{
  const body=new FormData();
  if(Platform.OS==='web'){
   const response=await fetch(file.uri);if(!response.ok)throw new Error('Unable to read the selected photo.');
   const blob=await response.blob();if(blob.size!==file.size)throw new Error('The photo changed. Select it again.');
   body.append('file',blob,file.name);
  }else body.append('file',{uri:file.uri,name:file.name,type:file.mimeType});
  account(uid);
  return uploadRequest(`profile/photos/upload?version=${intent.version}&requestId=${encodeURIComponent(intent.requestId)}`,body,{expectedUid:uid,onProgress});
 });
}
