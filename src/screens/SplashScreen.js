import React, { useEffect } from "react";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import LogoMark from "../components/LogoMark";
import colors from "../theme/colors";

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("RoleSelection");
    }, 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={styles.center}>
        <LogoMark size={90} variant="onDark" />
        <Text style={styles.title}>PimpMyRide</Text>
      </View>
      <Text style={styles.tagline}>Connect. Customize. Drive Your Style.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 20,
    fontSize: 30,
    fontWeight: "800",
    color: colors.white,
  },
  tagline: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
});
