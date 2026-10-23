import React, {useMemo, useRef, useEffect} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';

export function useMessagingStyles() {
  const {theme, isDark} = useTheme();
  return {theme, styles: useMemo(() => makeStyles(theme, isDark), [theme, isDark])};
}
// The API supplies workshop names and request references, but no customer names or avatars.
export const conversationLabel = (item, role) => (role === 'shop' ? item.requestTitle : item.shopName) || item.requestTitle || item.shopName || 'Conversation';
export function messageDate(value, now = Date.now()) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return 'Date unavailable';
  const date = new Date(value), today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date >= yesterday && date < today) return 'Yesterday';
  return date.toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'});
}
export function messageTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) return 'Time unavailable';
  return new Date(value).toLocaleTimeString('en-ZA', {hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'}) + ' SAST';
}
export const activityTime = value => messageDate(value) === 'Today' ? messageTime(value) : messageDate(value);
export function MessagingFrame({navigation, role, title, subtitle, icon, children}) {
  const {styles, theme} = useMessagingStyles(), focused = useIsFocused(), leaving = useRef(false);
  useEffect(() => {if (focused) leaving.current = false;}, [focused]);
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}><View style={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={({pressed}) => [styles.back, pressed && styles.pressed]} onPress={() => {
        if (leaving.current) return; leaving.current = true;
        if (navigation.canGoBack?.()) navigation.goBack(); else navigation.navigate(role === 'shop' ? 'ShopJobs' : 'Discover');
      }}><Ionicons name="arrow-back" size={22} color={theme.textPrimary}/></Pressable>
      {!!icon && <View style={styles.avatar} accessible={false}><Ionicons name={icon} size={22} color={theme.textPrimary}/></View>}
      <View style={styles.headerCopy}><Text accessibilityRole="header" weight="semibold" style={styles.title}>{title}</Text>{!!subtitle && <Text style={styles.secondary}>{subtitle}</Text>}</View>
    </View>{children}
  </View></SafeAreaView>;
}
export function MessageAction({title, onPress, disabled = false}) {
  const {styles} = useMessagingStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed}) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}><Text weight="semibold" style={styles.actionText}>{title}</Text></Pressable>;
}
export function MessageFeedback({error, busy, loading = 'Loading messages...'}) {
  const {styles, theme} = useMessagingStyles();
  return <>{!!error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View>}
    {busy && <View accessibilityRole="status" style={styles.loading}><ActivityIndicator color={theme.textPrimary}/><Text style={styles.secondary}>{loading}</Text></View>}</>;
}
export function MessageEmpty({inbox = false}) {
  const {styles, theme} = useMessagingStyles();
  return <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={36} color={theme.textSecondary}/>
    <Text weight="semibold" style={styles.emptyTitle}>{inbox ? 'No conversations yet.' : 'No messages yet.'}</Text>
    <Text style={styles.emptyText}>{inbox ? 'Open a conversation from your request, quotation or booking.' : 'Messages for this service request will appear here.'}</Text>
  </View>;
}
const makeStyles = (theme, isDark) => StyleSheet.create({
  safe: {flex: 1, backgroundColor: theme.surfaceCanvas}, page: {flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12},
  back: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: theme.surfaceMuted},
  headerCopy: {flex: 1, minWidth: 0, gap: 3}, title: {fontSize: 22, lineHeight: 29, color: theme.textPrimary}, secondary: {fontSize: 13, lineHeight: 20, color: theme.textSecondary},
  avatar: {width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMuted},
  list: {flex: 1}, listContent: {paddingHorizontal: 16, paddingBottom: 20, flexGrow: 1},
  inboxRow: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 18, gap: 12, borderBottomWidth: 1, borderBottomColor: theme.divider},
  inboxCopy: {flex: 1, minWidth: 0, gap: 5}, inboxTop: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 3},
  name: {flexGrow: 1, flexShrink: 1, fontSize: 15, lineHeight: 22, color: theme.textPrimary}, preview: {fontSize: 14, lineHeight: 21, color: theme.textSecondary}, unreadPreview: {color: theme.textPrimary}, timestamp: {fontSize: 12, lineHeight: 18, color: theme.textSecondary},
  unreadBadge: {minWidth: 24, minHeight: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accentLight, marginTop: 5}, unreadCount: {fontSize: 12, lineHeight: 18, fontWeight: '600', color: isDark ? theme.accent : '#526D12'},
  action: {minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 10}, actionText: {fontSize: 13, lineHeight: 20, color: isDark ? theme.accent : '#526D12'}, actions: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4},
  pressed: {opacity: .7}, disabled: {opacity: .5}, errorBox: {backgroundColor: theme.errorSurface, padding: 12, borderRadius: 12, marginVertical: 6}, error: {fontSize: 14, lineHeight: 21, color: theme.error}, loading: {alignItems: 'center', gap: 8, padding: 16}, footer: {alignItems: 'center', paddingVertical: 12},
  empty: {alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 12}, emptyTitle: {fontSize: 18, lineHeight: 26, color: theme.textPrimary, textAlign: 'center'}, emptyText: {fontSize: 14, lineHeight: 22, color: theme.textSecondary, textAlign: 'center', maxWidth: 320},
  keyboard: {flex: 1}, context: {paddingHorizontal: 16, paddingBottom: 10, gap: 3}, contextLink: {flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: theme.surfaceCard}, contextCopy: {flex: 1, minWidth: 0, gap: 2}, contextTitle: {fontSize: 14, lineHeight: 21, color: theme.textPrimary}, contextDetails: {backgroundColor: theme.surfaceCard, borderRadius: 12, padding: 12, gap: 8, marginBottom: 12},
  modalBackdrop: {flex: 1, backgroundColor: '#00000099', alignItems: 'center', justifyContent: 'center', padding: 24}, modalPanel: {width: '100%', maxWidth: 560, maxHeight: '85%', backgroundColor: theme.surfaceCard, borderRadius: 20, padding: 8}, modalHeader: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12}, modalContent: {padding: 4},
  date: {fontSize: 12, lineHeight: 18, color: theme.textSecondary, alignSelf: 'center', paddingVertical: 18}, message: {paddingBottom: 8, alignItems: 'flex-start'}, ownMessage: {alignItems: 'flex-end'}, bubble: {maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomLeftRadius: 5, backgroundColor: theme.surfaceCard, gap: 5}, ownBubble: {backgroundColor: theme.accentLight, borderBottomLeftRadius: 18, borderBottomRightRadius: 5}, messageText: {fontSize: 15, lineHeight: 23, color: theme.textPrimary}, messageTime: {fontSize: 11, lineHeight: 18, color: theme.textSecondary, alignSelf: 'flex-end'},
  composerPanel: {paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: theme.divider, backgroundColor: theme.surfaceCanvas, gap: 6}, composer: {flexDirection: 'row', alignItems: 'flex-end', gap: 10}, input: {flex: 1, minWidth: 0, minHeight: 48, maxHeight: 150, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderRadius: 22, backgroundColor: theme.surfaceCard, color: theme.textPrimary, fontSize: 15, lineHeight: 22, borderWidth: 1, borderColor: theme.border}, inputFocused: {borderColor: isDark ? theme.accent : '#526D12'}, send: {minWidth: 48, minHeight: 48, borderRadius: 24, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent}, sendDisabled: {backgroundColor: theme.surfaceMuted}, hint: {fontSize: 11, lineHeight: 18, color: theme.textSecondary},
});
