import React,{useEffect,useRef,useState} from 'react';
import {Image,Pressable,RefreshControl,ScrollView,StyleSheet,View} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {postsApi,pickPostPhotos,uploadPostPhoto} from '../services/postsApi';
import {usePostsFeed} from '../hooks/usePostsFeed';
import {PostCard} from '../components/PostCard';
import {Page,Card,Field,Button,Notice,useInfiniteCursor} from '../components/MarketplaceUI';
import {useMarketData} from '../hooks/useMarketData';
import colors from '../../../shared/theme/colors';
const categories = ['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
const failure=e=>e?.message||'Unable to save this post. Please retry.';

export function PostFormScreen({navigation,route}){
 const {user,profile,offline}=useAuth(),post=route.params?.post,type=route.params?.type||(profile?.role==='shop'?'showcase':'build'),shop=profile?.role==='shop';
 const [title,setTitle]=useState(post?.title||''),[description,setDescription]=useState(post?.description||''),[category,setCategory]=useState(post?.category||'Other');
 const oldVehicle=typeof post?.vehicle==='string'?post.vehicle:'';
 const [status,setStatus]=useState(post?.projectStatus||'In progress'),[vehicle,setVehicle]=useState(oldVehicle),[vehicleMake,setVehicleMake]=useState(post?.vehicle?.make||''),[vehicleModel,setVehicleModel]=useState(post?.vehicle?.model||''),[vehicleYear,setVehicleYear]=useState(post?.vehicle?.year?String(post.vehicle.year):''),[images,setImages]=useState(post?.images||[]);
 const [files,setFiles]=useState([]),[imageOrder,setImageOrder]=useState(()=>[...(post?.images||[]).map(image=>`p:${image.path}`)]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const lock=useRef(false),verified=shop&&profile?.verificationStatus==='approved';
 async function selectPhotos(){
  if(busy||offline)return;
  try{const selected=await pickPostPhotos(Math.max(0,10-images.length-files.length));setFiles(previous=>[...previous,...selected].slice(0,Math.max(0,10-images.length)));setImageOrder(previous=>[...previous,...selected.map(file=>`f:${file.uri}`)]);}
  catch(e){if(__DEV__)console.error('[PimpMyRide showcase photo picker failed]',e);setError(failure(e));}
 }
 async function save(){
  if(lock.current||busy||offline)return;
  setError('');
  if(!verified&&shop){setError('Shop verification is required before you can publish a showcase.');return;}
  if(!title.trim()||title.trim().length>100||description.trim().length>2000){setError('Enter a title (up to 100 characters) and a description up to 2000 characters.');return;}
  if(shop&&images.length+files.length<1){setError('Add at least one photo to your showcase.');return;}
  lock.current=true;setBusy(true);setProgress(0);const uploaded=[];
  try{
   const uploadedByUri=new Map();
   for(const [index,file] of files.entries()){
    const result=await uploadPostPhoto(file,user?.uid,value=>setProgress(Math.round(((index+value/100)/files.length)*100)));
    uploaded.push(result.path);uploadedByUri.set(file.uri,result.path);
   }
   const imagePaths=shop?imageOrder.map(item=>item.startsWith('p:')?item.slice(2):uploadedByUri.get(item.slice(2))).filter(Boolean):[...images.map(image=>image.path),...uploaded];
   if(shop){
    const vehicleData={make:vehicleMake.trim(),model:vehicleModel.trim(),...(vehicleYear.trim()?{year:Number(vehicleYear)}:{})};
    await postsApi(post?'update':'create',{...(post?{id:post.id,showcase:true}:{type}),title:title.trim(),description:description.trim(),images:imagePaths,serviceCategory:category,vehicle:vehicleData},user?.uid);
   }else{
    await postsApi(post?'update':'create',{...(post?{id:post.id}:{type}),title:title.trim(),description:description.trim(),images:imagePaths,category,...(shop?{projectStatus:status}:{}),vehicle:vehicle.trim()},user?.uid);
   }
   navigation.goBack();
  }catch(e){
   setError(failure(e));
   await Promise.all(uploaded.map(path=>postsApi('removeImage',{path},user?.uid).catch(()=>{})));
  }finally{lock.current=false;setBusy(false);}
 }
 function removeImage(path){if(!busy){setImages(current=>current.filter(image=>image.path!==path));setImageOrder(current=>current.filter(item=>item!==`p:${path}`));}}
 function removeFile(uri){if(!busy){setFiles(current=>current.filter(file=>file.uri!==uri));setImageOrder(current=>current.filter(item=>item!==`f:${uri}`));}}
 function moveImage(index,amount){
  if(busy)return;setImageOrder(current=>{const next=index+amount;if(next<0||next>=current.length)return current;const reordered=[...current];[reordered[index],reordered[next]]=[reordered[next],reordered[index]];return reordered;});
 }
 const disabled=busy||offline||shop&&!verified;
 return <Page title={post?'Edit post':shop?'New showcase':'Share a build'} navigation={navigation} showTabs={false}>
  {shop&&!verified&&<Text style={styles.warning}>Shop verification is required before you can publish showcases. You can complete verification from My Shop.</Text>}
  <Card>
   <Field label="Title" value={title} onChangeText={setTitle} maxLength={shop?100:80} editable={!busy} placeholder="Give your post a title"/>
   <Field label="Description (optional)" value={description} onChangeText={setDescription} maxLength={shop?2000:1000} multiline editable={!busy} placeholder="Tell everyone about this work"/>
   <Text weight="medium">Service category</Text>
   <View style={styles.pills}>{categories.map(item=><Pressable key={item} accessibilityRole="button" accessibilityState={{selected:category===item}} onPress={()=>!busy&&setCategory(item)} style={[styles.pill,category===item&&styles.selected]}><Text style={[styles.pillText,category===item&&styles.selectedText]}>{item}</Text></Pressable>)}</View>
   {shop&&<><Text weight="medium">Project status</Text><View style={styles.pills}>{['In progress','Completed'].map(item=><Pressable key={item} accessibilityRole="button" accessibilityState={{selected:status===item}} onPress={()=>!busy&&setStatus(item)} style={[styles.pill,status===item&&styles.selected]}><Text style={[styles.pillText,status===item&&styles.selectedText]}>{item}</Text></Pressable>)}</View></>}
   {shop?<><Field label="Vehicle make (optional)" value={vehicleMake} onChangeText={setVehicleMake} maxLength={80} editable={!busy} placeholder="e.g. Volkswagen"/><Field label="Vehicle model (optional)" value={vehicleModel} onChangeText={setVehicleModel} maxLength={80} editable={!busy} placeholder="e.g. Golf"/><Field label="Vehicle year (optional)" value={vehicleYear} onChangeText={setVehicleYear} maxLength={4} keyboardType="number-pad" editable={!busy} placeholder="e.g. 2024"/></>:<Field label="Vehicle (optional)" value={vehicle} onChangeText={setVehicle} maxLength={120} editable={!busy} placeholder="For example, 2020 VW Golf 7"/>}
   <Button title={`Add photos (${images.length+files.length}/${shop?10:6})`} outline disabled={disabled||images.length+files.length>=(shop?10:6)} onPress={()=>void selectPhotos()}/>
   {imageOrder.map((key,index)=>{const existing=key.startsWith('p:'),image=existing?images.find(item=>item.path===key.slice(2)):files.find(item=>item.uri===key.slice(2));if(!image)return null;return <View key={key} style={styles.photoRow}><Image source={{uri:existing?image.url:image.uri}} style={styles.preview}/><Text style={styles.photoName}>{index===0?'Cover · ':''}{image.name||'Uploaded photo'}</Text><Button title="↑" outline disabled={busy||index===0} onPress={()=>moveImage(index,-1)}/><Button title="↓" outline disabled={busy||index===imageOrder.length-1} onPress={()=>moveImage(index,1)}/><Button title="Remove" outline disabled={busy} onPress={()=>existing?removeImage(image.path):removeFile(image.uri)}/></View>;})}
   {busy&&files.length>0&&<Text accessibilityRole="status">Uploading photos · {progress}%</Text>}
   <Notice error={error}/>
   <Button title={busy?post?'Saving…':'Publishing…':post?'Save changes':'Post'} disabled={disabled||!title.trim()} onPress={()=>void save()}/>
  </Card>
 </Page>;
}

export function MyPostsScreen({navigation,route}){
 const {profile,user}=useAuth(),shop=profile?.role==='shop',type=shop?'showcase':'build';
 const feed=usePostsFeed({view:'mine',shopId:shop?user?.uid:undefined});
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<240)feed.loadNext();};
 const onContentSizeChange=(_,height)=>{if(height<650)feed.loadNext();};
 return <Page title={shop?'My Posts':'My builds'} navigation={navigation} onScroll={onScroll} onContentSizeChange={onContentSizeChange} refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}>
  {shop&&<Button title="Shop account settings" outline onPress={()=>navigation.navigate('ShopAccount')}/>}
  <Button title={shop?'New showcase':'Share a build'} disabled={feed.busy||!shop} onPress={()=>navigation.navigate('PostForm',{type})}/>
  <Notice busy={feed.busy} error={feed.error}/>
  {!!feed.error&&<Button title="Retry loading posts" outline onPress={()=>void feed.refresh()}/>}
  {feed.items.filter(post=>post.type===type).map(post=><PostCard key={post.id} post={post} editable onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onEdit={item=>navigation.navigate('PostForm',{type,post:item})} onRemoved={()=>void feed.refresh()}/>)}
  {!feed.busy&&!feed.error&&!feed.items.length&&<Text>{shop?'No posts yet.':'You have not shared any builds yet.'}</Text>}
  {feed.busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more posts...</Text>}
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
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setBusy(true);setPost(null);setError('');postsApi('get',{id:route.params?.id},user?.uid).then(result=>{if(active)setPost(result.post);}).catch(e=>{if(active)setError(e.message||failure(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[route.params?.id,user?.uid,retry]);
 const photos=post?.images||[],vehicle=post?.vehicle;
 return <Page title="Showcase" navigation={navigation} showTabs={false}>
  <Notice busy={busy} error={error}/>
  {!!error&&<Button title="Retry loading post" outline onPress={()=>setRetry(value=>value+1)}/>}
  {post&&<Card>
   <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{photos.map((image,index)=><Image key={image.path||image.url||index} source={{uri:image.url||image}} style={styles.detailImage} resizeMode="cover"/>)}</ScrollView>
   <Text weight="medium" style={styles.detailTitle}>{post.title}</Text>
   <Text style={styles.categoryChip}>{post.serviceCategory||post.category}</Text>
   {!!post.description&&<Text>{post.description}</Text>}
   {(vehicle?.make||vehicle?.model||vehicle?.year)&&<Text style={styles.muted}>{[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')}</Text>}
   {!!post.shop&&<Pressable accessibilityRole="button" onPress={()=>navigation.navigate('ShopProfile',{shop:post.shop})} style={styles.shopRow}>
    <Image source={post.shop.avatar?{uri:post.shop.avatar}:undefined} style={styles.shopAvatar}/>
    <View><Text weight="medium">{post.shop.name}</Text><Text style={styles.muted}>{[post.shop.city,post.shop.province].filter(Boolean).join(' · ')}</Text></View>
    <Text style={styles.shopLink}>View shop →</Text>
   </Pressable>}
  </Card>}
 </Page>;
}

export function ShareBuildButton({navigation}){return <Button title="Share a build" onPress={()=>navigation.navigate('PostForm',{type:'build'})}/>;}
export function ShopProfileScreen({navigation,route}){
 const shop=route.params?.shop,feed=usePostsFeed({view:'feed',shopId:shop?.id});
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<240)feed.loadNext();};
 return <Page title={shop?.name||'Workshop'} subtitle={[shop?.city,shop?.province].filter(Boolean).join(' · ')} navigation={navigation} onScroll={onScroll} refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}>
  <Notice busy={feed.busy} error={feed.error}/>
  {feed.items.map(post=><PostCard key={post.id} post={post} onOpen={()=>navigation.navigate('PostDetail',{id:post.id})}/>)}
  {!feed.busy&&!feed.error&&!feed.items.length&&<Text>No posts yet.</Text>}
 </Page>;
}
const styles=StyleSheet.create({pills:{flexDirection:'row',flexWrap:'wrap',gap:7},pill:{paddingHorizontal:11,paddingVertical:7,borderWidth:1,borderColor:colors.border,borderRadius:999},selected:{backgroundColor:colors.primary,borderColor:colors.primary},pillText:{fontSize:12,color:colors.textSecondary},selectedText:{color:colors.white},photoRow:{flexDirection:'row',alignItems:'center',gap:6},preview:{width:48,height:48,borderRadius:8,backgroundColor:colors.background},photoName:{flex:1,color:colors.textSecondary},warning:{color:colors.error},muted:{color:colors.textSecondary},detailImage:{width:300,height:260,borderRadius:14,marginRight:8,backgroundColor:colors.background},detailTitle:{fontSize:22},categoryChip:{alignSelf:'flex-start',borderRadius:999,overflow:'hidden',paddingHorizontal:10,paddingVertical:5,backgroundColor:colors.background,color:colors.textSecondary},shopRow:{flexDirection:'row',alignItems:'center',gap:10,paddingTop:12,borderTopWidth:1,borderColor:colors.border},shopAvatar:{width:44,height:44,borderRadius:22,backgroundColor:colors.background},shopLink:{marginLeft:'auto',color:colors.primary}});
