import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import colors from "../../../shared/theme/colors";
import { radius, typography } from "../../../shared/theme/typography";

/**
 * Two-way segmented control: "Vehicle Owner" | "Custom Shop"
 * role: "owner" | "shop"
 */
export default function RoleToggle({ role, onChange }) {
  return (
    <View style={styles.container}>
      <Segment
        label="Vehicle Owner"
        active={role === "owner"}
        onPress={() => onChange("owner")}
      />
      <Segment
        label="Custom Shop"
        active={role === "shop"}
        onPress={() => onChange("shop")}
      />
    </View>
  );
}

function Segment({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  labelActive: {
    color: colors.white,
  },
});
