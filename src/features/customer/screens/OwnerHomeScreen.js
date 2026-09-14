import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import colors from '../../../shared/theme/colors';
import { LandingButton, LandingShell, LandingText, ownerTabs, ui, useLandingFeedback } from '../../../shared/components/landing/LandingUI';

export default function OwnerHomeScreen() {
  const feedback = useLandingFeedback();
  const soon = feedback.showFeature;
  return <LandingShell title="Discover" tabs={ownerTabs} {...feedback}>
    <View style={styles.locationRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose location" onPress={() => soon('Choose location')} style={styles.location}>
        <LandingText weight="semibold" style={ui.green}>Johannesburg⌄</LandingText>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => soon('Notifications')} style={styles.alerts}>
        <LandingText weight="semibold" style={ui.green}>Alerts</LandingText>
      </Pressable>
    </View>
    <LandingText style={ui.muted}>Find inspiration for your next upgrade</LandingText>
    <LandingButton title="Search workshops or services" outline onPress={() => soon('Search workshops or services')} />
    <View style={styles.categories}>
      <LandingButton title="All" onPress={() => {}} style={styles.category} accessibilityHint="Showing the sample showcase" />
      <LandingButton title="Body Kit" outline onPress={() => soon('Body Kit filter')} style={styles.category} />
      <LandingButton title="More filters" outline onPress={() => soon('More filters')} style={styles.category} />
    </View>
    <LandingText weight="bold" style={styles.heading}>Workshop showcases</LandingText>
    <View style={ui.card}>
      <LandingText style={ui.sample}>Sample showcase</LandingText>
      <View style={styles.workshopRow}>
        <Image source={require('../../../../assets/landing/workshop-logo.png')} style={styles.logo} accessible={false} />
        <View style={styles.workshopText}>
          <LandingText weight="bold" style={styles.workshopName}>Powerpipes AutoART ✓</LandingText>
          <LandingText style={styles.caption}>Sandton · Body Kit</LandingText>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="View BMW M2 showcase" onPress={() => soon('Showcase details')}>
        <Image source={require('../../../../assets/landing/owner-showcase.png')} style={styles.photo} accessibilityLabel="Red BMW M2 showcase" />
      </Pressable>
      <LandingText weight="bold" style={styles.cardTitle}>BMW M2 · Full body kit</LandingText>
      <LandingText style={[ui.muted, styles.description]}>A sharper finish with a complete styling upgrade.</LandingText>
      <LandingButton title="View Shop" outline onPress={() => soon('Shop profile')} />
    </View>
  </LandingShell>;
}

const styles = StyleSheet.create({
  locationRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginVertical: -12 },
  location: { flex: 1, minHeight: 44, justifyContent: 'center' },
  alerts: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  categories: { flexDirection: 'row', gap: 8 },
  category: { flex: 1, width: undefined, paddingHorizontal: 4 },
  heading: { fontSize: 18, lineHeight: 25 },
  workshopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 36, height: 36, borderRadius: 18 },
  workshopText: { flex: 1, gap: 2 },
  workshopName: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  photo: { width: '100%', aspectRatio: 330 / 200, borderRadius: 8, resizeMode: 'cover' },
  cardTitle: { fontSize: 16, lineHeight: 22 },
  description: { fontSize: 13, lineHeight: 18 },
});
