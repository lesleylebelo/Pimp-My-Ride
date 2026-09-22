import React,{useRef,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import UploadField from '../../../shared/components/UploadField';
import {fileError} from '../utils/registration';
import colors from '../../../shared/theme/colors';
export default function DocumentPickerField({label,value,onChange,error,disabled}) {
 const [pickError,setPickError]=useState('');
 const picking=useRef(false);
  async function pick() {
   if(disabled||picking.current)return;
   picking.current=true;setPickError('');
  try {
   const result = await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true,multiple:false});
   if (result.canceled) return;
   const file=result.assets[0], issue=fileError(file);
   if(issue) { setPickError(issue);return; }
   onChange(file);
  } catch (_) { setPickError('Unable to open file. Please choose the file again.'); }
  finally {picking.current=false;}
 }
 return <View><UploadField label={label} fileName={value?.name} onPress={disabled?undefined:pick}/>
 {value && <Pressable disabled={disabled} onPress={()=>onChange(null)}><Text style={{color:colors.primary,marginBottom:12}}>Remove file</Text></Pressable>}
 {(pickError||error) && <Text accessibilityRole="alert" style={{color:colors.error,marginBottom:12}}>{pickError||error}</Text>}</View>;
}
