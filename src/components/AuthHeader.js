import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import colors from "../theme/colors";
import { spacing, radius } from "../theme/typography";

/**
 * Full-width dark green header block used at the top of the Sign Up flow
 * (and, with an icon, the Admin Sign In screen).
 * title: e.g. "Create Account"
 * subtitle: optional line under the title (only shown on step 1)
 * icon: optional glyph shown in a bordered badge above the title
 * iconSet: "ionicons" (default) or "material"
 */
export default function AuthHeader({ title, subtitle, icon, iconSet = "ionicons" }) {
  const IconComponent = iconSet === "material" ? MaterialCommunityIcons : Ionicons;
  return (
    <View style={styles.container}>
      {icon ? (
        <View style={styles.iconBadge}>
          <IconComponent name={icon} size={32} color={colors.white} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary,
    minHeight: 150,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
