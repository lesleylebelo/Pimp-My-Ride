import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

/**
 * Rounded-square logo mark used on Splash and the Sign In / Sign Up headers.
 * variant="onDark"  -> white box + green icon   (used on the green Splash screen)
 * variant="onLight" -> green box + white icon   (used on light-background headers)
 */
export default function LogoMark({ size = 72, iconSize, variant = "onDark" }) {
  const onDark = variant === "onDark";
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: onDark ? colors.white : colors.primary,
        },
      ]}
    >
      <Ionicons
        name="car-sport-outline"
        size={iconSize || size * 0.5}
        color={onDark ? colors.primary : colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
  },
});
