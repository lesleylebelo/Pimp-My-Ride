import React, {useRef, useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../context/AuthContext';
import {resendVerification} from '../services/accounts';
import {authError} from '../utils/authErrors';
import {validateEmailField} from '../utils/validators';
import AuthNavHeader from '../components/AuthNavHeader';
import AppTextInput from '../../../shared/components/AppTextInput';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import OutlineButton from '../../../shared/components/OutlineButton';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {spacing} from '../../../shared/theme/typography';

export default function VerifyEmailScreen({navigation, route}) {
  const {theme:colors}=useTheme(),styles=makeStyles(colors);
  const {run, offline} = useAuth();
  const [email, setEmail] = useState(typeof route?.params?.email === 'string' ? route.params.email : '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [sent, setSent] = useState(route?.params?.emailSent === true);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const backToSignIn = () => navigation.reset({index:0,routes:[{name:'SignIn',params:{email:email.trim()}}]});

  const handleResend = async () => {
    if (submitting.current || offline) return;
    const emailError = validateEmailField(email);
    const passwordError = password ? null : 'Password is required to resend your verification email.';
    setErrors({email:emailError,password:passwordError});
    setSubmitError('');
    if (emailError || passwordError) return;

    submitting.current = true;
    setLoading(true);
    setSent(false);
    try {
      await run(() => resendVerification(email.trim(), password));
      setSent(true);
    } catch (error) {
      setSubmitError(authError(error));
    } finally {
      setPassword('');
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top','bottom']}>
      <AuthNavHeader title="Verify your email" onBack={backToSignIn}/>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.body}>You are signed out. Open the verification link in your inbox, then return here and sign in. Your account cannot access the app until your email is verified.</Text>
            <Text style={styles.body}>Check your spam folder too. If you need another email, enter your account password below. Resending a link does not sign you in.</Text>
            {route?.params?.emailSent === false && !sent && !submitError && <Text accessibilityRole="alert" style={styles.error}>Your account was created, but the verification email could not be sent. Request another email below.</Text>}
            {sent && <Text accessibilityLiveRegion="polite" style={styles.success}>Verification email sent. Check your inbox and open the link.</Text>}
            <AppTextInput
              label="Email address"
              placeholder="example@gmail.com"
              value={email}
              editable={!loading}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              onChangeText={value => {
                setEmail(value);setSent(false);setSubmitError('');
                setErrors(previous=>({...previous,email:validateEmailField(value)}));
              }}
            />
            <AppTextInput
              label="Password"
              placeholder="Enter your account password"
              value={password}
              editable={!loading}
              autoCapitalize="none"
              secureTextEntry
              showPasswordToggle
              error={errors.password}
              onChangeText={value=>{
                setPassword(value);setSubmitError('');
                setErrors(previous=>({...previous,password:value ? null : 'Password is required to resend your verification email.'}));
              }}
            />
            {offline && <Text accessibilityRole="alert" style={styles.body}>Connect to the internet to resend your verification email.</Text>}
            {!!submitError && <Text accessibilityRole="alert" style={styles.error}>{submitError}</Text>}
            <PrimaryButton title="Resend verification email" onPress={handleResend} loading={loading} disabled={offline}/>
            <OutlineButton title="Back to sign in" onPress={backToSignIn} disabled={loading}/>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = colors => StyleSheet.create({
  safeArea:{flex:1,backgroundColor:colors.background},
  flex:{flex:1},
  content:{padding:spacing.lg,paddingBottom:spacing.xxl},
  card:{padding:spacing.lg,gap:spacing.md,borderWidth:1,borderColor:colors.border,borderRadius:12,backgroundColor:colors.surfaceCard},
  title:{fontSize:24,fontWeight:'500',color:colors.textPrimary},
  body:{fontSize:14,lineHeight:21,fontWeight:'400',color:colors.textSecondary},
  error:{fontSize:14,lineHeight:21,color:colors.error},
  success:{fontSize:14,lineHeight:21,color:colors.success},
});
