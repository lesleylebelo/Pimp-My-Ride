import React, {useState} from 'react';
import {KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text, ownerTabs, shopTabs} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {formatMoney, ownerRoutes, shopRoutes} from './MarketplaceUI';

export function QuotationPage({title, subtitle, navigation, children, keyboard=false, maxWidth, onScroll, onLayout, onContentSizeChange}) {
 const {profile}=useAuth(),{theme}=useTheme(),s=quotationStyles(theme),shop=profile?.role==='shop',routes=shop?shopRoutes:ownerRoutes;
 const state=navigation.getState?.(),route=state?.routes?.[state.index]?.name;
 const active=Object.keys(routes).find(label=>routes[label]===route)||(shop?'Quotes':'My Requests');
 return <SafeAreaView style={s.safe} edges={['top','bottom','left','right']}><KeyboardAvoidingView style={s.flex} enabled={keyboard} behavior={Platform.OS==='ios'?'padding':Platform.OS==='android'?'height':undefined}><View style={[s.page,maxWidth&&{maxWidth}]}>
  <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" style={s.back} onPress={()=>navigation.canGoBack?.()===false?navigation.navigate(shop?'ShopQuotes':'OwnerRequests'):navigation.goBack?.()}><Ionicons name="arrow-back" size={22} color={theme.textPrimary}/></Pressable><View style={s.copy}><Text accessibilityRole="header" weight="displaySemi" style={s.title}>{title}</Text>{!!subtitle&&<Text style={s.muted}>{subtitle}</Text>}</View></View>
  <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'} onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} scrollEventThrottle={16}>{children}</ScrollView>
  <View accessibilityRole="tablist" style={s.tabs}>{(shop?shopTabs:ownerTabs).map(tab=><Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:active===tab.label}} style={s.tab} onPress={()=>navigation.navigate(routes[tab.label])}><Ionicons name={({Discover:'compass-outline',Garage:'car-outline','My Requests':'document-text-outline',Bookings:'calendar-outline',Profile:'person-outline','Find Jobs':'compass-outline',Requests:'document-text-outline',Quotes:'receipt-outline','My Shop':'storefront-outline'})[tab.label]} size={22} color={active===tab.label?theme.accent:theme.textSecondary}/><Text style={s.tabText}>{tab.label}</Text></Pressable>)}</View>
 </View></KeyboardAvoidingView></SafeAreaView>;
}
export function QuotationAction({title,onPress,disabled=false,outline=false}) {
 const {theme}=useTheme(),s=quotationStyles(theme);
 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[s.action,!outline&&s.primary,disabled&&s.disabled,pressed&&s.pressed]}><Text weight="semibold" style={[s.actionText,!outline&&s.primaryText]}>{title}</Text></Pressable>;
}
export function QuotationSection({children,style,...props}) {const {theme}=useTheme();return <View {...props} style={[quotationStyles(theme).section,style]}>{children}</View>;}
export function QuotationSteps({step=0,customer=false}) {
 const {theme}=useTheme(),s=quotationStyles(theme),labels=customer?['Compare offers','Choose quotation','Confirm next step']:['Build quotation','Review offer','Submitted'];
 return <View style={s.steps}>{labels.map((label,index)=><View key={label} style={[s.step,index===step&&s.currentStep]}><Text style={s.stepText}>{index+1}. {label}</Text></View>)}</View>;
}
export function QuotationEmpty({children}) {const {theme}=useTheme(),s=quotationStyles(theme);return <View style={s.empty}><Ionicons name="document-text-outline" size={38} color={theme.textSecondary}/><Text style={s.muted}>{children}</Text></View>;}
export function quoteStatus(quote) {
 if(quote.status==='submitted'&&typeof quote.validUntil==='number'&&quote.validUntil<=Date.now())return 'Expired';
 return ({submitted:'Submitted',accepted:'Accepted',withdrawn:'Withdrawn',superseded:'Superseded',rejected:'Declined'})[quote.status]||quote.status||'Status unavailable';
}
export const quotationDate=value=>typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})+' SAST':null;

