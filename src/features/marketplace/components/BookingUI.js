import React from 'react';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import {StyleSheet, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {QuotationPage, QuotationAction, QuotationSection} from './QuotationUI';

export const isSimulatedBooking=booking=>booking?.simulated===true&&booking?.testTransaction===true&&booking?.paymentProvider==='mock'&&(booking.paymentAccountingMode===undefined||booking.paymentAccountingMode==='simulated');

export const bookingStatusLabels={pending_payment:'Payment pending',pending_confirmation:'Awaiting shop confirmation',confirmed:'Confirmed',cancelled:'Cancelled'};
export const bookingStatusLabel=value=>bookingStatusLabels[value]||value||'Status not recorded';
export const serviceStatusLabel=value=>({not_started:'Not started',completed:'Completed'})[value]||value||'Not recorded';
export const paymentChoiceLabel=value=>({pay_in_store:'Pay at shop',pay_deposit:'Deposit online',pay_now:'Full payment online'})[value]||'Not recorded';
export function BookingPage(props){return <QuotationPage {...props} activeTab="Bookings"/>;}
export const BookingAction=QuotationAction;
export const BookingSection=QuotationSection;

export function BookingProgress({booking,choice=false,reviewing=false}){
 const {theme}=useTheme(),s=bookingStyles(theme);
 if(booking?.status==='cancelled')return <Text style={s.muted}>Cancelled booking · retained in history</Text>;
 const labels=choice?['Choose method','Review choice','Open booking']:['Quotation accepted','Appointment confirmed','Service completed'];
 const index=choice?(reviewing?1:0):booking?.serviceStatus==='completed'?2:booking?.status==='confirmed'?1:0;
 return <View accessibilityLabel={choice?'Booking handoff progress':'Booking progress'} style={s.steps}>{labels.map((label,i)=><View key={label} style={[s.step,index===i&&s.currentStep]}><Text style={s.stepText}>{i+1}. {label}</Text></View>)}</View>;
}
export function AppointmentInfo({booking}){
 const {theme}=useTheme(),s=bookingStyles(theme),complete=!!booking.appointmentDate&&!!booking.appointmentTime;
 return <View style={s.infoRow}><Ionicons name="calendar-outline" size={20} color={theme.textSecondary}/><View style={s.copy}>
  <Text style={s.eyebrow}>APPOINTMENT</Text>
  <Text style={s.value}>{complete?`${booking.appointmentDate} at ${booking.appointmentTime} SAST (UTC+02:00)`:booking.appointmentDate||booking.appointmentTime?'Appointment details incomplete':'Appointment not scheduled'}</Text>
  {!complete&&!!booking.appointmentDate&&<Text style={s.muted}>Date: {booking.appointmentDate}</Text>}
  {!complete&&!!booking.appointmentTime&&<Text style={s.muted}>Time: {booking.appointmentTime} SAST</Text>}
 </View></View>;
}
export function BookingOverview({booking,detail=false}){
 const {profile}=useAuth(),{theme}=useTheme(),s=bookingStyles(theme);
 const status=bookingStatusLabel(booking.status),vehicle=[booking.vehicle?.year,booking.vehicle?.make,booking.vehicle?.model].filter(Boolean).join(' ');
 return <>
  <View style={s.statusRow}><View style={[s.status,booking.status==='confirmed'&&s.confirmedStatus,booking.status==='cancelled'&&s.cancelledStatus]}><Ionicons name={booking.status==='confirmed'?'checkmark-circle-outline':booking.status==='cancelled'?'close-circle-outline':'time-outline'} size={18} color={theme.textPrimary}/><Text weight="semibold" style={s.statusText}>{status}</Text></View>
   {booking.serviceStatus==='completed'&&<Text style={s.secondaryStatus}>Service completed</Text>}
  </View>
  <Text accessibilityRole={detail?'header':undefined} weight="semibold" style={detail?s.hero:s.heading}>{booking.requestTitle||'Service booking'}</Text>
  {!!vehicle&&<View style={s.infoRow}><Ionicons name="car-sport-outline" size={22} color={theme.textSecondary}/><Text style={[s.value,s.copy]}>{vehicle}{detail&&booking.vehicle?.colour?` · ${booking.vehicle.colour}`:''}</Text></View>}
  <View style={s.infoRow}><ProfileAvatar context={profile?.role==='shop'?'request':'shop'} id={profile?.role==='shop'?booking.serviceRequestId:booking.shopId} enabled={profile?.role==='shop'?!!booking.customerName&&booking.customerName!=='Customer'&&!!booking.serviceRequestId:!!booking.shopName&&!!booking.shopId} shop={profile?.role!=='shop'} size={40}/><View style={s.copy}>
   <Text style={s.eyebrow}>{profile?.role==='shop'?'CUSTOMER':'WORKSHOP'}</Text><Text style={s.value}>{profile?.role==='shop'?booking.customerName||'Customer name not provided':booking.shopName||'Workshop name not provided'}</Text>
   {profile?.role==='shop'&&!!booking.shopName&&<Text style={s.muted}>Workshop: {booking.shopName}</Text>}
  </View></View>
  {!!(booking.categoryName||booking.city)&&<Text style={s.muted}>{[booking.categoryName,booking.city].filter(Boolean).join(' · ')}</Text>}
  <AppointmentInfo booking={booking}/>
  {detail&&<Text style={s.muted}>Service status: {serviceStatusLabel(booking.serviceStatus)}</Text>}
 </>;
}
export function BookingEmpty(){const {theme}=useTheme(),s=bookingStyles(theme);return <View style={s.empty}><Ionicons name="calendar-outline" size={44} color={theme.textSecondary}/><Text weight="semibold" style={s.heading}>No bookings yet.</Text><Text style={s.emptyText}>A booking is created when a customer accepts a quotation through the existing confirmation flow.</Text></View>;}
export function BookingHandoffContext({quote}){
 const {theme}=useTheme(),s=bookingStyles(theme),vehicle=[quote.vehicle?.year,quote.vehicle?.make,quote.vehicle?.model].filter(Boolean).join(' ');
 return <>{!!quote.requestTitle&&<Text style={s.heading}>{quote.requestTitle}</Text>}{!!vehicle&&<Text style={s.muted}>{vehicle}</Text>}<Text style={s.muted}>Review your selected quotation and existing payment choice. The booking appears only after backend confirmation.</Text></>;
}
export const bookingStyles=theme=>StyleSheet.create({
 heading:{fontSize:19,lineHeight:28,color:theme.textPrimary,fontWeight:'600'},hero:{fontSize:26,lineHeight:35,color:theme.textPrimary},muted:{fontSize:13,lineHeight:21,color:theme.textSecondary},value:{fontSize:15,lineHeight:23,color:theme.textPrimary},eyebrow:{fontSize:10,lineHeight:17,letterSpacing:1.4,color:theme.textSecondary},copy:{flex:1,minWidth:0,gap:3},
 infoRow:{flexDirection:'row',alignItems:'flex-start',gap:12},statusRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:10},status:{flexDirection:'row',alignItems:'center',gap:7,paddingVertical:8,paddingHorizontal:12,borderRadius:12,backgroundColor:theme.surfaceMuted,flexShrink:1},confirmedStatus:{backgroundColor:theme.accentLight},cancelledStatus:{backgroundColor:theme.errorSurface},statusText:{fontSize:12,lineHeight:20,color:theme.textPrimary,flexShrink:1},secondaryStatus:{fontSize:12,lineHeight:20,color:theme.textPrimary},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:18},gridCell:{width:'100%'},wideCell:{width:'48%',maxWidth:'50%',flexGrow:1},card:{padding:20,borderRadius:22,backgroundColor:theme.surfaceCard,gap:16},financial:{fontSize:26,lineHeight:35,color:theme.textPrimary,fontWeight:'600'},total:{fontSize:26,lineHeight:35,color:theme.textPrimary,fontWeight:'600'},notice:{fontSize:13,lineHeight:21,color:theme.textSecondary},
 lineItem:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:12,paddingVertical:10,borderBottomWidth:1,borderBottomColor:theme.divider},itemDescription:{flex:1,minWidth:100,fontSize:14,lineHeight:22,color:theme.textPrimary},
 steps:{flexDirection:'row',flexWrap:'wrap',gap:8},step:{padding:10,borderRadius:12,backgroundColor:theme.surfaceMuted,flexGrow:1},currentStep:{backgroundColor:theme.accentLight},stepText:{fontSize:12,lineHeight:20,color:theme.textPrimary},empty:{alignItems:'center',paddingVertical:48,paddingHorizontal:24,gap:14,borderRadius:22,backgroundColor:theme.surfaceCard},emptyText:{fontSize:14,lineHeight:22,color:theme.textSecondary,textAlign:'center',maxWidth:360},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:12},actionCell:{flexGrow:1,flexBasis:220},error:{fontSize:13,lineHeight:21,color:theme.error},loading:{padding:24,alignItems:'center',gap:12},
});
