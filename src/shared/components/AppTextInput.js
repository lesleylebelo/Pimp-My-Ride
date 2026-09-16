import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";
import { radius, typography, spacing } from "../theme/typography";

export default function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  showPasswordToggle = false,
  icon,
  keyboardType,
  autoCapitalize = "sentences",
  multiline = false,
  error,
  helperText,
  style,
  ...inputProps
}) {
  const [revealed, setRevealed] = useState(false);
  const isSecure = secureTextEntry && !revealed;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          multiline && styles.inputRowMultiline,
          error && styles.inputRowError,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={colors.textSecondary}
            style={styles.leadingIcon}
          />
        ) : null}
        <TextInput
          {...inputProps}
          accessibilityLabel={label}
          autoCorrect={secureTextEntry ? false : undefined}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={secureTextEntry ? "none" : autoCapitalize}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={10}
            style={styles.eyeButton}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRowMultiline: {
    alignItems: "flex-start",
  },
  inputRowError: {
    borderColor: colors.error,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 18,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 90,
    paddingTop: 18,
  },
  eyeButton: {
    paddingLeft: spacing.sm,
    paddingVertical: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
  },
});
