import React from 'react';
import {View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {BookingAction} from './BookingUI';

export default function MockPaymentNotice({capability}){
 const {theme}=useTheme();
 return <View style={{padding:18,borderRadius:18,gap:10,backgroundColor:theme.surfaceMuted}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Ionicons name="flask-outline" size={23} color={theme.textPrimary}/><Text weight="semibold" style={{flex:1,color:theme.textPrimary}}>Simulated Payment — No Real Money</Text></View>
  <Text accessibilityRole="status" style={{color:theme.textSecondary,lineHeight:22}}>{capability.busy?'Checking simulation availability…':capability.enabled?'Payment simulation is enabled on this backend. Recorded amounts are test values, never real settlement or shop revenue.':capability.error?'Unable to verify simulation mode. Payment actions are unavailable.':'Simulation is disabled on this backend. Refresh after the operator enables mock payments.'}</Text>
  {!capability.enabled&&!capability.busy&&<BookingAction title="Check simulation availability" outline onPress={()=>void capability.refresh().catch(()=>{})}/>}
 </View>;
}
