import {useAppActive} from '../../../shared/services/useAppActive';
import React,{useEffect,useRef,useState} from 'react';
import {Image,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {viewPhoto} from '../services/photoApi';
import {isMediaUrl} from '../../../shared/services/mediaUrl';
import {Button} from './MarketplaceUI';
import colors from '../../../shared/theme/colors';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {CustomerAction,CustomerPressable,CustomerText} from '../../customer/components/CustomerUI';

// Only the request's explicit asset IDs are eligible. Never enumerate its Garage.
export default function RequestPhotos({request,presentation}){
 const ids=[...new Set((Array.isArray(request.photoIds)?request.photoIds:[]).filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id)))].slice(0,5);
 if(!ids.length){const missing=Array.isArray(request.photos)&&request.photos.length;return presentation==='feed'?<CustomerText muted>{missing?'Attached photos unavailable.':'No attached photos'}</CustomerText>:missing?<Text>Attached photos unavailable.</Text>:null;}
 if(presentation==='feed')return <View style={{gap:10}}><RequestPhoto requestId={request.id} photoId={ids[0]} index={0} feed large/>{ids.length>1&&<ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Request attachments">{ids.slice(1).map((id,index)=><RequestPhoto key={id} requestId={request.id} photoId={id} index={index+1} feed/>)}</ScrollView>}</View>;
 return <View><Text>{ids.length} attached {ids.length===1?'photo':'photos'}</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Request attachments">
   {ids.map((id,index)=><RequestPhoto key={id} requestId={request.id} photoId={id} index={index}/>)}</ScrollView>
 </View>;
}

function RequestPhoto({requestId,photoId,index,feed=false,large=false}){
 const {theme}=useTheme(),Interaction=feed?CustomerPressable:Pressable,Action=feed?CustomerAction:Button;
 const imageStyle=feed?{width:large?'100%':120,aspectRatio:4/3,borderRadius:12}:styles.image;
 const {user,offline}=useAuth(),uid=user?.uid,screenFocused=useIsFocused(),appActive=useAppActive(),focused=screenFocused&&appActive;
 const [access,setAccess]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[open,setOpen]=useState(false);
 const timer=useRef(null),current=useRef(null);
 const key=JSON.stringify([uid,requestId,photoId,focused,offline,retry]);
 useEffect(()=>{
  let active=true;setAccess(null);setError(false);setOpen(false);current.current=null;
  if(!uid||offline||!focused)return undefined;
  async function load(){
   current.current=null;setAccess(null);
   try{
    // Express rechecks request audience/status and attachment membership each time.
    const result=await viewPhoto('request',requestId,photoId,uid);
    if(!active)return;
    if(!isMediaUrl(result?.url)||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now())throw Error('Expired preview');
    const next={key,url:result.url};current.current=next;setAccess(next);setError(false);
    timer.current=setTimeout(()=>void load(),Math.max(1,result.expiresAt-Date.now()));
   }catch{if(active){current.current=null;setAccess(null);setError(true);}}
  }
  void load();return()=>{active=false;clearTimeout(timer.current);};
 },[key]);
 const url=uid&&focused&&!offline&&access?.key===key?access.url:null;
 function unavailable(){
  if(current.current?.key!==key||current.current?.url!==url)return;
  clearTimeout(timer.current);current.current=null;setAccess(null);setError(true);setOpen(false);
 }
 return <View style={feed?{width:large?'100%':120,marginRight:large?0:8,gap:6}:styles.item}>
  {url?<Interaction accessibilityRole="button" accessibilityLabel={`Preview attached photo ${index+1}`} onPress={()=>setOpen(true)}>
   <Image accessibilityLabel={`Attached request photo ${index+1}`} source={{uri:url,cache:'reload'}} style={imageStyle} resizeMode="cover" onError={unavailable}/>
  </Interaction>:<View style={[imageStyle,styles.placeholder,feed&&{backgroundColor:theme.surfaceMuted}]}><Text style={feed?{color:theme.textSecondary}:undefined}>{error||offline?'Photo unavailable':'Loading attached photo…'}</Text></View>}
  {error&&uid&&focused&&!offline&&<Action title={`Retry attached photo ${index+1}`} outline onPress={()=>setRetry(value=>value+1)}/>}
  {open&&!!url&&<Modal visible transparent onRequestClose={()=>setOpen(false)}>
   <View style={styles.backdrop}><Image accessibilityLabel={`Attached photo ${index+1} preview`} source={{uri:url,cache:'reload'}} style={styles.preview} resizeMode="contain" onError={unavailable}/>
    <Action title="Close photo" onPress={()=>setOpen(false)}/></View>
  </Modal>}
 </View>;
}

const styles=StyleSheet.create({
 item:{width:250,marginRight:8,gap:6},image:{width:250,height:180,borderRadius:12},
 placeholder:{backgroundColor:colors.background,alignItems:'center',justifyContent:'center'},
 backdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.9)',padding:20,justifyContent:'center',gap:12},
 preview:{width:'100%',height:'75%'},
});
