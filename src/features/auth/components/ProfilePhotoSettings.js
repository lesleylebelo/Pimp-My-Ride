import {useCustomerExperience} from '../../customer/components/CustomerUI';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {usePhotoSource} from '../../../shared/components/PhotoSourceChooser';
import * as ImageManipulator from 'expo-image-manipulator';
import {useAuth} from '../context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import OutlineButton from '../../../shared/components/OutlineButton';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {preparePhoto,PICKER_PHOTO_TYPES,PHOTO_MAX_BYTES} from '../../marketplace/utils/photos';
import {profilePhotoStatus,uploadProfilePhoto,removeProfilePhoto} from '../services/profilePhotos';

function Settings({uid,disabled,onBusyChange}){
 const {profile,offline,refresh}=useAuth(),{theme}=useTheme(),focused=useIsFocused();
 const photoSource=usePhotoSource({scopeKey:uid,enabled:!offline&&!disabled});
 const [saved,setSaved]=useState(null),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[progress,setProgress]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState('');
 const active=useRef(true),lock=useRef(false),epoch=useRef(0),permission=useRef({});
 permission.current={offline,disabled,focused};
 const allowed=()=>active.current&&!permission.current.offline&&!permission.current.disabled&&permission.current.focused;
 useEffect(()=>{active.current=true;return()=>{active.current=false;++epoch.current;onBusyChange?.(false);};},[onBusyChange]);
 const load=useCallback(async()=>{
  const generation=++epoch.current;setLoading(true);setError('');
  try{const value=await profilePhotoStatus(uid);if(active.current&&generation===epoch.current)setSaved(value);}
  catch(e){if(active.current&&generation===epoch.current){setSaved(null);setError(e.message||'Unable to load profile photo.');}}
  finally{if(active.current&&generation===epoch.current)setLoading(false);}
 },[uid]);
 useEffect(()=>{setSaved(null);setFile(null);if(focused&&!offline)void load();else{++epoch.current;setLoading(false);}return()=>{++epoch.current;};},[focused,offline,load]);
 async function choose(){
  if(!allowed()||lock.current||loading||!saved)return;
  lock.current=true;setBusy(true);setError('');setMessage('');const generation=epoch.current;
  try{
   const picked=await photoSource.choose({maximum:1,crop:true});
   if(picked.canceled||!picked.assets?.[0])return;
   const asset=picked.assets[0];
   if(asset.mimeType&&!PICKER_PHOTO_TYPES.includes(asset.mimeType))throw new Error('Choose a JPEG, PNG, WebP or HEIC photo.');
   if(asset.fileSize>PHOTO_MAX_BYTES)throw new Error('Each photo must be 5 MB or smaller.');
   // Native picker offers a square crop; web receives an equivalent centred crop.
   let cropped=asset;
   if(asset.width>0&&asset.height>0){
    const side=Math.min(asset.width,asset.height);
    const result=await ImageManipulator.manipulateAsync(asset.uri,[{crop:{originX:Math.floor((asset.width-side)/2),originY:Math.floor((asset.height-side)/2),width:side,height:side}}],{compress:0.9,format:ImageManipulator.SaveFormat.JPEG});
    cropped={...asset,...result,mimeType:'image/jpeg',fileName:'profile.jpg'};
   }
   const selected=await preparePhoto(cropped,ImageManipulator);
   if(allowed()&&generation===epoch.current)setFile(selected);
  }catch(e){if(allowed()&&generation===epoch.current)setError(e.message||'Unable to select a photo.');}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 async function save(remove=false){
  if(!allowed()||lock.current||loading||!saved||!remove&&!file)return;
  lock.current=true;setBusy(true);onBusyChange?.(true);setError('');setMessage('');setProgress(null);
  const generation=epoch.current;
  try{
   const result=remove?await removeProfilePhoto(saved.version,uid):await uploadProfilePhoto(file,saved.version,uid,value=>{if(active.current&&generation===epoch.current)setProgress(value);});
   if(!active.current||generation!==epoch.current)return;
   setSaved(result);setFile(null);setMessage(remove?'Profile photo removed.':'Profile photo saved.');
   // Refresh metadata, without locking unrelated profile editors or routing on animation.
   void Promise.resolve(refresh?.()).catch(()=>{});
  }catch(e){
   if(active.current&&generation===epoch.current){setError(e.message||'Unable to save photo. Retry the selected photo.');if(e.retryWithNewRequest){setFile(null);setSaved(null);}}
  }finally{lock.current=false;onBusyChange?.(false);if(active.current){setBusy(false);setProgress(null);}}
 }
 const customer=useCustomerExperience();
 const blocked=busy||loading||disabled||offline||!focused||!saved;
 const text={color:theme.textSecondary,fontSize:14,lineHeight:22};
 return <View style={{padding:20,borderRadius:customer?12:22,borderWidth:customer?1:0,borderColor:theme.border,backgroundColor:theme.surfaceCard,gap:14}}>
  <Text accessibilityRole="header" style={{color:theme.textPrimary,fontSize:19,fontWeight:'600'}}>{profile?.role==='shop'?'Workshop logo / profile image':'Profile photo'}</Text>
  <View style={{alignItems:'center',gap:12}}><ProfileAvatar size={96} shop={profile?.role==='shop'} revision={saved?.version??profile?.profilePhotoRevision}/>
   {!!file&&<><Text style={text}>Preview your new photo</Text><Image accessibilityLabel="Selected profile photo preview" source={{uri:file.uri}} resizeMode="cover" style={{width:160,height:160,borderRadius:80}}/></>}
  </View>
  <Text style={text}>{customer?'Choose a square JPG, PNG, WebP or HEIC photo, up to 5 MB.':'Choose a square photo. JPG, PNG, WebP and HEIC selections are prepared securely on your device. Maximum 5 MB.'}</Text>
  {(loading||busy)&&<View accessibilityRole="status"><ActivityIndicator color={theme.accent}/><Text style={text}>{loading?'Loading photo…':progress===null?'Preparing or saving photo…':`Uploading photo: ${progress}%`}</Text></View>}
  {!!error&&<Text accessibilityRole="alert" style={{...text,color:theme.error}}>{error}</Text>}
  {!!message&&<Text accessibilityRole="status" style={text}>{message}</Text>}
  {offline&&<Text style={text}>Connect to manage your profile photo.</Text>}
  <OutlineButton title={saved?.photoId?'Change Photo':'Upload Photo'} disabled={blocked} onPress={choose}/>
  {!!file&&<><PrimaryButton title="Save Photo" disabled={blocked} onPress={()=>save()}/><OutlineButton title="Cancel Photo" disabled={busy} onPress={()=>setFile(null)}/></>}
  {!!saved?.photoId&&<ConfirmationButton palette={theme} title="Remove Photo" message="Remove your current profile photo? Your avatar will return to the default icon." disabled={blocked} onConfirm={()=>save(true)} danger/>}
  {!saved&&!loading&&!offline&&<OutlineButton title="Refresh Photo" disabled={busy||disabled} onPress={load}/>}
  {photoSource.chooser}
 </View>;
}
export default function ProfilePhotoSettings(props){const {user}=useAuth();return user?.uid?<Settings key={user.uid} uid={user.uid} {...props}/>:null;}
