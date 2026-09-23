import React,{useState} from 'react';
import {Text,View} from 'react-native';
import {useAuth} from '../../auth/context/AuthContext';
import {LandingShell,LandingButton,ownerTabs,shopTabs,ui,useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import AppTextInput from '../../../shared/components/AppTextInput';
export const ownerRoutes={Discover:'Discover',Garage:'Garage','My Requests':'OwnerRequests',Profile:'OwnerAccount'};
export const shopRoutes={'Find Jobs':'ShopJobs',Requests:'ShopRequests',Quotes:'ShopQuotes','My Shop':'ShopAccount'};
export function Page({title,navigation,children}){
 const {profile}=useAuth(),shop=profile?.role==='shop',routes=shop?shopRoutes:ownerRoutes,feedback=useLandingFeedback();
 const state=navigation?.getState?.(),route=state?.routes?.[state.index]?.name;
 const activeTab=Object.keys(routes).find(k=>routes[k]===route)||(shop?'Find Jobs':'Garage');
 return <LandingShell title={title} tabs={shop?shopTabs:ownerTabs} activeTab={activeTab} {...feedback} onTabPress={label=>routes[label]?navigation?.navigate(routes[label]):feedback.showFeature(label)}>
  {navigation?.canGoBack?.()&&<LandingButton title="Back" outline onPress={()=>navigation.goBack()}/>}
  {children}
 </LandingShell>;
}
export const Card=({children,style,...props})=><View {...props} style={[ui.card,style]}>{children}</View>;
export const Field=AppTextInput;
export const Button=LandingButton;
export function Notice({busy,error}){return <>{busy&&<Text accessibilityRole="status" style={ui.muted}>Loading...</Text>}{!!error&&<Text accessibilityRole="alert" style={ui.error}>{error}</Text>}</>;}
export function usePages(){const [history,setHistory]=useState([null]);return {cursor:history.at(-1),number:history.length,next:cursor=>setHistory(h=>cursor&&h.at(-1)!==cursor?[...h,cursor]:h),previous:()=>setHistory(h=>h.length>1?h.slice(0,-1):h),first:()=>setHistory([null])};}
export function Paging({pages,nextCursor,busy}){return <View style={{gap:8}}><Text style={ui.muted}>Page {pages.number}</Text><View style={{flexDirection:'row',gap:8}}>
 <Button title="First" outline style={{flex:1}} disabled={busy||pages.number===1} onPress={()=>{if(!busy)pages.first();}}/>
 <Button title="Previous" outline style={{flex:1}} disabled={busy||pages.number===1} onPress={()=>{if(!busy)pages.previous();}}/>
 <Button title="Next" outline style={{flex:1}} disabled={busy||!nextCursor} onPress={()=>{if(!busy&&nextCursor)pages.next(nextCursor);}}/>
 </View></View>;}
export const formatMoney=cents=>Number.isSafeInteger(cents)?`R${(cents/100).toFixed(2)}`:'Not specified';
export function QuoteCard({quote}){
 const expired=Number(quote.validUntil)<=Date.now();
 return <Card><Text style={ui.sectionTitle}>{quote.shopName||'Your quotation'}</Text><Text>{quote.status}{expired&&quote.status==='submitted'?' · Validity period ended':''}</Text>
  <Text>{quote.scope}</Text>{(quote.items||[]).map((item,i)=><Text key={i}>{item.description} · {formatMoney(item.amountCents)}</Text>)}
  <Text style={{fontWeight:'700'}}>Total {formatMoney(quote.totalCents)}</Text><Text>Estimated completion: {quote.completionDays} working days</Text>
  {!!quote.warranty&&<Text>Warranty: {quote.warranty}</Text>}<Text>Valid until: {quote.validUntil?new Date(quote.validUntil).toLocaleDateString():'Not available'}</Text>
 </Card>;
}
