import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AccountScreen from '../auth/screens/AccountScreen';
import {BookingsScreen,BookingDetailScreen} from './screens/BookingScreens';
import {ShopJobsScreen,ShopRequestsScreen,ShopRequestScreen,QuoteFormScreen,ShopQuotesScreen} from './screens/ShopMarketplaceScreens';
const Stack=createNativeStackNavigator();
export default function ShopNavigator(){return <Stack.Navigator initialRouteName="ShopJobs" screenOptions={{headerShown:false}}>
 <Stack.Screen name="ShopJobs" component={ShopJobsScreen}/><Stack.Screen name="ShopRequests" component={ShopRequestsScreen}/>
 <Stack.Screen name="ShopRequest" component={ShopRequestScreen}/><Stack.Screen name="QuoteForm" component={QuoteFormScreen}/>
 <Stack.Screen name="ShopQuotes" component={ShopQuotesScreen}/>
 <Stack.Screen name="Bookings" component={BookingsScreen}/><Stack.Screen name="BookingDetail" component={BookingDetailScreen}/>
 <Stack.Screen name="ShopAccount" component={AccountScreen} options={{headerShown:true,title:'Your shop account'}}/>
</Stack.Navigator>;}
