import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomePage from '../Screens/HomePage';
import VehicleOwnerSignIn from '../Screens/VehicleOwnerSignIn';
import CustomShopSignIn from '../Screens/CustomShopSignIn';
import CustomShopCreateAccount from '../Screens/CustomShopCreateAccount';
import VehicleOwnerCreateAccount from '../Screens/VehicleOwnerCreateAccount';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="HomePage" screenOptions={{headerShown: false,}}>
        <Stack.Screen name="HomePage" component={HomePage}/>
        <Stack.Screen name="VehicleOwnerSignIn" component={VehicleOwnerSignIn}/>
        <Stack.Screen name="VehicleOwnerCreateAccount" component={VehicleOwnerCreateAccount}/>
        <Stack.Screen name="CustomShopSignIn" component={CustomShopSignIn}/>
        <Stack.Screen name="CustomShopCreateAccount" component={CustomShopCreateAccount}/>       
      </Stack.Navigator>
    </NavigationContainer>
  );
}