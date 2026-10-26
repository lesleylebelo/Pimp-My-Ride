import React from 'react';
import {View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {CustomerCard,CustomerPressable,CustomerText,CustomerAction} from './CustomerUI';
import {useTheme} from '../../../shared/theme/ThemeContext';
import ProfileAvatar from '../../../shared/components/ProfileAvatar';
import ShowcasePhoto from '../../marketplace/components/ShowcasePhoto';

export default function CustomerPostPresentation({post,onOpen,photos,author,place,time,vehicle,saved,busy,offline,error,onToggleSaved}){
 const {theme}=useTheme();
 return <CustomerCard style={{padding:0,gap:0,overflow:'hidden'}}>
  <CustomerPressable accessibilityRole="button" accessibilityLabel={`View ${post.title}`} onPress={onOpen} style={{gap:12,paddingBottom:14}}>
   {photos.length?<ShowcasePhoto postId={post.id} image={photos[0]} style={{width:'100%',aspectRatio:4/3,backgroundColor:theme.surfaceMuted}}/>:<View style={{aspectRatio:4/3,backgroundColor:theme.surfaceMuted,alignItems:'center',justifyContent:'center',gap:8}}><Ionicons name="images-outline" size={28} color={theme.textSecondary}/><CustomerText muted>No project photo available</CustomerText></View>}
   <View style={{paddingHorizontal:16,gap:7}}>
    <CustomerText muted style={{fontSize:11}}>{[post.type==='showcase'?'SHOWCASE':'BUILD',post.serviceCategory||post.category].filter(Boolean).join(' / ')}</CustomerText>
    <CustomerText heading numberOfLines={2}>{post.title}</CustomerText>
    {!!post.description&&<CustomerText muted numberOfLines={2}>{post.description}</CustomerText>}
    {!!vehicle&&<CustomerText muted style={{fontSize:12}}>{vehicle}</CustomerText>}
   </View>
  </CustomerPressable>
  <View style={{padding:16,paddingTop:12,borderTopWidth:1,borderColor:theme.border,flexDirection:'row',alignItems:'center',gap:10}}>
   <ProfileAvatar context={post.authorRole==='shop'&&post.shop?.id?'shop':'post'} id={post.authorRole==='shop'&&post.shop?.id?post.shop.id:post.id} revision={post.authorPhotoRevision??post.shop?.profilePhotoRevision} shop={post.authorRole==='shop'} size={32}/>
   <View style={{flex:1,minWidth:0,gap:2}}><CustomerText numberOfLines={1} style={{fontWeight:'600',fontSize:12}}>{author}</CustomerText><CustomerText muted style={{fontSize:11,lineHeight:17}}>{[place,time].filter(Boolean).join(' · ')}</CustomerText></View>
   <CustomerAction title={saved?'Unsave post':'Save post'} icon={saved?'bookmark':'bookmark-outline'} iconOnly accessibilityState={{selected:saved}} disabled={busy||offline} onPress={event=>{event?.stopPropagation?.();void onToggleSaved();}}/>
  </View>
  {post.authorRole==='shop'&&(post.verificationStatus==='approved'||post.shop?.verificationStatus==='approved')&&<CustomerText style={{paddingHorizontal:16,paddingBottom:12,fontSize:11}}>Verified workshop</CustomerText>}
  {!!error&&<CustomerText accessibilityRole="alert" style={{padding:16,color:theme.error}}>{error}</CustomerText>}
 </CustomerCard>;
}
