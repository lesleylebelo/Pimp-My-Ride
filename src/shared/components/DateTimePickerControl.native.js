import React, {useEffect, useRef, useState} from 'react';
import {Modal, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import DateTimePicker, {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {Ionicons} from '@expo/vector-icons';
import {APPOINTMENT_TIME_ZONE, calendarDateLabel, pickerDate, pickerValue, validPickerValue} from '../utils/dateTime';

export default function DateTimePickerControl(props) {
  const {mode,label,value,minimum,maximum,disabled,invalid,theme,isDark,onSelect,onBlur,onError}=props;
  const latest=useRef(props);latest.current=props;
  const pending=useRef(false),epoch=useRef(0);
  const [visible,setVisible]=useState(false),[draft,setDraft]=useState(()=>pickerDate(value,mode));
  const close=()=>{setVisible(false);onBlur?.();};
  useEffect(()=>{
    setVisible(false);
    return()=>{
      ++epoch.current;
      if(pending.current){pending.current=false;void DateTimePickerAndroid.dismiss(mode).catch(()=>{});}
    };
  },[disabled,mode,value]);
  function open() {
    if(disabled||pending.current)return;
    let initial=pickerValue(pickerDate(value,mode),mode);
    if(minimum&&initial<minimum)initial=minimum;
    if(maximum&&initial>maximum)initial=maximum;
    const selected=pickerDate(initial,mode);
    if(Platform.OS!=='android'){setDraft(selected);setVisible(true);return;}
    const ticket=++epoch.current;pending.current=true;
    const current=callback=>{if(ticket!==epoch.current||!pending.current)return;pending.current=false;++epoch.current;if(!latest.current.disabled)callback(latest.current);};
    try {
      DateTimePickerAndroid.open({mode,value:selected,timeZoneName:APPOINTMENT_TIME_ZONE,is24Hour:true,
        ...(mode==='date'?{minimumDate:minimum?pickerDate(minimum,mode):undefined,maximumDate:maximum?pickerDate(maximum,mode):undefined}:{}),
        positiveButton:{label:'Select',textColor:theme.accent},negativeButton:{label:'Cancel'},
        onValueChange:(_,date)=>current(next=>{const result=pickerValue(date,mode);if(result)next.onSelect(result);else next.onError(`Choose a valid ${mode}.`);}),
        onDismiss:()=>current(next=>next.onBlur?.()),
        onError:()=>current(next=>next.onError('Unable to open the picker. Please try again.')),
      });
    } catch { pending.current=false;++epoch.current;onError('Unable to open the picker. Please try again.'); }
  }
  const action=(title,onPress)=><Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={({pressed})=>({minHeight:48,paddingHorizontal:16,justifyContent:'center',opacity:pressed ? .7 : 1})}><Text style={{color:theme.textPrimary,fontWeight:'600'}}>{title}</Text></Pressable>;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`Choose a ${mode}`} accessibilityState={{disabled}}
      accessibilityValue={{text:validPickerValue(value,mode)?value:'No selection'}} disabled={disabled} onPress={open}
      style={({pressed})=>({flexDirection:'row',alignItems:'center',gap:10,minHeight:54,paddingHorizontal:16,paddingVertical:12,borderRadius:14,borderWidth:1,
        borderColor:invalid?theme.error:theme.border,backgroundColor:theme.surfaceMuted,opacity:disabled ? .5 : pressed ? .7 : 1})}>
      <Ionicons name={mode==='time'?'time-outline':'calendar-outline'} size={20} color={theme.accent}/>
      <Text style={{flex:1,color:value?theme.textPrimary:theme.textSecondary,fontSize:15}}>{validPickerValue(value,mode)?(mode==='time'?`${value} SAST`:calendarDateLabel(value)):`Select ${mode}`}</Text>
    </Pressable>
    <Modal visible={visible&&!disabled} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={[styles.panel,{backgroundColor:theme.surfaceCard,borderColor:theme.border}]}>
        <Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'600',fontSize:18}}>{label}</Text>
        <DateTimePicker mode={mode} value={draft} display="spinner" timeZoneName={APPOINTMENT_TIME_ZONE} themeVariant={isDark?'dark':'light'} textColor={theme.textPrimary} accentColor={theme.accent}
          minimumDate={mode==='date'&&minimum?pickerDate(minimum,mode):undefined} maximumDate={mode==='date'&&maximum?pickerDate(maximum,mode):undefined}
          onValueChange={(_,date)=>{if(pickerValue(date,mode))setDraft(date);else onError(`Choose a valid ${mode}.`);}}/>
        <View style={{flexDirection:'row',justifyContent:'flex-end',flexWrap:'wrap'}}>{action('Cancel',close)}{action('Use selection',()=>{onSelect(pickerValue(draft,mode));close();})}</View>
      </View></View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({
  backdrop:{flex:1,padding:16,backgroundColor:'#00000099',alignItems:'center',justifyContent:'center'},
  panel:{width:'100%',maxWidth:420,padding:16,borderRadius:14,borderWidth:1,gap:12},
});
