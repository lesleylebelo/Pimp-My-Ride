import React,{useState} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import colors from '../../../shared/theme/colors';
import {Card,Button} from './MarketplaceUI';
import {postsApi} from '../services/postsApi';
import {useAuth} from '../../auth/context/AuthContext';

export function postTime(value){
 const timestamp=typeof value?.toMillis==='function'?value.toMillis():Number(value)||new Date(value).getTime();
 if(!Number.isFinite(timestamp))return '';
 const elapsed=Math.max(0,Date.now()-timestamp),minutes=Math.floor(elapsed/60000);
 return minutes<1?'just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;
}
export function PostCard({post,onOpen,onEdit,onRemoved,editable=false,onSaved}){
 const {user,offline}=useAuth(),[saved,setSaved]=useState(post.saved===true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false);
 async function toggleSaved(){
  if(busy||offline)return;setBusy(true);setError('');
  try{const next=!saved;await postsApi('save',{id:post.id,saved:next},user?.uid);setSaved(next);onSaved?.(post.id,next);}
  catch(e){setError(e.message||'Unable to update saved posts.');}
  finally{setBusy(false);}
 }
 const photos=(post.images||[]).filter(image=>typeof image?.url==='string'&&image.url.startsWith('https://'));
 const place=[post.city,post.province].filter(Boolean).join(' · ');
 const author=post.authorName||'Customer';
 return <Card style={styles.card}>
  <View style={styles.authorRow}>
   <View style={styles.avatar}>{post.authorAvatar?<Image source={{uri:post.authorAvatar}} style={styles.avatarImage}/>:<Text style={styles.initials}>{author.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'C'}</Text>}</View>
   <View style={styles.authorCopy}><Text weight="medium" style={styles.authorName}>{author}</Text><Text style={styles.location}>{[place,postTime(post.createdAt)].filter(Boolean).join(' · ')||postTime(post.createdAt)}</Text></View>
   {post.authorRole==='shop'&&<View style={styles.verified}><Ionicons name="checkmark-circle-outline" size={15} color={colors.primary}/><Text style={styles.verifiedText}>Verified workshop</Text></View>}
   {editable&&<Pressable accessibilityRole="button" accessibilityLabel="Post options" onPress={()=>setMenu(value=>!value)} hitSlop={8} style={styles.more}><Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary}/></Pressable>}
  </View>
  {!!photos.length&&<ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.photos}>
   {photos.slice(0,1).map(photo=><Image key={photo.path} source={{uri:photo.url}} style={styles.photo} resizeMode="cover"/>)}
  </ScrollView>}
  <View style={styles.tags}><Text style={styles.tag}>{post.type==='showcase'?'Showcase':'Build'} · {post.category}</Text>{!!post.projectStatus&&<Text style={styles.status}>{post.projectStatus}</Text>}</View>
  <Text weight="medium" style={styles.title}>{post.title}</Text>
  <Text style={styles.description}>{post.description}</Text>
  {!!post.vehicle&&<Text style={styles.vehicle}>{post.vehicle}</Text>}
  <View style={styles.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={`View ${post.title}`} onPress={onOpen} style={styles.view}><Text weight="medium" style={styles.viewText}>View →</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={saved?'Unsave post':'Save post'} accessibilityState={{selected:saved}} disabled={busy||offline} onPress={()=>void toggleSaved()} style={styles.save}>
    <Ionicons name={saved?'bookmark':'bookmark-outline'} size={19} color={saved?colors.primary:colors.textSecondary}/><Text style={styles.saveText}>{saved?'Saved':'Save'}</Text>
   </Pressable>
  </View>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {menu&&<View style={styles.menu}><Button title="Edit post" outline onPress={()=>{setMenu(false);onEdit?.(post);}}/><ConfirmationButton title="Delete post" message="Delete this post from public feeds? This cannot be undone." danger onConfirm={async()=>{try{await postsApi('remove',{id:post.id,...(post.type==='showcase'?{showcase:true}:{})},user?.uid);setMenu(false);onRemoved?.(post.id);}catch(e){setError(e.message||'Unable to delete post.');}}}/></View>}
 </Card>;
}

const styles=StyleSheet.create({
 card:{padding:16,gap:10},authorRow:{flexDirection:'row',alignItems:'center',gap:9},avatar:{width:38,height:38,borderRadius:19,backgroundColor:colors.brandGreenLight,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:38,height:38,borderRadius:19},initials:{fontSize:13,color:colors.primary,fontWeight:'500'},authorCopy:{flex:1,gap:1},authorName:{fontSize:14},location:{fontSize:12,color:colors.textSecondary},verified:{flexDirection:'row',alignItems:'center',gap:3,paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:colors.brandGreenLight},verifiedText:{fontSize:11,color:colors.primary},more:{padding:3},photos:{height:210,borderRadius:12,backgroundColor:colors.background},photo:{width:300,height:210,borderRadius:12,marginRight:6},tags:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},tag:{fontSize:12,color:colors.textSecondary,backgroundColor:colors.background,paddingHorizontal:9,paddingVertical:4,borderRadius:999},status:{fontSize:12,color:colors.primary,backgroundColor:colors.brandGreenLight,paddingHorizontal:9,paddingVertical:4,borderRadius:999},title:{fontSize:17},description:{fontSize:14,lineHeight:21,color:colors.textSecondary},vehicle:{fontSize:13,color:colors.textSecondary},actions:{minHeight:38,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},view:{minHeight:38,justifyContent:'center'},viewText:{color:colors.primary},save:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:4},saveText:{fontSize:12,color:colors.textSecondary},error:{fontSize:12,color:colors.error},menu:{borderTopWidth:1,borderColor:colors.border,paddingTop:8,gap:8},
});
