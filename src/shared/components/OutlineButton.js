import {CustomerAction,useCustomerExperience} from '../../features/customer/components/CustomerUI';
import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

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
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const IconComponent = iconSet === "material" ? MaterialCommunityIcons : Ionicons;

  const customer=useCustomerExperience();
  if(customer)return <CustomerAction {...{title,icon,onPress,style,disabled,accessibilityHint,testID}} outline/>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon ? (
        <IconComponent name={icon} size={18} color={theme.textPrimary} style={styles.icon} />
      ) : null}
      <Text style={[styles.text, textStyle]} numberOfLines={2}>{title}</Text>
    </Pressable>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    minHeight: 54,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});
