import React from 'react';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {GaragePage} from '../components/GarageUI';
import PhotoGallery from '../components/PhotoGallery';

export default function VehiclePhotosScreen({route,navigation}) {
 const id = route.params?.id;
 return <GaragePage title="Vehicle photos" subtitle="Your vehicle, from every angle." navigation={navigation}>
  {id ? <PhotoGallery target="vehicle" id={id} editable presentation="garage"/> : <Text accessibilityRole="alert">Choose a vehicle from your garage to manage its photos.</Text>}
 </GaragePage>;
}
