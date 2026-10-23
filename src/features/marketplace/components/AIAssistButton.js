import React,{useEffect,useRef,useState} from 'react';
import {KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {aiAssist} from '../services/aiAssistApi';
import {pimpPilotCopy,pimpPilotErrorMessage} from '../services/pimpPilotPresentation';
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
   if(original!==current.current.basis)throw Error('Your draft changed. Use Regenerate Suggestions before applying a PimpPilot suggestion.');
   setSuggestion({...result,basis:original});
  }catch(e){if(mounted.current&&generation===epoch.current&&uid===current.current.uid)setError(pimpPilotErrorMessage(e));}
  finally{if(mounted.current&&generation===epoch.current){lock.current=false;setLoading(false);}}
 }
 const triggerDisabled=disabled||offline||!focused||loading||`${title}${description}`.trim().length<3;
 const stale=suggestion&&suggestion.basis!==basis;
 const valid=suggestion&&suggestion.title.trim()&&suggestion.title.length<=100&&suggestion.description.trim()&&suggestion.description.length<=(kind==='request'?300:2000);
 function apply(){if(!valid||stale||current.current.disabled||loading)return;current.current.onApply({title:suggestion.title.trim(),description:suggestion.description.trim(),category:useCategory?suggestion.category:null});dismiss();}
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel={pimpPilotCopy.trigger}
   accessibilityHint={pimpPilotCopy.subtitle+'. Review suggestions before applying them.'}
   accessibilityState={{disabled:!!triggerDisabled,busy:loading}} disabled={triggerDisabled}
   onPress={()=>void generate()} style={({pressed})=>[styles.trigger,{borderColor:theme.border,backgroundColor:theme.surfaceCard,opacity:triggerDisabled?0.5:pressed?0.8:1}]}>
   <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.iconBadge,{backgroundColor:theme.surfaceMuted}]}>
    <Ionicons name="sparkles-outline" size={22} color={theme.accent}/>
   </View>
   <View style={styles.identity}>
    <Text style={[styles.triggerTitle,{color:theme.accent}]}>{pimpPilotCopy.trigger}</Text>
    <Text style={[styles.subtitle,{color:theme.textSecondary}]}>{pimpPilotCopy.subtitle}</Text>
   </View>
  </Pressable>
  {visible&&!offline&&focused&&<Modal visible transparent animationType="fade" onRequestClose={dismiss}>
   <SafeAreaView style={styles.overlay}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
     <View accessibilityViewIsModal style={[styles.card,{backgroundColor:theme.surfaceCard,borderColor:theme.border}]}>
      <View style={styles.brandHeader}>
       <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.iconBadge,{backgroundColor:theme.surfaceMuted}]}>
        <Ionicons name="sparkles-outline" size={22} color={theme.accent}/>
       </View>
       <View style={styles.identity}>
        <Text accessibilityRole="header" style={[styles.heading,{color:theme.textPrimary}]}>{pimpPilotCopy.heading}</Text>
        <Text style={[styles.subtitle,{color:theme.textSecondary}]}>{pimpPilotCopy.subtitle}</Text>
       </View>
      </View>
      <Text style={{color:theme.textSecondary}}>Review for accuracy. Nothing is saved or published until you use the normal form controls.</Text>
      <Notice error={error|| (stale?'Your draft changed. Use Regenerate Suggestions before applying.':'')}/>
      {loading&&<Text accessibilityRole="status" accessibilityLiveRegion="polite" style={{color:theme.textPrimary}}>{pimpPilotCopy.loading}</Text>}
      {!!suggestion&&<>
       {!stale&&<Text accessibilityRole="status" accessibilityLiveRegion="polite" style={{color:theme.accent}}>{pimpPilotCopy.ready}</Text>}
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
      <Button title={pimpPilotCopy.regenerate} outline disabled={loading||disabled||offline} onPress={()=>void generate()}/>
      <Button title="Dismiss" outline onPress={dismiss}/>
     </View>
    </ScrollView>
   </KeyboardAvoidingView></SafeAreaView>
  </Modal>}
 </>;
}
const styles=StyleSheet.create({
 trigger:{minHeight:72,width:'100%',flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:18,padding:16},
 iconBadge:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',flexShrink:0},
 identity:{flex:1,minWidth:0,gap:4},brandHeader:{flexDirection:'row',alignItems:'center',gap:12},
 triggerTitle:{fontSize:15,lineHeight:21,fontWeight:'700'},subtitle:{fontSize:13,lineHeight:19},heading:{fontSize:22,lineHeight:28,fontWeight:'700'},
 fill:{flex:1},overlay:{flex:1,padding:16,backgroundColor:'rgba(0,0,0,0.65)'},
 scroll:{flexGrow:1,justifyContent:'center',paddingVertical:16},card:{width:'100%',maxWidth:560,alignSelf:'center',borderRadius:20,borderWidth:1,padding:20,gap:14},
});
