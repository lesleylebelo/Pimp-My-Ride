import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {useFonts} from 'expo-font';
import {Inter_400Regular} from '@expo-google-fonts/inter/400Regular';
import {Inter_500Medium} from '@expo-google-fonts/inter/500Medium';
import {Inter_600SemiBold} from '@expo-google-fonts/inter/600SemiBold';
import {Inter_700Bold} from '@expo-google-fonts/inter/700Bold';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { authError } from '../../../features/auth/utils/authErrors';
import colors from '../../theme/colors';
import { spacing } from '../../theme/typography';
import PrimaryButton from '../PrimaryButton';
import OutlineButton from '../OutlineButton';

const FontContext = createContext(false);
const fontNames = { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold' };
const weights = { regular: '400', medium: '500', semibold: '600', bold: '700' };

export function LandingText({ weight = 'regular', style, ...props }) {
  const loaded = useContext(FontContext);
  return <Text {...props} style={[ui.body, { fontFamily: loaded ? fontNames[weight] : undefined, fontWeight: weights[weight] }, style]} />;
}

export function LandingButton({ title, onPress, outline = false, style, ...props }) {
  const loaded = useContext(FontContext);
  const Button = outline ? OutlineButton : PrimaryButton;
  return <Button {...props} title={title} onPress={onPress} style={[ui.button, style]}
    textStyle={[ui.buttonText, { fontFamily: loaded ? fontNames.semibold : undefined }]} />;
}

export function useLandingFeedback() {
  const [feature, setFeature] = useState('');
  return { feature, showFeature: setFeature, onClose: () => setFeature('') };
}

const icons = {
  discover: require('../../../../assets/landing/discover.png'),
  garage: require('../../../../assets/landing/garage.png'),
  requests: require('../../../../assets/landing/requests.png'),
  bookings: require('../../../../assets/landing/bookings.png'),
  profile: require('../../../../assets/landing/profile.png'),
};
export const ownerTabs = [
  { label: 'Discover', icon: 'discover' }, { label: 'Garage', icon: 'garage' },
  { label: 'My Requests', icon: 'requests' }, { label: 'Bookings', icon: 'bookings' },
  { label: 'Profile', icon: 'profile' },
];
export const shopTabs = [
  { label: 'Find Jobs', icon: 'discover' }, { label: 'Requests', icon: 'garage' },
  { label: 'Quotes', icon: 'requests' }, { label: 'Bookings', icon: 'bookings' },
  { label: 'My Shop', icon: 'profile' },
];

export function LandingShell({ title, tabs, feature, showFeature, onClose, children, admin = false }) {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const { logout, working, offline, cachedAt } = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const insets = useSafeAreaInsets();
  async function signOut() {
    if (working) return;
    setSignOutError('');
    try { await logout(); } catch (error) { setSignOutError(authError(error)); }
  }
  // Fonts are packaged locally. Fall back to system text if font loading fails.
  if (!loaded && !fontError) return <SafeAreaView style={ui.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading page" /></SafeAreaView>;
  return (
    <FontContext.Provider value={loaded}>
      <SafeAreaView style={ui.safeArea} edges={['top', 'left', 'right']}>
        <View style={ui.page}>
          {offline && <View style={{padding:12,backgroundColor:'#FFF2CD'}}><LandingText accessibilityLiveRegion="polite">Offline · Read-only preview{cachedAt ? ` · Saved ${new Date(cachedAt).toLocaleString()}` : ''}. Connect for updates.</LandingText></View>}
          <View style={ui.header}>
            <LandingText accessibilityRole="header" weight={title === 'Discover' ? 'bold' : 'semibold'} style={[ui.title, title === 'Discover' ? { fontSize: 30 } : ui.green]}>{title}</LandingText>
            {!admin && <Pressable onPress={signOut} disabled={working} accessibilityRole="button" accessibilityLabel="Sign out" style={ui.signOut}>
              <LandingText weight="semibold" style={ui.link}>Sign Out</LandingText>
            </Pressable>}
          </View>
          <ScrollView style={ui.scroll} contentContainerStyle={[ui.content, !tabs && { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
            {!!signOutError && <LandingText accessibilityRole="alert" style={ui.error}>{signOutError}</LandingText>}
            {children}
            {admin && <LandingButton title="Sign Out" outline onPress={signOut} disabled={working} />}
          </ScrollView>
          {tabs && <View accessibilityRole="tablist" style={[ui.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {tabs.map((tab, index) => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label}
              accessibilityState={{ selected: index === 0 }} accessibilityHint={index ? 'Coming soon' : 'Current page'}
              onPress={() => index > 0 && showFeature(tab.label)} style={ui.tab}>
              <Image source={icons[tab.icon]} style={ui.navIcon} accessible={false} />
              <LandingText weight="medium" style={[ui.navLabel, index === 0 && ui.green]}>{tab.label}</LandingText>
            </Pressable>)}
          </View>}
        </View>
        <Modal visible={!!feature} transparent animationType="fade" onRequestClose={onClose}>
          <View style={ui.modalBackdrop}>
            <View style={ui.modalCard} accessibilityViewIsModal>
              <LandingText accessibilityRole="header" weight="bold" style={ui.sectionTitle}>{feature}</LandingText>
              <LandingText style={ui.muted}>Coming soon. This feature will be available in a future update.</LandingText>
              <LandingButton title="Got it" onPress={onClose} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </FontContext.Provider>
  );
}

export const ui = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 28, lineHeight: 39, flex: 1 },
  signOut: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 30, gap: spacing.md },
  body: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  green: { color: colors.primary },
  link: { fontSize: 12, color: colors.primary },
  sectionTitle: { fontSize: 20, lineHeight: 28 },
  button: { borderRadius: 8, minHeight: 48, paddingVertical: 13, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.primary },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  card: { padding: 12, borderRadius: 12, backgroundColor: colors.white, gap: 10 },
  sample: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  navigation: { flexDirection: 'row', paddingTop: 12, backgroundColor: colors.white },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', minHeight: 48, gap: 4, paddingHorizontal: 2 },
  navIcon: { width: 24, height: 24, resizeMode: 'contain' },
  navLabel: { fontSize: 10, lineHeight: 14, textAlign: 'center', color: colors.textSecondary },
  error: { color: colors.error },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 20, borderRadius: 16, backgroundColor: colors.white },
});
