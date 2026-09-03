import React from "react";
import { View, Text, StyleSheet } from "react-native";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";

/**
 * Full-width dark green header block used at the top of the Sign Up flow.
 * title: e.g. "Create Account"
 * subtitle: optional line under the title (only shown on step 1)
 */
export default function AuthHeader({ title, subtitle }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    minHeight: 150,
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
