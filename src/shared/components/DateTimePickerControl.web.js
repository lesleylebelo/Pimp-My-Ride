import React, {useRef, useState} from 'react';
import {Pressable, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {validPickerValue} from '../utils/dateTime';

export default function DateTimePickerControl({mode, label, value, minimum, maximum, disabled, invalid, describedBy, theme, isDark, onSelect, onBlur, onError}) {
  const input = useRef(null), [focused, setFocused] = useState(false);
  function open() {
    if (disabled) return;
    input.current?.focus();
    // Browsers without showPicker retain their native keyboard/calendar affordance.
    try { input.current?.showPicker?.(); } catch { /* The focused input remains usable. */ }
  }
  return <View style={{flexDirection:'row',alignItems:'center',minHeight:54,borderWidth:1,borderRadius:14,paddingLeft:16,paddingRight:4,
    borderColor:invalid?theme.error:focused?theme.accent:theme.border,backgroundColor:theme.surfaceMuted,opacity:disabled ? .5 : 1}}>
    <input ref={input} type={mode} aria-label={label} aria-invalid={invalid} aria-describedby={describedBy}
      value={validPickerValue(value, mode)?value:''} min={minimum || undefined} max={maximum || undefined} step={mode==='time'?60:undefined} disabled={disabled}
      onChange={event => {
        if (event.target.validity?.badInput) { onError(`Choose a valid ${mode}.`); return; }
        onSelect(event.target.value);
      }} onFocus={() => setFocused(true)} onBlur={event => {setFocused(false);onBlur?.(event);}}
      style={{flex:1,minWidth:0,width:'100%',minHeight:52,border:0,outline:'none',background:'transparent',color:theme.textPrimary,
        fontFamily:'inherit',fontSize:15,colorScheme:isDark?'dark':'light'}}/>
    <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label}`} disabled={disabled} onPress={open}
      style={{width:44,height:48,alignItems:'center',justifyContent:'center'}}>
      <Ionicons name={mode==='time'?'time-outline':'calendar-outline'} size={20} color={theme.accent}/>
    </Pressable>
  </View>;
}
