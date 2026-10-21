import React from 'react';
import {ReceiptDetailScreen,NotificationsScreen} from './screens/CommunicationScreens';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import OwnerHomeScreen from '../customer/screens/OwnerHomeScreen';
import AccountScreen from '../auth/screens/AccountScreen';
import {BookingsScreen,BookingDetailScreen} from './screens/BookingScreens';
import {QuoteComparisonScreen} from './screens/QuoteComparisonScreen';
import PaymentChoiceScreen from './screens/PaymentChoiceScreen';
import VehiclePhotosScreen from './screens/VehiclePhotosScreen';
import {GarageScreen,VehicleFormScreen,OwnerRequestsScreen,RequestFormScreen,OwnerRequestScreen} from './screens/OwnerMarketplaceScreens';
import {useTheme} from '../../shared/theme/ThemeContext';
import {PostDetailScreen,ShopProfileScreen} from './screens/PostScreens';

const Stack = createNativeStackNavigator();

export default function OwnerNavigator(){
  const {theme} = useTheme();
  const headerTheme = {
    headerStyle: { backgroundColor: theme.surfaceCanvas },
    headerTintColor: theme.accent,
    headerTitleStyle: { color: theme.textPrimary, fontWeight: '600' },
    headerShadowVisible: false,
    headerBackTitle: '',
    contentStyle: { backgroundColor: theme.surfaceCanvas },
  };
  return (
    <Stack.Navigator initialRouteName="Discover" screenOptions={{headerShown: false, ...headerTheme}}>
      <Stack.Screen name="Discover" component={OwnerHomeScreen}/>
      <Stack.Screen name="PostDetail" component={PostDetailScreen}/>
      <Stack.Screen name="ShopProfile" component={ShopProfileScreen}/>
      <Stack.Screen name="Garage" component={GarageScreen}/>
      <Stack.Screen name="VehicleForm" component={VehicleFormScreen} options={{presentation:'modal'}}/>
      <Stack.Screen name="OwnerRequests" component={OwnerRequestsScreen}/>
      <Stack.Screen name="VehiclePhotos" component={VehiclePhotosScreen}/>
      <Stack.Screen name="RequestForm" component={RequestFormScreen}/>
      <Stack.Screen name="OwnerRequest" component={OwnerRequestScreen}/>
      <Stack.Screen name="QuoteComparison" component={QuoteComparisonScreen}/>
      <Stack.Screen name="PaymentChoice" component={PaymentChoiceScreen}/>
      <Stack.Screen name="Bookings" component={BookingsScreen}/>
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen}/>
      <Stack.Screen name="ReceiptDetail" component={ReceiptDetailScreen}/>
      <Stack.Screen name="Notifications" component={NotificationsScreen}/>
      <Stack.Screen name="OwnerAccount" component={AccountScreen}/>
    </Stack.Navigator>
  );
}