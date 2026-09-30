import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {postsApi,pickPostPhotos,uploadPostPhoto} from '../services/postsApi';
import {usePostsFeed} from '../hooks/usePostsFeed';
import {PostCard} from '../components/PostCard';
import {Page,Card,Field,Button,Notice,useInfiniteCursor} from '../components/MarketplaceUI';
import {useMarketData} from '../hooks/useMarketData';
import colors from '../../../shared/theme/colors';

const categories=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
const failure=e=>e?.message||'Unable to save this post. Please retry.';

export function PostFormScreen({navigation,route}){
 const {user,profile,offline}=useAuth(),post=route.params?.post,type=route.params?.type||(profile?.role==='shop'?'showcase':'build'),shop=profile?.role==='shop';
 const [title,setTitle]=useState(post?.title||''),[description,setDescription]=useState(post?.description||''),[category,setCategory]=useState(post?.category||'Other');
 const [status,setStatus]=useState(post?.projectStatus||'In progress'),[vehicle,setVehicle]=useState(post?.vehicle||''),[images,setImages]=useState(post?.images||[]);
 const [files,setFiles]=useState([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const lock=useRef(false),verified=shop&&profile?.verificationStatus==='approved';
 async function selectPhotos(){
  if(busy||offline)return;
  try{const selected=await pickPostPhotos(Math.max(0,6-images.length-files.length));setFiles(previous=>[...previous,...selected].slice(0,Math.max(0,6-images.length)));}
  catch(e){setError(failure(e));}
 }
 async function save(){
  if(lock.current||busy||offline)return;
  setError('');
  if(!verified&&shop){setError('Shop verification is required before you can publish a showcase.');return;}
  if(!title.trim()||title.trim().length>80||!description.trim()||description.trim().length>1000){setError('Enter a title (up to 80 characters) and description (up to 1000 characters).');return;}
  lock.current=true;setBusy(true);setProgress(0);const uploaded=[];
  try{
   for(const [index,file] of files.entries()){
    const result=await uploadPostPhoto(file,user?.uid,value=>setProgress(Math.round(((index+value/100)/files.length)*100)));
    uploaded.push(result.path);
   }
   const imagePaths=[...images.map(image=>image.path),...uploaded];
   await postsApi(post?'update':'create',{...(post?{id:post.id}:{type}),title:title.trim(),description:description.trim(),images:imagePaths,category,...(shop?{projectStatus:status}:{}),vehicle:vehicle.trim()},user?.uid);
   navigation.goBack();
  }catch(e){
   setError(failure(e));
   await Promise.all(uploaded.map(path=>postsApi('removeImage',{path},user?.uid).catch(()=>{})));
  }finally{lock.current=false;setBusy(false);}
 }
 function removeImage(path){if(!busy)setImages(current=>current.filter(image=>image.path!==path));}
 const disabled=busy||offline||shop&&!verified;
 return <Page title={post?'Edit post':shop?'New showcase':'Share a build'} navigation={navigation} showTabs={false}>
  {shop&&!verified&&<Text style={styles.warning}>Shop verification is required before you can publish showcases. You can complete verification from My Shop.</Text>}
  <Card>
   <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} editable={!busy} placeholder="Give your post a title"/>
   <Field label="Description" value={description} onChangeText={setDescription} maxLength={1000} multiline editable={!busy} placeholder="Tell everyone about this work"/>
   <Text weight="medium">Service category</Text>
   <View style={styles.pills}>{categories.map(item=><Pressable key={item} accessibilityRole="button" accessibilityState={{selected:category===item}} onPress={()=>!busy&&setCategory(item)} style={[styles.pill,category===item&&styles.selected]}><Text style={[styles.pillText,category===item&&styles.selectedText]}>{item}</Text></Pressable>)}</View>
   {shop&&<><Text weight="medium">Project status</Text><View style={styles.pills}>{['In progress','Completed'].map(item=><Pressable key={item} accessibilityRole="button" accessibilityState={{selected:status===item}} onPress={()=>!busy&&setStatus(item)} style={[styles.pill,status===item&&styles.selected]}><Text style={[styles.pillText,status===item&&styles.selectedText]}>{item}</Text></Pressable>)}</View></>}
   <Field label="Vehicle (optional)" value={vehicle} onChangeText={setVehicle} maxLength={120} editable={!busy} placeholder="For example, 2020 VW Golf 7"/>
   <Button title={`Add photos (${images.length+files.length}/6)`} outline disabled={disabled||images.length+files.length>=6} onPress={()=>void selectPhotos()}/>
   {images.map(image=><View key={image.path} style={styles.photoRow}><Text style={styles.photoName}>{image.name||'Uploaded photo'}</Text><Button title="Remove" outline disabled={busy} onPress={()=>removeImage(image.path)}/></View>)}
   {files.map((file,index)=><Text key={`${file.uri}:${index}`} style={styles.photoName}>{file.name}</Text>)}
   {busy&&files.length>0&&<Text accessibilityRole="status">Uploading photos · {progress}%</Text>}
   <Notice error={error}/>
   <Button title={busy?'Publishing…':post?'Save changes':'Post'} disabled={disabled||!title.trim()||!description.trim()} onPress={()=>void save()}/>
  </Card>
 </Page>;
}

export function MyPostsScreen({navigation,route}){
 const {profile}=useAuth(),shop=profile?.role==='shop',type=shop?'showcase':'build';
 const [cursor,setCursor]=useState(null),{data,busy,error,refresh}=useMarketData('posts',{view:'mine',cursor});
 const feed=useInfiniteCursor(data,busy,setCursor);
 return <Page title={shop?'My showcases':'My builds'} navigation={navigation} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
  <Button title={shop?'New showcase':'Share a build'} disabled={busy} onPress={()=>navigation.navigate('PostForm',{type})}/>
  <Notice busy={busy} error={error}/>
  {feed.items.filter(post=>post.type===type).map(post=><PostCard key={post.id} post={post} editable onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onEdit={item=>navigation.navigate('PostForm',{type,post:item})} onRemoved={()=>void refresh().catch(()=>{})}/>)}
  {!busy&&data&&!feed.items.length&&<Text>{shop?'You have not published a showcase yet.':'You have not shared a build yet.'}</Text>}
  {busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more posts...</Text>}
 </Page>;
}

export function SavedPostsScreen({navigation}){
 const [cursor,setCursor]=useState(null),{data,busy,error,refresh}=useMarketData('posts',{view:'saved',cursor});
 const feed=useInfiniteCursor(data,busy,setCursor);
 return <Page title="Saved posts" navigation={navigation} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
  <Notice busy={busy} error={error}/>{feed.items.map(post=><PostCard key={post.id} post={post} onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onSaved={(id,saved)=>{if(!saved)void refresh().catch(()=>{});}}/>)}
  {!busy&&data&&!feed.items.length&&<Text>You have not saved any posts yet.</Text>}
 </Page>;
}

export function PostDetailScreen({navigation,route}){
 const {user}=useAuth(),[post,setPost]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;postsApi('get',{id:route.params?.id},user?.uid).then(result=>{if(active)setPost(result.post);}).catch(e=>{if(active)setError(failure(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[route.params?.id,user?.uid]);
 return <Page title="Post" navigation={navigation} showTabs={false}><Notice busy={busy} error={error}/>{post&&<PostCard post={post} onOpen={()=>{}}/>}</Page>;
}

export function ShareBuildButton({navigation}){return <Button title="Share a build" onPress={()=>navigation.navigate('PostForm',{type:'build'})}/>;}
const styles=StyleSheet.create({pills:{flexDirection:'row',flexWrap:'wrap',gap:7},pill:{paddingHorizontal:11,paddingVertical:7,borderWidth:1,borderColor:colors.border,borderRadius:999},selected:{backgroundColor:colors.primary,borderColor:colors.primary},pillText:{fontSize:12,color:colors.textSecondary},selectedText:{color:colors.white},photoRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},photoName:{flex:1,color:colors.textSecondary},warning:{color:colors.error},muted:{color:colors.textSecondary}});
