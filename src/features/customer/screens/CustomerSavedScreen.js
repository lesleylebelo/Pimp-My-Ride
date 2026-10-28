import React,{useState,useSyncExternalStore} from 'react';
import {RefreshControl,View} from 'react-native';
import {CustomerAction,CustomerPage,CustomerState,CustomerText} from '../components/CustomerUI';
import {useAuth} from '../../auth/context/AuthContext';
import {usePostsFeed} from '../../marketplace/hooks/usePostsFeed';
import {PostCard} from '../../marketplace/components/PostCard';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {bookmarkRevision,bookmarkSnapshot,subscribeBookmarks} from '../../marketplace/services/bookmarkState';

export default function CustomerSavedScreen(props){const {user}=useAuth();return <Saved key={user?.uid} {...props}/>;}
function Saved({navigation}){
 const {user,offline}=useAuth(),{theme}=useTheme(),feed=usePostsFeed({view:'saved'}),[message,setMessage]=useState('');
 useSyncExternalStore(subscribeBookmarks,bookmarkRevision,bookmarkRevision);
 const items=offline?[]:feed.items.filter(item=>bookmarkSnapshot(user?.uid,item.id)?.saved!==false);
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<400)feed.loadNext();};
 return <CustomerPage title="Saved posts" subtitle="Work you want to come back to" navigation={navigation} back onScroll={onScroll}
  refreshControl={<RefreshControl refreshing={feed.refreshing===true} onRefresh={()=>void feed.refresh()} tintColor={theme.accent}/>}>
  {!!message&&<CustomerText accessibilityLiveRegion="polite">{message}</CustomerText>}
  {!!feed.error&&<CustomerState error={feed.error} onRetry={()=>void feed.refresh()}/>}
  {feed.busy&&!items.length&&<CustomerState busy title="Loading saved posts…"/>}
  {offline&&<CustomerState title="Connect to view saved posts" description="Your bookmarks are kept in your account. Reconnect to load them." icon="cloud-offline-outline"/>}
  <View style={{width:'100%',maxWidth:680,alignSelf:'center',gap:24}}>{items.map(post=><PostCard key={post.id} post={{...post,saved:true}} presentation="feed" onOpen={()=>navigation.navigate('PostDetail',{id:post.id})}
   onProfile={post.shop?.id?()=>navigation.navigate('ShopProfile',{shop:post.shop}):undefined}
   onSaved={(_,saved)=>{if(!saved)setMessage('Post removed from saved posts.');}}/>)}</View>
  {!offline&&!feed.busy&&!feed.error&&!items.length&&!feed.cursor&&<CustomerState title="Nothing saved yet" description="Use the bookmark on a showcase to keep it here." icon="bookmark-outline" action={<CustomerAction title="Explore showcases" onPress={()=>navigation.navigate('Discover')}/>}/>}
  {!offline&&!feed.busy&&!feed.error&&!items.length&&!!feed.cursor&&<CustomerText muted>No available showcases in this batch. Load more to continue.</CustomerText>}
  {!!feed.cursor&&<CustomerAction title="Load more saved posts" disabled={offline} loading={feed.busy} onPress={feed.loadNext}/>}
  <CustomerAction title="Refresh saved posts" disabled={feed.busy||offline} onPress={()=>{setMessage('');void feed.refresh();}}/>
 </CustomerPage>;
}
