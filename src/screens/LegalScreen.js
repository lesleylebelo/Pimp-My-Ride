import React from 'react';
import {ScrollView,Text} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AuthNavHeader from '../components/AuthNavHeader';
export default function LegalScreen({navigation}) {
 return <SafeAreaView style={{flex:1,backgroundColor:'#F2F2F2'}}><AuthNavHeader title="Terms and privacy" onBack={()=>navigation.goBack()}/><ScrollView contentContainerStyle={{padding:24,gap:18}}>
 <Text style={{fontSize:24,fontWeight:'bold'}}>Academic demonstration</Text>
 <Text>PimpMyRide is a student project. These accounts demonstrate vehicle owner and shop registration. No real bookings, payments or commercial services are offered in this version. Do not impersonate another person or business.</Text>
 <Text>We collect your name, email and phone number to manage your account. Shop accounts also provide business details and verification documents for administrator review. For this demonstration, upload sample documents with fictional details only.</Text>
 <Text>Firebase Authentication processes sign-in credentials. Profile information is stored in Cloud Firestore and shop files in Cloud Storage. Other users cannot access your private verification documents under the supplied security rules; authorized administrators can review them.</Text>
 <Text>Contact the student project team directly to request correction or deletion of your account and files. Before a public launch, the team must provide a contact address, retention period and reviewed terms and privacy policy.</Text>
 <Text>Notice version: academic-v1</Text>
 </ScrollView></SafeAreaView>;
}
