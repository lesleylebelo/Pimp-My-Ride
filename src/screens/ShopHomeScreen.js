import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { LandingButton, LandingShell, LandingText, shopTabs, ui, useLandingFeedback } from '../components/landing/LandingUI';

export default function ShopHomeScreen() {
  const { profile } = useAuth();
  const feedback = useLandingFeedback();
  const soon = feedback.showFeature;
  return <LandingShell title="Find Jobs" tabs={shopTabs} {...feedback}>
    <LandingText weight="semibold" style={ui.green}>{profile?.shop?.shopName || 'Your shop'}  ✓ Verified</LandingText>
    <LandingText style={ui.muted}>Service requests from vehicle owners near you.</LandingText>
    <LandingButton title="Private direct requests" outline onPress={() => soon('Private direct requests')} />
    <LandingText weight="semibold" style={ui.sectionTitle}>Nearby opportunities</LandingText>
    <View style={[ui.card, styles.card]}>
      <LandingText style={ui.sample}>Sample request</LandingText>
      <Image source={require('../../assets/landing/shop-request.png')} style={styles.photo} accessibilityLabel="Black BMW M4 service request" />
      <LandingText weight="semibold" style={styles.cardTitle}>Body kit for BMW M4</LandingText>
      <LandingText style={[ui.muted, styles.details]}>Lesley Lebelo · Johannesburg{'\n'}R10,000–R15,000 · Flexible date</LandingText>
      <LandingButton title="View Request" onPress={() => soon('Service request details')} />
    </View>
    <LandingButton title="Explore other shops" outline onPress={() => soon('Explore other shops')} />
    <LandingButton title="Notifications" outline onPress={() => soon('Notifications')} />
  </LandingShell>;
}

const styles = StyleSheet.create({
  card: { padding: 14 },
  photo: { width: '100%', aspectRatio: 326 / 164, borderRadius: 10, resizeMode: 'cover' },
  cardTitle: { fontSize: 19, lineHeight: 27 },
  details: { fontSize: 13, lineHeight: 18 },
});
