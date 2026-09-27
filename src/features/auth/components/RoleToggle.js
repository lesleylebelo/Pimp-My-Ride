import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import colors from "../../../shared/theme/colors";
import { radius, typography } from "../../../shared/theme/typography";

export default function RoleToggle({ role, onChange }) {
  return (
    <View style={styles.container}>
      <Segment
        label="Vehicle owner"
        active={role === "owner"}
        onPress={() => onChange("owner")}
      />
      <Segment
        label="Custom shop"
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
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: radius.button,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  labelActive: {
    color: colors.white,
  },
});