export function QuotationCard({quote,request,children,compact=false,draft=false}) {
 const {theme}=useTheme(),s=quotationStyles(theme),[details,setDetails]=useState(false);
 const context=request||{title:quote.requestTitle,vehicle:quote.vehicle};
 const terms=(full=false)=><>
  {!!quote.scope&&<Text numberOfLines={compact&&!full?3:undefined} style={s.body}>{quote.scope}</Text>}
  {(!compact||full)&&(quote.items||[]).map((item,index)=><View key={index} style={s.priceRow}><Text style={s.lineLabel}>{item.description}</Text><Text style={s.priceValue}>{formatMoney(item.amountCents)}</Text></View>)}
  <View style={s.metaGrid}>
   <View style={s.metric}><Text style={s.muted}>Deposit</Text><Text style={s.value}>{quote.depositType==='none'?'No deposit required':(quote.depositType==='fixed'||quote.depositType==='percentage')&&Number.isSafeInteger(quote.depositAmountCents)?`${formatMoney(quote.depositAmountCents)}${quote.depositType==='percentage'?` (${quote.depositValue}%)`:''}`:'Not specified'}</Text>{(quote.depositType==='fixed'||quote.depositType==='percentage')&&<Text style={s.small}>Required deposit</Text>}</View>
   <View style={s.metric}><Text style={s.muted}>Estimated completion</Text><Text style={s.value}>{Number.isSafeInteger(quote.completionDays)?`${quote.completionDays} working days`:'Not specified'}</Text></View>
   <View style={s.metric}><Text style={s.muted}>Warranty</Text><Text style={s.value}>{quote.warranty||'Not specified'}</Text></View>
   <View style={s.metric}><Text style={s.muted}>{draft?'Offer validity':'Valid until'}</Text><Text style={s.value}>{draft?`${quote.validForDays} days`:quotationDate(quote.validUntil)||'Not specified'}</Text></View>
  </View>
  {full&&<><Text style={s.muted}>Scope coverage: {quote.scopeConfirmed===true?'Full scope confirmed by shop':'Full scope not confirmed'}</Text><Text style={s.muted}>Fees and taxes: {quote.allChargesIncluded===true?'All required charges confirmed':'Not confirmed'}</Text>{(quote.coveredServices||[]).map(service=><Text key={service} style={s.body}>Included: {service}</Text>)}</>}
 </>;
 return <View testID={`quotation-${quote.id||'review'}`} style={s.offer}>
  <View style={s.offerHeader}><View style={s.avatar}><Ionicons name="storefront-outline" size={22} color={theme.textPrimary}/></View><View style={s.copy}><Text weight="semibold" style={s.heading}>{quote.shopName||'Your quotation'}</Text>{!draft&&<Text style={s.status}>{quoteStatus(quote)}</Text>}</View></View>
  <View style={s.priceHeader}><Text style={s.muted}>Total quotation · ZAR</Text><Text weight="semibold" style={s.total}>{formatMoney(quote.totalCents)}</Text></View>
  {quotationDate(quote.updatedAt)&&<Text style={s.small}>Updated: {quotationDate(quote.updatedAt)}</Text>}
  {!quote.updatedAt&&quotationDate(quote.createdAt)&&<Text style={s.small}>Submitted: {quotationDate(quote.createdAt)}</Text>}
  {terms()}
  {!draft&&<QuotationAction title={`View details: ${quote.shopName||'Your quotation'}`} outline onPress={()=>setDetails(true)}/>}
  {children}
  <Modal visible={details} transparent animationType="fade" onRequestClose={()=>setDetails(false)}><View style={s.backdrop}><View accessibilityViewIsModal style={s.dialog}>
   <View style={s.dialogHeader}><Text accessibilityRole="header" weight="semibold" style={s.heading}>Quotation details</Text><QuotationAction title="Close quotation details" outline onPress={()=>setDetails(false)}/></View>
   <ScrollView contentContainerStyle={s.dialogContent}><Text style={s.heading}>{quote.shopName||'Your quotation'}</Text><Text style={s.status}>{quoteStatus(quote)}</Text>{!!context.title&&<Text style={s.heading}>{context.title}</Text>}{!!context.vehicle&&<Text style={s.muted}>{[context.vehicle.year,context.vehicle.make,context.vehicle.model,context.vehicle.colour].filter(Boolean).join(' · ')}</Text>}
    <Text style={s.total}>{formatMoney(quote.totalCents)}</Text>{terms(true)}{Number.isSafeInteger(quote.termsVersion||quote.requestVersion)&&<Text style={s.small}>Request terms revision: {quote.termsVersion||quote.requestVersion}</Text>}
    {quotationDate(quote.createdAt)&&<Text style={s.small}>Submitted: {quotationDate(quote.createdAt)}</Text>}{quotationDate(quote.updatedAt)&&<Text style={s.small}>Updated: {quotationDate(quote.updatedAt)}</Text>}
   </ScrollView>
  </View></View></Modal>
 </View>;
}
export const quotationStyles=theme=>StyleSheet.create({
 flex:{flex:1},safe:{flex:1,backgroundColor:theme.surfaceCanvas},page:{flex:1,width:'100%',maxWidth:1080,alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',gap:14,padding:20},back:{width:44,height:44,borderRadius:22,backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center'},copy:{flex:1,minWidth:0,gap:4},title:{fontSize:26,lineHeight:34,color:theme.textPrimary},content:{paddingHorizontal:20,paddingBottom:28,gap:18},
 tabs:{flexDirection:'row',paddingTop:10,borderTopWidth:1,borderTopColor:theme.divider},tab:{flex:1,minHeight:56,alignItems:'center',paddingHorizontal:2,gap:4},tabText:{fontSize:11,lineHeight:16,color:theme.textSecondary,textAlign:'center'},
 section:{padding:20,borderRadius:20,backgroundColor:theme.surfaceCard,gap:16},heading:{fontSize:18,lineHeight:26,color:theme.textPrimary,fontWeight:'600'},muted:{fontSize:13,lineHeight:21,color:theme.textSecondary},body:{fontSize:14,lineHeight:22,color:theme.textPrimary},small:{fontSize:12,lineHeight:19,color:theme.textSecondary},
 action:{minHeight:48,padding:14,borderRadius:14,backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center'},primary:{backgroundColor:theme.accent},actionText:{fontSize:14,lineHeight:22,color:theme.textPrimary,textAlign:'center'},primaryText:{color:'#101208'},pressed:{opacity:.7},disabled:{opacity:.5},
 steps:{flexDirection:'row',flexWrap:'wrap',gap:8},step:{flexGrow:1,padding:10,borderRadius:12,backgroundColor:theme.surfaceMuted},currentStep:{backgroundColor:theme.accentLight},stepText:{fontSize:12,lineHeight:20,color:theme.textPrimary},
 offer:{padding:20,borderRadius:22,backgroundColor:theme.surfaceCard,gap:16},offerHeader:{flexDirection:'row',alignItems:'center',gap:12},avatar:{width:44,height:44,borderRadius:22,backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center'},status:{fontSize:12,lineHeight:20,color:theme.textPrimary},priceHeader:{gap:5,paddingVertical:6},total:{fontSize:30,lineHeight:40,color:theme.textPrimary,fontWeight:'600'},
 priceRow:{flexDirection:'row',flexWrap:'wrap',gap:12,justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:theme.divider},lineLabel:{flexGrow:1,flexShrink:1,fontSize:14,lineHeight:22,color:theme.textSecondary},priceValue:{fontSize:14,lineHeight:22,color:theme.textPrimary},metaGrid:{flexDirection:'row',flexWrap:'wrap',gap:16},metric:{flexBasis:'44%',flexGrow:1,minWidth:120,gap:4},value:{fontSize:14,lineHeight:22,color:theme.textPrimary},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:18},gridCell:{width:'100%'},wideCell:{width:'48%',flexGrow:1,maxWidth:'50%'},lineItem:{padding:16,borderRadius:14,backgroundColor:theme.surfaceMuted,gap:8},quote:{gap:14},empty:{padding:36,alignItems:'center',gap:14,borderRadius:20,backgroundColor:theme.surfaceCard},
 backdrop:{flex:1,backgroundColor:'#000000AA',padding:20,alignItems:'center',justifyContent:'center'},dialog:{width:'100%',maxWidth:700,maxHeight:'90%',borderRadius:22,backgroundColor:theme.surfaceCanvas,overflow:'hidden'},dialogHeader:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',padding:16,gap:10},dialogContent:{padding:20,gap:18},error:{fontSize:13,lineHeight:21,color:theme.error},
});
