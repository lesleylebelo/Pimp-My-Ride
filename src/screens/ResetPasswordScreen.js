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
import IconBox from "../components/IconBox";
import AppTextInput from "../components/AppTextInput";
import PrimaryButton from "../components/PrimaryButton";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";
import {
  validatePasswordField,
  validateConfirmPasswordField,
} from "../utils/validators";

const ROLE_CONTENT = {
  owner: {
    icon: "car-sport-outline",
    iconSet: "ionicons",
    subtitle: "Enter your new password below to reset your account password.",
  },
  shop: {
    icon: "storefront-outline",
    iconSet: "ionicons",
    subtitle:
      "Enter your new password below to reset your shop account password.",
  },
  admin: {
    icon: "shield-account-outline",
    iconSet: "material",
    subtitle:
      "Enter your new password below to reset your admin account password.",
  },
};

export default function ResetPasswordScreen({ navigation, route }) {
  const role = route?.params?.role === "shop" || route?.params?.role === "admin"
    ? route.params.role
    : "owner";
  const email = route?.params?.email;
  const content = ROLE_CONTENT[role];

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleBack = () => navigation.goBack();

  const handleResetPassword = () => {
    const passwordError = validatePasswordField(password);
    const confirmError = validateConfirmPasswordField(password, confirmPassword);
    if (passwordError || confirmError) {
      setErrors({ password: passwordError, confirmPassword: confirmError });
      return;
    }
    setErrors({});
    setLoading(true);
    // Frontend-only for now — swap this timeout for a real Firebase Auth
    // confirmPasswordReset() call once the backend is wired up.
    setTimeout(() => {
      setLoading(false);
      navigation.replace("ResetSuccess", { role });
    }, 700);
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
              {email ? ` (${email})` : ""}
            </Text>
          </View>

          <AppTextInput
            label="New Password"
            icon="lock-closed-outline"
            placeholder="Enter new password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((e) => ({ ...e, password: null }));
            }}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            error={errors.password}
            helperText={errors.password ? null : "Min. 8 characters"}
          />

          <AppTextInput
            label="Confirm New Password"
            icon="lock-closed-outline"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (errors.confirmPassword)
                setErrors((e) => ({ ...e, confirmPassword: null }));
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
});
