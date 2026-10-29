import React,{useState} from 'react';
import ManageProfile from '../../auth/components/ManageProfile';
import {View} from 'react-native';
import {CustomerPage,CustomerCard,CustomerText,CustomerAction} from '../components/CustomerUI';
import ProfilePhotoSettings from '../../auth/components/ProfilePhotoSettings';

export default function CustomerAccountScreen({navigation,user,profile,mode,toggleTheme,busy,photoBusy,onPhotoBusy,error,message,onLogout}){
 const [managing,setManaging]=useState(false);
 if(managing)return <CustomerPage title="Manage Profile" navigation={navigation} activeRoute="OwnerAccount"><CustomerAction title="Back to Profile" outline onPress={()=>setManaging(false)}/><ManageProfile/></CustomerPage>;
 return <CustomerPage title="Profile" subtitle="Your account and preferences" navigation={navigation} activeRoute="OwnerAccount">
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:18,alignItems:'flex-start'}}>
   <View style={{flexGrow:1,flexBasis:340,minWidth:0,gap:18}}>
    <CustomerCard><CustomerText heading>{profile.fullName||'Customer account'}</CustomerText><CustomerText muted>Customer</CustomerText>
     {[['Email',user.email],['Phone',profile.phone]].filter(([,value])=>!!value).map(([label,value])=><View key={label} style={{gap:2}}><CustomerText muted style={{fontSize:12}}>{label}</CustomerText><CustomerText selectable>{value}</CustomerText></View>)}
     <CustomerAction title="Manage Profile" icon="settings-outline" disabled={busy||photoBusy} onPress={()=>setManaging(true)}/>
    </CustomerCard>
    <CustomerCard><CustomerText heading>Appearance</CustomerText><CustomerText muted>Choose the theme that works for you.</CustomerText><CustomerAction title={`Switch to ${mode==='dark'?'light':'dark'} mode`} icon={mode==='dark'?'sunny-outline':'moon-outline'} disabled={busy||photoBusy} onPress={toggleTheme}/></CustomerCard>
    <CustomerCard><CustomerText heading>Saved work</CustomerText><CustomerText muted>Return to the showcases you bookmarked.</CustomerText><CustomerAction title="Saved posts" icon="bookmark-outline" onPress={()=>navigation.navigate('SavedPosts')}/></CustomerCard>
   </View>
   <View style={{flexGrow:1,flexBasis:340,minWidth:0}}><ProfilePhotoSettings disabled={busy||!!error||!!profile.reviewOperation||!!profile.statusOperation} onBusyChange={onPhotoBusy}/></View>
  </View>
  {!!(error||message)&&<CustomerText accessibilityRole="alert">{error||message}</CustomerText>}
  <CustomerAction title="Sign out" icon="log-out-outline" danger disabled={busy||photoBusy} onPress={onLogout}/>
 </CustomerPage>;
}
