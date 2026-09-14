import {requireConnection} from '../../../shared/services/network';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
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
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";
import {
  validatePasswordField,
  validateConfirmPasswordField,
} from "../utils/validators";

export default function ResetPasswordScreen({ navigation, route }) {
  const content={icon:'car-sport-outline',iconSet:'ionicons',placeholder:'example@gmail.com',subtitle:"Choose a new password for your account."};
  const email = route?.params?.email;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleBack = () => navigation.goBack();

  const handleResetPassword = async () => {
    if (loading) return;
    const passwordError = validatePasswordField(password);
    const confirmError = validateConfirmPasswordField(password, confirmPassword);
    if (passwordError || confirmError) {
      setErrors({ password: passwordError, confirmPassword: confirmError });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const code = route?.params?.oobCode;
      if (!code) throw new Error('Open the reset link in your email to reset your password.');
      await requireConnection();
      await verifyPasswordResetCode(firebase().auth,code);
      await confirmPasswordReset(firebase().auth,code,password);
      navigation.replace('ResetSuccess');
    } catch(e) {setErrors({password:authError(e)});}
    finally {setLoading(false);}

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
