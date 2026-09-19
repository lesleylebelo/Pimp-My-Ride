import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AdminHomeScreen from './screens/AdminHomeScreen';
import {AccountsScreen,AccountDetailScreen,CategoriesScreen,AuditScreen,PresenceScreen,ConfirmIdentityScreen} from './screens/AdminScreens';
const Stack=createNativeStackNavigator();
export default function AdminNavigator(){return <Stack.Navigator screenOptions={{headerTintColor:'#103C2E',headerBackTitle:'Back'}}>
 <Stack.Screen name="AdminDashboard" component={AdminHomeScreen} options={{title:'Administration'}}/>
 <Stack.Screen name="AdminAccounts" component={AccountsScreen} options={{title:'Accounts'}}/>
 <Stack.Screen name="AdminAccount" component={AccountDetailScreen} options={{title:'Account details'}}/>
 <Stack.Screen name="AdminCategories" component={CategoriesScreen} options={{title:'Service categories'}}/>
 <Stack.Screen name="AdminAudit" component={AuditScreen} options={{title:'Activity history'}}/>
 <Stack.Screen name="AdminPresence" component={PresenceScreen} options={{title:'Online status'}}/>
 <Stack.Screen name="AdminConfirm" component={ConfirmIdentityScreen} options={{title:'Confirm identity'}}/>
 </Stack.Navigator>;}
