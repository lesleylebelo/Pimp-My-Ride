import {CustomerFrame,CustomerPressable,useCustomerExperience} from '../../customer/components/CustomerUI';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, SectionList, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../../auth/context/AuthContext';
import {useNotificationHistory} from '../hooks/useNotificationHistory';
import {marketApi} from '../services/marketApi';
import {notificationDestination, notificationIcon, notificationSections, notificationTime} from '../utils/notificationPresentation';

export default function NotificationHistory({navigation}) {
  const {profile, offline} = useAuth(), {theme, isDark} = useTheme(), focused = useIsFocused();
  const feed = useNotificationHistory(),customer=useCustomerExperience(),Interaction=customer?CustomerPressable:Pressable;
  const [readIds, setReadIds] = useState(new Set()), [saving, setSaving] = useState(false), [failure, setFailure] = useState('');
  const [now, setNow] = useState(Date.now);
  const active = useRef(true), lock = useRef(false), navigating = useRef(false);
  useEffect(() => {active.current = true; return () => {active.current = false;};}, []);
  useEffect(() => {
    if (!focused) return;
    navigating.current = false; setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [focused]);
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);
  const sections = useMemo(() => notificationSections(offline ? [] : feed.items, now), [feed.items, offline, now]);
  const disabled = feed.busy || offline || saving;
  async function markRead(item) {
    if (disabled || lock.current || item.readAt || readIds.has(item.id)) return;
    lock.current = true; setSaving(true); setFailure('');
    try {
      await marketApi('notificationRead', {id: item.id});
      if (active.current) setReadIds(previous => new Set([...previous, item.id]));
    } catch (error) {
      if (active.current) setFailure(error?.message || 'Unable to mark this notification read. Please retry.');
    } finally {lock.current = false; if (active.current) setSaving(false);}
  }
  function open(item) {
    const destination = notificationDestination(item, profile?.role);
    if (disabled || !focused || navigating.current || !destination) return;
    navigating.current = true;
    navigation.navigate(...destination);
  }
  function refresh() {
    if (offline || saving || feed.refreshing) return;
    setFailure(''); void feed.refresh();
  }
  function loadNext() {if (!disabled && !feed.error) void feed.loadNext();}
  const message = offline ? 'Connect to view your notifications.' : failure || feed.error;
  function action(title, onPress, blocked = false, label = title) {
    return <Interaction accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled: blocked}} disabled={blocked} onPress={onPress}
      style={({pressed}) => [styles.action, pressed && styles.pressed, blocked && styles.disabled]}>
      <Text weight="semibold" style={styles.actionText}>{title}</Text>
    </Interaction>;
  }
  const Frame=customer?CustomerNotificationFrame:SafeAreaView;
  return <Frame navigation={navigation} style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
    <View style={styles.page}>
      {!customer&&<View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={({pressed}) => [styles.back, pressed && styles.pressed]}
          onPress={() => {if (navigating.current) return; navigating.current = true; if (navigation.canGoBack?.()) navigation.goBack(); else navigation.navigate(profile?.role === 'shop' ? 'ShopJobs' : 'Discover');}}>
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary}/>
        </Pressable>
        <Text accessibilityRole="header" weight="displaySemi" style={styles.title}>Notifications</Text>
      </View>}
      <SectionList testID="notification-list" style={styles.list} sections={sections} keyExtractor={item => item.id}
        contentContainerStyle={styles.content} stickySectionHeadersEnabled={false}
        initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
        refreshing={feed.refreshing && !!feed.items.length} onRefresh={refresh} onEndReached={loadNext} onEndReachedThreshold={0.3}
        extraData={{readIds, saving, now, offline, focused}}
        ListHeaderComponent={<View style={styles.intro}>
          <Text style={styles.secondary}>Your latest activity. Newest first.</Text>
          {!!message && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{message}</Text></View>}
        </View>}
        renderSectionHeader={({section}) => <Text accessibilityRole="header" weight="semibold" style={styles.section}>{section.title}</Text>}
        renderItem={({item}) => {
          const read = !!item.readAt || readIds.has(item.id), destination = notificationDestination(item, profile?.role);
          const title = item.title || item.event?.replace(/_/g, ' ') || 'Marketplace update';
          const timestamp = notificationTime(item.createdAt, now);
          return <View testID={`notification-${item.id}`} style={[styles.row, !read && styles.unread]}>
            <Interaction disabled={disabled || !destination} accessibilityRole={destination ? 'button' : undefined}
              accessibilityLabel={`${read ? 'Read' : 'Unread'}: ${title}${item.body ? `. ${item.body}` : ''}. ${timestamp}`}
              accessibilityHint={destination ? 'Opens the related record' : undefined}
              accessibilityState={destination ? {disabled} : undefined} onPress={() => open(item)}
              style={({pressed}) => [styles.rowMain, pressed && destination && styles.pressed]}>
              <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
                <Ionicons name={notificationIcon(item)} size={22} color={theme.textPrimary}/>
              </View>
              <View style={styles.copy}>
                <Text weight={read ? 'medium' : 'semibold'} style={styles.rowTitle}>{title}</Text>
                {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                {(item.simulated || item.testTransaction) && <Text weight="semibold" style={styles.testLabel}>SIMULATED / TEST</Text>}
                <View style={styles.meta}><Text style={styles.timestamp}>{timestamp}</Text><Text style={styles.timestamp}>{read ? 'Read' : 'Unread'}</Text></View>
              </View>
              {!read && <View testID="notification-unread-dot" style={styles.dot}/>}
              {!!destination && <Ionicons name="chevron-forward" size={16} color={theme.textSecondary}/>}
            </Interaction>
            {!read && <View style={styles.readAction}>{action('Mark as read', () => void markRead(item), disabled, `Mark as read: ${title}`)}</View>}
          </View>;
        }}
        ListEmptyComponent={feed.busy && !offline ? <View accessibilityRole="status" style={styles.state}><ActivityIndicator color={theme.textPrimary}/><Text style={styles.secondary}>Loading notifications...</Text></View>
          : !message ? <View style={styles.state}><Ionicons name="notifications-outline" size={36} color={theme.textSecondary}/><Text weight="semibold" style={styles.emptyTitle}>No notifications yet.</Text><Text style={styles.emptyBody}>Your updates will appear here when there’s new activity.</Text></View> : null}
        ListFooterComponent={<View style={styles.footer}>
          {feed.busy && !!feed.items.length && <View accessibilityRole="status" style={styles.loadingMore}><ActivityIndicator color={theme.textPrimary}/><Text style={styles.secondary}>{feed.refreshing ? 'Refreshing notifications...' : 'Loading earlier notifications...'}</Text></View>}
          {!!feed.cursor && !offline && action('Load more notifications', () => {if (!disabled) void feed.loadNext();}, disabled)}
          {action('Refresh notifications', refresh, offline || saving || feed.refreshing)}
        </View>}/>
    </View>
  </Frame>;
}

