import React from 'react';
import {Platform, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {CustomerPressable, CustomerText} from '../../customer/components/CustomerUI';
import {useTheme} from '../../../shared/theme/ThemeContext';

const icons = {discover: 'compass-outline', garage: 'car-outline', requests: 'document-text-outline', bookings: 'calendar-outline', profile: 'person-outline'};

// Existing Shop tab data/routes are supplied by each existing navigation shell.
export default function ShopBottomNavigation({tabs, active, onTabPress, bottomInset = 0}) {
  const {theme} = useTheme();
  return <View style={{flexShrink: 0, borderTopWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceCanvas, paddingBottom: bottomInset}}>
    <View accessibilityRole="tablist" accessibilityLabel="Workshop navigation" style={{width: '100%', maxWidth: 640, alignSelf: 'center', flexDirection: 'row', padding: 6, gap: 2}}>
      {tabs.map(tab => <CustomerPressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected: active === tab.label}} {...(Platform.OS === 'web' ? {'aria-selected': active === tab.label} : {})} onPress={() => onTabPress(tab.label)} style={{flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 3, paddingVertical: 7, borderRadius: 8, borderTopWidth: 2, borderTopColor: active === tab.label ? theme.accent : 'transparent', backgroundColor: active === tab.label ? theme.accentLight : 'transparent', gap: 3, alignItems: 'center', justifyContent: 'center'}}>
        <Ionicons name={icons[tab.icon]} size={20} color={active === tab.label ? theme.accent : theme.textSecondary}/>
        <CustomerText style={{fontSize: 11, lineHeight: 16, textAlign: 'center', color: active === tab.label ? theme.textPrimary : theme.textSecondary}}>{tab.label}</CustomerText>
      </CustomerPressable>)}
    </View>
  </View>;
}
