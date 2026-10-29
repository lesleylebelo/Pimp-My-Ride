import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,ActivityIndicator,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import LogoMark from '../../../shared/components/LogoMark';
import AppTextInput from '../../../shared/components/AppTextInput';

// Presentation is scoped by the existing authenticated role, never by screen name.
export function useCustomerExperience(){return useAuth()?.profile?.role==='owner';}
export const customerTabs=[
 {label:'Discover',route:'Discover',icon:'compass-outline'},
 {label:'Garage',route:'Garage',icon:'car-sport-outline'},
 {label:'Requests',route:'OwnerRequests',icon:'document-text-outline'},
 {label:'Bookings',route:'Bookings',icon:'calendar-outline'},
 {label:'Profile',route:'OwnerAccount',icon:'person-outline'},
];
const families={PimpPilotStudio:'Discover',VehicleForm:'Garage',VehiclePhotos:'Garage',RequestForm:'OwnerRequests',OwnerRequest:'OwnerRequests',QuoteComparison:'OwnerRequests',PaymentChoice:'OwnerRequests',BookingDetail:'Bookings',ReceiptDetail:'Bookings',PostDetail:'Discover',ShopProfile:'Discover',SavedPosts:'Discover',MyPosts:'Discover',PostForm:'Discover'};
export const customerActiveRoute=route=>families[route]||route;
export function customerLayout(width,fontScale=1,content=Math.min(width,1200)-(width>=768?48:32)){
 const columns=fontScale>=1.4?1:content>=1000?3:content>=620?2:1;
 return {desktop:width>=1000&&fontScale<1.4,columns,cardWidth:columns===1?'100%':Math.floor((content-(columns-1)*18)/columns)};
}

export function CustomerPressable({style,children,disabled,onFocus,onBlur,onHoverIn,onHoverOut,...props}){
 const {theme}=useTheme(),[focused,setFocused]=useState(false),[hovered,setHovered]=useState(false);
 return <Pressable {...props} disabled={disabled}
  onFocus={event=>{setFocused(true);onFocus?.(event);}} onBlur={event=>{setFocused(false);onBlur?.(event);}}
  onHoverIn={event=>{setHovered(true);onHoverIn?.(event);}} onHoverOut={event=>{setHovered(false);onHoverOut?.(event);}}
  style={state=>[typeof style==='function'?style({...state,hovered,focused}):style,
   !disabled&&hovered&&{opacity:.9,borderColor:props.accessibilityState?.selected?theme.accent:theme.textSecondary},!disabled&&state.pressed&&{opacity:.72},
   !disabled&&focused&&(Platform.OS==='web'?{outlineStyle:'solid',outlineWidth:2,outlineColor:theme.accent,outlineOffset:-3}:{borderColor:theme.accent}),disabled&&{opacity:.48}].flat(Infinity)}>{children}</Pressable>;
}
export function CustomerText({style,muted,heading,...props}){
 const {theme}=useTheme();return <Text {...props} style={[{color:muted?theme.textSecondary:theme.textPrimary,fontSize:heading?19:14,lineHeight:heading?28:22,fontWeight:heading?'600':'400'},style]}/>;
}
export function CustomerAction({title,displayTitle,icon,onPress,disabled=false,loading=false,outline=false,primary=false,danger=false,iconOnly=false,style,...props}){
 const {theme}=useTheme(),solid=primary&&!outline&&!danger;
 return <CustomerPressable {...props} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel||title} accessibilityState={{...props.accessibilityState,disabled:disabled||loading,busy:loading}} disabled={disabled||loading} onPress={onPress}
  style={({hovered})=>[{minHeight:48,paddingHorizontal:iconOnly?10:16,paddingVertical:10,borderRadius:8,borderWidth:1,borderColor:danger?theme.error:solid?theme.accent:theme.border,backgroundColor:danger?theme.errorSurface:solid?theme.accent:theme.surfaceCard,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,alignSelf:'flex-start',maxWidth:'100%',...(iconOnly?{width:44}: {})},hovered&&!disabled&&!loading&&{borderColor:danger?theme.error:theme.textSecondary},style]}>
  {loading?<ActivityIndicator size="small" color={solid?'#101208':theme.textPrimary}/>:!!icon&&<Ionicons name={icon} size={19} color={danger?theme.error:solid?'#101208':theme.textPrimary}/>}
  {!iconOnly&&<CustomerText style={{fontWeight:'600',fontSize:13,lineHeight:20,color:danger?theme.error:solid?'#101208':theme.textPrimary,flexShrink:1,textAlign:'center'}}>{displayTitle||title}</CustomerText>}
 </CustomerPressable>;
}
export function CustomerCard({style,children,...props}){
 const {theme}=useTheme();return <View {...props} style={[{padding:20,gap:14,borderWidth:1,borderColor:theme.border,borderRadius:12,backgroundColor:theme.surfaceCard,minWidth:0},style]}>{children}</View>;
}
export function CustomerGrid({children,style}){
 const {width,fontScale}=useWindowDimensions(),[measured,setMeasured]=useState(0);
 // Use the real container width: web scrollbars and fractional percentages
 // otherwise push the last card onto another row at desktop/tablet sizes.
 const {cardWidth}=customerLayout(width,fontScale,measured||undefined);
 return <View onLayout={event=>{const next=event.nativeEvent.layout.width;if(next>0)setMeasured(previous=>Math.abs(previous-next)<1?previous:next);}} style={[{flexDirection:'row',flexWrap:'wrap',gap:18,alignItems:'flex-start'},style]}>{React.Children.toArray(children).filter(Boolean).map(child=><View key={child.key} style={{width:cardWidth,minWidth:0}}>{child}</View>)}</View>;
}
export function CustomerState({title,description,icon='information-circle-outline',busy=false,error,onRetry,action}){
 const {theme}=useTheme();
 return <CustomerCard style={{alignItems:'center',paddingVertical:30,gap:10}}>
  {busy?<ActivityIndicator color={theme.accent}/>:<Ionicons name={error?'cloud-offline-outline':icon} size={30} color={theme.textSecondary}/>}
  <CustomerText accessibilityRole={error?'alert':busy?'status':'header'} heading style={{textAlign:'center'}}>{error||title}</CustomerText>
  {!!description&&<CustomerText muted style={{textAlign:'center',maxWidth:420}}>{description}</CustomerText>}
  {!!onRetry&&<CustomerAction title="Try again" icon="refresh-outline" onPress={onRetry}/>}{action}
 </CustomerCard>;
}
export function CustomerField(props){const {theme}=useTheme();return <AppTextInput {...props} placeholderTextColor={theme.textSecondary} style={[{marginBottom:0,minWidth:0},props.style]} inputStyle={[{fontSize:14},props.inputStyle]}/>;}
export function CustomerChip({title,icon,selected,onPress,disabled}){
 const {theme}=useTheme();return <CustomerPressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress}
  style={{minHeight:44,paddingHorizontal:12,paddingVertical:10,borderRadius:8,borderWidth:1,borderColor:selected?theme.accent:theme.border,backgroundColor:selected?theme.accentLight:theme.surfaceCard,flexDirection:'row',alignItems:'center',gap:7}}>
  {!!icon&&<Ionicons name={icon} size={16} color={theme.textPrimary}/>}<CustomerText style={{fontSize:12,fontWeight:selected?'600':'400'}}>{title}</CustomerText>
 </CustomerPressable>;
}

