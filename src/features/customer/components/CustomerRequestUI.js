import React,{useState} from 'react';
import {View,useWindowDimensions} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {CustomerPage,CustomerCard,CustomerText,CustomerAction,CustomerPressable,CustomerModal,CustomerState} from './CustomerUI';
import PrivatePhoto from '../../marketplace/components/PrivatePhoto';
import {Notice,formatMoney} from '../../marketplace/components/MarketplaceUI';

export const requestStatusLabel=status=>({open:'Open for quotations',booked:'Quotation accepted',closed:'Closed request'})[status]||'Status unavailable';
export const requestVehicleLabel=vehicle=>vehicle&&[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')||'Vehicle details unavailable';
export const requestResponseLabel=count=>Number.isSafeInteger(count)&&count>=0?`${count} submitted quotation${count===1?'':'s'}`:null;
export const requestDate=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleDateString():null;

export function RequestPage({form=false,back=false,...props}){
 return <CustomerPage {...props} activeRoute="OwnerRequests" back={back} maxWidth={form?760:1040}/>;
}
export function RequestAction({style,...props}){return <CustomerAction {...props} style={[{alignSelf:'stretch'},style]}/>;}
export function RequestSection({title,description,children,...props}){
 return <CustomerCard {...props} style={[{padding:16,gap:14},props.style]}>
  {!!title&&<CustomerText heading accessibilityRole="header">{title}</CustomerText>}
  {!!description&&<CustomerText muted>{description}</CustomerText>}{children}
 </CustomerCard>;
}
export function RequestStatus({status}){
 const {theme}=useTheme();
 return <View style={{alignSelf:'flex-start',maxWidth:'100%',paddingVertical:6,paddingHorizontal:10,borderRadius:8,backgroundColor:status==='open'?theme.accentLight:theme.surfaceMuted}}>
  <CustomerText style={{fontSize:12,fontWeight:'600'}}>{requestStatusLabel(status)}</CustomerText>
 </View>;
}
export function RequestGrid({children}){
 const {width,fontScale}=useWindowDimensions(),[measured,setMeasured]=useState(0);
 const available=Math.min(measured||Infinity,Math.min(width-(width>=768?48:32),992));
 const cardWidth=fontScale<1.4&&available>=700?Math.floor((available-18)/2):'100%';
 return <View testID="customer-request-grid" onLayout={event=>{if(event.nativeEvent.layout.width>0)setMeasured(event.nativeEvent.layout.width);}} style={{flexDirection:'row',flexWrap:'wrap',gap:18,width:'100%',alignItems:'flex-start'}}>
  {React.Children.toArray(children).map(child=><View key={child.key} style={{width:cardWidth,minWidth:0}}>{child}</View>)}
 </View>;
}
export function RequestListCard({request,navigation,disabled}){
 const {theme}=useTheme(),responses=requestResponseLabel(request.quotationCount),open=request.status==='open';
 const navigate=(route,params)=>{if(!disabled)navigation.navigate(route,params);};
 return <RequestSection testID={`customer-request-${request.id}`}>
  <CustomerText heading accessibilityRole="header">{request.title||'Service request'}</CustomerText>
  <RequestStatus status={request.status}/>
  <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><Ionicons name="car-sport-outline" size={19} color={theme.textSecondary}/><CustomerText style={{flex:1}}>{requestVehicleLabel(request.vehicle)}</CustomerText></View>
  {!!request.description&&<CustomerText muted numberOfLines={3}>{request.description}</CustomerText>}
  {!!request.photoIds?.length&&<View style={{minHeight:128,backgroundColor:theme.surfaceMuted,borderRadius:8,overflow:'hidden'}}><PrivatePhoto target="request" id={request.id} accessibilityLabel={`Private photo for ${request.title||'service request'}`} imageStyle={{height:128,borderRadius:8}}/></View>}
  <CustomerText muted>{[request.categoryName,request.city].filter(Boolean).join(' · ')||'Service details unavailable'}</CustomerText>
  <CustomerText muted>{formatMoney(request.budgetMinCents)} – {formatMoney(request.budgetMaxCents)}</CustomerText>
  <CustomerText muted>{request.visibility==='direct'?'Audience: one selected workshop':request.visibility==='open'?'Audience: approved workshops':'Audience unavailable'}</CustomerText>
  {responses&&<CustomerText>{responses}</CustomerText>}
  <RequestAction title={`View ${request.title||'service request'}`} displayTitle="View request" icon="document-text-outline" primary disabled={disabled} onPress={()=>navigate('OwnerRequest',{id:request.id})}/>
  {open&&<View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
   <RequestAction title={`Edit ${request.title||'service request'}`} displayTitle="Edit request" icon="create-outline" disabled={disabled} style={{flexGrow:1,flexBasis:140}} onPress={()=>navigate('RequestForm',{request})}/>
   {Number.isSafeInteger(request.quotationCount)&&request.quotationCount>0&&<RequestAction title={`View quotations for ${request.title||'service request'}`} displayTitle="View quotations" icon="reader-outline" disabled={disabled} style={{flexGrow:1,flexBasis:140}} onPress={()=>navigate('QuoteComparison',{id:request.id})}/>}
  </View>}
 </RequestSection>;
}
export function RequestOptions({title,state,feed,selected,onSelect,label,disabled,onLayout}){
 const {theme}=useTheme();
 return <RequestSection title={title} description={['Vehicle','Service category'].includes(title)?'Required':undefined} onLayout={onLayout}>
  <Notice busy={state.busy} error={state.error}/>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{feed.items.map(item=>{
   const active=selected===item.id,blocked=disabled||state.busy;
   return <CustomerPressable key={item.id} accessibilityRole="button" accessibilityLabel={`${active?'Selected: ':''}${label(item)}`} accessibilityState={{selected:active,disabled:blocked}} disabled={blocked} onPress={()=>{if(!blocked)onSelect(item);}}
    style={{minHeight:48,maxWidth:'100%',paddingHorizontal:12,paddingVertical:12,borderRadius:8,borderWidth:1,borderColor:active?theme.accent:theme.border,backgroundColor:active?theme.accentLight:theme.surfaceMuted,flexDirection:'row',alignItems:'center',gap:8}}>
    <CustomerText style={{flexShrink:1,fontSize:13,fontWeight:active?'600':'400'}}>{label(item)}</CustomerText>{active&&<Ionicons name="checkmark-circle" size={18} color={theme.accent}/>}
   </CustomerPressable>;
  })}</View>
  {state.data&&!state.busy&&!state.error&&!feed.items.length&&<CustomerText muted>{title==='Service category'?'No active service categories are available.':title==='Vehicle'?'No active vehicles loaded. Add a vehicle or refresh your Garage.':'No eligible workshops loaded.'}</CustomerText>}
  <RequestAction title={`Refresh ${title.toLowerCase()}`} icon="refresh-outline" disabled={disabled||state.busy} onPress={()=>{if(!disabled&&!state.busy)void state.refresh().catch(()=>{});}}/>
  {state.busy&&!!feed.items.length&&<CustomerText muted>Loading more options...</CustomerText>}
 </RequestSection>;
}
export function RequestAudience({title,selected,disabled,onPress}){
 const {theme}=useTheme();
 return <CustomerPressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{selected,disabled}} disabled={disabled} onPress={()=>{if(!disabled)onPress();}}
  style={{minHeight:48,maxWidth:'100%',padding:12,borderRadius:8,borderWidth:1,borderColor:selected?theme.accent:theme.border,backgroundColor:selected?theme.accentLight:theme.surfaceMuted}}><CustomerText style={{fontSize:13,fontWeight:selected?'600':'400'}}>{title}</CustomerText></CustomerPressable>;
}
export function RequestDiscard({action,onKeep,onDiscard}){
 const {theme}=useTheme();
 return <CustomerModal visible={!!action} transparent animationType="fade" onRequestClose={onKeep}>
  <View style={{flex:1,padding:20,justifyContent:'center',alignItems:'center',backgroundColor:'#000000AA'}}>
   <RequestSection title="Discard request changes?" style={{width:'100%',maxWidth:440,backgroundColor:theme.surfaceCard}} accessibilityViewIsModal>
    <CustomerText muted>Your changes have not been saved. Uploaded private photos are not published as a request until you submit it.</CustomerText>
    <RequestAction title="Keep editing" onPress={onKeep}/><RequestAction title="Discard changes" danger onPress={onDiscard}/>
   </RequestSection>
  </View>
 </CustomerModal>;
}
export {CustomerText as RequestText,CustomerState as RequestState};
