import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Modal,ScrollView,Pressable,ActivityIndicator,KeyboardAvoidingView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../context/AuthContext';
import {googleLogin,cancelled} from '../services/googleAccounts';
import {acquireAndroidGoogle,exchangeAndroidGoogle} from '../services/googleIdentity.android';
import {registrationErrors} from '../utils/registration';
import {authError} from '../utils/authErrors';
import {useTheme} from '../../../shared/theme/ThemeContext';
import AppTextInput from '../../../shared/components/AppTextInput';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import OutlineButton from '../../../shared/components/OutlineButton';
import RoleToggle from './RoleToggle';
import LegalScreen from '../screens/LegalScreen';

const shopFields=[['shopName','Shop name'],['regNumber','Business registration number'],['address','Physical address'],['city','City'],['province','Province'],['services','Services offered']];
const emptyForm={fullName:'',phone:'',agreed:false,shopName:'',regNumber:'',address:'',city:'',province:'',services:''};

export default function GoogleSignIn({disabled=false,initialRole='owner'}){
 const {run,offline,working}=useAuth(),{theme}=useTheme();
 const [open,setOpen]=useState(false),[stage,setStage]=useState('busy'),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [attempting,setAttempting]=useState(false),[selecting,setSelecting]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState(initialRole),[form,setForm]=useState(emptyForm),[errors,setErrors]=useState({});
 const [legal,setLegal]=useState(false);
 const controller=useRef(null),pending=useRef(null),inFlight=useRef(false),mounted=useRef(true);
 const stop=()=>{controller.current?.abort();pending.current?.reject(cancelled());pending.current=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
 const waitForInput=(next,identity)=>new Promise((resolve,reject)=>{
  if(controller.current?.signal.aborted){reject(cancelled());return;}
  pending.current={resolve,reject};setEmail(identity.email);setStage(next);
 });
 const close=()=>{stop();setOpen(false);setLegal(false);setPassword('');setForm(emptyForm);setMessage('Google sign-in cancelled. You remain signed out.');};
 async function start(){
  if(inFlight.current||disabled||offline||working)return;
  inFlight.current=true;setAttempting(true);stop();
  controller.current=new AbortController();const signal=controller.current.signal;
  setError('');setErrors({});setPassword('');setForm(emptyForm);setRole(initialRole);setStage('busy');setOpen(true);setMessage('');setSelecting(true);
  try{
   const identity=await acquireAndroidGoogle(signal);
   if(mounted.current)setSelecting(false);
   await googleLogin({...identity,signal,run,exchange:exchangeAndroidGoogle,
    askPassword:address=>waitForInput('link',{email:address}),askProfile:profile=>waitForInput('profile',profile)});
   if(mounted.current){setOpen(false);setMessage('Google sign-in completed.');}
  }catch(e){
   if(mounted.current&&!signal.aborted){
    if(e?.code==='auth/google-cancelled'){setOpen(false);setMessage(authError(e));}
    else{setError(authError(e));setStage('failed');}
   }
  }finally{
   inFlight.current=false;pending.current=null;
   if(mounted.current){setAttempting(false);setSelecting(false);setPassword('');}
  }
 }
 function submit(){
  if(!pending.current)return;
  if(stage==='link'){
   if(!password){setErrors({password:'Enter your existing account password.'});return;}
   const next=pending.current;pending.current=null;setStage('busy');setPassword('');next.resolve(password);return;
  }
  const issues={...registrationErrors({...form,email,password:'',confirmPassword:''},role,1),...(role==='shop'?registrationErrors(form,role,2):{})};
  delete issues.password;delete issues.confirmPassword;setErrors(issues);
  if(Object.keys(issues).length)return;
  const next=pending.current;pending.current=null;setStage('busy');next.resolve({form,role});
 }
 const field=(key,label,extra={})=><AppTextInput key={key} label={label} value={form[key]} error={errors[key]} onChangeText={value=>setForm(previous=>({...previous,[key]:value}))} {...extra}/>;
 return <>
  <OutlineButton title="Continue with Google" icon="google" iconSet="material" onPress={start} disabled={disabled||offline||working||attempting||open} style={{marginBottom:16}}/>
  {!!message&&<Text accessibilityRole="status" style={{color:theme.textSecondary,marginBottom:12}}>{message}</Text>}
  <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
   <SafeAreaView style={{flex:1,backgroundColor:'rgba(0,0,0,0.65)'}}>
    <KeyboardAvoidingView behavior="height" style={{flex:1,justifyContent:'center',alignItems:'center',padding:16}}>
     <ScrollView keyboardShouldPersistTaps="handled" style={{width:'100%',maxWidth:520,maxHeight:'95%',backgroundColor:theme.background,borderRadius:24}} contentContainerStyle={{padding:24,gap:16}}>
      <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'600',color:theme.textPrimary}}>{stage==='profile'?'Complete your Google signup':stage==='link'?'Connect your existing account':'Continue with Google'}</Text>
      {stage==='busy'&&<><ActivityIndicator color={theme.primary}/><Text style={{color:theme.textSecondary}}>{selecting?'Choose your Google account on the Android account picker.':'Verifying your account securely…'}</Text></>}
      {stage==='link'&&<>
       <Text style={{color:theme.textSecondary}}>An account already uses {email}. Enter its password to connect Google while keeping your account and data. Your password will continue to work.</Text>
       <AppTextInput label="Existing account password" value={password} onChangeText={setPassword} error={errors.password} secureTextEntry showPasswordToggle autoCapitalize="none"/>
       <PrimaryButton title="Confirm password and connect Google" onPress={submit}/>
       <Text style={{color:theme.textSecondary}}>Forgot your password? Cancel and use Forgot password on the sign-in screen, then return here.</Text>
      </>}
      {stage==='profile'&&<>
       <Text style={{color:theme.textSecondary}}>{email}</Text>
       <RoleToggle role={role} onChange={setRole}/>
       {field('fullName',role==='shop'?'Owner/representative':'Full name')}
       {field('phone','Phone number',{keyboardType:'phone-pad',placeholder:'0821234567'})}
       {role==='shop'&&shopFields.map(([key,label])=>field(key,label))}
       <Pressable accessibilityRole="checkbox" accessibilityState={{checked:form.agreed}} onPress={()=>setForm(previous=>({...previous,agreed:!previous.agreed}))}><Text style={{color:theme.textPrimary}}>{form.agreed?'☑':'☐'} I accept the terms and privacy notice.</Text></Pressable>
       <OutlineButton title="Read terms and privacy notice" onPress={()=>setLegal(true)}/>
       {!!errors.agreed&&<Text accessibilityRole="alert" style={{color:theme.error}}>{errors.agreed}</Text>}
       {role==='shop'&&<Text style={{color:theme.textSecondary}}>Workshops must upload verification documents and wait for approval before accessing workshop features.</Text>}
       <PrimaryButton title={role==='shop'?'Create pending workshop account':'Create customer account'} onPress={submit}/>
      </>}
      {!!error&&<Text accessibilityRole="alert" style={{color:theme.error}}>{error}</Text>}
      <OutlineButton title={stage==='failed'?'Close and try again':'Cancel Google sign-in'} onPress={close}/>
     </ScrollView>
    </KeyboardAvoidingView>
   </SafeAreaView>
  </Modal>
  <Modal visible={legal&&open} animationType="slide" onRequestClose={()=>setLegal(false)}><LegalScreen navigation={{goBack:()=>setLegal(false)}}/></Modal>
 </>;
}
