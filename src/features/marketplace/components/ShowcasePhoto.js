import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Text,View} from 'react-native';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {viewPostPhoto} from '../services/postsApi';
import {isMediaUrl} from '../../../shared/services/mediaUrl';
import {Button} from './MarketplaceUI';

export const hasPostImage=image=>typeof image?.path==='string'||isMediaUrl(image?.url);

// Bucket/path identify private media. Never persist signed URLs in a post or cache.
export default function ShowcasePhoto({postId,image,style,resizeMode='cover'}){
 const {theme}=useTheme();
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const [access,setAccess]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const privateMedia=!!image?.bucket||(typeof image?.path==='string'&&!isMediaUrl(image?.url)),key=JSON.stringify([uid,postId,image?.bucket,image?.path,focused,offline,retry]);
 useEffect(()=>{
  let active=true,timer;setAccess(null);setError('');
  if(!privateMedia||!uid||offline||!focused)return;
  async function load(){
   try{
    const result=await viewPostPhoto(postId,image.path,uid);
    if(!active)return;
    if(!isMediaUrl(result?.url)||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now())throw Error('Photo access expired. Try again.');
    setAccess({key,url:result.url});setError('');
    timer=setTimeout(()=>{setAccess(null);void load();},Math.max(1000,Math.min(55000,result.expiresAt-Date.now()-5000)));
   }catch(e){if(active){setAccess(null);setError(e.message||'Photo unavailable. Try again.');}}
  }
  void load();return()=>{active=false;clearTimeout(timer);};
 },[key,privateMedia]);
 if(!uid||offline||!focused)return null;
 const url=privateMedia?(access?.key===key?access.url:null):image?.url;
 return <View>{!isMediaUrl(url)&&!error&&<View accessibilityLabel="Loading private photo" style={[style,{backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center'}]}><ActivityIndicator color={theme.accent}/><Text style={{color:theme.textSecondary}}>Loading photo…</Text></View>}{isMediaUrl(url)&&!error&&<Image accessibilityLabel="Showcase photo" source={{uri:url,...(privateMedia?{cache:'reload'}:{})}} style={style} resizeMode={resizeMode} onError={()=>{setAccess(null);setError('Photo unavailable. Try again.');}}/>}{!!error&&<View style={[style,{backgroundColor:theme.surfaceMuted,padding:12,justifyContent:'center',gap:12}]}><Text accessibilityRole="alert" style={{color:theme.textPrimary}}>{error}</Text><Button title="Retry photo" outline onPress={()=>{setError('');setRetry(value=>value+1);}}/></View>}</View>;
}
