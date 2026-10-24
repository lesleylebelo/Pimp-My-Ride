import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {useTheme} from '../../../shared/theme/ThemeContext';
import LogoMark from '../../../shared/components/LogoMark';
import { spacing } from "../../../shared/theme/typography";

export default function AuthNavHeader({ title, onBack }) {
  const {theme:colors}=useTheme(),styles=makeStyles(colors);
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} hitSlop={12} style={styles.side}>
        <Ionicons name="arrow-back-outline" size={22} color={colors.primary} />
      </Pressable>
      <Text style={styles.title} >
        {title}
      </Text>
      <LogoMark size={40}/>
    </View>
  );
}

const makeStyles = colors => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  side: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "500",
    color: colors.primary,
  },
});
