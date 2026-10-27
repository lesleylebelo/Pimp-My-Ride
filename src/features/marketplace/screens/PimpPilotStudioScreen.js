import React,{useEffect,useRef,useState} from 'react';
import {Platform,View} from 'react-native';
import {StudioLanding,StudioProgress,StudioHeading,StudioInterests,StudioConceptPreview,StudioVehiclePicker,vehicleLabel} from '../components/StudioUI';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {useIsFocused,usePreventRemove} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {CustomerModal} from '../../customer/components/CustomerUI';
import {Page,Card,Button,Field,Notice} from '../components/MarketplaceUI';
import {createStudioPlan,isStudioPlan,studioRequestDraft} from '../services/pimpPilotStudio';

export default function PimpPilotStudioScreen(props){
 const {user}=useAuth();
 return <Studio key={`${user?.uid}:${props.route.params?.vehicleId}`} {...props}/>;
}
function Studio({route,navigation}){
 const {user,offline}=useAuth(),{theme}=useTheme(),focused=useIsFocused();
 const [vehicle,setVehicle]=useState(route.params?.vehicle?.archived?null:route.params?.vehicle||null);
 const [vehicleId,setVehicleId]=useState(route.params?.vehicle?.archived?null:route.params?.vehicleId);
 const [started,setStarted]=useState(!!vehicleId),[choosing,setChoosing]=useState(!vehicleId);
 const [interests,setInterests]=useState([]),[unavailable,setUnavailable]=useState(false);
 const [message,setMessage]=useState(''),[history,setHistory]=useState([]),[result,setResult]=useState(null),[photo,setPhoto]=useState(null);
 const [selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[picking,setPicking]=useState(false),[error,setError]=useState(''),[leaveAction,setLeaveAction]=useState(null);
 const epoch=useRef(0),lock=useRef(false),current=useRef({});
 current.current={uid:user?.uid,focused};
 useEffect(()=>()=>{epoch.current++;},[]);
 useEffect(()=>{if(!focused){clear();}},[focused]);
 const dirty=!!(message||photo||result||history.length||interests.length);
 usePreventRemove(dirty&&!leaveAction,({data})=>setLeaveAction(data.action));
 const disabled=busy||offline||!user?.uid;
 function clear(){epoch.current++;lock.current=false;setMessage('');setHistory([]);setPhoto(null);setResult(null);setSelected([]);setError('');setBusy(false);setPicking(false);setInterests([]);setUnavailable(false);}
 async function choosePhoto(camera=false){
  if(busy||lock.current||!user?.uid)return;
  const uid=user.uid,version=epoch.current;
  try{
  lock.current=true;setBusy(true);setPicking(true);setError('');
   if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Camera permission is required. You can also choose a photo from Gallery.');}
   if(epoch.current!==version||current.current.uid!==uid||!current.current.focused)return;
   // Gallery opens directly from the user's tap, preserving web picker activation.
   const picked=await (camera?ImagePicker.launchCameraAsync:ImagePicker.launchImageLibraryAsync)({mediaTypes:['images'],allowsMultipleSelection:false,quality:1});if(picked.canceled)return;
   const image=await ImageManipulator.manipulateAsync(picked.assets[0].uri,[{resize:{width:1280}}],{compress:0.72,format:ImageManipulator.SaveFormat.JPEG,base64:true});
   if(!image.base64||image.base64.length>1398100)throw Error('This photo is too large. Choose a smaller vehicle photo.');
   if(epoch.current!==version||current.current.uid!==uid||!current.current.focused)return;
   setPhoto({mimeType:'image/jpeg',data:image.base64});setHistory([]);setResult(null);setSelected([]);
  }catch(e){if(epoch.current===version)setError(e.message||'Unable to read that photo. Choose a smaller vehicle photo and try again.');}
  finally{if(epoch.current===version){lock.current=false;setBusy(false);setPicking(false);}}
 }
 async function generate(){
  if(disabled||lock.current||!vehicleId||choosing||(!message.trim()&&!interests.length))return;
  const uid=user.uid,version=epoch.current,text=[interests.length?`Interests: ${interests.join(', ')}.`:'',message.trim()].filter(Boolean).join('\n');
  if(text.length>1500){setError('Shorten your instructions so the complete direction, including interests, fits within 1,500 characters.');return;}
  lock.current=true;setBusy(true);setError('');
  try{
   const response=await createStudioPlan({vehicleId,message:text,history,...(photo?{image:photo}:{})},uid);
   if(epoch.current!==version||current.current.uid!==uid||!current.current.focused)return;
   if(response?.vehicleId!==vehicleId||!isStudioPlan(response.plan))throw Error('Invalid Studio response.');
   setUnavailable(false);setResult(response.plan);setHistory(previous=>[...previous,{message:text,plan:response.plan}].slice(-6));setSelected([]);setMessage('');setInterests([]);
  }catch(e){if(epoch.current===version&&current.current.uid===uid){const code=(e.code||'').replace(/^api\//,'');setUnavailable(code==='unavailable'||e.status===503);setError(code==='unavailable'||e.status===503?'Studio analysis is unavailable right now. Your vehicle, photo and ideas are still here. Try again later.':['permission-denied','not-found','failed-precondition','resource-exhausted','invalid-argument'].includes(code)?e.message:'Studio could not prepare a plan. Your input is preserved. Please try again.');}}
  finally{if(epoch.current===version){lock.current=false;setBusy(false);}}
 }
 const draft=result?studioRequestDraft(result,selected):null;
 const copy=(text,key)=><Text key={key} style={{color:theme.textSecondary,lineHeight:22}}>{text}</Text>;
 return <Page title="PimpPilot Studio" subtitle="Your car. Your direction." navigation={navigation}>
  {!started?<StudioLanding onStart={()=>setStarted(true)}/>:<>
  <StudioProgress hasVehicle={!!vehicleId&&!choosing} hasPlan={!!result}/>
  {choosing?<><StudioVehiclePicker navigation={navigation} disabled={busy||offline} onSelect={next=>{clear();setVehicle(next);setVehicleId(next.id);setChoosing(false);}}/>{!!vehicleId&&<Button title="Keep current vehicle" outline onPress={()=>setChoosing(false)}/>}</>:<>
  <Card>
   <StudioHeading eyebrow="Your Garage / Vehicle details" detail="Garage details are separate from AI suggestions, which need workshop assessment.">{vehicleLabel(vehicle)}</StudioHeading>
   <Button title="Choose another vehicle" outline disabled={busy} onPress={()=>setChoosing(true)}/>
  </Card>
  <StudioConceptPreview photo={photo}/>
  <Card>
   <StudioHeading eyebrow="02 / Creative direction" detail="Choose an interest, add instructions, or combine both. Describe your preferred finish, daily use and priorities.">What do you have in mind?</StudioHeading>
   <StudioInterests values={interests} onChange={setInterests} disabled={busy}/>
   <Button title={photo?'Replace vehicle photo':'Add vehicle photo (optional)'} outline disabled={busy} onPress={()=>void choosePhoto()}/>
   {Platform.OS!=='web'&&<Button title="Take vehicle photo" outline disabled={busy} onPress={()=>void choosePhoto(true)}/>}
   {!!photo&&<Button title="Remove photo and reset plan" outline disabled={busy} onPress={clear}/>}
   {copy('Your selected photo and messages are sent to the AI provider only when you prepare or refine a plan. This session stays in memory; leaving clears it.')}
   <Field label={result?'Refine your concept':'Customer instructions (optional)'} value={message} onChangeText={setMessage} maxLength={1500} multiline editable={!busy} placeholder="e.g. A subtle matte black wrap for daily driving"/>
   <Text style={{color:theme.textSecondary,fontSize:12}}>{message.length} / 1,500 characters (interests also count when sent)</Text>
   <Button title={picking?'Reading your photo...':busy?'Preparing your concept...':result?'Refine plan':'Prepare plan'} primary disabled={disabled||(!message.trim()&&!interests.length)} onPress={()=>void generate()}/>
   <Notice busy={busy} error={offline?'Connect to use PimpPilot Studio. Your local ideas are preserved.':error}/>
   {unavailable&&<View accessibilityRole="alert" style={{gap:12,padding:16,borderRadius:12,backgroundColor:theme.surfaceMuted}}><StudioHeading eyebrow="Analysis unavailable" detail="Keep adjusting your ideas here. No recommendations were generated for this attempt.">Keep your vision in focus.</StudioHeading><Button title="Retry Studio analysis" outline disabled={disabled||(!message.trim()&&!interests.length)} onPress={()=>void generate()}/></View>}
  </Card>
  {!!history.length&&<Card><StudioHeading eyebrow="Conversation" detail="The latest direction controls your next refinement. Studio sends at most the last six turns.">Your direction so far.</StudioHeading>{history.map((turn,index)=><View key={index} style={{padding:14,borderRadius:12,backgroundColor:theme.surfaceMuted,gap:6}}><Text style={{color:theme.textPrimary,fontWeight:'600'}}>You · {index+1}</Text>{copy(turn.message)}<Text style={{color:theme.accent,fontSize:12,fontWeight:'600'}}>PimpPilot concept</Text>{copy(turn.plan.objective)}</View>)}</Card>}
  {!!result&&<>
   <Card><StudioHeading eyebrow="03 / AI suggestions" detail="A preliminary concept, not confirmed vehicle facts, certified engineering or a mechanical diagnosis.">Your concept</StudioHeading>{copy(result.objective)}
    {!result.modifications.length&&copy('No modifications were proposed. Refine your direction above to explore another approach.')}
    {!!result.observations.length&&copy('AI photo observations — verify with your workshop')}{result.observations.map((text,i)=>copy(text,`o${i}`))}
    {!!result.assumptions.length&&copy('Assumptions to verify')}{result.assumptions.map((text,i)=>copy(text,`a${i}`))}
   </Card>
   {result.modifications.map((item,index)=><Card key={index} style={selected.includes(index)?{borderColor:theme.accent,backgroundColor:theme.accentLight}:undefined}>
    <Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700',fontSize:18}}>{item.title}</Text>
    {copy(`Proposed work: ${item.scope}`)}{item.parts.map((text,i)=>copy(`Component to verify: ${text}`,i))}{copy(item.tradeOffs)}
    <Button title={selected.includes(index)?`Remove ${item.title} from request`:`Select ${item.title} for request`} accessibilityState={{selected:selected.includes(index)}} icon={selected.includes(index)?'checkmark-circle-outline':'add-circle-outline'} outline disabled={disabled} onPress={()=>setSelected(previous=>previous.includes(index)?previous.filter(i=>i!==index):[...previous,index])}/>
   </Card>)}
   <Card><Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Practical considerations</Text>{result.considerations.map(copy)}
    <Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Questions for your workshop</Text>{result.questions.map(copy)}
   </Card>
   <Card><Text accessibilityRole="header" style={{color:theme.textPrimary,fontWeight:'700'}}>Prepare a Service Request</Text>
    <Text accessibilityRole="status" style={{color:theme.accent,fontWeight:'600'}}>{selected.length} of {result.modifications.length} modifications selected</Text>
    {copy('Select only the proposed work you want. Review the preview before confirming transfer. Your request still needs the normal form review and submission.')}
    {draft?copy(draft.description):copy(selected.length?'Select fewer modifications to fit the 300-character request limit.':'Select a modification above to prepare your draft.')}
    <ConfirmationButton palette={theme} title="Transfer selected work to request form" message={draft?`${draft.description}\n\nTransfer this proposed work into a new, unsaved request form?`:'Select work first.'} disabled={disabled||!draft} onConfirm={()=>{if(draft)navigation.push('RequestForm',{vehicleId,vehicle,studioDraft:{...draft,uid:user.uid}});}}/>
   </Card>
  </>}
  </>}
  <Button title="Clear Studio session" outline disabled={busy} onPress={clear}/>
  </>}
  <CustomerModal visible={!!leaveAction} transparent animationType="fade" onRequestClose={()=>setLeaveAction(null)}>
   <View style={{flex:1,padding:24,backgroundColor:'#00000099',justifyContent:'center',alignItems:'center'}}><Card accessibilityViewIsModal style={{width:'100%',maxWidth:440}}><StudioHeading eyebrow="Leave Studio?" detail="Leaving clears your photo, conversation and plan. Your Service Request is not submitted.">Keep working on your vision?</StudioHeading><Button title="Leave and clear session" onPress={()=>{clear();navigation.dispatch(leaveAction);}}/><Button title="Stay in Studio" outline onPress={()=>setLeaveAction(null)}/></Card></View>
  </CustomerModal>
 </Page>;
}
