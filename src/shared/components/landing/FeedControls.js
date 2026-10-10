import React, { useRef } from 'react';
import { Pressable, StyleSheet, View, Text, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/typography';
import AppTextInput from '../AppTextInput';

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

export function FeedServicePill({title, icon, selected, onPress, disabled = false, style}) {
  const {theme} = useTheme();
  const styles = makeStyles(theme);
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const handlePressIn = () => {
    shimmerAnim.setValue(-1);
    Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {};

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-260, 260],
  });

  const labelColor = selected ? theme.primaryText : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.pill, selected && styles.pillSelected, disabled && styles.pillDisabled, style]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.shimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '20deg' }] }]}
      />
      {icon ? <Ionicons name={icon} size={16} color={labelColor} style={styles.pillIcon} /> : null}
      <Text style={[styles.pillLabel, { color: labelColor, fontWeight: selected ? '700' : '500' }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function FeedSourceSelector({options, storageKey, value, onChange}) {
  const {theme} = useTheme();
  const styles = makeStyles(theme);
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

const makeStyles = (colors) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 0,
    overflow: 'hidden',
  },
  pillSelected: { backgroundColor: colors.primary },
  pillDisabled: { opacity: 0.5 },
  pillIcon: { marginTop: 1 },
  pillLabel: { fontSize: 14, letterSpacing: 0.2 },
  shimmer: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  segmentSelected: { backgroundColor: colors.accent },
  segmentLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  segmentLabelSelected: { color: colors.primaryText, fontWeight: '700' },
  preferenceError: { fontSize: 12, color: colors.error, marginTop: 4 },
});