import React, {useEffect, useId, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useTheme} from '../theme/ThemeContext';
import {validPickerValue} from '../utils/dateTime';
import DateTimePickerControl from './DateTimePickerControl';

export default function AppDateTimeField({mode, label, value = '', onChange, onBlur, disabled = false, minimum, maximum, error, helperText, clearable = false}) {
  const {theme, isDark} = useTheme(), id = useId();
  const [selectionError, setSelectionError] = useState('');
  useEffect(() => setSelectionError(''), [value, minimum, maximum, disabled]);
  const invalidRange = minimum && !validPickerValue(minimum, mode) || maximum && !validPickerValue(maximum, mode) || minimum && maximum && minimum > maximum;
  const invalidValue = value && !validPickerValue(value, mode);
  const message = error || selectionError || (invalidRange ? 'Selection range is unavailable.' : invalidValue ? `Choose a valid ${mode}.` : '');
  const unavailable = disabled || !!invalidRange;
  function select(next) {
    if (unavailable) return;
    if (next && (!validPickerValue(next, mode) || minimum && next < minimum || maximum && next > maximum)) {
      setSelectionError(`Choose a valid ${mode}${minimum ? ` from ${minimum}` : ''}${maximum ? ` up to ${maximum}` : ''}.`);
      onBlur?.();
      return;
    }
    setSelectionError(''); onChange?.(next); onBlur?.();
  }
  return <View style={styles.wrapper}>
    <Text nativeID={`${id}-label`} style={[styles.label, {color: theme.textSecondary}]}>{label}</Text>
    <DateTimePickerControl {...{mode, label, value, minimum, maximum, theme, isDark, onBlur}} disabled={unavailable} invalid={!!message}
      describedBy={`${id}-feedback`} onSelect={select} onError={setSelectionError}/>
    {clearable && !!value && <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} disabled={unavailable} onPress={() => select('')}
      style={({pressed}) => [{minHeight:44,justifyContent:'center',alignSelf:'flex-start',paddingHorizontal:8,opacity:unavailable ? .5 : pressed ? .7 : 1}]}>
      <Text style={{color:theme.textPrimary,fontSize:13}}>Clear selection</Text>
    </Pressable>}
    <Text nativeID={`${id}-feedback`} accessibilityLiveRegion="polite" accessibilityRole={message ? 'alert' : undefined}
      style={[styles.feedback, {color: message ? theme.error : theme.textSecondary}]}>{message || helperText || (mode === 'time' ? 'South African Standard Time (SAST, UTC+02:00).' : 'Choose a calendar date.')}</Text>
  </View>;
}
const styles = StyleSheet.create({
  wrapper:{marginBottom:16,minWidth:0},
  label:{fontSize:13,fontWeight:'600',marginBottom:8,letterSpacing:.2},
  feedback:{fontSize:12,lineHeight:18,marginTop:6,marginLeft:2},
});
