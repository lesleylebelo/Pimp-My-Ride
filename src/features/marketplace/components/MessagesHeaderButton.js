import {CustomerPressable,useCustomerExperience} from '../../customer/components/CustomerUI';
import React,{useEffect,useState} from 'react';
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {messageApi} from '../services/messageApi';

// Display existing inbox counters; opening the feed never acknowledges messages.
function useUnreadCount(){
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const key=JSON.stringify([uid,offline,focused]),[count,setCount]=useState(null);
 useEffect(()=>{
  setCount(null);if(!uid||offline||!focused)return undefined;
  let active=true,epoch=0,loading=false;
  async function refresh(){
   if(loading||AppState.currentState!=='active')return;
   loading=true;const current=epoch;
   try{
    const result=await messageApi('summary',{});
    if(!active||current!==epoch)return;
    const total=result?.unreadCount;
    if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid unread summary');
    setCount({key,value:total});
   }catch{if(active&&current===epoch)setCount(null);}
   finally{if(current===epoch)loading=false;}
  }
  void refresh();const interval=setInterval(()=>void refresh(),30000);
  const listener=AppState.addEventListener('change',state=>{if(state==='active')void refresh();else{++epoch;loading=false;setCount(null);}});
  return()=>{active=false;++epoch;clearInterval(interval);listener.remove();};
 },[key]);
 return count?.key===key?count.value:null;
}

export default function MessagesHeaderButton({navigation}){
 const unread=useUnreadCount(),{theme}=useTheme(),customer=useCustomerExperience(),Interaction=customer?CustomerPressable:Pressable;
 return <Interaction accessibilityRole="button" accessibilityLabel="Messages" accessibilityHint="Open your messages inbox"
  accessibilityValue={{text:unread===null?'Unread status unavailable':unread?`${unread} unread messages`:'No unread messages'}}
  hitSlop={6} onPress={()=>navigation.navigate('Messages')}
  style={({pressed})=>[styles.button,{backgroundColor:theme.surfaceCard,borderColor:theme.border,opacity:pressed?0.7:1}]}>
  <Ionicons name="chatbubbles-outline" size={24} color={theme.accent}/>
  {unread>0&&<View testID="messages-unread-badge" accessible={false} style={[styles.badge,{backgroundColor:theme.accent}]}>
   <Text style={[styles.badgeText,{color:theme.primaryText}]}>{unread>99?'99+':String(unread)}</Text>
  </View>}
 </Interaction>;
}

const styles=StyleSheet.create({
 button:{width:44,height:44,borderRadius:22,borderWidth:1,alignItems:'center',justifyContent:'center',flexShrink:0},
 badge:{position:'absolute',top:-4,right:-5,minWidth:20,height:20,borderRadius:10,paddingHorizontal:4,alignItems:'center',justifyContent:'center'},
 badgeText:{fontSize:11,lineHeight:15,fontWeight:'600'},
});
