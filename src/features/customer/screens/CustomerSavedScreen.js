import React,{useState} from 'react';
import {CustomerAction,CustomerGrid,CustomerPage,CustomerState} from '../components/CustomerUI';
import {useAuth} from '../../auth/context/AuthContext';
import {usePostsFeed} from '../../marketplace/hooks/usePostsFeed';
import {PostCard} from '../../marketplace/components/PostCard';

export default function CustomerSavedScreen(props){const {user}=useAuth();return <Saved key={user?.uid} {...props}/>;}
function Saved({navigation}){
 const feed=usePostsFeed({view:'saved'}),[removed,setRemoved]=useState(new Set());
 const items=feed.items.filter(item=>!removed.has(item.id));
 return <CustomerPage title="Saved posts" subtitle="Work you want to come back to" navigation={navigation} back>
  {!!feed.error&&<CustomerState error={feed.error} onRetry={()=>void feed.refresh()}/>}
  {feed.busy&&!items.length&&<CustomerState busy title="Loading saved posts…"/>}
  <CustomerGrid>{items.map(post=><PostCard key={post.id} post={{...post,saved:true}} onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onSaved={(id,saved)=>{if(!saved)setRemoved(previous=>new Set([...previous,id]));}}/>)}</CustomerGrid>
  {!feed.busy&&!feed.error&&!items.length&&<CustomerState title="Nothing saved yet" description="Use the bookmark on a showcase to keep it here." icon="bookmark-outline" action={<CustomerAction title="Explore showcases" onPress={()=>navigation.navigate('Discover')}/>}/>}
  {!!feed.cursor&&<CustomerAction title="Load more saved posts" loading={feed.busy} onPress={feed.loadNext}/>}
  <CustomerAction title="Refresh saved posts" disabled={feed.busy} onPress={()=>{setRemoved(new Set());void feed.refresh();}}/>
 </CustomerPage>;
}
