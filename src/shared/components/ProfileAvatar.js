import React,{useEffect,useRef,useState} from 'react';
import {AppState,Image,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../features/auth/context/AuthContext';
import {useTheme} from '../theme/ThemeContext';
import {onProfilePhotoChange,viewProfilePhoto} from '../../features/auth/services/profilePhotos';
import {isMediaUrl} from '../services/mediaUrl';

export default function ProfileAvatar({context='self',id,revision=0,size=48,shop=false,enabled=true,label}){
 const {user,offline}=useAuth(),{theme}=useTheme(),focused=useIsFocused();
 const [photo,setPhoto]=useState(null),[refresh,setRefresh]=useState(0),[foreground,setForeground]=useState(AppState.currentState==='active');
 const key=JSON.stringify([user?.uid,context,id,revision,focused,offline,enabled,foreground]);
 const renewal=useRef(null);
 useEffect(()=>onProfilePhotoChange(()=>setRefresh(n=>n+1)),[]);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{
  let active=true;
  if(!user?.uid||offline||!focused||!enabled||!foreground){setPhoto(null);return;}
  void viewProfilePhoto(context,id,user.uid,revision).then(value=>{
   if(!active)return;
   if(!isMediaUrl(value.url)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now()){setPhoto(null);return;}
   setPhoto({key,url:value.url,expiresAt:value.expiresAt});
   // Renew at expiry, so the initial load and renewal do not double the photo
   // traffic within the same 60-second API window. Failures stay at the fallback.
   renewal.current=setTimeout(()=>{if(active)setRefresh(n=>n+1);},Math.max(1000,value.expiresAt-Date.now()));
  }).catch(()=>{if(active)setPhoto(null);});
  return()=>{active=false;clearTimeout(renewal.current);};
 },[key,refresh]);
 useEffect(()=>{
  if(!photo)return;
  const timer=setTimeout(()=>setPhoto(value=>value===photo?null:value),Math.max(0,photo.expiresAt-Date.now()));
  return()=>clearTimeout(timer);
 },[photo]);
 return <View accessible accessibilityRole="image" accessibilityLabel={label||(shop?'Workshop profile image':'Profile photo')} style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:theme.surfaceMuted,flexShrink:0}}>
  {photo?.key===key?<Image accessible={false} source={{uri:photo.url,cache:'reload'}} resizeMode="cover" style={{width:size,height:size}} onError={()=>{clearTimeout(renewal.current);setPhoto(null);}}/>:<Ionicons name={shop?'storefront-outline':'person-outline'} size={Math.round(size*.48)} color={theme.textSecondary}/>}
 </View>;
}
