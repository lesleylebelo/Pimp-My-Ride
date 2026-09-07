import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AuthHeader from "../components/AuthHeader";
import AppTextInput from "../components/AppTextInput";
import PrimaryButton from "../components/PrimaryButton";
import OutlineButton from "../components/OutlineButton";
import OrDivider from "../components/OrDivider";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";
import { validateEmailField } from "../utils/validators";

export default function AdminSignInScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

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
    // (No admin dashboard exists yet in this stage of the build.)
    setTimeout(() => setLoading(false), 700);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled">
          <AuthHeader
            icon="shield-account-outline"
            iconSet="material"
            title="Admin Sign In"
            subtitle="Access the PimpMyRide Admin Panel"
          />

          <View style={styles.body}>
            <AppTextInput
              label="Email Address"
              icon="mail-outline"
              placeholder="admin@example.com"
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
              icon="lock-closed-outline"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password)
                  setErrors((e) => ({ ...e, password: null }));
              }}
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              error={errors.password}
            />

            <Pressable
              onPress={() => navigation.navigate("ForgotPassword", { role: "admin" })}
              style={styles.forgotWrap}
              hitSlop={8}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </Pressable>

            <PrimaryButton
              title="Sign In"
              onPress={handleSignIn}
              loading={loading}
            />

            <OrDivider />

            <OutlineButton
              title="Back to Role Selection"
              icon="shield-account-outline"
              iconSet="material"
              onPress={() => navigation.navigate("RoleSelection")}
            />
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
  flex: {
    flex: 1,
  },
  body: {
    padding: spacing.lg,
  },
  forgotWrap: {
    alignSelf: "flex-end",
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  forgotText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },
});
