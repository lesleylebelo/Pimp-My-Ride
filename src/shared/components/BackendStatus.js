import React,{useEffect,useState} from 'react';
import {View,Text} from 'react-native';
import {onBackendWaiting} from '../services/api';
export default function BackendStatus(){
 const [waiting,setWaiting]=useState(false);
 useEffect(()=>onBackendWaiting(setWaiting),[]);
 if(!waiting)return null;
 return <View accessibilityLiveRegion="polite" style={{position:'absolute',bottom:35,left:20,right:20,padding:14,borderRadius:10,backgroundColor:'#103C2E',zIndex:999,elevation:20}}><Text style={{color:'#fff'}}>Connecting to the server. The first connection can take about a minute. Please keep the app open.</Text></View>;
}
