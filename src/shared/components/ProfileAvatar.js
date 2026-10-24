import React,{useEffect,useState} from 'react';
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
 const key=JSON.stringify([user?.uid,context,id,revision,refresh,focused,offline,enabled,foreground]);
 useEffect(()=>onProfilePhotoChange(()=>setRefresh(n=>n+1)),[]);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove();},[]);
 useEffect(()=>{
  let active=true,timer;setPhoto(null);
  if(!user?.uid||offline||!focused||!enabled||!foreground)return;
  void viewProfilePhoto(context,id,user.uid,revision).then(value=>{
   if(!active||!isMediaUrl(value.url)||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())return;
   setPhoto({key,url:value.url});
   // Renew only successful previews while focused/active; failures stay at the fallback.
   timer=setTimeout(()=>{if(active)setRefresh(n=>n+1);},Math.max(1000,Math.min(55000,value.expiresAt-Date.now()-5000)));
  }).catch(()=>{});
  return()=>{active=false;clearTimeout(timer);};
 },[key]);
 return <View accessible accessibilityRole="image" accessibilityLabel={label||(shop?'Workshop profile image':'Profile photo')} style={{width:size,height:size,borderRadius:size/2,overflow:'hidden',alignItems:'center',justifyContent:'center',backgroundColor:theme.surfaceMuted,flexShrink:0}}>
  {photo?.key===key?<Image accessible={false} source={{uri:photo.url,cache:'reload'}} resizeMode="cover" style={{width:size,height:size}} onError={()=>setPhoto(null)}/>:<Ionicons name={shop?'storefront-outline':'person-outline'} size={Math.round(size*.48)} color={theme.textSecondary}/>}
 </View>;
}
