import {requireConnection} from '../../../shared/services/network';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { firebase } from '../../../shared/services/firebase';
import { authError } from '../utils/authErrors';
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AuthNavHeader from "../components/AuthNavHeader";
import IconBox from "../../../shared/components/IconBox";
import AppTextInput from "../../../shared/components/AppTextInput";
import PrimaryButton from "../../../shared/components/PrimaryButton";
import OutlineButton from "../../../shared/components/OutlineButton";
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";
import {
  validatePasswordField,
  validateConfirmPasswordField,
} from "../utils/validators";

const unusableCode = error => ['auth/expired-action-code', 'auth/invalid-action-code', 'auth/user-disabled', 'auth/user-not-found'].includes(error?.code);

export default function ResetPasswordScreen({ navigation, route }) {
  const content={icon:'car-sport-outline',iconSet:'ionicons',placeholder:'example@gmail.com',subtitle:"Choose a new password for your account."};
  const suppliedCode = route?.params?.oobCode;
  const code = typeof suppliedCode === 'string' && suppliedCode.trim() && suppliedCode.length <= 2048 ? suppliedCode : null;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState({status: 'checking'});
  const [checkAttempt, setCheckAttempt] = useState(0);
  const generation = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    submitting.current = false;
    setLoading(false);
    setPassword('');
    setConfirmPassword('');
    setErrors({});
    if (!code) {
      setLink({status: 'invalid', error: 'Open the reset link in your email, or request a new link.'});
      return () => { ++generation.current; };
    }
    setLink({status: 'checking'});
    (async () => {
      try {
        await requireConnection();
        const email = await verifyPasswordResetCode(firebase().auth, code);
        if (generation.current === current) setLink({status: 'ready', code, email});
      } catch (error) {
        if (generation.current === current) setLink({status: unusableCode(error) ? 'invalid' : 'retry', error: authError(error)});
      }
    })();
    return () => { ++generation.current; };
  }, [code, checkAttempt]);

  const handleBack = () => {
    if (!submitting.current) navigation.replace('ForgotPassword');
  };

  const handleResetPassword = async () => {
    if (submitting.current || link.status !== 'ready' || link.code !== code) return;
    const passwordError = validatePasswordField(password);
    const confirmError = validateConfirmPasswordField(password, confirmPassword);
    if (passwordError || confirmError) {
      setErrors({ password: passwordError, confirmPassword: confirmError });
      return;
    }
    setErrors({});
    submitting.current = true;
    setLoading(true);
    const current = generation.current;
    try {
      await requireConnection();
      await confirmPasswordReset(firebase().auth,code,password);
      if (generation.current === current) {
        setPassword('');
        setConfirmPassword('');
        navigation.replace('ResetSuccess');
      }
    } catch(error) {
      if (generation.current === current) {
        if (unusableCode(error)) {
          setPassword('');
          setConfirmPassword('');
          setLink({status: 'invalid', error: authError(error)});
        } else setErrors({form: authError(error)});
      }
    } finally {
      if (generation.current === current) {submitting.current = false;setLoading(false);}
    }

  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <AuthNavHeader title="Reset Password" onBack={handleBack} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <IconBox
              icon={content.icon}
              iconSet={content.iconSet}
              size={88}
              style={styles.iconBox}
            />
            <Text style={styles.title}>Reset Your Password</Text>
            <Text style={styles.subtitle}>
              {content.subtitle}
              {link.status === 'ready' && link.email ? ` (${link.email})` : ""}
            </Text>
          </View>

          {link.status === 'checking' && <Text accessibilityLiveRegion="polite" style={styles.subtitle}>Checking your reset link...</Text>}
          {link.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{link.error}</Text>}
          {link.status === 'retry' && <PrimaryButton title="Try Link Again" onPress={() => setCheckAttempt(value => value + 1)} />}
          {link.status === 'ready' && <>
          {errors.form && <Text accessibilityLiveRegion="polite" style={styles.error}>{errors.form}</Text>}
          <AppTextInput
            label="New Password"
            icon="lock-closed-outline"
            placeholder="Enter new password"
            value={password}
            editable={!loading}
            onChangeText={(text) => {
              setPassword(text);
              setErrors(e=>({...e,password:validatePasswordField(text),confirmPassword:confirmPassword ? validateConfirmPasswordField(text,confirmPassword) : null}));
            }}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            error={errors.password}
            helperText={errors.password ? null : "Min. 12 characters"}
          />

          <AppTextInput
            label="Confirm New Password"
            icon="lock-closed-outline"
            placeholder="Confirm new password"
            value={confirmPassword}
            editable={!loading}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setErrors(e=>({...e,confirmPassword:validateConfirmPasswordField(password,text)}));
            }}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            error={errors.confirmPassword}
          />

          <PrimaryButton
            title="Reset Password"
            onPress={handleResetPassword}
            loading={loading}
            style={styles.resetButton}
          />
          </>}
          {link.status !== 'checking' && <OutlineButton title="Request a New Link" onPress={handleBack} disabled={loading} style={styles.resetButton} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  iconBox: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  resetButton: {
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    marginBottom: spacing.md,
  },
});
