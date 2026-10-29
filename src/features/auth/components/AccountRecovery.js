import React,{useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {recoverAccount} from '../services/accountManagement';
import {authError} from '../utils/authErrors';
export default function AccountRecovery({eligible=false,email,password,disabled,onBusyChange,onRecovered}){
 const {theme}=useTheme(),{user}=useAuth(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function reactivate(){
  if(lock.current||disabled||!eligible||user||!email||!password)return;
  lock.current=true;setBusy(true);onBusyChange?.(true);setMessage('');
  try{await recoverAccount(email,password,true);if(mounted.current)onRecovered?.();}
  catch(error){if(mounted.current)setMessage(authError(error));}
  finally{lock.current=false;if(mounted.current)setBusy(false);onBusyChange?.(false);}
 }
 if(!eligible||user)return null;
 return <View style={{gap:12,marginBottom:12}}><Text style={{color:theme.textSecondary}}>You can reactivate your account, then sign in again.</Text><PrimaryButton title="Reactivate my account" disabled={disabled||busy} onPress={()=>void reactivate()}/>{!!message&&<Text accessibilityRole="alert" style={{color:theme.error}}>{message}</Text>}</View>;
}
