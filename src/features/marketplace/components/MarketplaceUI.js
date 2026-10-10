import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../auth/context/AuthContext';
import {LandingShell,LandingButton,ownerTabs,shopTabs,useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import AppTextInput from '../../../shared/components/AppTextInput';
import {useTheme} from '../../../shared/theme/ThemeContext';

export const ownerRoutes={Discover:'Discover',Garage:'Garage','My Requests':'OwnerRequests',Bookings:'Bookings',Profile:'OwnerAccount'};
export const shopRoutes={'Find Jobs':'ShopJobs',Requests:'ShopRequests',Quotes:'ShopQuotes',Bookings:'Bookings','My Shop':'ShopAccount'};

export function Page({title,subtitle,navigation,children,showTabs=true,onScroll,onLayout,onContentSizeChange,floatingAction}){
  const {profile}=useAuth();
  const {theme}=useTheme();
  const styles=makeStyles(theme);
  const shop=profile?.role==='shop',routes=shop?shopRoutes:ownerRoutes,feedback=useLandingFeedback();
  const state=navigation?.getState?.(),route=state?.routes?.[state.index]?.name;
  const activeTab=Object.keys(routes).find(k=>routes[k]===route)||(route==='BookingDetail'?'Bookings':shop?(route==='QuoteForm'?'Quotes':'Find Jobs'):['RequestForm','OwnerRequest','QuoteComparison'].includes(route)?'My Requests':'Garage');
  const showBack = navigation?.canGoBack?.();
  return <LandingShell title={title} subtitle={subtitle} tabs={showTabs?(shop?shopTabs:ownerTabs):undefined} activeTab={activeTab} {...feedback} onScroll={onScroll} onLayout={onLayout} onContentSizeChange={onContentSizeChange} floatingAction={floatingAction} onTabPress={label=>routes[label]?navigation?.navigate(routes[label]):feedback.showFeature(label)}>
    {showBack && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={()=>navigation.goBack()}
        hitSlop={12}
        style={styles.backArrow}
      >
        <Ionicons name="arrow-back" size={20} color={theme.accent} />
      </Pressable>
    )}
    {children}
  </LandingShell>;
}

const makeStyles = (colors) => ({
  backArrow: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
});

export function Card({children,style,...props}){
  const {theme}=useTheme();
  const s=makeCardStyles(theme);
  return <View {...props} style={[s.card,style]}>{children}</View>;
}
const makeCardStyles = (colors) => ({
  card: { padding: 20, borderRadius: 24, backgroundColor: colors.surfaceCard, gap: 14, borderWidth: 1, borderColor: colors.border },
});

export const Field=AppTextInput;
export const Button=LandingButton;

export function Notice({busy,error}){
  const {theme}=useTheme();
  return <>{busy&&<Text accessibilityRole="status" style={{color:theme.textSecondary}}>Loading...</Text>}{!!error&&<Text accessibilityRole="alert" style={{color:theme.error}}>{error}</Text>}</>;
}

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
  const {theme}=useTheme();
  const s=makeStatusStyles(theme);
  return <View style={s.statusTag}><Text style={s.statusText}>{children}</Text></View>;
}
const makeStatusStyles = (colors) => ({
  statusTag: { alignSelf: 'flex-start', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surfaceMuted },
  statusText: { fontSize: 12, lineHeight: 16, color: colors.accent, fontWeight: '600' },
});

export const formatMoney=cents=>Number.isSafeInteger(cents)?`R${(cents/100).toFixed(2)}`:'Not specified';

export function QuoteCard({quote,children}){
  const {theme}=useTheme();
  const quoteStyles=makeQuoteStyles(theme);
  const expired=Number(quote.validUntil)<=Date.now();
  return (
    <Card>
      <Text style={quoteStyles.heading}>{quote.shopName || 'Your quotation'}</Text>
      <StatusTag>
        {quote.status}
        {expired && quote.status==='submitted' ? ' · Validity period ended' : ''}
      </StatusTag>
      {!!quote.scope && <Text style={quoteStyles.body}>{quote.scope}</Text>}
      {(quote.items||[]).map((item,i)=>(
        <View key={i} style={quoteStyles.lineItem}>
          <Text style={quoteStyles.lineLabel}>{item.description}</Text>
          <Text style={quoteStyles.lineValue}>{formatMoney(item.amountCents)}</Text>
        </View>
      ))}
      <View style={quoteStyles.totalRow}>
        <Text style={quoteStyles.totalLabel}>Total</Text>
        <Text style={quoteStyles.totalValue}>{formatMoney(quote.totalCents)}</Text>
      </View>
      <View style={quoteStyles.metaRow}>
        <Text style={quoteStyles.metaLabel}>Estimated completion</Text>
        <Text style={quoteStyles.metaValue}>{quote.completionDays} working days</Text>
      </View>
      {!!quote.warranty && (
        <View style={quoteStyles.metaRow}>
          <Text style={quoteStyles.metaLabel}>Warranty</Text>
          <Text style={quoteStyles.metaValue}>{quote.warranty}</Text>
        </View>
      )}
      <View style={quoteStyles.metaRow}>
        <Text style={quoteStyles.metaLabel}>Valid until</Text>
        <Text style={quoteStyles.metaValue}>{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'Not available'}</Text>
      </View>
      {children}
    </Card>
  );
}

const makeQuoteStyles = (colors) => ({
  heading: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.2 },
  body: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  lineLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  lineValue: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  totalValue: { fontSize: 17, fontWeight: '700', color: colors.accent },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  metaLabel: { fontSize: 13, color: colors.textSecondary },
  metaValue: { fontSize: 13, fontWeight: '500', color: colors.textPrimary, textAlign: 'right' },
});