import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../theme/colors";

/**
 * A rounded-square icon badge. Used for the Role Selection cards and the
 * large centered icon on Forgot/Reset Password screens.
 *
 * iconSet: "ionicons" (default) or "material" (for MaterialCommunityIcons,
 * needed for the admin shield-with-person glyph).
 */
export default function IconBox({
  icon,
  iconSet = "ionicons",
  size = 64,
  iconSize,
  bgColor = colors.primary,
  iconColor = colors.white,
  radius,
  style,
}) {
  const IconComponent = iconSet === "material" ? MaterialCommunityIcons : Ionicons;
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius ?? size * 0.28,
          backgroundColor: bgColor,
        },
        style,
      ]}
    >
      <IconComponent name={icon} size={iconSize || size * 0.46} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});
