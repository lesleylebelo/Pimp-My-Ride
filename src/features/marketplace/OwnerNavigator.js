import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import OwnerHomeScreen from '../customer/screens/OwnerHomeScreen';
import AccountScreen from '../auth/screens/AccountScreen';
import {GarageScreen,VehicleFormScreen,OwnerRequestsScreen,RequestFormScreen,OwnerRequestScreen} from './screens/OwnerMarketplaceScreens';
const Stack=createNativeStackNavigator();
export default function OwnerNavigator(){return <Stack.Navigator initialRouteName="Discover" screenOptions={{headerShown:false}}>
 <Stack.Screen name="Discover" component={OwnerHomeScreen}/><Stack.Screen name="Garage" component={GarageScreen}/>
 <Stack.Screen name="VehicleForm" component={VehicleFormScreen}/><Stack.Screen name="OwnerRequests" component={OwnerRequestsScreen}/>
 <Stack.Screen name="RequestForm" component={RequestFormScreen}/><Stack.Screen name="OwnerRequest" component={OwnerRequestScreen}/>
 <Stack.Screen name="OwnerAccount" component={AccountScreen} options={{headerShown:true,title:'Your account'}}/>
</Stack.Navigator>;}
