import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import {useTheme} from '../../../shared/theme/ThemeContext';
import { radius, typography } from "../../../shared/theme/typography";

export default function RoleToggle({ role, onChange }) {
  const {theme:colors}=useTheme(),styles=makeStyles(colors);
  return (
    <View style={styles.container}>
      <Segment
        label="Vehicle owner"
        active={role === "owner"}
        onPress={() => onChange("owner")}
      />
      <Segment
        label="Workshop"
        active={role === "shop"}
        onPress={() => onChange("shop")}
      />
    </View>
  );
}

function Segment({ label, active, onPress }) {
  const {theme:colors}=useTheme(),styles=makeStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = colors => StyleSheet.create({
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
    paddingVertical: 16, minHeight:48, paddingHorizontal:8,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
  },
  label: {
    fontSize: typography.label.fontSize, textAlign:"center",
    fontWeight: "500",
    color: colors.textPrimary,
  },
  labelActive: {
    color: colors.white,
  },
});
