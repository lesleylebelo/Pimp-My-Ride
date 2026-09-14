import {requireConnection} from '../../../shared/services/network';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebase } from '../../../shared/services/firebase';
import { authError } from '../utils/authErrors';
import React, { useState } from "react";
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

// Content that differs by role. The Client/Owner and Shop flows are
// logically separate from Admin (different icon, copy and destination) even
// though they share one component — this keeps the design consistent
// without duplicating near-identical screens three times.
export default function ForgotPasswordScreen({ navigation, route }) {
  const content={icon:'car-sport-outline',iconSet:'ionicons',placeholder:'example@gmail.com',subtitle:"Enter your email address to request a password reset link."};
  const [sent,setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleBack = () => navigation.navigate("SignIn");

  const handleSendResetLink = async () => {
    if (loading) return;
    const emailError = validateEmailField(email);
    setError(emailError);
    if (emailError) return;

    setLoading(true);
    try { await requireConnection();await sendPasswordResetEmail(firebase().auth,email.trim());setSent(true); }
    catch(e) { if(e.code === 'auth/user-not-found') setSent(true);else setError(authError(e)); }
    finally {setLoading(false);}

  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <AuthNavHeader title="Forgot Password" onBack={handleBack} />
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
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
          </View>

          <AppTextInput
            label="Email Address"
            icon="mail-outline"
            placeholder={content.placeholder}
            value={email}
            onChangeText={(text) => {
              setEmail(text);setSent(false);
              setError(validateEmailField(text));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={error}
          />

          <PrimaryButton
            title={sent ? "Email requested" : "Send Reset Link"}
            disabled={sent}
            onPress={handleSendResetLink}
            loading={loading}
            style={styles.sendButton}
          />

          {sent && <Text style={{color:colors.primary,marginTop:16}}>If an account exists for this email, you will receive a reset link. Open it to choose a new password, then return here to sign in. Check your spam folder too.</Text>}
          <OrDivider />

          <OutlineButton
            title="Back to Sign In"
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
  sendButton: {
    marginTop: spacing.sm,
  },
});
