import React,{useCallback,useRef,useState} from 'react';
import {KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SafeAreaView} from 'react-native-safe-area-context';
import {sendEmailVerification} from 'firebase/auth';
import {useAuth} from '../context/AuthContext';
import {firebase} from '../../../shared/services/firebase';
import {authError} from '../utils/authErrors';
import {accountStage} from '../utils/registration';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import VerificationDocuments from '../components/VerificationDocuments';
import BusinessLocation from '../components/BusinessLocation';
import ProfilePhotoSettings from '../components/ProfilePhotoSettings';
import { useTheme } from '../../../shared/theme/ThemeContext';

export default function AccountScreen({ navigation }) {
 const {user,profile,error,refresh,logout,offline,requireConnection}=useAuth();
 const { mode, toggleTheme, theme } = useTheme();
 const styles = makeStyles(theme);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[resendAt,setResendAt]=useState(0);
 const [uploadBusy,setUploadBusy]=useState(false),[documentRefresh,setDocumentRefresh]=useState(0);
 const [locationBusy,setLocationBusy]=useState(false);
 const [photoBusy,setPhotoBusy]=useState(false);
 const actionLock=useRef(false),uploadLock=useRef(false);
 const onUploadBusy=useCallback(value=>{uploadLock.current=value;setUploadBusy(value);},[]);
 const stage=accountStage(user,profile);
 const titles={restricted:'Account access restricted',verify:'Verify your email',pending:'Shop verification pending',rejected:'Shop registration not approved',ready:'You’re signed in',incomplete:'Profile unavailable',invalid:'Account role needs attention'};
 async function action(fn,success='') {if(actionLock.current||uploadLock.current)return;actionLock.current=true;setBusy(true);setMessage('');try {await fn();setMessage(success);}catch(e){setMessage(authError(e));}finally{actionLock.current=false;setBusy(false);}}

 return (
  <SafeAreaView style={styles.safeArea}>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} contentContainerStyle={styles.scroll}>
    {!!navigation?.canGoBack?.() && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={styles.backArrow}
      >
        <Ionicons name="arrow-back" size={20} color={theme.accent} />
      </Pressable>
    )}

    <Text style={styles.heading}>{offline ? 'You are offline' : error ? 'Account access needs attention' : profile?.role==='shop'&&stage==='ready'?'Workshop settings':titles[stage]}</Text>

    <View style={styles.identityBlock}>
      <Text style={styles.identity}>{profile?.role==='shop'?profile?.shop?.shopName||profile?.fullName||user?.email:profile?.fullName || user?.email}</Text>
      <Text style={styles.role}>
        {profile?.role === 'owner' ? 'Vehicle owner' : profile?.role === 'shop' ? 'Custom shop' : profile?.role === 'admin' ? 'Administrator' : ''}
      </Text>
    </View>
    {user?.emailVerified&&['owner','shop'].includes(profile?.role)&&stage!=='restricted'&&<ProfilePhotoSettings disabled={busy||!!error||!!profile.reviewOperation||!!profile.statusOperation} onBusyChange={setPhotoBusy}/>}
    {profile?.role==='shop'&&<View style={styles.businessCard}>
      <Text accessibilityRole="header" style={styles.identity}>Business profile</Text>
      {profile.verificationStatus==='approved'&&<View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="checkmark-circle" size={20} color={theme.accent}/><Text style={styles.body}>Verified workshop</Text></View>}
      {profile.verificationStatus&&profile.verificationStatus!=='approved'&&<Text style={styles.body}>Verification: {profile.verificationStatus}</Text>}
      {!!profile.shop?.address&&<Text style={styles.body}>Address: {profile.shop.address}</Text>}
      {!!(profile.shop?.city||profile.shop?.province)&&<Text style={styles.body}>{[profile.shop.city,profile.shop.province].filter(Boolean).join(' · ')}</Text>}
      {!!profile.shop?.services&&<><Text accessibilityRole="header" style={styles.identity}>Services offered</Text><Text style={styles.body}>{Array.isArray(profile.shop.services)?profile.shop.services.join(' · '):profile.shop.services}</Text></>}
      {stage==='ready'&&<PrimaryButton title="Manage showcases" onPress={()=>navigation.navigate('ShopPosts')}/>}
    </View>}

    {stage==='verify' && <>
      <Text style={styles.body}>Check your inbox for a verification link sent to {user.email}. Open the link to verify your email. Once verified, sign in with your email and password to continue to your workspace. If you do not receive the email, check spam or resend it below.</Text>
      <PrimaryButton title="Resend verification email" disabled={busy || offline} onPress={()=>action(async()=>{if(Date.now()<resendAt)throw new Error('Please wait one minute before resending.');await requireConnection();await sendEmailVerification(firebase().auth.currentUser);setResendAt(Date.now()+60000);},'Verification email sent.')}/>
    </>}

    {stage==='restricted' && <Text style={styles.body}>Your account has been suspended or archived. Contact the project administrator.</Text>}
    {profile?.reviewReason && <Text style={styles.body}>Shop review: {profile.reviewReason}</Text>}
    {stage==='pending' && <Text style={styles.body}>{profile?.verificationStatus==='reviewing' ? 'An administrator is reviewing your application. Document replacement is paused until this review finishes.' : 'Your shop needs administrator approval before it can use the marketplace. Upload each document below and check that all three show as saved.'}</Text>}
    {stage==='rejected' && <Text style={styles.body}>Contact the project administrator to discuss the review. Marketplace access is restricted.</Text>}
    {(stage==='incomplete'||stage==='invalid') && <Text style={styles.body}>Your sign-in account exists, but its profile is missing or invalid. Profile setup is not part of sign-in. For an incomplete signup, return to Create account and submit the original details to retry saving the profile; otherwise contact support.</Text>}
    {stage==='ready' && <Text style={styles.body}>{profile?.role==='shop'?'Manage your business location, verification documents and account preferences here.':'Your account is ready.'}</Text>}

    {stage!=='restricted' && user?.emailVerified && profile?.role==='shop' && <BusinessLocation disabled={busy || uploadBusy || !!error || !!profile.reviewOperation || !!profile.statusOperation} onBusyChange={setLocationBusy}/>}
    {stage!=='restricted' && user?.emailVerified && profile?.role==='shop' && <VerificationDocuments uid={user.uid} offline={offline} canUpload={profile.verificationStatus==='pending'} disabled={busy || locationBusy} onBusyChange={onUploadBusy} refreshKey={documentRefresh}/>}

    {offline && <Text style={styles.body}>Previously loaded customer and approved shop landing pages are available offline for up to 24 hours. Sign-in, verification, uploads and administrator access need a connection.</Text>}

    {!!(error || message) && <Text accessibilityRole="alert" style={styles.alert}>{error || message}</Text>}

    <PrimaryButton
      title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      disabled={busy||uploadBusy||locationBusy||photoBusy}
      onPress={toggleTheme}
    />
    <PrimaryButton
      title="Sign out"
      disabled={busy||uploadBusy||locationBusy}
      onPress={()=>action(logout)}
      style={{ backgroundColor: theme.errorSurface, borderColor: theme.errorSurface }}
      textStyle={{ color: theme.error }}
    />
   </ScrollView></KeyboardAvoidingView>
  </SafeAreaView>
 );
}

const makeStyles = (colors) => ({
  safeArea: {flex:1, backgroundColor: colors.background},
  scroll: {padding:24, gap:22, width:'100%',maxWidth:860,alignSelf:'center'},
  businessCard:{padding:20,borderRadius:22,backgroundColor:colors.surfaceCard,gap:14},

  backArrow: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },

  heading: {fontSize:26, fontWeight:'600', color: colors.accent, letterSpacing:0.2},

  identityBlock: {gap: 2},
  identity: {fontSize:18, fontWeight:'500', color: colors.textPrimary},
  role: {fontSize:14, color: colors.textSecondary},

  body: {fontSize:14, lineHeight:21, color: colors.textSecondary},
  alert: {fontSize:14, color: colors.error, fontWeight:'500'},
});
