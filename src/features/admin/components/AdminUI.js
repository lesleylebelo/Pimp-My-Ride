import React from 'react';
import {View,Text,ScrollView,Pressable,TextInput,StyleSheet,ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import colors from '../../../shared/theme/colors';

export const styles = StyleSheet.create({
  page: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 24,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  muted: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 52,
  },
  button: {
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  buttonText: {
    color: colors.textPrimary,
    fontWeight: '500',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  buttonTextPrimary: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  danger: {
    backgroundColor: '#3A1414',
    borderColor: '#3A1414',
  },
  dangerText: {
    color: '#FF6B6B',
  },
});

export function Page({ title, children, onScroll, onLayout, onContentSizeChange }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }} edges={['top', 'bottom']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={onScroll ? 16 : undefined}
      >
        <Text style={styles.title}>{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const Card = ({ children }) => <View style={styles.card}>{children}</View>;

export function Button({ title, onPress, disabled, danger, primary }) {
  const containerStyle = [
    styles.button,
    danger && styles.danger,
    primary && styles.buttonPrimary,
    disabled && { opacity: 0.4 },
  ];
  const labelStyle = [
    styles.buttonText,
    danger && styles.dangerText,
    primary && styles.buttonTextPrimary,
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={containerStyle}
    >
      <Text style={labelStyle} numberOfLines={2}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, ...props }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value || ''}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textMuted}
        {...props}
      />
    </View>
  );
}

export function Notice({ error, busy }) {
  return (
    <>
      {busy && <ActivityIndicator color={colors.accent} />}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.error, lineHeight: 21 }}>{error}</Text>}
    </>
  );
}

export const when = value => value ? new Date(value).toLocaleString() : 'Not recorded';