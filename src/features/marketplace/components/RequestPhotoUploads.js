import React,{useEffect,useRef,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {pickPostPhotos} from '../services/postsApi';
import {listPhotos,uploadRequestPhoto} from '../services/photoApi';
import {Button} from './MarketplaceUI';
import PrivatePhoto from './PrivatePhoto';
import {usePhotoSource} from '../../../shared/components/PhotoSourceChooser';

export default function RequestPhotoUploads({vehicleId,selectedIds,onSelectionChange,disabled,onBusyChange}){
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const photoSource=usePhotoSource({scopeKey:JSON.stringify([uid,vehicleId]),enabled:!offline&&!disabled});
 const [selection,setSelection]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uploaded,setUploaded]=useState([]);
 const generation=useRef(0),lock=useRef(false),pending=useRef(null),current=useRef({});
 current.current={uid,vehicleId,disabled,offline,focused,selectedIds,onSelectionChange,onBusyChange};
 useEffect(()=>{++generation.current;pending.current=null;setSelection(null);setError('');setUploaded([]);return()=>{++generation.current;};},[uid,vehicleId,offline,focused]);
 async function choose(){
  if(lock.current||disabled||offline||!focused||selectedIds.length>=5)return;
  const epoch=generation.current;lock.current=true;setBusy(true);onBusyChange?.(true);setError('');
  try{
   const file=(await pickPostPhotos(1,{selectAssets:photoSource.choose}))[0];
   if(file&&epoch===generation.current&&!current.current.disabled&&!current.current.offline&&current.current.focused){pending.current=file;setSelection(file);}
  }catch(e){if(epoch===generation.current)setError(e.message||'Unable to prepare the selected photo. Try again.');}
  finally{lock.current=false;setBusy(false);current.current.onBusyChange?.(false);}
 }
 async function add(){
  if(lock.current||disabled||offline||!focused||selectedIds.length>=5)return;
  const epoch=generation.current,owner=uid,vehicle=vehicleId;
  const valid=()=>epoch===generation.current&&current.current.uid===owner&&current.current.vehicleId===vehicle&&!current.current.offline&&current.current.focused;
  lock.current=true;setBusy(true);onBusyChange?.(true);setError('');
  try{
   const file=pending.current;
   if(!file||!valid())return;
   pending.current=file;
   const state=await listPhotos('vehicle',vehicle,owner);
   if(!valid())return;
   const result=await uploadRequestPhoto(vehicle,state.version,file,owner);
   if(!valid())return;
   if(typeof result?.id!=='string')throw Error('The attachment upload could not be confirmed. Try again.');
   pending.current=null;setSelection(null);setUploaded(previous=>[...previous,{id:result.id,name:file.name}]);
   const ids=current.current.selectedIds;
   if(!ids.includes(result.id)&&ids.length<5)current.current.onSelectionChange([...ids,result.id]);
  }catch(e){if(valid())setError(e.message||'Attachment upload failed. Try again.');}
  finally{lock.current=false;setBusy(false);current.current.onBusyChange?.(false);}
 }
 return <View>{photoSource.chooser}{uploaded.filter(item=>selectedIds.includes(item.id)).map(item=><View key={item.id}><Text>{item.name}</Text><PrivatePhoto target="attachment" id={item.id}/><Button title="Detach uploaded attachment" outline disabled={busy||disabled||offline} onPress={()=>onSelectionChange(selectedIds.filter(id=>id!==item.id))}/></View>)}
  {!!selection&&<View><Image accessibilityLabel="Selected request attachment preview" source={{uri:selection.uri}} resizeMode="contain" style={{width:'100%',height:180,borderRadius:12}}/><Text>{selection.name}</Text><Button title="Upload attachment" disabled={busy||disabled||offline||!focused||selectedIds.length>=5} onPress={()=>void add()}/><Button title="Cancel attachment" outline disabled={busy} onPress={()=>{pending.current=null;setSelection(null);setError('');}}/></View>}
  <Button title={busy?'Preparing or uploading photo…':selection?'Choose another photo':'Upload request photo'} outline disabled={busy||disabled||offline||!focused||selectedIds.length>=5} onPress={()=>void choose()}/>{!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}
