import { View, Text, ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AccountScreen from './src/screens/AccountScreen';
import LegalScreen from './src/screens/LegalScreen';
import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SplashScreen from "./src/screens/SplashScreen";
import RoleSelectionScreen from "./src/screens/RoleSelectionScreen";
import SignInScreen from "./src/screens/SignInScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import ResetSuccessScreen from "./src/screens/ResetSuccessScreen";
import AdminSignInScreen from "./src/screens/AdminSignInScreen";

const Stack = createNativeStackNavigator();

export default function App() { return <AuthProvider><AppNavigation /></AuthProvider>; }
function AppNavigation() {
  const {user,initializing,working} = useAuth();
  if (initializing) return <SafeAreaProvider><View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator color="#0E3B2C"/><Text>Please wait…</Text></View></SafeAreaProvider>;
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <NavigationContainer>
        <Stack.Navigator
          key={user ? "authenticated" : "guest"}
          initialRouteName={user ? "Account" : "Splash"}
          screenOptions={{ headerShown: false }}
        >
          {user ? <Stack.Screen name="Account" component={AccountScreen}/> : <>
          <Stack.Screen name="Legal" component={LegalScreen}/>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          <Stack.Screen name="ResetSuccess" component={ResetSuccessScreen} />
          <Stack.Screen name="AdminSignIn" component={AdminSignInScreen} />
          </>}
        </Stack.Navigator>
      </NavigationContainer>
      {working && <View style={{position:"absolute",top:0,bottom:0,left:0,right:0,backgroundColor:"#ffffffcc",alignItems:"center",justifyContent:"center"}}><ActivityIndicator color="#0E3B2C"/><Text>Please wait…</Text></View>}
    </SafeAreaProvider>
  );
}
