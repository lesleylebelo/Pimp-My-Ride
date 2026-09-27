import React,{useEffect,useState} from 'react';
import {View,Text} from 'react-native';
import {onBackendWaiting} from '../services/api';
import colors from '../theme/colors';
export default function BackendStatus(){
 const [waiting,setWaiting]=useState(false);
 useEffect(()=>onBackendWaiting(setWaiting),[]);
 if(!waiting)return null;
 return <View accessibilityLiveRegion="polite" style={{position:'absolute',bottom:35,left:20,right:20,padding:16,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.white,zIndex:999}}><Text style={{color:colors.textPrimary}}>Connecting to the server. The first connection can take about a minute. Please keep the app open.</Text></View>;
}
