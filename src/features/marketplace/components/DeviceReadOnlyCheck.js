import React,{useEffect,useRef,useState} from 'react';
import {Button,Image,ScrollView,StyleSheet,Text,TextInput} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {onAuthStateChanged,signInWithEmailAndPassword} from 'firebase/auth';
import {firebase,withIsolatedAuth} from '../../../shared/services/firebase';
import {apiRequest} from '../../../shared/services/api';
import {listPhotos} from '../services/photoApi';
import {approvedVehicleTest} from '../utils/approvedVehicleTest';

const CUSTOMER='aT6RWRl4AtQjtJKYIiD39eaR3x73',SHOP='vsZYsbWkD4Urq2S5OmWEKUNs6rZ2';
const VEHICLE='78gG6bPHbGvCTOCuZAwR';
export default function DeviceReadOnlyCheck(){
 const origin=process.env.EXPO_PUBLIC_API_URL||'';
 const [uid,setUid]=useState(null),[message,setMessage]=useState('Waiting for the existing test session.'),[busy,setBusy]=useState(false);
 const email=process.env.EXPO_PUBLIC_PMR_DEVICE_TEST_CUSTOMER_EMAIL||'';
 const [password,setPassword]=useState('');
 const allowSignIn=process.env.EXPO_PUBLIC_PMR_DEVICE_TEST_SIGN_IN==='true';
 const allowV1=process.env.EXPO_PUBLIC_PMR_DEVICE_V1==='true';
 const attempted=useRef(false),[v1Used,setV1Used]=useState(false),[v1Result,setV1Result]=useState(null);
 const projectCorrect=process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID==='pimp-my-ride-a26fc';
 // This screen has no AuthProvider, presence tracker, navigation or upload controls.
 useEffect(()=>{
  const timer=setTimeout(()=>setMessage('Saved-session restoration timed out. No authenticated check has run.'),12000);
  const unsubscribe=onAuthStateChanged(firebase().auth,user=>{
   clearTimeout(timer);setUid(user?.uid||null);
   setMessage(user?'Saved session restored. Only designated test accounts can run this check.':allowSignIn?'No saved test session was found. Use the approved isolated customer check below.':'No saved test session was found. Isolated test-account sign-in requires separate approval.');
  });
  return()=>{clearTimeout(timer);unsubscribe();};
 },[allowSignIn]);
 useEffect(()=>{
  if(!v1Result?.preview?.url)return;
  const timer=setTimeout(()=>{setV1Result(value=>value?{...value,preview:null}:null);setMessage('The approved preview expired. Test budget closed; do not retry.');},Math.max(0,v1Result.preview.expiresAt-Date.now()));
  return()=>clearTimeout(timer);
 },[v1Result]);
 async function check(){
  if(busy)return;
  if(!projectCorrect||![CUSTOMER,SHOP].includes(uid)){setMessage('An existing designated customer or shop session is required. No sign-in or records are created here.');return;}
  setBusy(true);setMessage('Checking authenticated vehicle metadata…');
  try{
   const result=await listPhotos('vehicle',VEHICLE,uid);
   setMessage(`Authenticated metadata read passed. Photos: ${result.items.length}; revision: ${result.version}. No image previews or writes requested.`);
  }catch(error){setMessage(error.code==='api/not-found'&&uid===SHOP?'Shop access to the customer’s private Garage is denied, as expected.':error.message||'Read-only check failed.');}
  finally{setBusy(false);}
 }
 async function isolatedCheck(){
  if(!allowSignIn||!projectCorrect||busy||!email.trim()||!password)return;
  const secret=password;setPassword('');setBusy(true);setMessage('Checking the approved isolated customer session…');
  try{
   const result=await withIsolatedAuth(async({auth})=>{
    const signed=await signInWithEmailAndPassword(auth,email.trim(),secret);
    if(signed.user.uid!==CUSTOMER||!signed.user.emailVerified)throw new Error('Designated verified customer required.');
    return apiRequest('photos',{op:'list',target:'vehicle',id:VEHICLE},{authClient:auth,expectedUid:CUSTOMER});
   });
   setMessage(`Isolated customer metadata read passed. Photos: ${result.items.length}; revision: ${result.version}. Isolated session closed; no Firestore writes requested.`);
  }catch{setMessage('Isolated check failed. Use the designated verified customer credentials; no upload or record change was requested.');}
  finally{setBusy(false);}
 }
 async function runV1(){
  if(!allowV1||!allowSignIn||!projectCorrect||busy||attempted.current||!email.trim()||!password)return;
  attempted.current=true;setV1Used(true);setBusy(true);const secret=password;setPassword('');
  setMessage('Starting the approved one-photo test…');
  try{
   const result=await withIsolatedAuth(async({auth})=>{
    const signed=await signInWithEmailAndPassword(auth,email.trim(),secret);
    if(signed.user.uid!==CUSTOMER||!signed.user.emailVerified)throw new Error('Designated customer required.');
    return approvedVehicleTest({auth,onStage:setMessage,loadFixture:async()=>{
     const {Asset}=await import('expo-asset');
     let timer;try{return await Promise.race([Asset.fromURI(origin+'/__device/v1/fixture.png').downloadAsync().then(asset=>asset.localUri),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture deadline exceeded.')),20000);})]);}finally{clearTimeout(timer);}
    }});
   });
   setV1Result(result);setMessage('Upload and persisted metadata verified: 1 photo, revision 1. Isolated session closed. Loading the one authorized preview…');
  }catch(error){setMessage('One-photo test stopped. Do not retry. '+(error.userMessage||'The outcome needs inspection; no additional upload is permitted.'));}
  finally{setBusy(false);}
 }
 return <><StatusBar style="dark"/><ScrollView style={styles.screen} contentContainerStyle={styles.content}>
  <Text style={styles.heading} accessibilityRole="header">{allowV1?'Approved one-photo device test':'Read-only device connectivity'}</Text>
  <Text style={styles.text} selectable>API: {origin}</Text>
  <Text style={styles.text}>{uid===CUSTOMER?'Customer test session':uid===SHOP?'Shop test session':'No designated test session'}</Text>
  <Text style={styles.text}>{allowV1?'Only the approved BMW slot 1 synthetic PNG upload and one private preview are enabled. Request/showcase uploads, presence, payments and all other changes remain blocked.':'Uploads, previews, presence updates, payments and Firestore record changes are blocked. Open the displayed API address with /health in Safari first.'}</Text>
  <Button title="Check authenticated metadata" disabled={busy||!uid||!projectCorrect} onPress={check}/>
  {allowSignIn&&<>
   <Text style={styles.text}>Approved isolated customer check. Enter existing test credentials here only. Firebase records sign-in activity; this does not start presence or write Firestore records.</Text>
   <TextInput style={styles.input} accessibilityLabel="Test customer email" value={email} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={false}/>
   <Text style={styles.text}>Test customer password</Text>
   <TextInput style={styles.input} accessibilityLabel="Test customer password" placeholder="Enter the test customer password" placeholderTextColor="#61776B" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy}/>
   <Button title="Sign in for isolated read-only check" disabled={busy||!projectCorrect||!email.trim()||!password} onPress={isolatedCheck}/>
   {allowV1&&<Button title="Run approved one-photo test" disabled={busy||v1Used||!projectCorrect||!email.trim()||!password} onPress={runV1}/>}
  </>}
  <Text style={styles.status} accessibilityRole="status">{message}</Text>
  {v1Result?.preview?.url&&<Image accessibilityLabel="Approved new synthetic vehicle photo preview" source={{uri:v1Result.preview.url,cache:'reload'}} style={{width:220,height:180,borderWidth:1,borderColor:'#61776B'}} resizeMode="contain" onLoad={()=>setMessage('Vehicle upload, persisted metadata and private image rendering passed. Photos: 1; revision: 1. Isolated session closed. Test complete; do not upload again.')} onError={()=>setMessage('Upload and metadata succeeded, but private image rendering failed. Stop; do not request another preview or upload.')}/>}
 </ScrollView></>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#F4F7F5'},
 content:{flexGrow:1,padding:24,paddingTop:64,paddingBottom:40,gap:16},
 heading:{color:'#17382D',fontSize:24,lineHeight:32,fontWeight:'700'},
 text:{color:'#17382D',fontSize:16,lineHeight:24},
 status:{color:'#17382D',backgroundColor:'#E1ECE5',padding:16,borderRadius:8,fontSize:16,lineHeight:24},
 input:{color:'#17382D',backgroundColor:'#FFFFFF',borderColor:'#61776B',borderWidth:1,borderRadius:8,padding:12,fontSize:16},
});
