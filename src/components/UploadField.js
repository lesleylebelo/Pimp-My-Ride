import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import colors from "../theme/colors";
import { radius, typography, spacing } from "../theme/typography";

/**
 * Label above a white pill row containing a grey "Upload" pill button.
 * fileName: when set, shows the picked file name instead of the Upload button.
 */
export default function UploadField({ label, fileName, onPress }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.uploadText} numberOfLines={1}>
            {fileName || "Upload"}
          </Text>
        </Pressable>
      </View>
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
  row: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  uploadBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.disabledSurface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    maxWidth: "100%",
  },
  uploadText: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    color: colors.textPrimary,
  },
});
