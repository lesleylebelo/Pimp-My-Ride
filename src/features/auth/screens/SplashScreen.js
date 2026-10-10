import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { StatusBar } from "expo-status-bar";
import LogoMark from "../../../shared/components/LogoMark";

const GLOW = '#C4E052';       // lime accent (same in both themes)
const BG = '#0B0B0D';         // always dark — premium feel
const TEXT_PRIMARY = '#F5F5F7';
const TEXT_SECONDARY = '#98989D';

export default function SplashScreen({ navigation }) {
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    // Entrance animation — logo fades + scales in, then text fades
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(logoScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Loading dots — each pulses on a staggered loop
    const pulse = (i) => Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity[i], { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(dotOpacity[i], { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    );
    const loops = [pulse(0), pulse(1), pulse(2)];
    loops.forEach((loop, i) => setTimeout(() => loop.start(), i * 180));

    // Advance after 2.2s
    const timer = setTimeout(() => {
      navigation.replace("SignIn");
    }, 2200);

    return () => {
      clearTimeout(timer);
      loops.forEach(l => l.stop());
    };
  }, [navigation, logoOpacity, logoScale, textOpacity, dotOpacity]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.center}>
        {/* Soft radial glow behind the logo */}
        <View style={styles.glowOuter} />
        <View style={styles.glowInner} />

        <Animated.View
          style={[
            styles.logoWrap,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <LogoMark size={96} variant="onDark" />
        </Animated.View>

        <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
          <Text style={styles.title}>PimpMyRide</Text>
          <View style={styles.rule} />
          <Text style={styles.tagline}>Connect. Customize. Drive Your Style.</Text>
        </Animated.View>
      </View>

      {/* Loading dots at the bottom */}
      <View style={styles.dotsRow}>
        {dotOpacity.map((op, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: op }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    position: 'relative',
  },

  // Radial glow — two concentric transparent circles
  glowOuter: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: GLOW,
    opacity: 0.06,
  },
  glowInner: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GLOW,
    opacity: 0.12,
  },

  logoWrap: {
    shadowColor: GLOW,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },

  title: {
    marginTop: 28,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: TEXT_PRIMARY,
  },

  rule: {
    width: 40,
    height: 2,
    backgroundColor: GLOW,
    borderRadius: 1,
    marginTop: 12,
    marginBottom: 12,
  },

  tagline: {
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.3,
    color: TEXT_SECONDARY,
  },

  // Loading dots
  dotsRow: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GLOW,
  },
});