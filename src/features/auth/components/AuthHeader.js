import React from 'react';
import {View,Text} from 'react-native';
import {useTheme} from '../../../shared/theme/ThemeContext';
import LogoMark from '../../../shared/components/LogoMark';
export default function AuthHeader({title,subtitle}){
 const {theme}=useTheme();
 return <View style={{padding:24,gap:12,alignItems:'center',backgroundColor:theme.background}}>
  <LogoMark size={88}/>
  <Text style={{color:theme.textPrimary,fontSize:18,fontWeight:'600',textAlign:'center'}}>PimpMyRide</Text>
  <Text style={{color:theme.textSecondary,fontSize:14,textAlign:'center'}}>Connect. Customize. Drive your style.</Text>
  <Text accessibilityRole="header" style={{color:theme.textPrimary,fontSize:28,fontWeight:'500',textAlign:'center'}}>{title}</Text>
  {!!subtitle&&<Text style={{color:theme.textSecondary,fontSize:15,lineHeight:23,textAlign:'center'}}>{subtitle}</Text>}
 </View>;
}
