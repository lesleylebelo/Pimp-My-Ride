import React from 'react';
import {Text} from 'react-native';
import {Page} from '../components/MarketplaceUI';
import PhotoGallery from '../components/PhotoGallery';

export default function VehiclePhotosScreen({route,navigation}) {
 const id = route.params?.id;
 return <Page title="Vehicle photos" navigation={navigation}>
  {id ? <PhotoGallery target="vehicle" id={id} editable/> : <Text accessibilityRole="alert">Choose a vehicle from your garage to manage its photos.</Text>}
 </Page>;
}
