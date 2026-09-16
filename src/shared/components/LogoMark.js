import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

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
