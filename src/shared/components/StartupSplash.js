import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Image, StyleSheet, Text, View} from 'react-native';
import * as NativeSplash from 'expo-splash-screen';
import {StatusBar} from 'expo-status-bar';

// Hold the native launch image until its matching React view has laid out.
// Expo Web/Go may have no native splash; that must never block startup.
void NativeSplash.preventAutoHideAsync().catch(() => {});

export default function StartupSplash({ready, onDismiss}) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [motionKnown, setMotionKnown] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const laidOut = useRef(false);
  const imageReady = useRef(false);
  const nativeHidden = useRef(false);
  const completed = useRef(false);
  const dismiss = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    void NativeSplash.hideAsync().catch(() => {});
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    let active = true;
    const update = value => {
      if (active) { setReducedMotion(value); setMotionKnown(true); }
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => update(true));
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    // Do not briefly show text then hide it while the OS preference resolves.
    if (!motionKnown && !ready) return;
    if (reducedMotion || ready) {
      scale.setValue(1); tagline.setValue(1);
      return;
    }
    scale.setValue(0.97); tagline.setValue(0);
    const logoMotion = Animated.timing(scale, {toValue:1, duration:280, useNativeDriver:true});
    const textMotion = Animated.timing(tagline, {toValue:1, duration:220, delay:80, useNativeDriver:true});
    logoMotion.start(); textMotion.start();
    return () => { logoMotion.stop(); textMotion.stop(); };
  }, [motionKnown, reducedMotion, ready, scale, tagline]);

  useEffect(() => {
    if (!ready) return;
    // Readiness always wins: never wait for the entrance animation.
    if (reducedMotion) { dismiss(); return; }
    const exit = Animated.timing(opacity, {toValue:0, duration:120, useNativeDriver:true});
    const fallback = setTimeout(dismiss, 180);
    exit.start(({finished}) => { if (finished) dismiss(); });
    return () => { exit.stop(); clearTimeout(fallback); };
  }, [ready, reducedMotion, dismiss, opacity]);

  // An overlay failure or stalled initialization cannot trap the user here.
  // This only reveals the existing loading/error UI; it never grants access.
  useEffect(() => { const timer = setTimeout(dismiss, 12000); return () => clearTimeout(timer); }, [dismiss]);

  const reveal = () => {
    if (!laidOut.current || !imageReady.current || nativeHidden.current) return;
    nativeHidden.current = true;
    void NativeSplash.hideAsync().catch(() => {});
  };
  return <Animated.View testID="startup-splash" pointerEvents="none" onLayout={() => { laidOut.current = true; reveal(); }} style={[styles.overlay,{opacity}]}>
    <StatusBar style="light"/>
    <View style={styles.center}>
      <Animated.View style={{transform:[{scale}]}}>
        <Image source={require('../../../assets/branding/splash-logo.png')} onLoadEnd={() => { imageReady.current = true; reveal(); }} resizeMode="contain" accessibilityLabel="PimpMyRide PR logo" style={styles.logo}/>
      </Animated.View>
    </View>
    <Animated.View style={[styles.copy,{opacity:tagline}]}>
      <Text style={styles.tagline}>Connect. Customize. Drive your style.</Text>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'#0B0B0D',zIndex:100},
  center:{flex:1,alignItems:'center',justifyContent:'center'},
  logo:{width:200,height:200},
  copy:{position:'absolute',top:'50%',marginTop:116,left:24,right:24,alignItems:'center'},
  tagline:{color:'#C4E052',fontSize:18,lineHeight:28,textAlign:'center',maxWidth:440},
});
