import React from 'react';
import {Pressable, StyleSheet, View, Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import colors from '../../theme/colors';
import {radius} from '../../theme/typography';
import AppTextInput from '../AppTextInput';
import {LandingButton} from './LandingUI';

export function FeedSearchInput({accessibilityLabel, placeholder, value, onChangeText, ...props}) {
  return <AppTextInput
    accessibilityLabel={accessibilityLabel}
    placeholder={placeholder}
    icon="search-outline"
    value={value}
    onChangeText={onChangeText}
    {...props}
  />;
}

export function FeedServicePill({title, selected, onPress, disabled = false, style}) {
  return <LandingButton
    title={title}
    outline={!selected}
    disabled={disabled}
    onPress={onPress}
    style={[styles.pill, style]}
  />;
}

export function FeedSourceSelector({options, storageKey, value, onChange}) {
  const [selected,setSelected]=useState(options[0]?.value||'all');
  const active=value??selected;
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    AsyncStorage.getItem(storageKey).then(value=>{
      if(active&&options.some(option=>option.value===value)){setSelected(value);onChange(value);}
    }).catch(()=>{if(active)setError('Your saved feed preference could not be loaded.');});
    return()=>{active=false;};
  },[storageKey]);
  async function choose(value){
    setSelected(value);onChange(value);setError('');
    try{await AsyncStorage.setItem(storageKey,value);}
    catch(_){setError('Your feed preference could not be saved.');}
  }
  return <View>
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map(option=><Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label}
          accessibilityState={{selected:active===option.value}} onPress={()=>void choose(option.value)}
          style={[styles.segment,active===option.value&&styles.segmentSelected]}>
          <Text style={[styles.segmentLabel,active===option.value&&styles.segmentLabelSelected]}>{option.label}</Text>
      </Pressable>)}
    </View>
    {!!error&&<Text accessibilityRole="alert" style={styles.preferenceError}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  pill: {flexGrow: 1, width: undefined, paddingHorizontal: 12, borderRadius: radius.pill},
  segmented: {flexDirection:'row',borderRadius:radius.pill,padding:3,backgroundColor:colors.brandGreenLight,gap:3},
  segment: {flex:1,minHeight:38,alignItems:'center',justifyContent:'center',paddingHorizontal:8,borderRadius:radius.pill},
  segmentSelected: {backgroundColor:colors.primary},
  segmentLabel: {fontSize:13,color:colors.textSecondary,fontWeight:'500'},
  segmentLabelSelected: {color:colors.white},
  preferenceError: {fontSize:12,color:colors.error,marginTop:4},
});
