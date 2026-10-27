import React,{useState} from 'react';
import {Image,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {Button,Card,Notice} from './MarketplaceUI';
import {CustomerChip} from '../../customer/components/CustomerUI';
import {useMarketData} from '../hooks/useMarketData';
import {useAuth} from '../../auth/context/AuthContext';
import PrivatePhoto from './PrivatePhoto';

export const studioInterests=['Visual styling','Mechanical improvements','Repairs & maintenance'];
export const vehicleLabel=vehicle=>[vehicle?.year,vehicle?.make,vehicle?.model].filter(Boolean).join(' ')||'Your selected vehicle';
export function StudioHeading({eyebrow,children,detail}){
 const {theme}=useTheme();
 return <View style={{gap:7}}>{!!eyebrow&&<Text style={{color:theme.accent,fontSize:11,fontWeight:'700',letterSpacing:2}}>{eyebrow.toUpperCase()}</Text>}<Text accessibilityRole="header" style={{color:theme.textPrimary,fontSize:24,lineHeight:32,fontWeight:'700',letterSpacing:-.5}}>{children}</Text>{!!detail&&<Text style={{color:theme.textSecondary,lineHeight:22}}>{detail}</Text>}</View>;
}
export function StudioLanding({onStart}){
 const {theme}=useTheme();
 return <>
  <Card style={{padding:26,gap:24,borderRadius:24,overflow:'hidden'}}>
   <View style={{padding:20,borderRadius:20,backgroundColor:theme.accentLight,alignItems:'center',gap:8}}><Ionicons name="car-sport-outline" size={88} color={theme.textPrimary}/><Text style={{color:theme.textSecondary,fontSize:11,letterSpacing:3}}>YOUR NEXT CHAPTER</Text></View>
   <StudioHeading eyebrow="PimpPilot / Studio" detail="Turn your ideas into a considered plan for your car. Explore a direction, refine the details, then choose what goes to your workshop.">Built around your vision.</StudioHeading>
   <Button title="Start New Concept" primary icon="arrow-forward-outline" onPress={onStart}/>
  </Card>
  <Card><StudioHeading eyebrow="How it works">From inspiration to a plan.</StudioHeading>{[['01','Choose your canvas','Pick a vehicle from your Garage and optionally add a reference photo.'],['02','Explore your direction','Describe your ideas. When available, PimpPilot helps you refine a preliminary concept.'],['03','Make it yours','Select proposed work and review an unsaved Service Request before you submit it.']].map(([step,title,detail])=><View key={step} style={{flexDirection:'row',gap:14,paddingVertical:8}}><Text style={{color:theme.accent,fontSize:20,fontWeight:'700'}}>{step}</Text><View style={{flex:1,gap:5}}><Text style={{color:theme.textPrimary,fontWeight:'700'}}>{title}</Text><Text style={{color:theme.textSecondary,lineHeight:22}}>{detail}</Text></View></View>)}</Card>
  <Card><StudioHeading eyebrow="Availability" detail="You can prepare your ideas here. AI analysis depends on service availability; edited vehicle images are not available yet.">Your ideas, at your pace.</StudioHeading></Card>
 </>;
}
export function StudioProgress({hasVehicle,hasPlan}){
 const {theme}=useTheme(),active=hasPlan?2:hasVehicle?1:0;
 return <View accessibilityLabel={`Step ${active+1} of 3: ${['Vehicle','Direction','Review'][active]}`} style={{flexDirection:'row',gap:8}}>{['Vehicle','Direction','Review'].map((label,index)=><View key={label} style={{flex:1,gap:8,paddingVertical:12,borderTopWidth:3,borderColor:index<=active?theme.accent:theme.border}}><Text style={{color:index===active?theme.textPrimary:theme.textSecondary,fontSize:12,fontWeight:'600'}}>{index+1} · {label}</Text></View>)}</View>;
}
export function StudioInterests({values,onChange,disabled}){
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{studioInterests.map(title=><CustomerChip key={title} title={title} selected={values.includes(title)} disabled={disabled} onPress={()=>onChange(values.includes(title)?values.filter(value=>value!==title):[...values,title])}/>)}</View>;
}
// Future editing belongs behind this boundary. Only the customer's original is shown.
export function StudioConceptPreview({photo}){
 const {theme}=useTheme();
 return <Card><StudioHeading eyebrow="Concept preview" detail="Your original reference photograph. No visual modifications have been applied.">The starting point.</StudioHeading>
  {photo?<Image source={{uri:`data:image/jpeg;base64,${photo.data}`}} accessibilityLabel="Your original reference vehicle photo, unedited" style={{height:240,width:'100%',borderRadius:16,backgroundColor:theme.surfaceMuted}} resizeMode="contain"/>:<View style={{padding:28,alignItems:'center',gap:10,backgroundColor:theme.surfaceMuted,borderRadius:16}}><Ionicons name="image-outline" size={36} color={theme.textSecondary}/><Text style={{color:theme.textSecondary,textAlign:'center'}}>Add your own photo to see it here.</Text></View>}
  <View style={{padding:14,borderRadius:12,backgroundColor:theme.surfaceMuted,gap:5}}><Text style={{color:theme.textPrimary,fontWeight:'700'}}>AI image editing · Not available yet</Text><Text style={{color:theme.textSecondary,lineHeight:22}}>Studio can help plan proposed work when analysis is available. It cannot generate an edited vehicle picture.</Text></View>
 </Card>;
}
export function StudioVehiclePicker({onSelect,navigation,disabled}){
 const {user}=useAuth(),{theme}=useTheme(),[cursor,setCursor]=useState(null);
 const {data,busy,error,refresh}=useMarketData('vehicles',{archived:false,cursor},setCursor);
 const vehicles=(data?.items||[]).filter(vehicle=>!vehicle.archived&&(!vehicle.ownerId||vehicle.ownerId===user?.uid));
 return <Card><StudioHeading eyebrow="01 / Your canvas" detail="Choose an active vehicle from your own Garage.">Choose your vehicle.</StudioHeading><Notice busy={busy} error={error}/>
  {vehicles.map(vehicle=><View key={vehicle.id} style={{borderWidth:1,borderColor:theme.border,borderRadius:16,padding:14,gap:12}}>{!!vehicle.photoIds?.length&&<PrivatePhoto target="vehicle" id={vehicle.id} accessibilityLabel={`Garage photo of ${vehicleLabel(vehicle)}`}/>}<Text style={{color:theme.textPrimary,fontSize:18,fontWeight:'700'}}>{vehicleLabel(vehicle)}</Text><Button title={`Use ${vehicleLabel(vehicle)}`} outline disabled={disabled||busy} onPress={()=>onSelect(vehicle)}/></View>)}
  {!busy&&!error&&!vehicles.length&&<><Text style={{color:theme.textSecondary,lineHeight:22}}>No active vehicles on this page. Add a vehicle in Garage to start your concept.</Text><Button title="Go to Garage" onPress={()=>navigation.navigate('Garage')}/></>}
  {!!error&&<Button title="Retry Garage" outline disabled={busy} onPress={()=>void refresh().catch(()=>{})}/>}
  {!!data?.cursor&&<Button title="More Garage vehicles" outline disabled={busy||disabled} onPress={()=>setCursor(data.cursor)}/>}
 </Card>;
}
