import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";
import { radius, typography } from "../theme/typography";

const ICONS = {
  google: { name: "logo-google", color: "#EA4335" },
  apple: { name: "logo-apple", color: "#000000" },
};

export default function SocialButton({ provider, label, onPress, style }) {
  const icon = ICONS[provider];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon.name} size={18} color={icon.color} style={styles.icon} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    fontSize: typography.label.fontSize,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
