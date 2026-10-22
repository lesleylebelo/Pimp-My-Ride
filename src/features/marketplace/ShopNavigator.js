import React from 'react';
import {MessagesScreen,ChatScreen} from './screens/MessagingScreens';
import {ReceiptDetailScreen,NotificationsScreen} from './screens/CommunicationScreens';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AccountScreen from '../auth/screens/AccountScreen';
import {BookingsScreen,BookingDetailScreen} from './screens/BookingScreens';
import {ShopJobsScreen,ShopRequestsScreen,ShopRequestScreen,QuoteFormScreen,ShopQuotesScreen} from './screens/ShopMarketplaceScreens';
import {MyPostsScreen,PostFormScreen,PostDetailScreen} from './screens/PostScreens';
import {useTheme} from '../../shared/theme/ThemeContext';

const Stack = createNativeStackNavigator();

export default function ShopNavigator(){
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
    <Stack.Navigator initialRouteName="ShopJobs" screenOptions={{headerShown: false, ...headerTheme}}>
      <Stack.Screen name="ShopJobs" component={ShopJobsScreen}/>
      <Stack.Screen name="ShopRequests" component={ShopRequestsScreen}/>
      <Stack.Screen name="ShopRequest" component={ShopRequestScreen}/>
      <Stack.Screen name="QuoteForm" component={QuoteFormScreen}/>
      <Stack.Screen name="ShopQuotes" component={ShopQuotesScreen}/>
      <Stack.Screen name="Bookings" component={BookingsScreen}/>
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen}/>
      <Stack.Screen name="ReceiptDetail" component={ReceiptDetailScreen}/>
      <Stack.Screen name="Notifications" component={NotificationsScreen}/>
      <Stack.Screen name="Messages" component={MessagesScreen}/>
      <Stack.Screen name="Chat" component={ChatScreen}/>
      <Stack.Screen name="ShopAccount" component={AccountScreen}/>
      <Stack.Screen name="ShopPosts" component={MyPostsScreen}/>
      <Stack.Screen name="PostForm" component={PostFormScreen} options={{presentation:'modal'}}/>
      <Stack.Screen name="PostDetail" component={PostDetailScreen}/>
    </Stack.Navigator>
  );
}
