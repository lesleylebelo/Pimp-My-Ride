import ProfileRecovery from '../components/ProfileRecovery';
import React,{useCallback,useRef,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {sendEmailVerification} from 'firebase/auth';
import {useAuth} from '../context/AuthContext';
import {firebase} from '../../../shared/services/firebase';
import {authError} from '../utils/authErrors';
import {accountStage} from '../utils/registration';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import VerificationDocuments from '../components/VerificationDocuments';
import colors from '../../../shared/theme/colors';
export default function AccountScreen() {
 const {user,profile,error,refresh,logout,offline,requireConnection}=useAuth();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[resendAt,setResendAt]=useState(0);
 const [uploadBusy,setUploadBusy]=useState(false),[documentRefresh,setDocumentRefresh]=useState(0);
 const actionLock=useRef(false),uploadLock=useRef(false);
 const onUploadBusy=useCallback(value=>{uploadLock.current=value;setUploadBusy(value);},[]);
 const stage=accountStage(user,profile);
 const titles={restricted:'Account access restricted',verify:'Verify your email',pending:'Shop verification pending',rejected:'Shop registration not approved',ready:'You’re signed in',incomplete:'Account setup needs attention',invalid:'Account role needs attention'};
 async function action(fn,success='') {if(actionLock.current||uploadLock.current)return;actionLock.current=true;setBusy(true);setMessage('');try {await fn();setMessage(success);}catch(e){setMessage(authError(e));}finally{actionLock.current=false;setBusy(false);}}
 return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:24,gap:18}}>
 <Text style={{fontSize:26,fontWeight:'500',color:colors.primary}}>{offline ? 'You are offline' : error ? 'Account access needs attention' : titles[stage]}</Text>
 <Text>{profile?.fullName || user?.email}</Text><Text>{profile?.role === 'owner' ? 'Vehicle owner' : profile?.role === 'shop' ? 'Custom shop' : profile?.role === 'admin' ? 'Administrator' : ''}</Text>
 {stage==='verify' && <><Text>Open the verification email sent to {user.email}. After you verify, return to the app. This page checks automatically and will continue when verification is confirmed.</Text>

 <PrimaryButton title="Resend verification email" disabled={busy || offline} onPress={()=>action(async()=>{if(Date.now()<resendAt)throw new Error('Please wait one minute before resending.');await requireConnection();await sendEmailVerification(firebase().auth.currentUser);setResendAt(Date.now()+60000);},'Verification email sent.')}/></>}
 {stage==='restricted' && <Text>Your account has been suspended or archived. Contact the project administrator.</Text>}
 {profile?.reviewReason && <Text>Shop review: {profile.reviewReason}</Text>}
 {stage==='pending' && <Text>{profile?.verificationStatus==='reviewing' ? 'An administrator is reviewing your application. Document replacement is paused until this review finishes.' : 'Your shop needs administrator approval before it can use the marketplace. Upload each document below and check that all three show as saved.'}</Text>}
 {stage==='rejected' && <Text>Contact the project administrator to discuss the review. Marketplace access is restricted.</Text>}
 {(stage==='incomplete'||stage==='invalid') && <Text>Your sign-in account exists but its profile is unavailable or incomplete. Retry loading it or complete the profile below. If an access error appears, contact the project administrator.</Text>}
 {stage==='incomplete' && !error && !offline && <ProfileRecovery/>}
 {stage==='ready' && <Text>Your authentication is working. This is a temporary welcome screen; marketplace features will be built next.</Text>}
 {stage!=='restricted' && user?.emailVerified && profile?.role==='shop' && <VerificationDocuments uid={user.uid} offline={offline} canUpload={profile.verificationStatus==='pending'} disabled={busy} onBusyChange={onUploadBusy} refreshKey={documentRefresh}/>}
 {offline && <Text>Previously loaded customer and approved shop landing pages are available offline for up to 24 hours. Sign-in, verification, uploads and administrator access need a connection.</Text>}
 <Text accessibilityRole="alert">{error || message}</Text>
 <PrimaryButton title="Refresh account status" loading={busy} disabled={uploadBusy} onPress={()=>action(async()=>{await refresh();setDocumentRefresh(value=>value+1);})}/>
 <PrimaryButton title="Sign out" disabled={busy||uploadBusy} onPress={()=>action(logout)}/>
 </ScrollView></SafeAreaView>;
}
