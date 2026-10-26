import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export default function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  secureTextEntry,
  showPasswordToggle = false,
  icon,
  keyboardType,
  autoCapitalize = "sentences",
  multiline = false,
  error,
  helperText,
  style,
  inputStyle,
  accessibilityLabel = label,
  ...inputProps
}) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSecure = secureTextEntry && !revealed;

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          multiline && styles.inputRowMultiline,
          focused && styles.inputRowFocused,
          error && styles.inputRowError,
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={18} color={theme.textSecondary} style={styles.leadingIcon} />
        ) : null}
        <TextInput
          {...inputProps}
          accessibilityLabel={accessibilityLabel}
          autoCorrect={secureTextEntry ? false : undefined}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor || theme.textMuted}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={secureTextEntry ? "none" : autoCapitalize}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={event => { setFocused(true); inputProps.onFocus?.(event); }}
          onBlur={event => { setFocused(false); inputProps.onBlur?.(event); }}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={10}
            style={styles.eyeButton}
          >
            <Ionicons name={revealed ? "eye-off-outline" : "eye-outline"} size={20} color={theme.textSecondary} />
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

const makeStyles = (colors) => StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 54,
  },
  inputRowFocused: {
    borderColor: colors.accent,
  },
  inputRowMultiline: {
    alignItems: "flex-start",
  },
  inputRowError: {
    borderColor: colors.error,
  },
  leadingIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputMultiline: {
    minHeight: 90,
    paddingTop: 14,
  },
  eyeButton: {
    paddingLeft: 10,
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
