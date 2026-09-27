import {requireConnection} from '../../../shared/services/network';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebase } from '../../../shared/services/firebase';
import { authError } from '../utils/authErrors';
import React, { useRef, useState } from "react";
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
import OrDivider from "../../../shared/components/OrDivider";
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";
import { validateEmailField } from "../utils/validators";

export default function ForgotPasswordScreen({ navigation }) {
  const content={icon:'car-sport-outline',iconSet:'ionicons',placeholder:'example@gmail.com',subtitle:"Enter your email address to request a password reset link."};
  const [sent,setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const handleBack = () => navigation.reset({index:0,routes:[{name:'SignIn'}]});

  const handleSendResetLink = async () => {
    if (submitting.current || sent) return;
    const emailError = validateEmailField(email);
    setError(emailError);
    if (emailError) return;

    submitting.current = true;
    setLoading(true);
    try { await requireConnection();await sendPasswordResetEmail(firebase().auth,email.trim());setSent(true); }
    catch(e) { if(['auth/user-not-found','auth/user-disabled'].includes(e.code)) setSent(true);else setError(authError(e)); }
    finally {submitting.current=false;setLoading(false);}

  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <AuthNavHeader title="Forgot password" onBack={handleBack} />
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
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
          </View>

          <AppTextInput
            label="Email address"
            icon="mail-outline"
            placeholder={content.placeholder}
            value={email}
            editable={!loading}
            onChangeText={(text) => {
              setEmail(text);setSent(false);
              setError(validateEmailField(text));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
          />

          <PrimaryButton
            title={sent ? "Email requested" : "Send reset link"}
            disabled={sent}
            onPress={handleSendResetLink}
            loading={loading}
            style={styles.sendButton}
          />

          {sent && <Text accessibilityLiveRegion="polite" style={{color:colors.primary,marginTop:16}}>If an account exists for this email, you will receive a reset link. Open the link in your browser to choose a new password, then return to this app and sign in. Check your spam folder too.</Text>}
          <OrDivider />

          <OutlineButton
            title="Back to sign in"
            icon="arrow-back"
            onPress={handleBack}
          />
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
    fontWeight: "500",
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
  sendButton: {
    marginTop: spacing.sm,
  },
});
