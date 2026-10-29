import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {useAuth} from '../../auth/context/AuthContext';
import {Field,Notice} from './MarketplaceUI';
import {QuotationAction as Button,QuotationSection as Card} from './QuotationUI';
import {serviceReviewsApi} from '../services/serviceReviewsApi';

const yellow='#FACC15';
export function RatingStars({rating=0,onChange,disabled=false}){
 const {theme}=useTheme();
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:2}} accessibilityLabel={onChange?'Choose a rating':`${rating.toFixed(1)} out of 5 stars`}>
  {[1,2,3,4,5].map(value=>{
   const icon=<Ionicons name={rating>=value?'star':rating>=value-0.5?'star-half':'star-outline'} size={onChange?28:19} color={yellow}/>;
   return onChange?<Pressable key={value} accessibilityRole="button" accessibilityLabel={`Rate ${value} out of 5`} accessibilityState={{selected:rating===value,disabled}} disabled={disabled} onPress={()=>{if(!disabled)onChange(value);}} style={({pressed,focused})=>({width:44,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:rating===value?theme.surfaceMuted:'transparent',opacity:pressed?0.65:1,...(focused?{borderWidth:2,borderColor:theme.accent}:{})})}>{icon}</Pressable>:<View key={value} accessible={false}>{icon}</View>;
  })}
 </View>;
}
export function RatingSummary({summary}){
 const {theme}=useTheme(),count=Number.isFinite(summary?.average)&&Number.isSafeInteger(summary?.count)&&summary.count>0?summary.count:0;
 return <View style={{gap:6}}>{count>0?<><RatingStars rating={summary.average}/><Text style={{color:theme.textSecondary}}>{summary.average.toFixed(1)} / 5 · {count} verified {count===1?'review':'reviews'}</Text></>:<Text style={{color:theme.textSecondary}}>Not yet rated</Text>}</View>;
}
function useReviews(op,input,refreshKey){
 const {user,offline}=useAuth(),focused=useIsFocused(),uid=user?.uid,key=JSON.stringify(input),generation=useRef(0);
 const [state,setState]=useState({data:null,busy:true,error:''});
 const refresh=useCallback(async()=>{
  const ticket=++generation.current;
  if(!uid||offline||!focused){setState({data:null,busy:false,error:offline?'Connect to load reviews.':''});return;}
  setState({data:null,busy:true,error:''});
  try{const data=await serviceReviewsApi(op,JSON.parse(key),{force:true});if(ticket===generation.current)setState({data,busy:false,error:''});}
  catch(e){if(ticket===generation.current)setState({data:null,busy:false,error:e.message||'Unable to load reviews.'});}
 },[uid,offline,focused,op,key,refreshKey]);
 useEffect(()=>{void refresh();return()=>{++generation.current;};},[refresh]);
 return {...state,refresh};
}
export function ReviewContent({review}){
 const {theme}=useTheme();
 const date=Number.isFinite(review.createdAt)?new Date(review.createdAt).toLocaleDateString('en-ZA',{timeZone:'Africa/Johannesburg',day:'numeric',month:'short',year:'numeric'}):null;
 return <View style={{gap:10}}><Text weight="semibold">{review.customerName||'Verified customer'} · Verified service</Text><RatingStars rating={review.rating}/><Text>{review.rating} out of 5</Text><Text>{review.text}</Text>{!!review.serviceCategory&&<Text style={{color:theme.textSecondary}}>{review.serviceCategory}</Text>}{!!date&&<Text style={{color:theme.textSecondary}}>{date}</Text>}{review.status==='hidden'&&<Text>This review is hidden following moderation. Contact support to dispute the decision.</Text>}</View>;
}
export function WorkshopBookingReview({booking}){
 const state=useReviews('bookingReview',{id:booking.id});
 return <Card><Text weight="semibold">Customer service review</Text><Notice busy={state.busy} error={state.error}/>{state.data?.review?<ReviewContent review={state.data.review}/>:!state.busy&&!state.error?<Text>No visible customer review for this booking yet.</Text>:null}<Button title="Refresh customer review" outline disabled={state.busy} onPress={state.refresh}/></Card>;
}
export function BookingReview({booking,disabled=false,refreshKey=0}){
 const {user}=useAuth();
 return <BookingReviewForm key={`${user?.uid}:${booking.id}`} booking={booking} disabled={disabled} refreshKey={refreshKey}/>;
}
function BookingReviewForm({booking,disabled,refreshKey}){
 const state=useReviews('bookingReview',{id:booking.id},JSON.stringify([refreshKey,booking.updatedAt,booking.serviceStatus,booking.serviceCompletedAt,booking.status])),[open,setOpen]=useState(false),[rating,setRating]=useState(0),[text,setText]=useState(''),[submitted,setSubmitted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(null),[success,setSuccess]=useState(false);
 const lock=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const review=saved||state.data?.review,blocked=disabled||busy||state.busy,trimmed=text.trim();
 const validation=!Number.isInteger(rating)||rating<1||rating>5?'Select a star rating first.':trimmed.length<20||trimmed.length>2000?'Write a review of 20–2,000 characters.':'';
 async function submit(){
  if(lock.current||blocked||review||!state.data?.eligible)return;setSubmitted(true);if(validation)return;
  lock.current=true;setBusy(true);setError('');
  try{await serviceReviewsApi('reviewSubmit',{id:booking.id,rating,text:trimmed});if(mounted.current){setSaved({rating,text:trimmed,customerName:'Verified customer',status:'visible'});setSuccess(true);setOpen(false);void state.refresh();}}
  catch(e){if(mounted.current){setError(e.message||'Unable to submit your review. Retry.');if(e.code==='api/already-exists'||e.code==='already-exists')void state.refresh();}}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 return <Card><Text weight="semibold">Verified service review</Text><Text>{booking.shopName||'Workshop'} · {booking.requestTitle||booking.categoryName||'Completed service'}</Text>
  <Notice busy={state.busy||busy} error={state.error||error}/>
  {!!state.error&&<Button title="Retry loading review" outline disabled={blocked} onPress={state.refresh}/>}
  {success&&<Text accessibilityLiveRegion="polite">Thank you. Your review was submitted.</Text>}
  {review?<><Button title="View Your Review" outline disabled={blocked} onPress={()=>setOpen(value=>!value)}/>{open&&<ReviewContent review={state.data?.review||review}/>}</>:state.data?.eligible?<><Button title="Rate & Review Workshop" disabled={blocked} onPress={()=>setOpen(true)}/>{open&&<View style={{gap:14}}><Text>Select your rating, then describe your service experience.</Text><RatingStars rating={rating} onChange={setRating} disabled={blocked}/><Text accessibilityLiveRegion="polite">{rating?`${rating} out of 5`:'No rating selected'}</Text><Field label="Written review" value={text} onChangeText={setText} editable={!blocked&&rating>0} multiline maxLength={2000} helperText="20–2,000 characters. Avoid names, contact details and links." error={submitted?validation:undefined}/>{submitted&&!!validation&&<Text accessibilityRole="alert">{validation}</Text>}<Button title="Submit review" disabled={blocked} onPress={()=>void submit()}/><Button title="Cancel review" outline disabled={busy} onPress={()=>{setOpen(false);setError('');}}/></View>}</>:!state.busy&&!state.error?<Text>{state.data?.reason||'Reviews are available after an eligible service is marked completed.'}</Text>:null}
 </Card>;
}
export function WorkshopReviews({shopId}){const {user}=useAuth();return <ReviewHistory key={`${user?.uid}:${shopId}`} shopId={shopId}/>;}
function ReviewHistory({shopId}){
 const focused=useIsFocused();
 const [cursor,setCursor]=useState(null),[items,setItems]=useState([]),state=useReviews('workshopReviews',{shopId,...(cursor?{cursor}:{})}),{offline}=useAuth();
 useEffect(()=>{if(state.data)setItems(previous=>cursor?[...previous,...state.data.items.filter(item=>!previous.some(old=>old.id===item.id))]:state.data.items);},[state.data,cursor]);
 useEffect(()=>{setItems([]);setCursor(null);},[focused]);
 function refresh(){setItems([]);if(cursor)setCursor(null);else void state.refresh();}
 return <Card><Text accessibilityRole="header" weight="semibold">Verified ratings & reviews</Text><Notice busy={state.busy} error={state.error}/>
  {state.data?.archived&&<Text>This workshop account was deleted. Verified historical reviews are preserved.</Text>}
  {!!state.data&&<RatingSummary summary={state.data.summary}/>}
  {!offline&&items.map(review=><View key={review.id} style={{paddingVertical:14,gap:12}}><ReviewContent review={review}/></View>)}
  {!state.busy&&!state.error&&state.data&&!items.length&&<Text>No verified reviews yet.</Text>}
  {!!state.data?.cursor&&<Button title="Load more reviews" outline disabled={state.busy||offline} onPress={()=>setCursor(state.data.cursor)}/>}
  <Button title={state.error?'Retry loading reviews':'Refresh reviews'} outline disabled={state.busy||offline} onPress={refresh}/>
 </Card>;
}
