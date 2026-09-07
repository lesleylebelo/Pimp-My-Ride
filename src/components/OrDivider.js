import React from "react";
import { View, Text, StyleSheet } from "react-native";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";

export default function OrDivider({ style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.line} />
      <Text style={styles.text}>OR</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.lg,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  text: {
    marginHorizontal: spacing.md,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
});
