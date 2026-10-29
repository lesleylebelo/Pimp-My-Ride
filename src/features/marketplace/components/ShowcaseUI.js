import ShopBottomNavigation from './ShopBottomNavigation';
import React from 'react';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import {Image,KeyboardAvoidingView,Platform,Pressable,ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text,ownerTabs,shopTabs} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../../auth/context/AuthContext';
import {ownerRoutes,shopRoutes} from './MarketplaceUI';
import {CustomerPage,CustomerAction,useCustomerExperience} from '../../customer/components/CustomerUI';

export const showcaseStyles=t=>({
 title:{fontSize:28,lineHeight:36,color:t.textPrimary},heading:{fontSize:19,lineHeight:28,color:t.textPrimary},body:{fontSize:15,lineHeight:24,color:t.textPrimary},muted:{fontSize:13,lineHeight:21,color:t.textSecondary},
 section:{padding:20,borderRadius:22,backgroundColor:t.surfaceCard,gap:16},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12},copy:{flex:1,minWidth:120,gap:5},
 chip:{paddingHorizontal:12,paddingVertical:9,borderRadius:14,backgroundColor:t.surfaceMuted,color:t.textPrimary},photo:{width:'100%',aspectRatio:4/3,borderRadius:16,backgroundColor:t.surfaceMuted},
});
export function ShowcasePage({title,navigation,children,showTabs=false,keyboard=false,...scrollProps}){
 const {theme:t}=useTheme(),{profile,offline}=useAuth(),shop=profile?.role==='shop',routes=shop?shopRoutes:ownerRoutes;
 const customer=useCustomerExperience();
 if(customer)return <CustomerPage {...scrollProps} title={title} navigation={navigation} back={!showTabs} keyboard={keyboard}>{children}</CustomerPage>;
 return <SafeAreaView style={{flex:1,backgroundColor:t.surfaceCanvas}} edges={['top','bottom','left','right']}><KeyboardAvoidingView style={{flex:1}} enabled={keyboard} behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined}><View style={{flex:1,width:'100%',maxWidth:1080,alignSelf:'center'}}>
 <View style={{padding:20,flexDirection:'row',gap:14,alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>navigation.canGoBack?.()===false?navigation.navigate(shop?'ShopJobs':'Discover'):navigation.goBack?.()} style={{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:24,backgroundColor:t.surfaceMuted}}><Ionicons name="arrow-back" size={23} color={t.textPrimary}/></Pressable><Text accessibilityRole="header" weight="semibold" style={[showcaseStyles(t).title,{flex:1}]}>{title}</Text></View>
 <ScrollView {...scrollProps} style={{flex:1}} contentContainerStyle={{paddingHorizontal:20,paddingBottom:32,gap:20}} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} scrollEventThrottle={16}>{offline&&<Text accessibilityRole="status" style={showcaseStyles(t).muted}>Offline · Displayed information may be outdated. Connect to refresh or save changes.</Text>}{children}</ScrollView>
 {showTabs&&(shop?<ShopBottomNavigation tabs={shopTabs} active="My Shop" onTabPress={label=>navigation.navigate(routes[label])}/>:<View accessibilityRole="tablist" style={{flexDirection:'row',borderTopWidth:1,borderColor:t.divider}}>{(shop?shopTabs:ownerTabs).map(tab=><Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:shop?tab.label==='My Shop':tab.label==='Discover'}} onPress={()=>navigation.navigate(routes[tab.label])} style={{flex:1,minHeight:56,padding:8,alignItems:'center',justifyContent:'center'}}><Ionicons name={({Discover:"compass-outline",Garage:"car-outline","My Requests":"document-text-outline",Bookings:"calendar-outline",Profile:"person-outline","Find Jobs":"compass-outline",Requests:"document-text-outline",Quotes:"receipt-outline","My Shop":"storefront-outline"})[tab.label]} size={22} color={t.textSecondary}/><Text style={{fontSize:11,lineHeight:17,color:t.textPrimary,textAlign:"center"}}>{tab.label}</Text></Pressable>)}</View>)}
 </View></KeyboardAvoidingView></SafeAreaView>;
}
export function WorkshopIdentity({shop={},own=false}){
 const {theme:t}=useTheme(),s=showcaseStyles(t),[failed,setFailed]=React.useState(false);
 React.useEffect(()=>setFailed(false),[shop.avatar]);
 return <View style={s.section}><View style={s.row}><ProfileAvatar context={own?"self":"shop"} id={own?undefined:shop.id} revision={shop.profilePhotoRevision} enabled={own||!!shop.id} shop size={72}/><View style={s.copy}><Text style={s.muted}>{own?'YOUR WORKSHOP':'WORKSHOP'}</Text><Text accessibilityRole="header" weight="semibold" style={s.title}>{shop.name||'Workshop'}</Text>{!!(shop.city||shop.province)&&<Text style={s.muted}>{[shop.city,shop.province].filter(Boolean).join(' · ')}</Text>}</View></View>
 {shop.verificationStatus==='approved'&&<View style={s.row}><Ionicons name="checkmark-circle" size={20} color={t.accent}/><Text style={s.body}>Verified workshop</Text></View>}
 {own&&shop.verificationStatus&&shop.verificationStatus!=='approved'&&<Text style={s.body}>Verification: {shop.verificationStatus}</Text>}
 </View>;
}
export function ShowcaseEmpty({children}){const {theme:t}=useTheme();return <View style={[showcaseStyles(t).section,{alignItems:'center',padding:32}]}><Ionicons name="images-outline" size={36} color={t.textSecondary}/><Text style={showcaseStyles(t).muted}>{children}</Text></View>;}
export function ShowcaseAction({title,onPress,disabled=false,outline=false,icon}){const {theme:t}=useTheme(),customer=useCustomerExperience();if(customer)return <CustomerAction {...{title,onPress,disabled,outline,icon}} primary={!outline}/>;return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:48,padding:14,borderRadius:14,backgroundColor:outline?t.surfaceMuted:t.accent,opacity:disabled ? 0.5 : pressed ? 0.75 : 1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8})}>{!!icon&&<Ionicons name={icon} size={20} color={outline?t.textPrimary:'#101208'}/>}<Text weight="semibold" style={{color:outline?t.textPrimary:'#101208',fontSize:14,lineHeight:22,textAlign:'center'}}>{title}</Text></Pressable>;}
