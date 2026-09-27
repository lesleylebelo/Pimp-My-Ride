import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {useFonts} from 'expo-font';
import {Inter_400Regular} from '@expo-google-fonts/inter/400Regular';
import {Inter_500Medium} from '@expo-google-fonts/inter/500Medium';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { authError } from '../../../features/auth/utils/authErrors';
import colors from '../../theme/colors';
import { spacing } from '../../theme/typography';
import PrimaryButton from '../PrimaryButton';
import OutlineButton from '../OutlineButton';

const FontContext = createContext(false);
const fontNames = { regular: 'Inter_400Regular', medium: 'Inter_500Medium' };
const weights = { regular: '400', medium: '500', semibold: '500', bold: '500' };

export function LandingText({ weight = 'regular', style, ...props }) {
  const loaded = useContext(FontContext);
  const font = weight === 'regular' ? fontNames.regular : fontNames.medium;
  return <Text {...props} style={[ui.body, { fontFamily: loaded ? font : undefined, fontWeight: weights[weight] || '400' }, style]} />;
}

export function LandingButton({ title, onPress, outline = false, style, ...props }) {
  const loaded = useContext(FontContext);
  const Button = outline ? OutlineButton : PrimaryButton;
  return <Button {...props} title={title} onPress={onPress} style={[ui.button, style]}
    textStyle={[ui.buttonText, { fontFamily: loaded ? fontNames.medium : undefined }]} />;
}

export function useLandingFeedback() {
  const [feature, setFeature] = useState('');
  return { feature, showFeature: setFeature, onClose: () => setFeature('') };
}

const icons = {
  discover: 'compass-outline',
  garage: 'car-outline',
  requests: 'document-text-outline',
  bookings: 'calendar-outline',
  profile: 'person-outline',
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

export function LandingShell({ title, tabs, feature, showFeature, onClose, children, admin = false, activeTab, onTabPress, onScroll, onLayout, onContentSizeChange }) {
  const [loaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium });
  const { logout, working, offline, cachedAt } = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const insets = useSafeAreaInsets();
  async function signOut() {
    if (working) return;
    setSignOutError('');
    try { await logout(); } catch (error) { setSignOutError(authError(error)); }
  }
 
  if (!loaded && !fontError) return <SafeAreaView style={ui.loading}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading page" /></SafeAreaView>;
  return (
    <FontContext.Provider value={loaded}>
      <SafeAreaView style={ui.safeArea} edges={['top', 'left', 'right']}>
        <View style={ui.page}>
          {offline && <View style={{padding:12,backgroundColor:colors.brandGreenLight}}><LandingText accessibilityLiveRegion="polite">Offline · Read-only preview{cachedAt ? ` · Saved ${new Date(cachedAt).toLocaleString()}` : ''}. Connect for updates.</LandingText></View>}
          <View style={ui.header}>
            <LandingText accessibilityRole="header" weight="medium" style={[ui.title, title === 'Discover' ? { fontSize: 30 } : ui.green]}>{title}</LandingText>
            {!admin && <Pressable onPress={signOut} disabled={working} accessibilityRole="button" accessibilityLabel="Sign out" style={ui.signOut}>
              <LandingText weight="medium" style={ui.link}>Sign out</LandingText>
            </Pressable>}
          </View>
          <ScrollView style={ui.scroll} contentContainerStyle={[ui.content, !tabs && { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled" onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={onScroll ? 16 : undefined}>
            {!!signOutError && <LandingText accessibilityRole="alert" style={ui.error}>{signOutError}</LandingText>}
            {children}
            {admin && <LandingButton title="Sign Out" outline onPress={signOut} disabled={working} />}
          </ScrollView>
          {tabs && <View accessibilityRole="tablist" style={[ui.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {tabs.map((tab, index) => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab ? tab.label===activeTab : index===0 }} accessibilityHint={onTabPress ? undefined : index ? 'Coming soon' : 'Current page'}
              onPress={() => onTabPress ? onTabPress(tab.label) : index > 0 && showFeature?.(tab.label)} style={ui.tab}>
              <Ionicons name={icons[tab.icon]} size={22} color={(activeTab ? tab.label===activeTab : index===0) ? colors.primary : colors.textSecondary} accessible={false} />
              <LandingText weight="medium" style={[ui.navLabel, (activeTab ? tab.label===activeTab : index===0) && ui.green]}>{tab.label}</LandingText>
            </Pressable>)}
          </View>}
        </View>
        <Modal visible={!!feature} transparent animationType="fade" onRequestClose={onClose}>
          <View style={ui.modalBackdrop}>
            <View style={ui.modalCard} accessibilityViewIsModal>
              <LandingText accessibilityRole="header" weight="medium" style={ui.sectionTitle}>{feature}</LandingText>
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
  header: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 28, lineHeight: 39, flex: 1 },
  signOut: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 30, gap: spacing.md },
  body: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  green: { color: colors.primary },
  link: { fontSize: 14, color: colors.primary },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  statusTag: { alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.brandGreenLight },
  statusText: { fontSize: 12, lineHeight: 16, color: colors.primary, fontWeight: '500' },
  button: { borderRadius: 14, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.primary },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.surfaceCard, gap: 12 },
  sample: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  navigation: { flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', minHeight: 52, gap: 4, paddingHorizontal: 2 },
  navLabel: { fontSize: 10, lineHeight: 14, textAlign: 'center', color: colors.textSecondary },
  error: { color: colors.error },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 20, borderRadius: 20, backgroundColor: colors.surfaceCard },
});
