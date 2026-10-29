import AccountRecovery from '../components/AccountRecovery';
import {useLoginCooldown} from '../hooks/useLoginCooldown';
import GoogleSignIn from '../components/GoogleSignIn';
import { useAuth } from '../context/AuthContext';
import { login } from '../services/accounts';
import { authError } from '../utils/authErrors';
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LogoMark from "../../../shared/components/LogoMark";
import AppTextInput from "../../../shared/components/AppTextInput";
import PrimaryButton from "../../../shared/components/PrimaryButton";
import OutlineButton from "../../../shared/components/OutlineButton";
import {useTheme} from '../../../shared/theme/ThemeContext';
import { spacing } from "../../../shared/theme/typography";
import { validateEmailField } from "../utils/validators";

export default function SignInScreen({ navigation, route }) {
  const {theme:colors}=useTheme(),styles=makeStyles(colors);
  const { run, offline, user } = useAuth();
  const cooldown = useLoginCooldown();
  const [submitError, setSubmitError] = useState('');
  const [email, setEmail] = useState(typeof route?.params?.email === 'string' ? route.params.email : '');
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [recovery,setRecovery]=useState(null),[notice,setNotice]=useState('');
  const credentialsVersion=useRef(0),currentUid=useRef(user?.uid);currentUid.current=user?.uid;
  const submitting = useRef(false);

  const handleSignIn = async () => {
    if (submitting.current || loading || user || offline || cooldown.seconds !== 0) return;
    const version=credentialsVersion.current;setRecovery(null);setNotice('');
    setSubmitError('');
    setVerificationEmail('');
    const emailError = validateEmailField(email);
    const passwordError = !password ? "Password is required." : null;
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }
    setErrors({});
    submitting.current = true;
    setLoading(true);
    try { await run(() => login(email, password)); }
    catch (error) {
      if(version!==credentialsVersion.current||currentUid.current)return;
      setSubmitError(authError(error));
      if(error?.code==='auth/self-deactivated')setRecovery(version);
      if (error?.code === 'auth/email-not-verified') {
        setPassword('');
        setVerificationEmail(email.trim());
      }
    }
    finally { submitting.current = false; setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent,{width:'100%',maxWidth:600,alignSelf:'center'}]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero with glow */}
          <View style={styles.hero}>
            <View style={styles.glowOuter} />
            <View style={styles.glowMid} />
            <View style={styles.logoWrap}>
              <LogoMark size={104} variant="onDark" />
            </View>
            <Text style={styles.title}>PimpMyRide</Text>
            <Text style={styles.subtitle}>Connect. Customize. Drive your style.</Text>
            <Text style={styles.hint}>Sign in to your space</Text>
          </View>

          {/* Form card */}
          <GoogleSignIn disabled={loading || cooldown.seconds !== 0}/>
          <View style={styles.formCard}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Continue with email</Text>
              <View style={styles.dividerLine} />
            </View>

            <AppTextInput
              label="Email address"
              placeholder="example@gmail.com"
              value={email}
              onChangeText={(text) => {
                ++credentialsVersion.current;setRecovery(null);setNotice('');setEmail(text);setVerificationEmail('');
                setErrors(e=>({...e,email:validateEmailField(text)}));setSubmitError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <AppTextInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text) => {
                ++credentialsVersion.current;setRecovery(null);setNotice('');setPassword(text);setVerificationEmail('');
                setErrors(e=>({...e,password:text ? null : 'Password is required.'}));setSubmitError('');
              }}
              secureTextEntry
              showPasswordToggle
              error={errors.password}
            />

            <Pressable
              style={styles.forgotWrap}
              onPress={() => navigation.navigate("ForgotPassword")}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          </View>

          {recovery!==null&&!user&&<AccountRecovery key={recovery} eligible email={email} password={password} disabled={loading||offline||cooldown.seconds!==0} onBusyChange={setLoading} onRecovered={()=>{++credentialsVersion.current;setRecovery(null);setPassword('');setSubmitError('');setNotice('Account reactivated. Sign in to continue.');}}/>}
          {!!notice&&<Text accessibilityLiveRegion="polite" style={styles.hint}>{notice}</Text>}
          {offline && (
            <Text style={styles.hint}>You are offline. Connect to sign in.</Text>
          )}

          {(cooldown.error || submitError) ? (
            <Text accessibilityRole="alert" style={styles.error}>{cooldown.error || submitError}</Text>
          ) : null}

          {!!verificationEmail && (
            <OutlineButton
              title="Resend verification email"
              onPress={() => navigation.navigate('VerifyEmail', {email:verificationEmail})}
              disabled={loading}
              style={{marginBottom:spacing.md}}
            />
          )}

          <PrimaryButton
            title={cooldown.seconds > 0 ? `Try again in ${cooldown.seconds}s` : 'Sign in'}
            onPress={handleSignIn}
            loading={loading}
            disabled={offline || cooldown.seconds !== 0}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Pressable onPress={() => navigation.navigate("SignUp")}>
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = colors => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 32,
    paddingBottom: 32,
    flexGrow: 1,
    justifyContent: "center",
  },

  hero: {
    alignItems: "center",
    marginBottom: 32,
    position: "relative",
  },
  glowOuter: {
    position: "absolute",
    top: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.accent,
    opacity: 0.06,
  },
  glowMid: {
    position: "absolute",
    top: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
    opacity: 0.10,
  },
  logoWrap: {
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: "600",
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 8,
    fontWeight: '500',
  },

  formCard: {
    padding: 24,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surfaceCard,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },

  forgotWrap: {
    alignSelf: "flex-end",
    marginTop: 4,
  },
  forgotText: {
    color: colors.textPrimary,
    fontWeight: "500",
    fontSize: 14,
  },

  hint: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },

  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  footerLink: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
});
