import React from 'react';
import {StyleSheet} from 'react-native';
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

const styles = StyleSheet.create({
  pill: {flexGrow: 1, width: undefined, paddingHorizontal: 12, borderRadius: radius.pill},
});
