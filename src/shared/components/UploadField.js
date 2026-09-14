import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import colors from '../theme/colors';
import {spacing} from '../theme/typography';

// The file picker is intentionally kept separate from validation and upload.
// This component only presents the action and the selected filename.
export default function UploadField({label, fileName, onPress}) {
  return (
    <View style={styles.wrapper}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fileName ? `${label}, ${fileName}` : `Choose ${label || 'document'}`}
        accessibilityHint="Opens the document picker"
        onPress={onPress}
        disabled={!onPress}
        style={({pressed}) => [styles.field, pressed && styles.pressed, !onPress && styles.disabled]}
      >
        <Text numberOfLines={1} style={[styles.filename, !fileName && styles.placeholder]}>
          {fileName || 'Choose PDF, JPG or PNG'}
        </Text>
        <Text style={styles.action}>{fileName ? 'Replace' : 'Upload'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {marginBottom: spacing.md},
  label: {fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.sm},
  field: {
    minHeight: 56, paddingHorizontal: spacing.md, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
  },
  pressed: {opacity: 0.7},
  disabled: {opacity: 0.55},
  filename: {flex: 1, color: colors.textPrimary},
  placeholder: {color: colors.textSecondary},
  action: {color: colors.primary, fontWeight: '700'},
});
