import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import LogoMark from "../components/LogoMark";
import RoleCard from "../components/RoleCard";
import OrDivider from "../components/OrDivider";
import OutlineButton from "../components/OutlineButton";
import colors from "../theme/colors";
import { spacing } from "../theme/typography";

export default function RoleSelectionScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <LogoMark size={96} variant="onLight" />
          <Text style={styles.title}>Welcome to PimpMyRide</Text>
          <Text style={styles.subtitle}>Choose your role to continue</Text>
        </View>

        <RoleCard
          icon="person-outline"
          title="Vehicle Owner"
          description="Manage your vehicles, book services, and track your garage."
          onPress={() => navigation.navigate("SignUp", { role: "owner" })}
        />
        <RoleCard
          icon="storefront-outline"
          title="Custom Shop"
          description="Register your shop, manage services, and grow your business."
          onPress={() => navigation.navigate("SignUp", { role: "shop" })}
        />
        <RoleCard
          icon="shield-account-outline"
          iconSet="material"
          title="Admin"
          description="Access the admin panel and manage the platform."
          onPress={() => navigation.navigate("AdminSignIn")}
        />

        <OrDivider />

        <Text style={styles.footerText}>Already have an account?</Text>
        <OutlineButton
          title="Sign In"
          icon="log-in-outline"
          onPress={() => navigation.navigate("SignIn", { role: "owner" })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.primary,
    textAlign: "center",
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  footerText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
