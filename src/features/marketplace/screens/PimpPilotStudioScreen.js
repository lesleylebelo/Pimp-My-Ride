import React,{useEffect,useRef,useState} from 'react';
import {Image} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {useIsFocused,usePreventRemove} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {Page,Card,Button,Field,Notice} from '../components/MarketplaceUI';
import {createStudioPlan,studioRequestDraft} from '../services/pimpPilotStudio';

export default function PimpPilotStudioScreen(props){
 const {user}=useAuth();
 return <Studio key={`${user?.uid}:${props.route.params?.vehicleId}`} {...props}/>;
}
function Studio({route,navigation}){
 const {user,offline}=useAuth(),{theme}=useTheme(),focused=useIsFocused();
 const vehicleId=route.params?.vehicleId,vehicle=route.params?.vehicle;
 const [message,setMessage]=useState(''),[history,setHistory]=useState([]),[result,setResult]=useState(null),[photo,setPhoto]=useState(null);
 const [selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[leaveAction,setLeaveAction]=useState(null);
 const epoch=useRef(0),lock=useRef(false),current=useRef({});
 current.current={uid:user?.uid,focused};
 useEffect(()=>()=>{epoch.current++;},[]);
 useEffect(()=>{if(!focused){epoch.current++;lock.current=false;setBusy(false);setPhoto(null);setHistory([]);setResult(null);setSelected([]);setMessage('');}},[focused]);
 const dirty=!!(message||photo||result||history.length);
 usePreventRemove(dirty&&!leaveAction,({data})=>setLeaveAction(data.action));
 const disabled=busy||offline||!user?.uid;
 function clear(){epoch.current++;lock.current=false;setMessage('');setHistory([]);setPhoto(null);setResult(null);setSelected([]);setError('');setBusy(false);}
 async function choosePhoto(){
  if(disabled||lock.current)return;
  const uid=user.uid,version=epoch.current;
  try{
  // Open the system picker directly from the user's tap (also works on web).
  const picking=ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:false,quality:1});
  lock.current=true;setBusy(true);setError('');
   const picked=await picking;if(picked.canceled)return;
   const image=await ImageManipulator.manipulateAsync(picked.assets[0].uri,[{resize:{width:1280}}],{compress:0.72,format:ImageManipulator.SaveFormat.JPEG,base64:true});
   if(!image.base64||image.base64.length>1398100)throw Error('This photo is too large. Choose a smaller vehicle photo.');
   if(epoch.current!==version||current.current.uid!==uid||!current.current.focused)return;
   setPhoto({mimeType:'image/jpeg',data:image.base64});setHistory([]);setResult(null);setSelected([]);
  }catch{if(epoch.current===version)setError('Unable to read that photo. Choose a smaller vehicle photo and try again.');}
  finally{if(epoch.current===version){lock.current=false;setBusy(false);}}
 }
 async function generate(){
  if(disabled||lock.current||!message.trim())return;
  const uid=user.uid,version=epoch.current,text=message.trim();lock.current=true;setBusy(true);setError('');
  try{
   const response=await createStudioPlan({vehicleId,message:text,history,...(photo?{image:photo}:{})},uid);
   if(epoch.current!==version||current.current.uid!==uid||!current.current.focused)return;
   if(response.vehicleId!==vehicleId||!response.plan||!Array.isArray(response.plan.modifications))throw Error('Invalid Studio response.');
   setResult(response.plan);setHistory(previous=>[...previous,{message:text,plan:response.plan}].slice(-6));setSelected([]);setMessage('');
  }catch(e){if(epoch.current===version&&current.current.uid===uid)setError(e.code==='permission-denied'||e.code==='not-found'?e.message:'Studio could not prepare a plan. Please try again.');}
  finally{if(epoch.current===version){lock.current=false;setBusy(false);}}
 }
 const draft=result?studioRequestDraft(result,selected):null;
 const copy=(text,key)=><Text key={key} style={{color:theme.textSecondary,lineHeight:22}}>{text}</Text>;
 return <Page title="PimpPilot Studio" subtitle="Imagine your next build." navigation={navigation}>
  <Card>
   <Text accessibilityRole="header" style={{color:theme.textPrimary,fontSize:22,fontWeight:'700'}}>{[vehicle?.year,vehicle?.make,vehicle?.model].filter(Boolean).join(' ')||'Your selected vehicle'}</Text>
   {copy('Explore styling, maintenance and mechanical improvements. Plans are preliminary concepts, not certified engineering or mechanical diagnoses.')}
   {copy('Photo analysis is available when Studio is enabled. AI image editing is not configured; Studio cannot generate an edited vehicle picture.')}
   {copy('Your selected photo and messages are sent to the AI provider when you prepare a plan. This screen keeps the session in memory only; leaving clears it.')}
   <Button title={photo?'Replace vehicle photo':'Add vehicle photo (optional)'} outline disabled={disabled} onPress={()=>void choosePhoto()}/>
   {!!photo&&<><Image source={{uri:`data:image/jpeg;base64,${photo.data}`}} accessibilityLabel="Your reference vehicle photo" style={{height:220,width:'100%',borderRadius:16}} resizeMode="contain"/><Button title="Remove photo and reset plan" outline disabled={disabled} onPress={()=>{clear();}}/></>}
   <Field label={result?'Refine your concept':'What would you like to change?'} value={message} onChangeText={setMessage} maxLength={1500} multiline editable={!disabled} placeholder="e.g. A subtle matte black wrap for daily driving"/>
   <Button title={busy?'Preparing your concept...':result?'Refine plan':'Prepare plan'} disabled={disabled||!message.trim()} onPress={()=>void generate()}/>
   <Notice busy={busy} error={offline?'Connect to use PimpPilot Studio.':error}/>
  </Card>
  {!!result&&<>
   <Card><Text accessibilityRole="header" style={{color:theme.textPrimary,fontSize:20,fontWeight:'700'}}>Your concept</Text>{copy(result.objective)}
    {!!result.observations.length&&copy('Visible observations')}{result.observations.map((text,i)=>copy(text,`o${i}`))}
    {!!result.assumptions.length&&copy('Assumptions to verify')}{result.assumptions.map((text,i)=>copy(text,`a${i}`))}
   </Card>
   {result.modifications.map((item,index)=><Card key={index}>
    <Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700',fontSize:18}}>{item.title}</Text>
    {copy(`Proposed work: ${item.scope}`)}{item.parts.map((text,i)=>copy(`Component to verify: ${text}`,i))}{copy(item.tradeOffs)}
    <Button title={selected.includes(index)?`Remove ${item.title} from request`:`Select ${item.title} for request`} outline disabled={disabled} onPress={()=>setSelected(previous=>previous.includes(index)?previous.filter(i=>i!==index):[...previous,index])}/>
   </Card>)}
   <Card><Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Practical considerations</Text>{result.considerations.map(copy)}
    <Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Questions for your workshop</Text>{result.questions.map(copy)}
   </Card>
   <Card><Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Prepare a Service Request</Text>
    {copy('Select only the proposed work you want. Review the preview before confirming transfer. Your request still needs the normal form review and submission.')}
    {draft?copy(draft.description):copy(selected.length?'Select fewer modifications to fit the 300-character request limit.':'Select a modification above to prepare your draft.')}
    <ConfirmationButton palette={theme} title="Transfer selected work to request form" message={draft?`${draft.description}\n\nTransfer this proposed work into a new, unsaved request form?`:'Select work first.'} disabled={disabled||!draft} onConfirm={()=>{if(draft)navigation.push('RequestForm',{vehicleId,vehicle,studioDraft:{...draft,uid:user.uid}});}}/>
   </Card>
  </>}
  <Button title="Clear Studio session" outline disabled={busy} onPress={clear}/>
  {!!leaveAction&&<Card>{copy('Leaving Studio clears your photo, conversation and plan.')}<Button title="Leave and clear session" onPress={()=>{clear();navigation.dispatch(leaveAction);}}/><Button title="Stay in Studio" outline onPress={()=>setLeaveAction(null)}/></Card>}
 </Page>;
}
