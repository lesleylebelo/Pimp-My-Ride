import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../../../shared/theme/colors";
import { spacing } from "../../../shared/theme/typography";

export default function AuthNavHeader({ title, onBack }) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.side}>
        <Ionicons name="arrow-back" size={22} color={colors.primary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  side: {
    width: 32,
    height: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
  },
});
