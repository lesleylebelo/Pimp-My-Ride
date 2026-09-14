import ProfileRecovery from '../components/ProfileRecovery';
import React,{useState} from 'react';
import {ScrollView,Text,Alert,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {sendEmailVerification} from 'firebase/auth';
import {useAuth} from '../context/AuthContext';
import {firebase} from '../../../shared/services/firebase';
import {uploadDocuments} from '../services/accounts';
import {authError} from '../utils/authErrors';
import {accountStage,DOCUMENT_KEYS} from '../utils/registration';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import DocumentPickerField from '../components/DocumentPickerField';
export default function AccountScreen() {
 const {user,profile,error,refresh,logout,offline,cachedAt,requireConnection}=useAuth();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[files,setFiles]=useState({}),[resendAt,setResendAt]=useState(0);
 const stage=accountStage(user,profile);
 const titles={verify:'Verify your email',pending:'Shop verification pending',rejected:'Shop registration not approved',ready:'You’re signed in',incomplete:'Account setup needs attention',invalid:'Account role needs attention'};
 async function action(fn,success='') {if(busy)return;setBusy(true);setMessage('');try {await fn();setMessage(success);}catch(e){setMessage(authError(e));}finally{setBusy(false);}}
 return <SafeAreaView style={{flex:1,backgroundColor:'#F2F2F2'}}><ScrollView contentContainerStyle={{padding:24,gap:18}}>
 <Text style={{fontSize:26,fontWeight:'800',color:'#0E3B2C'}}>{offline ? 'You are offline' : error ? 'Account access needs attention' : titles[stage]}</Text>
 <Text>{profile?.fullName || user?.email}</Text><Text>{profile?.role === 'owner' ? 'Vehicle owner' : profile?.role === 'shop' ? 'Custom shop' : profile?.role === 'admin' ? 'Administrator' : ''}</Text>
 {stage==='verify' && <><Text>Open the verification email sent to {user.email}. After you verify, return to the app. This page checks automatically and will continue when verification is confirmed.</Text>

 <PrimaryButton title="Resend verification email" disabled={busy || offline} onPress={()=>action(async()=>{if(Date.now()<resendAt)throw new Error('Please wait one minute before resending.');await requireConnection();await sendEmailVerification(firebase().auth.currentUser);setResendAt(Date.now()+60000);},'Verification email sent.')}/></>}
 {stage==='pending' && <Text>Your shop needs administrator approval before it can use the marketplace. Ensure all three documents have uploaded successfully.</Text>}
 {stage==='rejected' && <Text>Contact the project administrator to discuss the review. Marketplace access is restricted.</Text>}
 {(stage==='incomplete'||stage==='invalid') && <Text>Your sign-in account exists but its profile is unavailable or incomplete. Retry loading it or complete the profile below. If an access error appears, contact the project administrator.</Text>}
 {stage==='incomplete' && !error && !offline && <ProfileRecovery/>}
 {stage==='ready' && <Text>Your authentication is working. This is a temporary welcome screen; marketplace features will be built next.</Text>}
 {!offline && user?.emailVerified && profile?.role==='shop' && profile.verificationStatus==='pending' && <View style={{gap:12}}>
 <Text>Upload or replace verification documents (PDF/JPG/PNG, up to 5 MB each). Use fictional sample documents for this academic demo.</Text>
 {DOCUMENT_KEYS.map(key=><DocumentPickerField key={key} label={{cipcCert:'CIPC certificate',proofOfAddress:'Proof of address',ownerId:'Representative ID'}[key]} value={files[key]} disabled={busy} onChange={value=>setFiles(f=>({...f,[key]:value}))}/>)}
 <PrimaryButton title="Upload documents" loading={busy} onPress={()=>action(()=>uploadDocuments(files),'All three documents uploaded successfully.')}/>
 </View>}
 {offline && <Text>Previously loaded customer and approved shop landing pages are available offline for up to 24 hours. Sign-in, verification, uploads and administrator access need a connection.</Text>}
 <Text accessibilityRole="alert">{error || message}</Text>
 <PrimaryButton title="Refresh account status" loading={busy} onPress={()=>action(refresh)}/>
 <PrimaryButton title="Sign out" disabled={busy} onPress={()=>action(logout)}/>
 </ScrollView></SafeAreaView>;
}
