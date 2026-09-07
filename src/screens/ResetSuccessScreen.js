import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import IconBox from "../components/IconBox";
import PrimaryButton from "../components/PrimaryButton";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";

const ROLE_MESSAGE = {
  owner:
    "Your password has been reset successfully. You can now sign in to your PimpMyRide account.",
  shop: "Your shop account password has been reset successfully. You can now sign in.",
  admin: "Your admin account password has been reset successfully. You can now sign in.",
};

export default function ResetSuccessScreen({ navigation, route }) {
  const role = route?.params?.role === "shop" || route?.params?.role === "admin"
    ? route.params.role
    : "owner";

  const handleBackToSignIn = () => {
    // Clear Forgot/Reset Password off the stack entirely so the user can't
    // navigate back into a completed reset flow — no dead ends.
    navigation.reset({
      index: 0,
      routes: [
        role === "admin"
          ? { name: "AdminSignIn" }
          : { name: "SignIn", params: { role } },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <IconBox
          icon="checkmark"
          size={96}
          bgColor={colors.success}
          style={styles.iconBox}
        />
        <Text style={styles.title}>Password Reset!</Text>
        <Text style={styles.subtitle}>{ROLE_MESSAGE[role]}</Text>

        <PrimaryButton
          title="Back to Sign In"
          onPress={handleBackToSignIn}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  iconBox: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  button: {
    width: "100%",
  },
});
