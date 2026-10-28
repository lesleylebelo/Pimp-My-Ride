import {useAppActive} from '../../../shared/services/useAppActive';
import React,{useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {listPhotos,viewPhoto} from '../services/photoApi';
import {Button} from './MarketplaceUI';
import {isMediaUrl} from '../../../shared/services/mediaUrl';

// Only asset IDs persist. Signed bearer URLs live in this focused account's UI.
export default function PrivatePhoto({target,id,imageStyle,style,accessibilityLabel='Vehicle photo'}){
 const {user,offline}=useAuth(),screenFocused=useIsFocused(),appActive=useAppActive(),focused=screenFocused&&appActive,uid=user?.uid;
 const [photo,setPhoto]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const key=JSON.stringify([uid,target,id,focused,offline,retry]);
 useEffect(()=>{
  let active=true,timer;setPhoto(null);setError('');
  if(!uid||offline||!focused)return;
  async function load(){
   try{
    const result=await listPhotos(target,id,uid),first=result.items[0];
    if(!active||!first)return;
    const access=await viewPhoto(target,id,first.id,uid);
    if(!active)return;
    if(!isMediaUrl(access.url)||!Number.isFinite(access.expiresAt)||access.expiresAt<=Date.now())throw new Error('Photo access expired. Try again.');
    setPhoto({key,url:access.url});setError('');
    timer=setTimeout(()=>{setPhoto(null);void load();},Math.max(1000,access.expiresAt-Date.now()));
   }catch(e){if(active){setPhoto(null);setError(e.message||'Photo unavailable. Try again.');}}
  }
  void load();return()=>{active=false;clearTimeout(timer);};
 },[key]);
 if(!uid||offline||!focused)return null;
 return <View style={style}>{photo?.key===key&&<Image accessibilityLabel={accessibilityLabel} source={{uri:photo.url,cache:'reload'}} style={[{width:'100%',height:180,borderRadius:12},imageStyle]} resizeMode="cover" onError={()=>{setPhoto(null);setError('Photo unavailable. Try again.');}}/>}{!!error&&<><Text accessibilityRole="alert">{error}</Text><Button title="Retry photo" outline onPress={()=>setRetry(value=>value+1)}/></>}</View>;
}
