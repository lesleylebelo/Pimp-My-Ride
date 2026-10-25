import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AdminHomeScreen from './screens/AdminHomeScreen';
import {AccountsScreen,AccountDetailScreen,CategoriesScreen,AuditScreen,PresenceScreen,ConfirmIdentityScreen} from './screens/AdminScreens';
import {useTheme} from '../../shared/theme/ThemeContext';
import AdminShell from './components/AdminShell';

const Stack = createNativeStackNavigator();

export default function AdminNavigator(){
  const {theme} = useTheme();
  const screenOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: theme.surfaceCanvas },
    headerTintColor: theme.accent,
    headerTitleStyle: { color: theme.textPrimary, fontWeight: '600' },
    headerShadowVisible: false,
    headerBackTitle: 'Back',
    contentStyle: { backgroundColor: theme.surfaceCanvas },
  };
  return (
    <Stack.Navigator screenOptions={screenOptions} layout={props => <AdminShell {...props}/>}>
      <Stack.Screen name="AdminDashboard" component={AdminHomeScreen} options={{title:'Overview'}}/>
      <Stack.Screen name="AdminAccounts" component={AccountsScreen} options={({route})=>({title:route.params?.filter==='pending'?'Workshop Applications':'Accounts'})}/>
      <Stack.Screen name="AdminAccount" component={AccountDetailScreen} options={{title:'Account details'}}/>
      <Stack.Screen name="AdminCategories" component={CategoriesScreen} options={{title:'Service Categories'}}/>
      <Stack.Screen name="AdminAudit" component={AuditScreen} options={{title:'Activity Log'}}/>
      <Stack.Screen name="AdminPresence" component={PresenceScreen} options={{title:'Online Status'}}/>
      <Stack.Screen name="AdminConfirm" component={ConfirmIdentityScreen} options={{title:'Verify identity'}}/>
    </Stack.Navigator>
  );
}
