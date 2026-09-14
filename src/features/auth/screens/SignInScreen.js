import { useAuth } from '../context/AuthContext';
import { login } from '../services/accounts';
import { authError } from '../utils/authErrors';
import React, { useState } from "react";
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
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";
import { validateEmailField } from "../utils/validators";

export default function SignInScreen({ navigation, route }) {
  const { run, offline } = useAuth();
  const [submitError, setSubmitError] = useState('');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);


  const handleSignIn = async () => {
    if (loading) return;
    setSubmitError('');
    const emailError = validateEmailField(email);
    const passwordError = !password ? "Password is required." : null;
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }
    setErrors({});
    setLoading(true);
    try { await run(() => login(email, password)); }
    catch (error) { setSubmitError(authError(error)); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <LogoMark size={64} variant="onLight" />
            <View style={styles.headerText}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>One account. Your own workspace.</Text>
            </View>
          </View>




          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>
              continue with email
            </Text>
            <View style={styles.dividerLine} />
          </View>

          <AppTextInput
            label="Email Address"
            placeholder="example@gmail.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
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
              setPassword(text);
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
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <Text>{offline ? "You are offline. Connect to sign in." : "Your account determines which workspace opens."}</Text>
          <Text accessibilityRole="alert" style={{color:colors.error,marginBottom:12}}>{submitError}</Text>
          <PrimaryButton
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            disabled={offline}
            style={{ marginTop: spacing.sm }}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Pressable
              onPress={() => navigation.navigate("SignUp")}
            >
              <Text style={styles.footerLink}>Sign Up</Text>
            </Pressable>
          </View>
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
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  headerText: {
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  socialRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginBottom: spacing.lg,
  },
  forgotText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  footerText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
});
