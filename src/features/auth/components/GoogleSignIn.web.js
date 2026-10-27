import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Modal,ScrollView,Pressable,ActivityIndicator} from 'react-native';
import {useAuth} from '../context/AuthContext';
import {googleLogin,cancelled} from '../services/googleAccounts';
import {googleNonce,loadGoogleIdentity} from '../services/googleIdentity';
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
const clientId=process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export default function GoogleSignIn({disabled=false,initialRole='owner'}){
 const {run,offline,working}=useAuth(),{theme}=useTheme();
 const [open,setOpen]=useState(false),[stage,setStage]=useState('google'),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState(initialRole),[form,setForm]=useState(emptyForm),[errors,setErrors]=useState({});
 const [legal,setLegal]=useState(false);
 const host=useRef(null),controller=useRef(null),pending=useRef(null),inFlight=useRef(false),mounted=useRef(true);
 const stop=()=>{controller.current?.abort();pending.current?.reject(cancelled());pending.current=null;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
 const waitForInput=(next,identity)=>new Promise((resolve,reject)=>{
  if(controller.current?.signal.aborted){reject(cancelled());return;}
  pending.current={resolve,reject};setEmail(identity.email);setStage(next);
 });
 const close=()=>{stop();setOpen(false);setPassword('');setForm(emptyForm);setMessage('Google sign-in cancelled. You remain signed out.');};
 useEffect(()=>{
  if(!open||stage!=='google')return;
  let disposed=false;
  const signal=controller.current.signal;
  let identity;
  loadGoogleIdentity().then(api=>{
   if(disposed||signal.aborted)return;
   identity=api;const nonce=googleNonce();
   api.initialize({client_id:clientId,nonce,auto_select:false,callback:async response=>{
    if(disposed||signal.aborted||inFlight.current)return;
    if(!response?.credential){setError('Google did not return a credential. Please try again.');return;}
    inFlight.current=true;setStage('busy');setError('');
    try{
     await googleLogin({credential:response.credential,nonce,signal,run,
      askPassword:address=>waitForInput('link',{email:address}),askProfile:profile=>waitForInput('profile',profile)});
     if(mounted.current){setOpen(false);setMessage('Google sign-in completed.');}
    }catch(e){if(mounted.current&&!signal.aborted){setError(authError(e));setStage('failed');}}
    finally{inFlight.current=false;pending.current=null;if(mounted.current)setPassword('');}
   }});
   if(host.current)api.renderButton(host.current,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'pill',width:Math.max(200,Math.min(360,host.current.clientWidth||300))});
  }).catch(e=>{if(!disposed&&!signal.aborted){setError(e.message);setStage('failed');}});
  // Stage transitions keep the in-progress credential callback alive.
  return()=>{disposed=true;identity?.cancel();};
 },[open]);
 function start(){
  if(inFlight.current||disabled||offline||working)return;
  if(!clientId){setMessage('Google sign-in is not configured yet. Please use email/password.');return;}
  stop();controller.current=new AbortController();setError('');setErrors({});setPassword('');setForm(emptyForm);setRole(initialRole);setStage('google');setOpen(true);setMessage('');
 }
 function submit(){
  if(!pending.current)return;
  if(stage==='link'){
   if(!password){setErrors({password:'Enter your existing account password.'});return;}
   const next=pending.current;pending.current=null;setStage('busy');setPassword('');next.resolve(password);return;
  }
  // Reuse signup validation without inventing a password for Google accounts.
  const issues={...registrationErrors({...form,email,password:'',confirmPassword:''},role,1),...(role==='shop'?registrationErrors(form,role,2):{})};
  delete issues.password;delete issues.confirmPassword;setErrors(issues);
  if(Object.keys(issues).length)return;
  const next=pending.current;pending.current=null;setStage('busy');next.resolve({form,role});
 }
 const field=(key,label,extra={})=><AppTextInput key={key} label={label} value={form[key]} error={errors[key]} onChangeText={value=>setForm(previous=>({...previous,[key]:value}))} {...extra}/>;
 return <>
  <OutlineButton title="Continue with Google" icon="google" iconSet="material" onPress={start} disabled={disabled||offline||working||open} style={{marginBottom:16}}/>
  {!!message&&<Text accessibilityRole="status" style={{color:theme.textSecondary,marginBottom:12}}>{message}</Text>}
  <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
   <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'center',alignItems:'center',padding:16}}>
    <ScrollView keyboardShouldPersistTaps="handled" style={{width:'100%',maxWidth:520,maxHeight:'90%',backgroundColor:theme.background,borderRadius:24}} contentContainerStyle={{padding:24,gap:16}}>
     <Text accessibilityRole="header" style={{fontSize:24,fontWeight:'600',color:theme.textPrimary}}>{stage==='profile'?'Complete your Google signup':stage==='link'?'Connect your existing account':'Continue with Google'}</Text>
     {stage==='google'&&<><Text style={{color:theme.textSecondary}}>Choose your Google account. If you close the Google window, you can try again or cancel below.</Text><View ref={host} style={{minHeight:48,alignItems:'center'}}/></>}
     {stage==='busy'&&<><ActivityIndicator color={theme.primary}/><Text style={{color:theme.textSecondary}}>Verifying your account securely…</Text></>}
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
   </View>
  </Modal>
  <Modal visible={legal&&open} animationType="slide" onRequestClose={()=>setLegal(false)}><LegalScreen navigation={{goBack:()=>setLegal(false)}}/></Modal>
 </>;
}
