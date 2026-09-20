import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import IconBox from "../../../shared/components/IconBox";
import PrimaryButton from "../../../shared/components/PrimaryButton";
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";

export default function ResetSuccessScreen({ navigation }) {
  const handleBackToSignIn = () => {
    navigation.reset({
      index: 0,
      routes: [
        { name: "SignIn" },
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
        <Text style={styles.subtitle}>Your password has been reset. Sign in to continue.</Text>

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
