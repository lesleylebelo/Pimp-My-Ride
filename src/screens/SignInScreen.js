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
import LogoMark from "../components/LogoMark";
import RoleToggle from "../components/RoleToggle";
import SocialButton from "../components/SocialButton";
import AppTextInput from "../components/AppTextInput";
import PrimaryButton from "../components/PrimaryButton";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";
import { validateEmailField } from "../utils/validators";

export default function SignInScreen({ navigation, route }) {
  const initialRole = route?.params?.role === "shop" ? "shop" : "owner";
  const [role, setRole] = useState(initialRole); // "owner" | "shop"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const isOwner = role === "owner";

  const handleSignIn = () => {
    const emailError = validateEmailField(email);
    const passwordError = !password ? "Password is required." : null;
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }
    setErrors({});
    setLoading(true);
    // Frontend-only for now — wire up Firebase Authentication here later.
    // (No Home/Feed screen exists yet in this stage of the build.)
    setTimeout(() => setLoading(false), 700);
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
              <Text style={styles.subtitle}>Sign in to manage your garage</Text>
            </View>
          </View>

          <RoleToggle role={role} onChange={setRole} />

          {isOwner && (
            <View style={styles.socialRow}>
              <SocialButton
                provider="google"
                label="Google"
                onPress={() => {}}
                style={{ marginRight: spacing.sm }}
              />
              <SocialButton provider="apple" label="Apple" onPress={() => {}} />
            </View>
          )}

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>
              {isOwner ? "or continue with email" : "continue with email"}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          <AppTextInput
            label="Email Address"
            placeholder="example@gmail.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((e) => ({ ...e, email: null }));
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
              if (errors.password) setErrors((e) => ({ ...e, password: null }));
            }}
            secureTextEntry
            showPasswordToggle
            error={errors.password}
          />

          <Pressable
            style={styles.forgotWrap}
            onPress={() => navigation.navigate("ForgotPassword", { role })}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <PrimaryButton
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            style={{ marginTop: spacing.sm }}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <Pressable
              onPress={() => navigation.navigate("SignUp", { role })}
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
