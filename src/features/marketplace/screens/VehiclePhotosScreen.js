import React from 'react';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {GaragePage} from '../components/GarageUI';
import PhotoGallery from '../components/PhotoGallery';
import {CustomerCard,CustomerText} from '../../customer/components/CustomerUI';

export default function VehiclePhotosScreen({route,navigation}) {
 const id = route.params?.id;
 const vehicle=route.params?.vehicle;
 return <GaragePage title="Vehicle photos" subtitle="Your vehicle, from every angle." navigation={navigation}>
  {id&&vehicle?.id===id&&<CustomerCard><CustomerText heading>{vehicle.make} {vehicle.model}</CustomerText><CustomerText muted>{[vehicle.year,vehicle.colour].filter(Boolean).join(' · ')}</CustomerText></CustomerCard>}
  {id ? <PhotoGallery target="vehicle" id={id} editable presentation="garage"/> : <Text accessibilityRole="alert">Choose a vehicle from your garage to manage its photos.</Text>}
 </GaragePage>;
}
