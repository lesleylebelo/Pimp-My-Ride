import React,{useEffect,useRef,useState} from 'react';
import {KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {aiAssist} from '../services/aiAssistApi';
import {Button,Field,Notice} from './MarketplaceUI';

export default function AIAssistButton(props){const {user}=useAuth();return <AssistDraft key={user?.uid||'signed-out'} {...props}/>;}
function AssistDraft({kind,title,description,categoryId='',disabled=false,onApply}){
 const {user,offline}=useAuth(),focused=useIsFocused(),{theme}=useTheme();
 const [visible,setVisible]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[suggestion,setSuggestion]=useState(null),[editing,setEditing]=useState(false),[useCategory,setUseCategory]=useState(false);
 const epoch=useRef(0),mounted=useRef(true),current=useRef(null),lock=useRef(false);
 const basis=JSON.stringify([user?.uid,kind,title,description,categoryId]);
 current.current={basis,uid:user?.uid,disabled:disabled||offline||!focused,onApply};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++epoch.current;};},[]);
 useEffect(()=>{if(offline||!focused){++epoch.current;lock.current=false;setVisible(false);setLoading(false);setSuggestion(null);}},[offline,focused,user?.uid]);
 function dismiss(){++epoch.current;lock.current=false;setVisible(false);setLoading(false);setSuggestion(null);setError('');}
 async function generate(){
  if(lock.current||current.current.disabled||!current.current.uid)return;
  lock.current=true;const generation=++epoch.current,original=current.current.basis,uid=current.current.uid;
  setVisible(true);setLoading(true);setSuggestion(null);setError('');setEditing(false);setUseCategory(false);
  try{
   const result=await aiAssist({kind,title,description,categoryId},uid);
   if(!mounted.current||generation!==epoch.current||uid!==current.current.uid)return;
   if(original!==current.current.basis)throw Error('Your draft changed. Regenerate before applying a suggestion.');
   setSuggestion({...result,basis:original});
  }catch(e){if(mounted.current&&generation===epoch.current&&uid===current.current.uid)setError(e.message||'AI Assist is unavailable. Your draft is unchanged.');}
  finally{if(mounted.current&&generation===epoch.current){lock.current=false;setLoading(false);}}
 }
 const stale=suggestion&&suggestion.basis!==basis;
 const valid=suggestion&&suggestion.title.trim()&&suggestion.title.length<=100&&suggestion.description.trim()&&suggestion.description.length<=(kind==='request'?300:2000);
 function apply(){if(!valid||stale||current.current.disabled||loading)return;current.current.onApply({title:suggestion.title.trim(),description:suggestion.description.trim(),category:useCategory?suggestion.category:null});dismiss();}
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel="Optimise with AI" disabled={disabled||offline||!focused||loading||`${title}${description}`.trim().length<3}
   onPress={()=>void generate()} style={[styles.trigger,{borderColor:theme.border,opacity:disabled||offline?0.5:1}]}>
   <Ionicons name="sparkles-outline" size={20} color={theme.accent}/><Text style={{color:theme.accent}}>Optimise with AI</Text>
  </Pressable>
  {visible&&!offline&&focused&&<Modal visible transparent animationType="fade" onRequestClose={dismiss}>
   <SafeAreaView style={styles.overlay}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
     <View accessibilityViewIsModal style={[styles.card,{backgroundColor:theme.surfaceCard}]}>
      <Text accessibilityRole="header" style={{fontSize:22,color:theme.textPrimary}}>AI suggestions</Text>
      <Text style={{color:theme.textSecondary}}>Review for accuracy. Nothing is saved or published until you use the normal form controls.</Text>
      <Notice busy={loading} error={error|| (stale?'Your draft changed. Regenerate before applying.':'')}/>
      {loading&&<Text accessibilityRole="status" style={{color:theme.textPrimary}}>Preparing suggestions…</Text>}
      {!!suggestion&&<>
       <Text style={{color:theme.textSecondary}}>Original title: {title}</Text><Text style={{color:theme.textSecondary}}>Original description: {description}</Text>
       {editing?<><Field label="Suggested title" value={suggestion.title} maxLength={100} onChangeText={value=>setSuggestion(previous=>({...previous,title:value}))}/>
        <Field label="Suggested description" value={suggestion.description} maxLength={kind==='request'?300:2000} multiline onChangeText={value=>setSuggestion(previous=>({...previous,description:value}))}/></>:
        <><Text style={{color:theme.textPrimary}}>Suggested title: {suggestion.title}</Text><Text style={{color:theme.textPrimary}}>Suggested description: {suggestion.description}</Text></>}
       {!!suggestion.category&&<><Text style={{color:theme.textPrimary}}>Suggested category: {suggestion.category.name}</Text>
        <Button title={useCategory?'Keep current category':'Use suggested category'} outline onPress={()=>setUseCategory(value=>!value)}/></>}
       {!!suggestion.missingDetails.length&&<Text style={{color:theme.textPrimary}}>Details to consider:</Text>}
       {suggestion.missingDetails.map((item,index)=><Text key={index} style={{color:theme.textSecondary}}>{item}</Text>)}
       <Button title="Apply" disabled={!valid||!!stale||disabled||offline||loading} onPress={apply}/>
       <Button title="Edit" outline onPress={()=>setEditing(true)}/>
      </>}
      <Button title="Regenerate" outline disabled={loading||disabled||offline} onPress={()=>void generate()}/>
      <Button title="Dismiss" outline onPress={dismiss}/>
     </View>
    </ScrollView>
   </KeyboardAvoidingView></SafeAreaView>
  </Modal>}
 </>;
}
const styles=StyleSheet.create({
 trigger:{minHeight:44,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderRadius:14,paddingHorizontal:14,paddingVertical:10},
 fill:{flex:1},overlay:{flex:1,padding:16,backgroundColor:'rgba(0,0,0,0.65)'},
 scroll:{flexGrow:1,justifyContent:'center',paddingVertical:16},card:{width:'100%',maxWidth:560,alignSelf:'center',borderRadius:20,padding:20,gap:14},
});