export function CustomerFrame({title,subtitle,navigation,activeRoute,headerRight,children,back,contentWidth=1200}){
 const {theme}=useTheme(),auth=useAuth()||{}, {width,fontScale}=useWindowDimensions(),{desktop}=customerLayout(width,fontScale);
 const state=navigation?.getState?.(),route=state?.routes?.[state.index]?.name;
 const active=customerActiveRoute(activeRoute||route||'Discover');
 const tabs=<View style={{flexShrink:0,borderTopWidth:1,borderColor:theme.border,backgroundColor:theme.surfaceCanvas}}><View accessibilityRole="tablist" accessibilityLabel="Customer navigation" style={s.tabs}>{customerTabs.map(tab=><CustomerPressable key={tab.route} accessibilityRole="tab" accessibilityLabel={tab.label==='Requests'?'My Requests':tab.label} accessibilityState={{selected:active===tab.route}} {...(Platform.OS==='web'?{'aria-selected':active===tab.route}:{})} onPress={()=>{if(active!==tab.route||route!==tab.route)navigation?.navigate(tab.route);}}
  style={[s.tab,{borderTopWidth:2,borderTopColor:active===tab.route?theme.accent:'transparent'},active===tab.route&&{backgroundColor:theme.accentLight}]}>
  <Ionicons name={tab.icon} size={20} color={active===tab.route?theme.accent:theme.textSecondary}/>
  <CustomerText style={{fontSize:11,lineHeight:16,fontWeight:active===tab.route?'600':'400',color:active===tab.route?theme.textPrimary:theme.textSecondary}}>{tab.label}</CustomerText>
 </CustomerPressable>)}</View></View>;
 return <SafeAreaView edges={['top','bottom','left','right']} style={{flex:1,minHeight:0,backgroundColor:theme.surfaceCanvas}}>
  {desktop&&<View style={{borderBottomWidth:1,borderColor:theme.border}}><View style={s.masthead}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><LogoMark size={34}/><CustomerText style={{fontSize:16,fontWeight:'700'}}>PimpMyRide</CustomerText></View></View></View>}
  <View style={[s.body,{maxWidth:contentWidth}]}>
   <View style={[s.header,{paddingHorizontal:width>=768?24:16}]}>
    {!!back&&<CustomerAction title="Go back" icon="arrow-back" iconOnly onPress={()=>navigation?.canGoBack?.()?navigation.goBack():navigation?.navigate(customerTabs.some(tab=>tab.route===active)?active:'Discover')}/>}
    {!desktop&&!back&&<LogoMark size={34}/>}
    <View style={{flex:1,minWidth:0,gap:3}}><CustomerText accessibilityRole="header" style={{fontSize:desktop?30:24,lineHeight:desktop?39:32,fontWeight:'600',letterSpacing:-.6}}>{title}</CustomerText>{!!subtitle&&<CustomerText muted style={{fontSize:13}}>{subtitle}</CustomerText>}</View>
    <View style={{flexDirection:'row',gap:2,alignItems:'center'}}>{headerRight||<><CustomerAction title="Notifications" icon="notifications-outline" iconOnly onPress={()=>navigation?.navigate('Notifications')}/><CustomerAction title="Messages" icon="chatbubbles-outline" iconOnly onPress={()=>navigation?.navigate('Messages')}/></>}</View>
   </View>
   {!!auth.offline&&<View style={{padding:12,marginHorizontal:16,borderRadius:8,backgroundColor:theme.surfaceMuted}}><CustomerText accessibilityRole="status" muted>Offline · Displayed information may be outdated.{auth.cachedAt ? ` Account preview saved ${new Date(auth.cachedAt).toLocaleString()}.` : ''} Connect to refresh or save changes.</CustomerText></View>}
   {children}
  </View>
  {tabs}
 </SafeAreaView>;
}
export function CustomerPage({title,subtitle,navigation,children,headerRight,activeRoute,maxWidth,keyboard=true,back,...scrollProps}){
 const {width}=useWindowDimensions();
 return <CustomerFrame {...{title,subtitle,navigation,headerRight,activeRoute,back}}>
  <KeyboardAvoidingView enabled={keyboard} style={{flex:1}} behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined}>
   <ScrollView {...scrollProps} style={{flex:1}} contentContainerStyle={{paddingHorizontal:width>=768?24:16,paddingBottom:28,gap:18,width:'100%',maxWidth:maxWidth||1200,alignSelf:'center'}} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} scrollEventThrottle={16}>{children}</ScrollView>
  </KeyboardAvoidingView>
 </CustomerFrame>;
}

