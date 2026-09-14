import React,{useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import AppTextInput from '../../../shared/components/AppTextInput';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import RoleToggle from './RoleToggle';
import {completeProfile} from '../services/accounts';
import {useAuth} from '../context/AuthContext';
import {registrationErrors} from '../utils/registration';
import {authError} from '../utils/authErrors';
export default function ProfileRecovery() {
 const {user,refresh,offline}=useAuth();
 const [issues,setIssues]=useState({});
 const [role,setRole]=useState('owner'),[form,setForm]=useState({fullName:'',phone:'',agreed:false}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function change(key,value){
  const next={...form,[key]:value};setForm(next);setError('');
  const details={...next,email:user.email,password:'not-used-in-recovery',confirmPassword:'not-used-in-recovery'};
  const all={...registrationErrors(details,role,1),...registrationErrors(details,role,2)};
  setIssues(e=>({...e,[key]:all[key]}));
 }
 async function save() {
  if(busy)return;
  const details={...form,email:user.email,password:'not-used-in-recovery',confirmPassword:'not-used-in-recovery'};
  const errors={...registrationErrors(details,role,1),...(role==='shop'?registrationErrors(details,role,2):{})};
  if(Object.keys(errors).length){setError(Object.values(errors).join('\n'));return;}
  setBusy(true);setError('');
  try{await completeProfile(details,role);await refresh();}catch(e){setError(authError(e));}finally{setBusy(false);}
 }
 return <View pointerEvents={busy?'none':'auto'} style={{gap:12}}>
 <Text>Finish saving your profile using the account you already created.</Text>
 <RoleToggle role={role} onChange={setRole}/>
 {['fullName','phone',...(role==='shop'?['shopName','regNumber','address','city','province','services']:[])].map(key=><AppTextInput key={key} label={{fullName:'Full name',phone:'Phone number',shopName:'Shop name',regNumber:'Registration number',address:'Address',city:'City',province:'Province',services:'Services offered'}[key]} value={form[key]||''} error={issues[key]} onChangeText={value=>change(key,value)}/>)}
 <Text>This academic demo stores your account and shop details in Firebase for account management and administrator review. Use fictional sample documents. Contact the student project team for correction or deletion. No real transactions are offered.</Text>
 <Pressable accessibilityRole="checkbox" accessibilityState={{checked:form.agreed}} onPress={()=>setForm(f=>({...f,agreed:!f.agreed}))}><Text>{form.agreed?'☑':'☐'} I accept these academic demo terms and privacy notice.</Text></Pressable>
 <Text accessibilityRole="alert" style={{color:'#C0392B'}}>{error}</Text>
 <PrimaryButton title="Save profile" loading={busy} disabled={offline} onPress={save}/>
 </View>;
}
