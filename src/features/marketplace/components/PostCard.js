import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import baseColors from '../../../shared/theme/colors';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {Card,Button} from './MarketplaceUI';
import {postsApi} from '../services/postsApi';
import {useAuth} from '../../auth/context/AuthContext';
import ShowcasePhoto,{hasPostImage} from './ShowcasePhoto';

export function postTime(value){
 const timestamp=typeof value?.toMillis==='function'?value.toMillis():Number(value)||new Date(value).getTime();
 if(!Number.isFinite(timestamp))return '';
 const elapsed=Math.max(0,Date.now()-timestamp),minutes=Math.floor(elapsed/60000);
 return minutes<1?'just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`;
}
function formatVehicle(value){
 if(typeof value==='string')return value.trim();
 if(!value||typeof value!=='object'||Array.isArray(value))return '';
 const text=part=>typeof part==='string'?part.trim():typeof part==='number'&&Number.isFinite(part)?String(part):'';
 return [text(value.year),text(value.make),text(value.model)].filter(Boolean).join(' ');
}
export function PostCard({post,onOpen,onEdit,onRemoved,editable=false,onSaved}){
 const {theme}=useTheme(),colors={...baseColors,primary:theme.accent,textPrimary:theme.textPrimary,textSecondary:theme.textSecondary,background:theme.surfaceMuted,brandGreenLight:theme.accentLight,border:theme.divider,error:theme.error,white:theme.textPrimary},styles=makeStyles(colors);
 const {user,offline}=useAuth(),[saved,setSaved]=useState(post.saved===true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[menu,setMenu]=useState(false);
 async function toggleSaved(){
  if(busy||offline)return;setBusy(true);setError('');
  try{const next=!saved;await postsApi('save',{id:post.id,saved:next},user?.uid);setSaved(next);onSaved?.(post.id,next);}
  catch(e){setError(e.message||'Unable to update saved posts.');}
  finally{setBusy(false);}
 }
 const photos=(Array.isArray(post.images)?post.images:[]).map(image=>typeof image==='string'?{url:image}:image).filter(hasPostImage);
 const vehicle=formatVehicle(post.vehicle);
 const place=[post.city,post.province].filter(Boolean).join(' · ');
 const author=post.shop?.name||post.authorName||(post.type==='showcase'?'Workshop':'Customer');
 return <Card style={styles.card}>
  <View style={styles.authorRow}>
   <View style={styles.avatar}>{post.authorAvatar?<Image source={{uri:post.authorAvatar}} style={styles.avatarImage}/>:<Text style={styles.initials}>{author.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'C'}</Text>}</View>
   <View style={styles.authorCopy}><Text weight="medium" style={styles.authorName}>{author}</Text><Text style={styles.location}>{[place,postTime(post.createdAt)].filter(Boolean).join(' · ')||postTime(post.createdAt)}</Text></View>
   {(post.verificationStatus==='approved'||post.shop?.verificationStatus==='approved')&&post.authorRole==='shop'&&<View style={styles.verified}><Ionicons name="checkmark-circle-outline" size={15} color={colors.primary}/><Text style={styles.verifiedText}>Verified workshop</Text></View>}
   {editable&&<Pressable accessibilityRole="button" accessibilityLabel="Post options" onPress={()=>setMenu(value=>!value)} hitSlop={8} style={styles.more}><Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary}/></Pressable>}
  </View>
  {!!photos.length&&<View style={styles.photos}>
   {photos.slice(0,1).map(photo=><ShowcasePhoto key={photo.path||photo.url} postId={post.id} image={photo} style={styles.photo}/>)}
  </View>}
  {!photos.length&&<View style={[styles.photos,{height:160,alignItems:'center',justifyContent:'center',gap:8}]}><Ionicons name="images-outline" size={30} color={colors.textSecondary}/><Text style={styles.location}>No project photo available</Text></View>}
  <View style={styles.tags}><Text style={styles.tag}>{post.type==='showcase'?'Showcase':'Build'} · {post.serviceCategory||post.category}</Text>{!!post.projectStatus&&<Text style={styles.status}>{post.projectStatus}</Text>}</View>
  <Text weight="medium" style={styles.title}>{post.title}</Text>
  <Text style={styles.description}>{post.description}</Text>
  {!!vehicle&&<Text style={styles.vehicle}>{vehicle}</Text>}
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

const makeStyles=colors=>StyleSheet.create({
 card:{padding:16,gap:10},authorRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:9},avatar:{width:38,height:38,borderRadius:19,backgroundColor:colors.brandGreenLight,alignItems:'center',justifyContent:'center',overflow:'hidden'},avatarImage:{width:38,height:38,borderRadius:19},initials:{fontSize:13,color:colors.textPrimary,fontWeight:'500'},authorCopy:{flex:1,gap:1},authorName:{fontSize:14},location:{fontSize:12,color:colors.textSecondary},verified:{flexDirection:'row',alignItems:'center',gap:3,paddingHorizontal:8,paddingVertical:4,borderRadius:999,backgroundColor:colors.brandGreenLight},verifiedText:{fontSize:11,color:colors.textPrimary},more:{padding:12,minHeight:44,minWidth:44},photos:{aspectRatio:4/3,borderRadius:12,backgroundColor:colors.background},photo:{width:'100%',aspectRatio:4/3,borderRadius:12,marginRight:6},tags:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},tag:{fontSize:12,color:colors.textSecondary,backgroundColor:colors.background,paddingHorizontal:9,paddingVertical:4,borderRadius:999},status:{fontSize:12,color:colors.textPrimary,backgroundColor:colors.brandGreenLight,paddingHorizontal:9,paddingVertical:4,borderRadius:999},title:{fontSize:17},description:{fontSize:14,lineHeight:21,color:colors.textSecondary},vehicle:{fontSize:13,color:colors.textSecondary},actions:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},view:{minHeight:48,justifyContent:'center'},viewText:{color:colors.textPrimary},save:{minHeight:48,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:4},saveText:{fontSize:12,color:colors.textSecondary},error:{fontSize:12,color:colors.error},menu:{borderTopWidth:1,borderColor:colors.border,paddingTop:8,gap:8},
});