// Native Modal supplies native focus semantics. Web additionally traps Tab,
// supports Escape and restores focus to the invoking control on dismissal.
export function CustomerModal({children,visible,onRequestClose,...props}){
 const customer=useCustomerExperience(),panel=useRef(null),close=useRef(onRequestClose);close.current=onRequestClose;
 const [reducedMotion,setReducedMotion]=useState(true);
 useEffect(()=>{if(!customer)return;let mounted=true;AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)setReducedMotion(value);}).catch(()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);return()=>{mounted=false;listener.remove();};},[customer]);
 useEffect(()=>{
  if(!customer||!visible||Platform.OS!=='web'||typeof document==='undefined')return;
  const previous=document.activeElement;
  const controls=()=>Array.from(panel.current?.querySelectorAll?.('button,[role="button"],[href],input,textarea,[tabindex="0"]')||[]).filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length);
  const timer=setTimeout(()=>controls()[0]?.focus(),0);
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();close.current?.();}if(event.key==='Tab'){const list=controls(),index=list.indexOf(document.activeElement);if(list.length&&(event.shiftKey&&index<=0||!event.shiftKey&&index===list.length-1)){event.preventDefault();list[event.shiftKey?list.length-1:0].focus();}}};
  document.addEventListener('keydown',keydown);
  return()=>{clearTimeout(timer);document.removeEventListener('keydown',keydown);previous?.focus?.();};
 },[customer,visible]);
 return <Modal {...props} animationType={customer&&reducedMotion?'none':props.animationType} visible={visible} onRequestClose={onRequestClose}>{customer?<View ref={panel} style={{flex:1}}>{children}</View>:children}</Modal>;
}
const s=StyleSheet.create({
 body:{flex:1,minHeight:0,width:'100%',alignSelf:'center'},masthead:{width:'100%',maxWidth:1200,alignSelf:'center',paddingHorizontal:24,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:20},
 header:{flexDirection:'row',alignItems:'center',gap:10,paddingTop:22,paddingBottom:20},tabs:{width:'100%',maxWidth:640,alignSelf:'center',flexDirection:'row',gap:2,padding:6},tab:{flex:1,minHeight:56,minWidth:0,paddingVertical:7,paddingHorizontal:3,gap:3,alignItems:'center',justifyContent:'center',borderRadius:8},
});
