import React, { useRef } from "react";
import { Pressable, Text, Animated, StyleSheet, ActivityIndicator, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export default function PrimaryButton({ title, onPress, style, textStyle, disabled, loading, accessibilityHint, testID }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const isDisabled = disabled || loading;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const handlePressIn = () => {
    Animated.timing(shimmerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(shimmerAnim, { toValue: -1, duration: 0, useNativeDriver: true }).start();
  };
  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-400, 400],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      testID={testID}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {!isDisabled && (
        <Animated.View
          pointerEvents="none"
          style={[styles.shimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '20deg' }] }]}
        />
      )}
      {loading ? (
        <ActivityIndicator color={theme.primaryText} />
      ) : (
        <Text style={[styles.text, textStyle]} numberOfLines={2}>{title}</Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    minHeight: 54,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    overflow: "hidden",
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  shimmer: {
    position: "absolute",
    top: -30,
    bottom: -30,
    width: 60,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  text: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});