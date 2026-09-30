import {Platform} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {apiRequest,uploadRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
import {photoFileError} from '../utils/photos';

const pending=new Map();
let lastUid;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function account(expectedUid){
 const uid=firebase().auth.currentUser?.uid;
 if(uid!==lastUid){pending.clear();lastUid=uid;}
 if(!uid)throw new Error('Sign in to continue.');
 if(expectedUid&&uid!==expectedUid)throw new Error('Your account changed. Please try again.');
 return uid;
}
export async function postsApi(op,data={},expectedUid){
 const uid=account(expectedUid),write=['create','update','remove'].includes(op),payload={...data,op};
 let key,requestId;
 if(write){
  key=JSON.stringify([uid,op,canonical(data)]);
  requestId=pending.get(key)||`post${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  pending.set(key,requestId);payload.requestId=requestId;
 }
 try{
  const result=await apiRequest('posts',payload,{expectedUid:uid});
  account(uid);if(key&&pending.get(key)===requestId)pending.delete(key);
  return result;
 }finally{account();}
}
export async function pickPostPhotos(maximum){
 const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:maximum,quality:1});
 if(picked.canceled)return [];
 const compressed=[];
 for(const asset of picked.assets||[]){
  const file={uri:asset.uri,name:asset.fileName||`showcase-${Date.now()}.jpg`,size:asset.fileSize||1,mimeType:asset.mimeType||'image/jpeg'};
  const issue=photoFileError(file);if(issue)throw new Error(issue);
  const result=await ImageManipulator.manipulateAsync(asset.uri,[{resize:{width:Math.min(asset.width||1600,1600)}}],{compress:0.78,format:ImageManipulator.SaveFormat.JPEG});
  compressed.push({uri:result.uri,name:file.name.replace(/\.[^.]+$/,'')+'.jpg',size:result.fileSize||file.size,mimeType:'image/jpeg'});
 }
 return compressed;
}
export async function uploadPostPhoto(file,expectedUid,onProgress){
 const issue=photoFileError(file);if(issue)throw new Error(issue);
 const uid=account(expectedUid),body=new FormData();
 if(Platform.OS==='web'){
  const response=await fetch(file.uri);if(!response.ok)throw new Error('Unable to read the selected photo. Choose it again.');
  const blob=await response.blob();body.append('file',blob,file.name);
 }else body.append('file',{uri:file.uri,name:file.name,type:file.mimeType});
 account(uid);
 return uploadRequest('posts/images',body,{expectedUid:uid,onProgress});
}
export async function removePostPhoto(path,expectedUid){
 return postsApi('removeImage',{path},expectedUid);
}
