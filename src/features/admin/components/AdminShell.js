import React, {useState} from 'react';
import {View, Text, ScrollView, Pressable, useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import LogoMark from '../../../shared/components/LogoMark';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../../auth/context/AuthContext';
import {adminSections, activeSection, pageTitle} from '../utils/presentation';
import {Button, Dialog, Notice, Detail, useAdminStyles} from './AdminUI';

export default function AdminShell({children, state, navigation}) {
  const {width} = useWindowDimensions(), desktop = width >= 1000;
  const {theme, isDark, toggleTheme} = useTheme(), {profile, user, logout} = useAuth(), styles = useAdminStyles();
  const [drawer, setDrawer] = useState(false), [account, setAccount] = useState(false), [error, setError] = useState(''), [signingOut, setSigningOut] = useState(false);
  const route = state.routes[state.index], active = activeSection(route);
  const accent = isDark ? theme.accent : '#526E13';
  const go = section => {navigation.navigate(section.route, section.filter ? {filter: section.filter} : undefined); setDrawer(false);};
  const nav = <View style={{padding: 16, gap: 8}}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, marginBottom: 24}}><LogoMark size={42}/><View><Text style={styles.heading}>PimpMyRide</Text><Text style={styles.muted}>Administration</Text></View></View>
    <Text style={[styles.muted, {fontSize: 11, letterSpacing: 1.5, margin: 8}]}>WORKSPACE</Text>
    {adminSections.map((section, index) => <Pressable key={section.label} accessibilityRole="button" accessibilityLabel={section.label} accessibilityState={{selected: active === index}} onPress={() => go(section)} style={({pressed, hovered, focused}) => ({flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: active === index ? theme.accentSurface : hovered || pressed ? theme.surfaceMuted : 'transparent', ...(focused ? {outlineWidth: 2, outlineColor: theme.accent} : {})})}>
      <Ionicons name={section.icon} size={19} color={active === index ? accent : styles.muted.color}/><Text style={{color: active === index ? accent : theme.textPrimary, fontSize: 13, flexShrink: 1, fontWeight: active === index ? '700' : '500'}}>{section.label}</Text>
    </Pressable>)}
  </View>;
  return <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{flex: 1, backgroundColor: theme.surfaceCanvas}}>
    <View style={{flex: 1, flexDirection: 'row'}}>
      {desktop && <View style={{width: 248, borderRightWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceCard}}><ScrollView>{nav}</ScrollView><View style={{padding: 20, borderTopWidth: 1, borderColor: theme.border}}><Text style={styles.muted}>PimpMyRide admin workspace</Text></View></View>}
      <View style={{flex: 1, minWidth: 0}}>
        <View style={{minHeight: 76, borderBottomWidth: 1, borderColor: theme.border, paddingHorizontal: desktop ? 24 : 12, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: theme.surfaceCard}}>
          {!desktop && <Button title="☰" accessibilityLabel="Open navigation" onPress={() => setDrawer(true)}/>}
          {['AdminAccount', 'AdminConfirm'].includes(route.name) && <Button title="‹" accessibilityLabel="Go back" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminDashboard')}/>}
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.heading, {flex: 1, fontSize: desktop ? 22 : 18}]}>{pageTitle(route)}</Text>
          <Button title={desktop ? 'Admin account' : 'Account'} onPress={() => {setError(''); setAccount(true);}}/>
        </View>
        {children}
      </View>
    </View>
    <Dialog visible={drawer && !desktop} title="Navigation" onClose={() => setDrawer(false)}>{nav}</Dialog>
    <Dialog visible={account} title="Admin account" onClose={() => setAccount(false)} busy={signingOut}>
      <Detail label="Name">{profile?.fullName}</Detail><Detail label="Email">{user?.email}</Detail>
      <Button title={`Use ${isDark ? 'light' : 'dark'} theme`} onPress={toggleTheme}/>
      <Notice error={error} busy={signingOut}/>
      <Button title="Sign out" danger disabled={signingOut} onPress={async () => {if (signingOut) return; setSigningOut(true); try {await logout();} catch (_) {setError('Could not complete sign-out. Please try again.');} finally {setSigningOut(false);}}}/>
    </Dialog>
  </SafeAreaView>;
}
