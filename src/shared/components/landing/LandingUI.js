import React, { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold } from '@expo-google-fonts/manrope';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { authError } from '../../../features/auth/utils/authErrors';
import { useTheme } from '../../theme/ThemeContext';
import { palettes } from '../../theme/colors';
import { spacing } from '../../theme/typography';
import PrimaryButton from '../PrimaryButton';
import OutlineButton from '../OutlineButton';

const FontContext = createContext(false);
const fontNames = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
};

export function LandingText({ weight = 'regular', style, ...props }) {
  const loaded = useContext(FontContext);
  const font = fontNames[weight] || fontNames.regular;
  const {theme} = useTheme();
  const styles = makeStyles(theme);
  return <Text {...props} style={[styles.body, { fontFamily: loaded ? font : undefined }, style]} />;
}

export function LandingButton({ title, onPress, outline = false, style, ...props }) {
  const loaded = useContext(FontContext);
  const Button = outline ? OutlineButton : PrimaryButton;
  return <Button {...props} title={title} onPress={onPress} style={style} textStyle={{ fontFamily: loaded ? fontNames.medium : undefined }} />;
}

export function useLandingFeedback() {
  const [feature, setFeature] = useState('');
  return { feature, showFeature: setFeature, onClose: () => setFeature('') };
}

const icons = { discover: 'compass-outline', garage: 'car-outline', requests: 'document-text-outline', bookings: 'calendar-outline', profile: 'person-outline' };

export const ownerTabs = [
  { label: 'Discover', icon: 'discover' },
  { label: 'Garage', icon: 'garage' },
  { label: 'My Requests', icon: 'requests' },
  { label: 'Bookings', icon: 'bookings' },
  { label: 'Profile', icon: 'profile' },
];

export const shopTabs = [
  { label: 'Find Jobs', icon: 'discover' },
  { label: 'Requests', icon: 'garage' },
  { label: 'Quotes', icon: 'requests' },
  { label: 'Bookings', icon: 'bookings' },
  { label: 'My Shop', icon: 'profile' },
];

export function LandingShell({ title, subtitle, tabs, feature, showFeature, onClose, children, admin = false, activeTab, onTabPress, onScroll, onLayout, onContentSizeChange, floatingAction, refreshControl }) {
  const [loaded, fontError] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold });
  const { logout, working, offline, cachedAt } = useAuth();
  const {theme} = useTheme();
  const ui = makeStyles(theme);
  const [signOutError, setSignOutError] = useState('');
  const insets = useSafeAreaInsets();

  async function signOut() {
    if (working) return;
    setSignOutError('');
    try { await logout(); } catch (error) { setSignOutError(authError(error)); }
  }

  if (!loaded && !fontError) return <SafeAreaView style={ui.loading}><ActivityIndicator color={theme.primary} /></SafeAreaView>;

  return (
    <FontContext.Provider value={loaded}>
      <SafeAreaView style={ui.safeArea} edges={['top', 'left', 'right']}>
        <View style={ui.page}>
          {offline && <View style={ui.offlineBar}><LandingText style={ui.offlineText}>Offline · Read-only preview{cachedAt ? ` · Saved ${new Date(cachedAt).toLocaleString()}` : ''}. Connect for updates.</LandingText></View>}

          <View style={ui.header}>
            <View style={ui.headerLeft}>
              <Text accessibilityRole="header" style={[ui.title, { fontFamily: loaded ? fontNames.displaySemi : undefined }]} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={[ui.subtitle, { fontFamily: loaded ? fontNames.regular : undefined }]} numberOfLines={2}>{subtitle}</Text>}
            </View>
            {!admin && <Pressable onPress={signOut} disabled={working} style={ui.signOut} hitSlop={8}>
              <Text style={[ui.signOutText, { fontFamily: loaded ? fontNames.medium : undefined }]}>Sign out</Text>
            </Pressable>}
          </View>

          <ScrollView refreshControl={refreshControl} style={ui.scroll} contentContainerStyle={[ui.content, !tabs && { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled" onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={onScroll ? 16 : undefined}>
            {!!signOutError && <LandingText style={ui.error}>{signOutError}</LandingText>}
            {children}
            {admin && <LandingButton title="Sign Out" outline onPress={signOut} disabled={working} />}
          </ScrollView>

          {tabs && <View accessibilityRole="tablist" style={[ui.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {tabs.map((tab, index) => {
              const isActive = activeTab ? tab.label === activeTab : index === 0;
              return <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: isActive }} onPress={() => onTabPress ? onTabPress(tab.label) : index > 0 && showFeature?.(tab.label)} style={ui.tab}>
                <Ionicons name={icons[tab.icon]} size={22} color={isActive ? theme.accent : theme.textSecondary} />
                <Text style={[ui.navLabel, isActive && ui.navLabelActive, { fontFamily: loaded ? fontNames.medium : undefined }]}>{tab.label}</Text>
              </Pressable>;
            })}
          </View>}
          {floatingAction}
        </View>

        <Modal visible={!!feature} transparent animationType="fade" onRequestClose={onClose}>
          <View style={ui.modalBackdrop}>
            <View style={ui.modalCard}>
              <LandingText weight="semibold" style={ui.sectionTitle}>{feature}</LandingText>
              <LandingText style={ui.muted}>Coming soon. This feature will be available in a future update.</LandingText>
              <LandingButton title="Got it" onPress={onClose} />
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </FontContext.Provider>
  );
}

export const makeStyles = (colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  offlineBar: { padding: 12, backgroundColor: colors.surfaceMuted },
  offlineText: { fontSize: 13, color: colors.textSecondary },

  header: { paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerLeft: { flex: 1, minWidth: 0 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: colors.accent },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 4 },
  signOut: { paddingVertical: 6, paddingHorizontal: 2, marginTop: 4 },
  signOutText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 30, gap: spacing.md },
  body: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  muted: { color: colors.textSecondary },
  link: { fontSize: 14, color: colors.accent },
  sectionTitle: { fontSize: 18, lineHeight: 24, color: colors.textPrimary, fontWeight: '600' },
  statusTag: { alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surfaceMuted },
  statusText: { fontSize: 12, lineHeight: 16, color: colors.accent, fontWeight: '600' },
  card: { padding: 20, borderRadius: 24, backgroundColor: colors.surfaceCard, gap: 14, borderWidth: 1, borderColor: colors.border },

  navigation: { flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceCard },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', minHeight: 56, gap: 4, paddingHorizontal: 2 },
  navLabel: { fontSize: 11, lineHeight: 14, textAlign: 'center', color: colors.textSecondary, fontWeight: '500' },
  navLabelActive: { color: colors.accent, fontWeight: '600' },

  error: { color: colors.error },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 20, borderRadius: 20, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border },
});

// Fallback for files that still import `ui` directly (they'll get dark by default).
// As we migrate those files, they'll start using the live theme instead.
export const ui = makeStyles(palettes.dark);