import BackendStatus from '../shared/components/BackendStatus';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAuth } from '../features/auth/context/AuthContext';
import AccountScreen from '../features/auth/screens/AccountScreen';
import OwnerHomeScreen from '../features/marketplace/OwnerNavigator';
import ShopHomeScreen from '../features/marketplace/ShopNavigator';
import AdminHomeScreen from '../features/admin/AdminNavigator';
import { getAuthenticatedRoute } from './landingRoute';
import LegalScreen from '../features/auth/screens/LegalScreen';
import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SplashScreen from "../features/auth/screens/SplashScreen";
import SignInScreen from "../features/auth/screens/SignInScreen";
import SignUpScreen from "../features/auth/screens/SignUpScreen";
import ForgotPasswordScreen from "../features/auth/screens/ForgotPasswordScreen";
import colors from "../shared/theme/colors";

const Stack = createNativeStackNavigator();
const authenticatedScreens = {
  Account: AccountScreen,
  OwnerHome: OwnerHomeScreen,
  ShopHome: ShopHomeScreen,
  AdminHome: AdminHomeScreen,
};


export default function AppNavigation() {
  const {user,profile,error,initializing,working} = useAuth();
  const authenticatedRoute = getAuthenticatedRoute(user, profile, error);
  if (initializing) return <SafeAreaProvider><View style={{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:colors.background}}><ActivityIndicator color={colors.primary}/><Text>Please wait…</Text></View></SafeAreaProvider>;
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <NavigationContainer>
        <Stack.Navigator
          key={user ? `${user.uid}:${authenticatedRoute}` : "guest"}
          initialRouteName={user ? authenticatedRoute : "Splash"}
          screenOptions={{ headerShown: false }}
        >
          {user ? <Stack.Screen name={authenticatedRoute} component={authenticatedScreens[authenticatedRoute]}/> : <>
          <Stack.Screen name="Legal" component={LegalScreen}/>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>}
        </Stack.Navigator>
      </NavigationContainer>
      {working && <View style={{position:"absolute",top:0,bottom:0,left:0,right:0,backgroundColor:"#ffffffcc",alignItems:"center",justifyContent:"center"}}><ActivityIndicator color={colors.primary}/><Text>Please wait…</Text></View>}
      <BackendStatus/>
    </SafeAreaProvider>
  );
}
