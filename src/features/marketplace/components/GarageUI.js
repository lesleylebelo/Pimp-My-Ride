import React from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text, ownerTabs} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {ownerRoutes} from './MarketplaceUI';

export function GaragePage({title, subtitle, navigation, children, tabs=false, keyboard=false, onScroll, onLayout, onContentSizeChange, refreshControl}) {
  const {theme} = useTheme(), s = garageStyles(theme);
  return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}>
    <KeyboardAvoidingView style={s.flex} enabled={keyboard} behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined}>
      <View style={s.page}>
        <View style={s.header}>
          {!tabs && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>navigation.canGoBack?.()===false?navigation.navigate('Garage'):navigation.goBack()} style={s.back}><Ionicons name="arrow-back" size={22} color={theme.textPrimary}/></Pressable>}
          <View style={s.headerCopy}><Text accessibilityRole="header" weight="displaySemi" style={s.title}>{title}</Text>{!!subtitle&&<Text style={s.secondary}>{subtitle}</Text>}</View>
        </View>
        <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'}
          onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={16} refreshControl={refreshControl}>{children}</ScrollView>
        {tabs&&<View accessibilityRole="tablist" style={s.tabs}>{ownerTabs.map(tab=><Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:tab.label==='Garage'}} onPress={()=>navigation.navigate(ownerRoutes[tab.label])} style={s.tab}>
          <Ionicons name={({Discover:'compass-outline',Garage:'car-outline','My Requests':'document-text-outline',Bookings:'calendar-outline',Profile:'person-outline'})[tab.label]} size={22} color={tab.label==='Garage'?theme.accent:theme.textSecondary}/><Text style={[s.tabText,tab.label==='Garage'&&{color:theme.textPrimary}]}>{tab.label}</Text>
        </Pressable>)}</View>}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function GarageAction({title,icon,onPress,disabled=false,primary=false}) {
  const {theme,isDark}=useTheme(),s=garageStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[s.action,primary&&s.primary,disabled&&s.disabled,pressed&&s.pressed]}>
    {!!icon&&<Ionicons name={icon} size={18} color={primary?'#101208':isDark?theme.accent:'#526D12'}/>}
    <Text weight="semibold" style={[s.actionText,{color:primary?'#101208':isDark?theme.accent:'#526D12'}]}>{title}</Text>
  </Pressable>;
}
export const garageStyles=theme=>StyleSheet.create({
  flex:{flex:1},safe:{flex:1,backgroundColor:theme.surfaceCanvas},page:{flex:1,width:'100%',maxWidth:1120,alignSelf:'center'},
  header:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:20,gap:14},headerCopy:{flex:1,minWidth:0,gap:5},title:{fontSize:28,lineHeight:36,color:theme.textPrimary},secondary:{fontSize:14,lineHeight:22,color:theme.textSecondary},
  back:{width:44,height:44,borderRadius:22,backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center'},content:{paddingHorizontal:20,paddingBottom:28,gap:20},
  tabs:{flexDirection:'row',borderTopWidth:1,borderTopColor:theme.divider,paddingTop:12,backgroundColor:theme.surfaceCanvas},tab:{flex:1,minHeight:56,alignItems:'center',paddingHorizontal:2,gap:5},tabText:{fontSize:11,lineHeight:16,color:theme.textSecondary,textAlign:'center'},
  action:{minHeight:48,paddingVertical:12,paddingHorizontal:14,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:theme.surfaceMuted},primary:{backgroundColor:theme.accent},actionText:{fontSize:14,lineHeight:22,flexShrink:1,textAlign:'center'},disabled:{opacity:.5},pressed:{opacity:.7},
  toolbar:{flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between'},intro:{flex:1,minWidth:180,gap:6},eyebrow:{fontSize:11,lineHeight:18,color:theme.textSecondary,letterSpacing:1.8},sectionTitle:{fontSize:20,lineHeight:28,color:theme.textPrimary},
  filters:{flexDirection:'row',flexWrap:'wrap',gap:8},filter:{minHeight:44,paddingVertical:10,paddingHorizontal:16,borderRadius:24,backgroundColor:theme.surfaceMuted},filterSelected:{backgroundColor:theme.accentLight},filterText:{fontSize:13,lineHeight:22,color:theme.textPrimary},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:20},vehicleCard:{width:'100%',backgroundColor:theme.surfaceCard,borderRadius:24,overflow:'hidden'},desktopCard:{width:'48%',flexGrow:1,maxWidth:'50%'},cover:{height:250,backgroundColor:theme.surfaceMuted,overflow:'hidden',justifyContent:'center'},coverPlaceholder:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'center',gap:12},placeholderText:{fontSize:12,lineHeight:18,color:theme.textSecondary},coverImage:{height:250,borderRadius:0},
  cardBody:{padding:20,gap:12},vehicleTitle:{fontSize:23,lineHeight:31,color:theme.textPrimary},specLine:{fontSize:14,lineHeight:22,color:theme.textSecondary},cardActions:{flexDirection:'row',flexWrap:'wrap',gap:10},actionCell:{flexGrow:1,flexBasis:150},
  empty:{paddingVertical:44,paddingHorizontal:24,alignItems:'center',gap:16,borderRadius:24,backgroundColor:theme.surfaceCard},emptyTitle:{fontSize:22,lineHeight:30,color:theme.textPrimary,textAlign:'center'},emptyBody:{fontSize:14,lineHeight:22,color:theme.textSecondary,textAlign:'center',maxWidth:360},
  backdrop:{flex:1,padding:20,backgroundColor:'#000000AA',alignItems:'center',justifyContent:'center'},detailPanel:{width:'100%',maxWidth:680,maxHeight:'90%',backgroundColor:theme.surfaceCanvas,borderRadius:24,overflow:'hidden'},detailHeader:{paddingHorizontal:20,paddingTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},detailContent:{padding:20,gap:20},detailHeading:{flex:1,fontSize:18,lineHeight:26,color:theme.textPrimary},
  specGrid:{flexDirection:'row',flexWrap:'wrap',gap:16},spec:{flexBasis:'44%',flexGrow:1,gap:4,minWidth:120},specValue:{fontSize:16,lineHeight:24,color:theme.textPrimary},
  form:{width:'100%',maxWidth:720,alignSelf:'center',gap:20},formSection:{padding:20,borderRadius:20,backgroundColor:theme.surfaceCard,gap:16},fields:{flexDirection:'row',flexWrap:'wrap',columnGap:20},fieldCell:{width:'100%'},wideField:{width:'47%',flexGrow:1},validation:{padding:16,borderRadius:14,backgroundColor:theme.errorSurface,gap:6},error:{fontSize:13,lineHeight:20,color:theme.error},privacy:{flexDirection:'row',alignItems:'flex-start',gap:10,padding:16,borderRadius:16,backgroundColor:theme.surfaceMuted},privacyText:{flex:1,minWidth:0,fontSize:13,lineHeight:21,color:theme.textSecondary},
});
