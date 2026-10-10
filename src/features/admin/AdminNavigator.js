import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AdminHomeScreen from './screens/AdminHomeScreen';
import {AccountsScreen,AccountDetailScreen,CategoriesScreen,AuditScreen,PresenceScreen,ConfirmIdentityScreen} from './screens/AdminScreens';
import {useTheme} from '../../shared/theme/ThemeContext';

const Stack = createNativeStackNavigator();

export default function AdminNavigator(){
  const {theme} = useTheme();
  const screenOptions = {
    headerStyle: { backgroundColor: theme.surfaceCanvas },
    headerTintColor: theme.accent,
    headerTitleStyle: { color: theme.textPrimary, fontWeight: '600' },
    headerShadowVisible: false,
    headerBackTitle: 'Back',
    contentStyle: { backgroundColor: theme.surfaceCanvas },
  };
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AdminDashboard" component={AdminHomeScreen} options={{title:'Administration'}}/>
      <Stack.Screen name="AdminAccounts" component={AccountsScreen} options={{title:'Accounts'}}/>
      <Stack.Screen name="AdminAccount" component={AccountDetailScreen} options={{title:'Account details'}}/>
      <Stack.Screen name="AdminCategories" component={CategoriesScreen} options={{title:'Service categories'}}/>
      <Stack.Screen name="AdminAudit" component={AuditScreen} options={{title:'Activity history'}}/>
      <Stack.Screen name="AdminPresence" component={PresenceScreen} options={{title:'Online status'}}/>
      <Stack.Screen name="AdminConfirm" component={ConfirmIdentityScreen} options={{title:'Confirm identity'}}/>
    </Stack.Navigator>
  );
}