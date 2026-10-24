import React from 'react';
import {Image,View} from 'react-native';
// A neutral plate keeps the charcoal R visible in both application themes.
export default function LogoMark({size=72}){
 return <View accessible accessibilityRole="image" accessibilityLabel="PimpMyRide PR logo: mechanical services and vehicle customisation" style={{width:size,height:size,borderRadius:size*0.22,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',flexShrink:0}}>
  <Image accessible={false} source={require('../../../assets/branding/pimpmyride-logo.png')} resizeMode="contain" style={{width:size,height:size}}/>
 </View>;
}
