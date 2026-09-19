import React,{useState} from 'react';
import {Text} from 'react-native';
import {useAuth} from '../../auth/context/AuthContext';
import {useAdminData} from '../services/useAdminData';
import {Page,Card,Button,Notice,styles} from '../components/AdminUI';
export default function AdminHomeScreen({navigation}){
 const [signOutError,setSignOutError]=useState('');
 const {logout}=useAuth(),{data,busy,error,refresh}=useAdminData('dashboard');
 return <Page title="Control centre"><Text style={styles.muted}>Manage the people and services behind PimpMyRide.</Text><Notice busy={busy} error={error||signOutError}/>
 {data&&<Card><Text style={styles.heading}>{data.accounts} accounts</Text><Text>{data.pending} shops awaiting review · {data.suspended} suspended accounts</Text><Text>{data.categories} active service categories</Text></Card>}
 <Button title="Accounts & access" onPress={()=>navigation.navigate('AdminAccounts',{filter:'all'})}/>
 <Button title="Review shop applications" onPress={()=>navigation.navigate('AdminAccounts',{filter:'pending'})}/>
 <Button title="Service categories" onPress={()=>navigation.navigate('AdminCategories')}/>
 <Button title="Online & last seen" onPress={()=>navigation.navigate('AdminPresence')}/>
 <Button title="Audit log" onPress={()=>navigation.navigate('AdminAudit')}/>
 <Button title="Confirm identity for sensitive actions" onPress={()=>navigation.navigate('AdminConfirm')}/>
 <Button title="Refresh overview" disabled={busy} onPress={refresh}/>
 <Button title="Sign out" onPress={()=>logout().catch(()=>setSignOutError('Could not complete sign-out. Please try again.'))}/>
 </Page>;
}
