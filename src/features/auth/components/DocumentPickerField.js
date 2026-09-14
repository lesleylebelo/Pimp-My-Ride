import React from 'react';
import {View,Text,Pressable,Alert} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import UploadField from '../../../shared/components/UploadField';
import {fileError} from '../utils/registration';
import colors from '../../../shared/theme/colors';
export default function DocumentPickerField({label,value,onChange,error,disabled}) {
 async function pick() {
  try {
   const result = await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true,multiple:false});
   if (result.canceled) return;
   const file=result.assets[0], issue=fileError(file);
   if(issue) { Alert.alert('Choose another file',issue);return; }
   onChange(file);
  } catch (_) { Alert.alert('Unable to open file','Please choose the file again.'); }
 }
 return <View><UploadField label={label} fileName={value?.name} onPress={disabled?undefined:pick}/>
 {value && <Pressable disabled={disabled} onPress={()=>onChange(null)}><Text style={{color:colors.primary,marginBottom:12}}>Remove file</Text></Pressable>}
 {error && <Text accessibilityRole="alert" style={{color:colors.error,marginBottom:12}}>{error}</Text>}</View>;
}
