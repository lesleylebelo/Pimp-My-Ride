import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../theme/colors";
import { radius, typography } from "../theme/typography";

/**
 * Secondary action button: white background, green border/text.
 * Used for "Back to Sign In", "Back to Role Selection", and the
 * Role Selection screen's "Sign In" action.
 */
export default function OutlineButton({
  title,
  icon,
  iconSet = "ionicons",
  onPress,
  style,
  textStyle,
  disabled = false,
  accessibilityHint,
  testID,
}) {
  const IconComponent = iconSet === "material" ? MaterialCommunityIcons : Ionicons;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
    >
      {icon ? (
        <IconComponent
          name={icon}
          size={18}
          color={colors.primary}
          style={styles.icon}
        />
      ) : null}
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    width: "100%",
  },
  pressed: {
    backgroundColor: colors.disabledSurface,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: colors.primary,
    fontSize: typography.button.fontSize,
    fontWeight: "700",
  },
});
