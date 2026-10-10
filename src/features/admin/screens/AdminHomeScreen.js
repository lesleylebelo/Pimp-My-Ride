import React,{useState} from 'react';
import {Text} from 'react-native';
import {useAuth} from '../../auth/context/AuthContext';
import {useAdminData} from '../services/useAdminData';
import {Page,Card,Button,Notice,styles} from '../components/AdminUI';
export default function AdminHomeScreen({navigation}){
 const [signOutError,setSignOutError]=useState('');
 const {logout}=useAuth(),{data,busy,error,refresh}=useAdminData('dashboard');
 return <Page title="Control centre">
  <Text style={styles.muted}>Manage the people and services behind PimpMyRide.</Text>
  <Notice busy={busy} error={error||signOutError}/>
  {data&&<Card>
    <Text style={styles.heading}>{data.accounts} accounts</Text>
    <Text style={styles.muted}>{data.pending} shops awaiting review · {data.suspended} suspended accounts</Text>
    <Text style={styles.muted}>{data.categories} active service categories</Text>
  </Card>}
  <Button title="Accounts & access" primary onPress={()=>navigation.navigate('AdminAccounts',{filter:'all'})}/>
  <Button title="Review shop applications" primary onPress={()=>navigation.navigate('AdminAccounts',{filter:'pending'})}/>
  <Button title="Service categories" primary onPress={()=>navigation.navigate('AdminCategories')}/>
  <Button title="Online & last seen" primary onPress={()=>navigation.navigate('AdminPresence')}/>
  <Button title="Audit log" primary onPress={()=>navigation.navigate('AdminAudit')}/>
  <Button title="Confirm identity for sensitive actions" primary onPress={()=>navigation.navigate('AdminConfirm')}/>
  <Button title="Refresh overview" primary disabled={busy} onPress={refresh}/>
  <Button title="Sign out" danger onPress={()=>logout().catch(()=>setSignOutError('Could not complete sign-out. Please try again.'))}/>
 </Page>;
}