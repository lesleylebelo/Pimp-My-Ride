import React,{useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {useAuth} from '../../auth/context/AuthContext';
import {LandingShell,LandingButton,ownerTabs,shopTabs,ui,useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import AppTextInput from '../../../shared/components/AppTextInput';
export const ownerRoutes={Discover:'Discover',Garage:'Garage','My Requests':'OwnerRequests',Bookings:'Bookings',Profile:'OwnerAccount'};
export const shopRoutes={'Find Jobs':'ShopJobs',Requests:'ShopRequests',Quotes:'ShopQuotes',Bookings:'Bookings','My Shop':'ShopAccount'};
export function Page({title,navigation,children,showTabs=true,onScroll,onLayout,onContentSizeChange}){
 const {profile}=useAuth(),shop=profile?.role==='shop',routes=shop?shopRoutes:ownerRoutes,feedback=useLandingFeedback();
 const state=navigation?.getState?.(),route=state?.routes?.[state.index]?.name;
 const activeTab=Object.keys(routes).find(k=>routes[k]===route)||(route==='BookingDetail'?'Bookings':shop?(route==='QuoteForm'?'Quotes':'Find Jobs'):['RequestForm','OwnerRequest','QuoteComparison'].includes(route)?'My Requests':'Garage');
 return <LandingShell title={title} tabs={showTabs?(shop?shopTabs:ownerTabs):undefined} activeTab={activeTab} {...feedback} onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} onTabPress={label=>routes[label]?navigation?.navigate(routes[label]):feedback.showFeature(label)}>
  {navigation?.canGoBack?.()&&<LandingButton title="Back" outline onPress={()=>navigation.goBack()}/>}
  {children}
 </LandingShell>;
}
export const Card=({children,style,...props})=><View {...props} style={[ui.card,style]}>{children}</View>;
export const Field=AppTextInput;
export const Button=LandingButton;
export function Notice({busy,error}){return <>{busy&&<Text accessibilityRole="status" style={ui.muted}>Loading...</Text>}{!!error&&<Text accessibilityRole="alert" style={ui.error}>{error}</Text>}</>;}
const sameItem=(left,right)=>left===right||Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.is(left[key],right[key]));
export function useInfiniteCursor(data,busy,setCursor,{itemsKey='items',cursorKey='cursor',autoLoad=true}={}){
 const [items,setItems]=useState([]),requested=useRef(new Set()),viewport=useRef(0),content=useRef(0),seen=useRef(new WeakSet());
 const pageItems=data?.[itemsKey],nextCursor=data?.[cursorKey];
 useEffect(()=>{if(!data||seen.current.has(data))return;seen.current.add(data);if(Array.isArray(pageItems))setItems(previous=>{const indexes=new Map(previous.map((item,index)=>[item.id,index])),next=[...previous];let changed=false;for(const item of pageItems){const index=indexes.get(item.id);if(index===undefined){indexes.set(item.id,next.length);next.push(item);changed=true;}else if(!sameItem(next[index],item)){next[index]=item;changed=true;}}return changed?next:previous;});},[data,pageItems]);
 const loadNext=()=>{if(nextCursor&&!busy&&!requested.current.has(nextCursor)){requested.current.add(nextCursor);setCursor(nextCursor);}};
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(autoLoad&&contentSize.height-contentOffset.y-layoutMeasurement.height<260)loadNext();};
 const onLayout=event=>{viewport.current=event.nativeEvent.layout.height;if(autoLoad&&content.current-viewport.current<260)loadNext();};
 const onContentSizeChange=(_,height)=>{content.current=height;if(autoLoad&&height-viewport.current<260)loadNext();};
 const reset=()=>{requested.current.clear();seen.current=new WeakSet();if(data)seen.current.add(data);setItems([]);};
 return {items,onScroll,onLayout,onContentSizeChange,loadNext,reset};
}
export function StatusTag({children}) {
 return <View style={ui.statusTag}><Text style={ui.statusText}>{children}</Text></View>;
}
export const formatMoney=cents=>Number.isSafeInteger(cents)?`R${(cents/100).toFixed(2)}`:'Not specified';
export function QuoteCard({quote,children}){
 const expired=Number(quote.validUntil)<=Date.now();
 return <Card><Text style={ui.sectionTitle}>{quote.shopName||'Your quotation'}</Text><StatusTag>{quote.status}{expired&&quote.status==='submitted'?' · Validity period ended':''}</StatusTag>
  <Text>{quote.scope}</Text>{(quote.items||[]).map((item,i)=><Text key={i}>{item.description} · {formatMoney(item.amountCents)}</Text>)}
  <Text style={{fontWeight:'500'}}>Total {formatMoney(quote.totalCents)}</Text><Text>Estimated completion: {quote.completionDays} working days</Text>
  {!!quote.warranty&&<Text>Warranty: {quote.warranty}</Text>}<Text>Valid until: {quote.validUntil?new Date(quote.validUntil).toLocaleDateString():'Not available'}</Text>
  {children}
 </Card>;
}
