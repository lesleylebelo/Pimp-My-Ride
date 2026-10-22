import React,{useEffect,useState} from 'react';
import {Modal,Pressable,RefreshControl,StyleSheet,View} from 'react-native';
import {LandingButton,LandingShell,LandingText,ownerTabs,ui,useLandingFeedback} from '../../../shared/components/landing/LandingUI';
import {FeedSearchInput,FeedServicePill} from '../../../shared/components/landing/FeedControls';
import {useAuth} from '../../auth/context/AuthContext';
import {usePostsFeed} from '../../marketplace/hooks/usePostsFeed';
import {PostCard} from '../../marketplace/components/PostCard';
import {ownerRoutes} from '../../marketplace/components/MarketplaceUI';
import MessagesHeaderButton from '../../marketplace/components/MessagesHeaderButton';
import NotificationsHeaderButton from '../../marketplace/components/NotificationsHeaderButton';
import {radius} from '../../../shared/theme/typography';
import colors from '../../../shared/theme/colors';

const categories=[
  {label:'Tuning', icon:'speedometer-outline'},
  {label:'Performance', icon:'flash-outline'},
  {label:'Exhaust', icon:'cloud-outline'},
  {label:'Lighting', icon:'bulb-outline'},
  {label:'Body Kit', icon:'construct-outline'},
  {label:'Wheels', icon:'ellipse-outline'},
  {label:'Interior', icon:'home-outline'},
  {label:'Wrap & Paint', icon:'color-palette-outline'},
  {label:'Other', icon:'ellipsis-horizontal'},
];
export default function OwnerHomeScreen({navigation}){
 const {user}=useAuth(),feedback=useLandingFeedback();
 const [query,setQuery]=useState(''),[normalized,setNormalized]=useState(''),[category,setCategory]=useState('All');
 const feed=usePostsFeed({view:'feed',source:'all',service:category,q:normalized,limit:20});
 const [location,setLocation]=useState(''),[filtersOpen,setFiltersOpen]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setNormalized(query.trim().toLowerCase()),180);return()=>clearTimeout(timer);},[query]);
 const locations=[...new Set(feed.items.map(post=>post.city).filter(Boolean))].sort();
 const visible=feed.items.filter(post=>{
  const haystack=[post.title,post.description,post.category,post.vehicle,post.city,post.province,post.authorName].join(' ').toLowerCase();
  return (!normalized||haystack.includes(normalized))&&(category==='All'||(post.serviceCategory||post.category)?.toLowerCase()===category.toLowerCase())&&
   (!location||post.city?.toLowerCase()===location.toLowerCase());
 });
 const hasFilters=!!query||category!=='All'||!!location;
 const clear=()=>{setQuery('');setNormalized('');setCategory('All');setLocation('');setFiltersOpen(false);};
 const onScroll=event=>{
  const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
  if(contentOffset.y+layoutMeasurement.height>=contentSize.height-400)feed.loadNext();
 };
 const onContentSizeChange=(_,height)=>{if(height<650)feed.loadNext();};
 return <LandingShell
   title="Discover"
   subtitle="Find shops and builds near you"
   tabs={ownerTabs}
   activeTab="Discover"
   headerRight={<><NotificationsHeaderButton navigation={navigation}/><MessagesHeaderButton navigation={navigation}/></>}
   {...feedback}
   onScroll={onScroll}
   onContentSizeChange={onContentSizeChange}
   refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}
   onTabPress={label=>ownerRoutes[label]?navigation.navigate(ownerRoutes[label]):feedback.showFeature(label)}
 >
  <FeedSearchInput accessibilityLabel="Search workshops or services" placeholder="Search workshops or services" value={query} onChangeText={setQuery}/>
  <LandingText style={styles.intro}>Explore workshop showcases and customer builds</LandingText>
  <LandingText weight="medium">Browse by service</LandingText>
  <View style={styles.categories}>
   <FeedServicePill title="All" icon="apps-outline" selected={category==='All'} onPress={()=>setCategory('All')}/>
{categories.map(item=><FeedServicePill key={item.label} title={item.label} icon={item.icon} selected={category===item.label} onPress={()=>setCategory(item.label)}/>)}
<FeedServicePill title="More filters" icon="options-outline" selected={false} onPress={()=>setFiltersOpen(true)}/>
  </View>
  {feed.busy&&!feed.items.length&&<View style={styles.loading}><LandingText accessibilityRole="status" style={ui.muted}>Loading posts...</LandingText>{[0,1,2].map(item=><View key={item} style={styles.skeleton}><View style={styles.skeletonImage}/><View style={styles.skeletonLine}/><View style={styles.skeletonLineShort}/></View>)}</View>}
  {!!feed.error&&<LandingText accessibilityRole="alert" style={ui.error}>{feed.error}</LandingText>}
  {!!feed.error&&<LandingButton title="Retry loading posts" outline onPress={()=>void feed.refresh()}/>}
  {!feed.busy&&!feed.error&&!visible.length&&<View style={styles.empty}><LandingText style={ui.muted}>{hasFilters?'No posts match your search':'No posts yet'}</LandingText>{hasFilters&&<LandingButton title="Clear filters" outline onPress={clear}/>}</View>}
  {visible.map(post=><PostCard key={post.id} post={post} editable={post.authorId===user?.uid} onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onEdit={item=>navigation.navigate('PostForm',{post:item,type:item.type})} onRemoved={()=>void feed.refresh()}/>)}
  {feed.busy&&!!feed.items.length&&<LandingText accessibilityRole="status" style={ui.muted}>Loading more posts...</LandingText>}
  <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={()=>setFiltersOpen(false)}>
   <View style={styles.backdrop}><View style={styles.modal} accessibilityViewIsModal>
    <LandingText accessibilityRole="header" weight="medium" style={styles.modalTitle}>More filters</LandingText>
    <LandingText weight="medium">Location</LandingText>
    <View style={styles.categories}><FeedServicePill title="All locations" selected={!location} onPress={()=>setLocation('')}/>{locations.map(city=><FeedServicePill key={city} title={city} selected={location===city} onPress={()=>setLocation(city)}/>)}</View>
    <LandingButton title="Close" outline onPress={()=>setFiltersOpen(false)}/>
   </View></View>
  </Modal>
 </LandingShell>;
}

const styles=StyleSheet.create({
  intro:{color:colors.textSecondary,marginTop:-8},
  categories:{flexDirection:'row',flexWrap:'wrap',gap:8},
  empty:{alignItems:'center',gap:12,paddingVertical:20},loading:{gap:12,paddingVertical:12},skeleton:{height:245,borderRadius:18,padding:12,gap:10,backgroundColor:colors.surfaceCard},skeletonImage:{height:155,borderRadius:12,backgroundColor:colors.background},skeletonLine:{height:16,width:'68%',borderRadius:8,backgroundColor:colors.background},skeletonLineShort:{height:12,width:'42%',borderRadius:8,backgroundColor:colors.background},
  backdrop:{flex:1,justifyContent:'center',padding:24,backgroundColor:'rgba(0,0,0,0.35)'},
  modal:{padding:24,gap:14,borderRadius:20,backgroundColor:colors.surfaceCard},
  modalTitle:{fontSize:20},
});
