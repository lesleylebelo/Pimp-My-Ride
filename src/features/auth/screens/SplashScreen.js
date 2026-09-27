import React, { useEffect } from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import LogoMark from "../../../shared/components/LogoMark";
import colors from "../../../shared/theme/colors";

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("SignIn");
    }, 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.center}>
        <LogoMark size={90} variant="onLight" />
        <Text style={styles.title}>PimpMyRide</Text>
      </View>
      <Text style={styles.tagline}>Connect. Customize. Drive Your Style.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 20,
    fontSize: 30,
    fontWeight: "500",
    color: colors.primary,
  },
  tagline: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    fontSize: 15,
    fontWeight: "400",
    color: colors.textSecondary,
  },
});
