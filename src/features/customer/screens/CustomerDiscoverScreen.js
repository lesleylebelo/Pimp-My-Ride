import React,{useEffect,useState} from 'react';
import {RefreshControl,View,ScrollView} from 'react-native';
import {CustomerAction as Action,CustomerCard,CustomerChip as Chip,CustomerField,CustomerGrid,CustomerModal,CustomerPage,CustomerPressable,CustomerState,CustomerText as Text} from '../components/CustomerUI';
import {usePostsFeed} from '../../marketplace/hooks/usePostsFeed';
import {useMarketData} from '../../marketplace/hooks/useMarketData';
import {useInfiniteCursor} from '../../marketplace/components/MarketplaceUI';
import {PostCard} from '../../marketplace/components/PostCard';
import MessagesHeaderButton from '../../marketplace/components/MessagesHeaderButton';
import NotificationsHeaderButton from '../../marketplace/components/NotificationsHeaderButton';
import {useTheme} from '../../../shared/theme/ThemeContext';

// Existing /api/posts filter vocabulary; not invented workshop listings.
const services=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
export default function CustomerDiscoverScreen({navigation}){
 const {theme}=useTheme();
 const [query,setQuery]=useState(''),[normalized,setNormalized]=useState(''),[category,setCategory]=useState('All');
 const [view,setView]=useState('work'),[location,setLocation]=useState(''),[filtersOpen,setFiltersOpen]=useState(false);
 const feed=usePostsFeed({view:'feed',source:'all',service:category,q:normalized,limit:20});
 useEffect(()=>{const timer=setTimeout(()=>setNormalized(query.trim().toLowerCase()),180);return()=>clearTimeout(timer);},[query]);
 const locations=[...new Set(feed.items.map(post=>post.city).filter(Boolean))].sort();
 const visible=feed.items.filter(post=>{
  const vehicle=typeof post.vehicle==='object'?Object.values(post.vehicle||{}).join(' '):post.vehicle;
  const haystack=[post.title,post.description,post.category,vehicle,post.city,post.province,post.authorName,post.shop?.name].join(' ').toLowerCase();
  return (!normalized||haystack.includes(normalized))&&(category==='All'||(post.serviceCategory||post.category)?.toLowerCase()===category.toLowerCase())&&(!location||post.city?.toLowerCase()===location.toLowerCase());
 });
 const hasFilters=!!query||category!=='All'||!!location;
 const clear=()=>{setQuery('');setNormalized('');setCategory('All');setLocation('');setFiltersOpen(false);};
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(view==='work'&&contentOffset.y+layoutMeasurement.height>=contentSize.height-400)feed.loadNext();};
 return <CustomerPage title="Discover" subtitle="Explore workshops and their work" navigation={navigation} activeRoute="Discover"
  headerRight={<><NotificationsHeaderButton navigation={navigation}/><MessagesHeaderButton navigation={navigation}/></>}
  onScroll={onScroll} onContentSizeChange={(_,height)=>{if(view==='work'&&height<650)feed.loadNext();}}
  refreshControl={view==='work'?<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()} tintColor={theme.textPrimary}/>:undefined}>
  <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12}}>
   <View style={{flexGrow:1,flexBasis:300}}><CustomerField icon="search-outline" accessibilityLabel="Search workshops or services" placeholder="Search workshops or services" value={query} onChangeText={setQuery} maxLength={120}/></View>
   <Action title="Saved posts" icon="bookmark-outline" onPress={()=>navigation.navigate('SavedPosts')}/>
  </View>
  <View style={{flexDirection:'row',gap:8}}><Chip title="Showcases" selected={view==='work'} onPress={()=>setView('work')}/><Chip title="Workshops" selected={view==='shops'} onPress={()=>setView('shops')}/></View>
  {view==='shops'?<WorkshopDirectory navigation={navigation} query={normalized}/>:<>
   <View style={{gap:10}}><Text heading>Browse by service</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
    {['All',...services].map(title=><Chip key={title} title={title} selected={category===title} onPress={()=>setCategory(title)}/>)}
    <Chip title="More filters" icon="options-outline" selected={!!location} onPress={()=>setFiltersOpen(true)}/>
   </View></View>
   {!!location&&<Text muted>Loaded showcases in {location}</Text>}
   {feed.busy&&!feed.items.length&&<CustomerState busy title="Loading showcases…"/>}
   {!!feed.error&&<CustomerState error={feed.error} onRetry={()=>void feed.refresh()}/>}
   {!feed.busy&&!feed.error&&!visible.length&&<CustomerState title={hasFilters?'No showcases match':'No showcases yet'} description={hasFilters?'Try another service or clear your filters.':'Work shared by workshops will appear here.'} icon="images-outline" action={hasFilters?<Action title="Clear filters" onPress={clear}/>:null}/>}
   <View style={{width:'100%',maxWidth:680,alignSelf:'center',gap:24}}>{visible.map(post=><PostCard key={post.id} post={post} presentation="feed" onOpen={()=>navigation.navigate('PostDetail',{id:post.id})}/>)}</View>
   {!!feed.cursor&&<Action title="Load more showcases" loading={feed.busy} onPress={()=>feed.loadNext()}/>}
  </>}
  <CustomerModal visible={filtersOpen} transparent animationType="fade" onRequestClose={()=>setFiltersOpen(false)}>
   <View style={{flex:1,padding:20,backgroundColor:'#00000099',justifyContent:'center',alignItems:'center'}}><CustomerCard accessibilityViewIsModal style={{width:'100%',maxWidth:520,maxHeight:'85%'}}>
    <Text heading>Filter showcases</Text><Text muted>Cities from the showcases loaded so far.</Text>
    <ScrollView contentContainerStyle={{flexDirection:'row',flexWrap:'wrap',gap:8}}><Chip title="All locations" selected={!location} onPress={()=>setLocation('')}/>{locations.map(city=><Chip key={city} title={city} selected={city===location} onPress={()=>setLocation(city)}/>)}</ScrollView>
    <Action title="Close" onPress={()=>setFiltersOpen(false)}/>
   </CustomerCard></View>
  </CustomerModal>
 </CustomerPage>;
}
export function WorkshopDirectory({navigation,query=''}){
 const {theme}=useTheme();
 const [cursor,setCursor]=useState(null),state=useMarketData('shops',{cursor},setCursor);
 const feed=useInfiniteCursor(state.data,state.busy,setCursor,{autoLoad:false,pageCursor:cursor});
 const shops=feed.items.filter(shop=>[shop.shopName,shop.city,shop.province,Array.isArray(shop.services)?shop.services.join(' '):shop.services].join(' ').toLowerCase().includes(query));
 return <View style={{gap:18}}><Text heading>Workshops</Text><Text muted>Approved workshops. Search refines the workshops loaded here.</Text>
  {!!state.error&&<CustomerState error={state.error} onRetry={()=>void state.refresh().catch(()=>{})}/>}
  {state.busy&&!feed.items.length&&<CustomerState busy title="Loading workshops…"/>}
  <CustomerGrid>{shops.map(shop=><CustomerPressable key={shop.id} accessibilityRole="button" accessibilityLabel={`View workshop: ${shop.shopName||'Workshop'}`} onPress={()=>navigation.navigate('ShopProfile',{shop:{...shop,name:shop.shopName,verificationStatus:shop.verified?'approved':undefined}})} style={{padding:20,gap:12,borderRadius:12,borderWidth:1,borderColor:theme.border,backgroundColor:theme.surfaceCard}}>
   <Text heading>{shop.shopName||'Workshop'}</Text>
   {!!(shop.city||shop.province)&&<Text muted>{[shop.city,shop.province].filter(Boolean).join(' · ')}</Text>}
   {shop.verified===true&&<Text>Verified workshop</Text>}
   {!!shop.services?.length&&<Text muted>{Array.isArray(shop.services)?shop.services.join(' · '):shop.services}</Text>}
   <Text style={{fontWeight:'600',fontSize:12}}>View workshop →</Text>
  </CustomerPressable>)}</CustomerGrid>
  {!state.busy&&!state.error&&!shops.length&&<CustomerState title={query?'No workshops match':'No workshops available'} description="Try another search or check again later." icon="storefront-outline"/>}
  {!!state.data?.cursor&&<Action title="Load more workshops" loading={state.busy} onPress={feed.loadNext}/>}
 </View>;
}
