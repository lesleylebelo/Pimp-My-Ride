import {createReadCoordinator,invalidateReads} from '../../../shared/services/readCoordinator';
import {Platform} from 'react-native';
import {photoFileError,preparePhoto} from '../utils/photos';
import {bookmarkSession,bookmarkRevision,publishBookmark,saveBookmark} from './bookmarkState';

const pending=new Map();
let lastUid;
const api=()=>require('../../../shared/services/api');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function account(expectedUid){
 const user=require('../../../shared/services/firebase').firebase().auth.currentUser,uid=user?.uid;
 bookmarkSession(user);
 if(uid!==lastUid){pending.clear();lastUid=uid;}
 if(!uid)throw new Error('Sign in to continue.');
 if(expectedUid&&uid!==expectedUid)throw new Error('Your account changed. Please try again.');
 return uid;
}
async function executePostsApi(op,data={},expectedUid){
 const uid=account(expectedUid);
 const restWrite=op==='create'&&data.type==='showcase'||['update','remove'].includes(op)&&data.showcase===true;
 if(['feed','mine','get'].includes(op)||restWrite){
  let result,key,requestId;
  if(op==='create'){
   key=JSON.stringify([uid,'rest-showcase-create',canonical(data)]);
   requestId=pending.get(key)||`post${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
   pending.set(key,requestId);
  }
  try{
   if(op==='feed'||op==='mine'){
    result=await api().apiMethodRequest('posts',{method:'GET',expectedUid:uid,query:{
     service:data.service??data.category??'All',q:data.q??data.search??'',cursor:data.cursor,limit:data.limit??20,page:data.page,
     shop_id:data.shop_id??data.shopId??(op==='mine'?uid:undefined)
    }});
   }else{
    const id=data.id,path=id?`posts/${encodeURIComponent(id)}`:'posts';
    const method=op==='get'?'GET':op==='update'?'PATCH':op==='remove'?'DELETE':'POST';
    const body=method==='GET'||method==='DELETE'?undefined:op==='update'?Object.fromEntries(Object.entries(data).filter(([key])=>!['id','showcase'].includes(key))):op==='create'?Object.fromEntries(Object.entries(data).filter(([key])=>key!=='type')):data;
    result=await api().apiMethodRequest(path,{method,data:requestId?{...body,requestId}:body,expectedUid:uid});
   }
   account(uid);if(key&&pending.get(key)===requestId)pending.delete(key);return result;
  }finally{account();}
 }
 // Save sets a desired boolean transactionally; its existing endpoint accepts
 // only op/id/saved, not the request IDs used for other post mutations.
 const write=['create','update','remove'].includes(op),payload={...data,op};
 let key,requestId;
 if(write){
  key=JSON.stringify([uid,op,canonical(data)]);
  requestId=pending.get(key)||`post${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  pending.set(key,requestId);payload.requestId=requestId;
 }
 try{
  const result=await api().apiRequest('posts',payload,{expectedUid:uid});
  account(uid);if(key&&pending.get(key)===requestId)pending.delete(key);
  return result;
 }finally{account();}
}
export async function viewPostPhoto(id,path,expectedUid){
 const uid=account(expectedUid);
 const result=await coordinatedMedia([id,path],()=>api().apiMethodRequest('posts/'+encodeURIComponent(id)+'/images/view',{method:'POST',data:{path},expectedUid:uid}),{ttl:0});
 account(uid);return result;
}
export async function pickPostPhotos(maximum,{
 selectAssets,
 loadImagePicker=()=>import('expo-image-picker'),
 loadImageManipulator=()=>import('expo-image-manipulator'),
}={}){
 if(!Number.isInteger(maximum)||maximum<1)return [];
 const picked=selectAssets?await selectAssets({maximum}):await (await loadImagePicker()).launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:maximum,quality:1});
 if(picked.canceled||!picked.assets?.length)return [];
 const ImageManipulator=await loadImageManipulator();
 const compressed=[];
 for(const asset of picked.assets.slice(0,picked.source==='camera'?1:maximum)){
  compressed.push(await preparePhoto(asset,ImageManipulator));
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
 const result=await api().uploadRequest('posts/images',body,{expectedUid:uid,onProgress});
 account(uid);
 if(typeof result?.path!=='string'||!result.path.startsWith(`posts/${uid}/`))throw new Error('The photo upload could not be confirmed. Try again.');
 return result;
}
export async function removePostPhoto(path,expectedUid){
 return postsApi('removeImage',{path},expectedUid);
}

const coordinatedRead=createReadCoordinator(()=>require('../../../shared/services/firebase').firebase().auth.currentUser);
export async function postsApi(op,data={},expectedUid,options={}){
 const uid=account(expectedUid);
 if(op==='save')return saveBookmark(uid,data.id,data.saved,async()=>{try{return await executePostsApi(op,data,uid);}finally{invalidateReads();}});
 if(!['feed','mine','saved','get'].includes(op)){try{return await executePostsApi(op,data,expectedUid);}finally{invalidateReads();}}
 const started=bookmarkRevision(),result=await coordinatedRead([op,data],()=>executePostsApi(op,data,expectedUid),{ttl:op==='get'?0:5000,...options});
 for(const post of result?.items||[result?.post])if(post?.id&&typeof post.saved==='boolean')publishBookmark(uid,post.id,post.saved,started);
 return result;
}

const coordinatedMedia=createReadCoordinator(()=>require('../../../shared/services/firebase').firebase().auth.currentUser);