function CustomerNotificationFrame({navigation,children}){return <CustomerFrame title="Notifications" navigation={navigation} activeRoute="Notifications" back>{children}</CustomerFrame>;}

const makeStyles = (theme, isDark) => StyleSheet.create({
  safe: {flex: 1, backgroundColor: theme.surfaceCanvas},
  page: {flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16},
  back: {width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMuted},
  title: {flex: 1, flexShrink: 1, fontSize: 26, lineHeight: 34, color: theme.textPrimary},
  list: {flex: 1}, content: {paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1},
  intro: {gap: 16, paddingTop: 4, paddingBottom: 12},
  secondary: {color: theme.textSecondary, fontSize: 14, lineHeight: 22},
  section: {fontSize: 15, color: theme.textPrimary, paddingTop: 20, paddingBottom: 12},
  row: {borderRadius: 16, marginBottom: 6, backgroundColor: theme.surfaceCard},
  unread: {backgroundColor: theme.accentLight},
  rowMain: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, minHeight: 80, borderRadius: 16},
  icon: {width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surfaceMuted, alignItems: 'center', justifyContent: 'center'},
  copy: {flex: 1, minWidth: 0, gap: 5},
  rowTitle: {fontSize: 15, lineHeight: 22, color: theme.textPrimary},
  body: {fontSize: 14, lineHeight: 22, color: theme.textSecondary},
  meta: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 3},
  timestamp: {fontSize: 12, lineHeight: 18, color: theme.textSecondary},
  testLabel: {fontSize: 11, lineHeight: 18, color: theme.textSecondary},
  dot: {width: 7, height: 7, borderRadius: 4, marginTop: 8, backgroundColor: isDark ? theme.accent : '#526D12'},
  readAction: {alignItems: 'flex-start', paddingLeft: 62, paddingRight: 16, paddingBottom: 4, marginTop: -12},
  action: {minHeight: 44, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', borderRadius: 10},
  actionText: {fontSize: 13, lineHeight: 20, color: isDark ? theme.accent : '#526D12'},
  pressed: {opacity: 0.7}, disabled: {opacity: 0.5},
  errorBox: {padding: 16, backgroundColor: theme.errorSurface, borderRadius: 12},
  error: {color: theme.error, fontSize: 14, lineHeight: 22},
  state: {paddingHorizontal: 24, paddingVertical: 64, alignItems: 'center', gap: 14},
  emptyTitle: {fontSize: 19, lineHeight: 26, color: theme.textPrimary, textAlign: 'center'},
  emptyBody: {fontSize: 14, lineHeight: 22, color: theme.textSecondary, textAlign: 'center', maxWidth: 300},
  footer: {paddingTop: 16, gap: 4, alignItems: 'center'},
  loadingMore: {alignItems: 'center', gap: 10, padding: 12},
});
