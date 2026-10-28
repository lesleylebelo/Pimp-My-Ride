import {WorkshopReviews} from '../components/ServiceReviews';
import {CustomerAction,CustomerGrid,CustomerPressable,useCustomerExperience} from '../../customer/components/CustomerUI';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Image,Pressable,RefreshControl,ScrollView,View,useWindowDimensions} from 'react-native';
import {LandingText as Text} from '../../../shared/components/landing/LandingUI';
import {useAuth} from '../../auth/context/AuthContext';
import {postsApi,pickPostPhotos,uploadPostPhoto} from '../services/postsApi';
import {usePostsFeed} from '../hooks/usePostsFeed';
import {PostCard} from '../components/PostCard';
import {Page,Field,Notice,useInfiniteCursor} from '../components/MarketplaceUI';
import {useMarketData} from '../hooks/useMarketData';
import colors from '../../../shared/theme/colors';
import {isMediaUrl} from '../../../shared/services/mediaUrl';
import ShowcasePhoto,{hasPostImage} from '../components/ShowcasePhoto';
import AIAssistButton from '../components/AIAssistButton';
import {useTheme} from '../../../shared/theme/ThemeContext';
import {ShowcaseAction as Button,ShowcasePage,WorkshopIdentity,ShowcaseEmpty,showcaseStyles} from '../components/ShowcaseUI';
import {WorkshopFeedColumn} from '../components/WorkshopFeedCards';
import {usePhotoSource} from '../../../shared/components/PhotoSourceChooser';
import {useIsFocused} from '@react-navigation/native';
import {usePostBookmark} from '../hooks/usePostBookmark';
import {bookmarkRevision,bookmarkSnapshot,subscribeBookmarks} from '../services/bookmarkState';
const categories = ['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
const failure=e=>e?.message||'Unable to save this post. Please retry.';

export function PostFormScreen({navigation,route}){
 const {theme}=useTheme(),ui=showcaseStyles(theme),[review,setReview]=useState(false),{width,fontScale}=useWindowDimensions();
 const {user,profile,offline}=useAuth(),post=route.params?.post,type=route.params?.type||(profile?.role==='shop'?'showcase':'build'),shop=profile?.role==='shop';
 const focused=useIsFocused(),photoSource=usePhotoSource({scopeKey:user?.uid,enabled:!offline});
 const selectionEpoch=useRef(0),selectionLock=useRef(false);
 useEffect(()=>{++selectionEpoch.current;return()=>{++selectionEpoch.current;};},[user?.uid,offline,focused]);
 const savedImages=(Array.isArray(post?.images)?post.images:[]).filter(image=>typeof image?.path==='string'&&(typeof image.bucket==='string'||isMediaUrl(image.url)));
 const invalidSavedMedia=!!post&&(post.images!=null&&!Array.isArray(post.images)||Array.isArray(post.images)&&savedImages.length!==post.images.length);
 const [title,setTitle]=useState(post?.title||''),[description,setDescription]=useState(post?.description||''),[category,setCategory]=useState(post?.category||'Other');
 const oldVehicle=typeof post?.vehicle==='string'?post.vehicle:'';
 const [status,setStatus]=useState(post?.projectStatus||'In progress'),[vehicle,setVehicle]=useState(oldVehicle),[vehicleMake,setVehicleMake]=useState(post?.vehicle?.make||''),[vehicleModel,setVehicleModel]=useState(post?.vehicle?.model||''),[vehicleYear,setVehicleYear]=useState(post?.vehicle?.year?String(post.vehicle.year):''),[images,setImages]=useState(savedImages);
 const [files,setFiles]=useState([]),[imageOrder,setImageOrder]=useState(()=>savedImages.map(image=>`p:${image.path}`)),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const lock=useRef(false),confirmedUploads=useRef(new Map()),verified=shop&&profile?.verificationStatus==='approved';
 async function selectPhotos(){
  if(busy||offline||!focused||selectionLock.current)return;
  selectionLock.current=true;const epoch=selectionEpoch.current;
  try{
   const selected=await pickPostPhotos(Math.max(0,10-images.length-files.length),{selectAssets:photoSource.choose});if(epoch!==selectionEpoch.current)return;
   // Web processing can return the same data URI when the same photo is picked
   // again from camera/gallery. URI keys and pending uploads must stay unique.
   const known=new Set(files.map(file=>file.uri)),added=selected.filter(file=>{if(known.has(file.uri))return false;known.add(file.uri);return true;}).slice(0,Math.max(0,10-images.length-files.length));
   setFiles(previous=>[...previous,...added]);setImageOrder(previous=>[...previous,...added.map(file=>`f:${file.uri}`)]);
  }
  catch(e){if(__DEV__)console.error('[PimpMyRide showcase photo picker failed]',e);setError(failure(e));}
  finally{selectionLock.current=false;}
 }
 async function save(){
  if(lock.current||busy||offline)return;
  setError('');
  if(invalidSavedMedia){setError('This post contains older or invalid photo references and cannot be edited safely. Its published media has been retained.');return;}
  if(!verified&&shop){setError('Shop verification is required before you can publish a showcase.');return;}
  if(!title.trim()||title.trim().length>100||description.trim().length>2000){setError('Enter a title (up to 100 characters) and a description up to 2000 characters.');return;}
  if(shop&&images.length+files.length<1){setError('Add at least one photo to your showcase.');return;}
  lock.current=true;setBusy(true);setProgress(0);const uploaded=[];
  try{
   const uploadedByUri=new Map();
   for(const [index,file] of files.entries()){
    const prior=confirmedUploads.current.get(file);
    const result=prior?.uid===user?.uid?prior.result:await uploadPostPhoto(file,user?.uid,value=>setProgress(Math.round(((index+value/100)/files.length)*100)));
    if(typeof result?.path!=='string'||!result.path.startsWith(`posts/${user?.uid}/`))throw new Error('The photo upload could not be confirmed. Try again.');
    confirmedUploads.current.set(file,{uid:user?.uid,result});
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
  }finally{lock.current=false;setBusy(false);}
 }
 function removeImage(path){if(!busy){setImages(current=>current.filter(image=>image.path!==path));setImageOrder(current=>current.filter(item=>item!==`p:${path}`));}}
 function removeFile(uri){if(!busy){setFiles(current=>current.filter(file=>file.uri!==uri));setImageOrder(current=>current.filter(item=>item!==`f:${uri}`));}}
 function moveImage(index,amount){
  if(busy)return;setImageOrder(current=>{const next=index+amount;if(next<0||next>=current.length)return current;const reordered=[...current];[reordered[index],reordered[next]]=[reordered[next],reordered[index]];return reordered;});
 }
 const disabled=busy||offline||shop&&!verified;
 const styles={pills:{flexDirection:'row',flexWrap:'wrap',gap:8},pill:{minHeight:44,padding:12,borderRadius:14,backgroundColor:theme.surfaceMuted},selected:{backgroundColor:theme.accentLight},pillText:{color:theme.textPrimary},selectedText:{color:theme.textPrimary},warning:{color:theme.error},photoRow:{width:width>=900&&fontScale<1.4?'48%':'100%',padding:12,borderRadius:16,backgroundColor:theme.surfaceMuted,gap:12},preview:{width:'100%',aspectRatio:4/3,borderRadius:12},photoName:{color:theme.textPrimary}};
 return <ShowcasePage title={post?'Edit post':shop?'New showcase':'Share a build'} navigation={navigation} keyboard>
  {photoSource.chooser}
  <Text style={ui.muted}>Add project details, choose your photos and review before publishing. Title is required.</Text>
  {offline&&<Text accessibilityRole="alert" style={ui.muted}>You are offline. Connect before selecting photos or publishing.</Text>}
  {shop&&!verified&&<Text style={styles.warning}>Shop verification is required before you can publish showcases. You can complete verification from My Shop.</Text>}
  <View style={ui.section}>
   <Text accessibilityRole="header" style={ui.heading}>Project details</Text>
   <Field label="Title" helperText="Required" value={title} onChangeText={setTitle} maxLength={shop?100:80} editable={!busy} placeholder="Give your post a title"/>
   <Field label="Description (optional)" value={description} onChangeText={setDescription} maxLength={shop?2000:1000} multiline inputStyle={{minHeight:140}} editable={!busy} placeholder="Tell everyone about this work"/>
   {shop&&type==='showcase'&&<AIAssistButton kind="showcase" title={title} description={description} categoryId={category} disabled={disabled} onApply={suggestion=>{setTitle(suggestion.title);setDescription(suggestion.description);if(suggestion.category)setCategory(suggestion.category.id);}}/>}
   <Text weight="medium">Service category</Text>
   <View style={styles.pills}>{categories.map(item=><Pressable key={item} accessibilityRole="button" accessibilityState={{selected:category===item}} onPress={()=>!busy&&setCategory(item)} style={[styles.pill,category===item&&styles.selected]}><Text style={[styles.pillText,category===item&&styles.selectedText]}>{item}</Text></Pressable>)}</View>
   {shop?<><Field label="Vehicle make (optional)" value={vehicleMake} onChangeText={setVehicleMake} maxLength={80} editable={!busy} placeholder="e.g. Volkswagen"/><Field label="Vehicle model (optional)" value={vehicleModel} onChangeText={setVehicleModel} maxLength={80} editable={!busy} placeholder="e.g. Golf"/><Field label="Vehicle year (optional)" value={vehicleYear} onChangeText={setVehicleYear} maxLength={4} keyboardType="number-pad" editable={!busy} placeholder="e.g. 2024"/></>:<Field label="Vehicle (optional)" value={vehicle} onChangeText={setVehicle} maxLength={120} editable={!busy} placeholder="For example, 2020 VW Golf 7"/>}
   <Text accessibilityRole="header" style={ui.heading}>Project photos</Text>
   <Text style={ui.muted}>The first photo is your cover. Photo changes apply when you save the project.</Text>
   <Button title={`Add photos (${images.length+files.length}/${shop?10:6})`} outline disabled={disabled||images.length+files.length>=(shop?10:6)} onPress={()=>void selectPhotos()}/>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{imageOrder.map((key,index)=>{const existing=key.startsWith('p:'),image=existing?images.find(item=>item.path===key.slice(2)):files.find(item=>item.uri===key.slice(2));if(!image)return null;return <View key={key} style={styles.photoRow}><View>{existing?<ShowcasePhoto postId={post?.id} image={image} style={styles.preview}/>:<Image accessibilityLabel={'Selected project photo '+(index+1)} source={{uri:image.uri}} style={styles.preview}/>}</View><Text style={styles.photoName}>{index===0?'Cover · ':''}{image.name||'Uploaded photo'}</Text><Button title="Move photo earlier" icon="arrow-up" outline disabled={busy||index===0} onPress={()=>moveImage(index,-1)}/><Button title="Move photo later" icon="arrow-down" outline disabled={busy||index===imageOrder.length-1} onPress={()=>moveImage(index,1)}/><Button title="Remove" outline disabled={busy} onPress={()=>existing?removeImage(image.path):removeFile(image.uri)}/></View>;})}</View>
   {busy&&files.length>0&&<Text accessibilityRole="status">Uploading photos · {progress}%</Text>}
   <Notice error={error}/>
   {shop&&<Button title={review?'Close project review':'Review showcase'} outline disabled={busy} onPress={()=>setReview(value=>!value)}/>}
   {shop&&review&&<View accessibilityLabel="Showcase review" style={ui.section}><Text style={ui.heading}>{title.trim()||'Add a title'}</Text><Text style={ui.body}>{description.trim()||'No description added.'}</Text><Text style={ui.muted}>{category} · {imageOrder.length} photos · Cover shown first</Text><Text style={ui.muted}>Publishing makes this showcase visible in the marketplace. Review does not publish your project.</Text></View>}
   <Button title={busy?post?'Saving…':'Publishing…':post?'Save changes':'Post'} disabled={disabled||!title.trim()} onPress={()=>void save()}/>
  </View>
  <Button title="Cancel" outline disabled={busy} onPress={()=>navigation.goBack()}/>
 </ShowcasePage>;
}

export function MyPostsScreen({navigation,route}){
 const {theme}=useTheme(),ui=showcaseStyles(theme),{width,fontScale}=useWindowDimensions();
 const {profile,user}=useAuth(),shop=profile?.role==='shop',type=shop?'showcase':'build';
 const feed=usePostsFeed({view:'mine',shopId:shop?user?.uid:undefined});
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<240)feed.loadNext();};
 const onContentSizeChange=(_,height)=>{if(height<650)feed.loadNext();};
 return <ShowcasePage showTabs title={shop?'My Shop':'My builds'} navigation={navigation} onScroll={onScroll} onContentSizeChange={onContentSizeChange} refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}>
  {shop&&<WorkshopIdentity own shop={{profilePhotoRevision:profile?.profilePhotoRevision,name:profile?.shop?.shopName,avatar:profile?.shop?.avatarUrl||profile?.avatarUrl||profile?.photoURL,city:profile?.shop?.city,province:profile?.shop?.province,verificationStatus:profile?.verificationStatus}}/>}
  {shop&&<Button title="Shop account settings" outline onPress={()=>navigation.navigate('ShopAccount')}/>}
  {shop&&<Button title="Saved posts" icon="bookmark-outline" outline onPress={()=>navigation.navigate('SavedPosts')}/>}
  <Button title={shop?'New showcase':'Share a build'} disabled={feed.busy||!shop} onPress={()=>navigation.navigate('PostForm',{type})}/>
  <Notice busy={feed.busy} error={feed.error}/>
  {!!feed.error&&<Button title="Retry loading posts" outline onPress={()=>void feed.refresh()}/>}
  <Text accessibilityRole="header" style={ui.heading}>{shop?'Your portfolio':'Your builds'}</Text>
  <View style={shop?{width:'100%',maxWidth:680,alignSelf:'center',gap:24}:{flexDirection:'row',flexWrap:'wrap',gap:18}}>{feed.items.filter(post=>post.type===type).map(post=><View key={post.id} style={{width:shop?'100%':width>=800&&fontScale<1.4?'48%':'100%'}}><PostCard post={post} presentation={shop?'feed':'card'} editable onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onEdit={item=>navigation.navigate('PostForm',{type,post:item})} onRemoved={()=>void feed.refresh()}/></View>)}</View>
  {!feed.busy&&!feed.error&&!feed.items.length&&<ShowcaseEmpty>{shop?'Add your first showcase to start your portfolio.':'You have not shared any builds yet.'}</ShowcaseEmpty>}
  {feed.busy&&!!feed.items.length&&<Text style={ui.muted}>Loading more posts...</Text>}
 </ShowcasePage>;
}

export function SavedPostsScreen({navigation}){
 const {user,offline}=useAuth(),feed=usePostsFeed({view:'saved'});
 useSyncExternalStore(subscribeBookmarks,bookmarkRevision,bookmarkRevision);
 const items=offline?[]:feed.items.filter(post=>bookmarkSnapshot(user?.uid,post.id)?.saved!==false);
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<400)feed.loadNext();};
 return <ShowcasePage title="Saved posts" navigation={navigation} onScroll={onScroll} refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}>
  <Notice busy={feed.busy} error={offline?'Connect to view saved posts.':feed.error}/>
  {!!feed.error&&<Button title="Retry loading saved posts" outline onPress={()=>void feed.refresh()}/>}
  <WorkshopFeedColumn>{items.map(post=><PostCard key={post.id} post={{...post,saved:true}} presentation="feed" onOpen={()=>navigation.navigate('PostDetail',{id:post.id})} onProfile={post.shop?.id?()=>navigation.navigate('ShopProfile',{shop:post.shop}):undefined}/>)}</WorkshopFeedColumn>
  {!offline&&!feed.busy&&!feed.error&&!items.length&&!feed.cursor&&<ShowcaseEmpty>You have not saved any posts yet.</ShowcaseEmpty>}
  {!!feed.cursor&&<Button title="Load more saved posts" outline disabled={feed.busy||offline} onPress={feed.loadNext}/>}
  <Button title="Refresh saved posts" outline disabled={feed.busy||offline} onPress={()=>void feed.refresh()}/>
 </ShowcasePage>;
}

export function PostDetailScreen({navigation,route}){
 const {theme}=useTheme(),ui=showcaseStyles(theme),{width}=useWindowDimensions(),[selected,setSelected]=useState(0);
 const customer=useCustomerExperience(),Interaction=customer?CustomerPressable:Pressable;
 const {user}=useAuth(),[loaded,setPost]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const post=loaded&&loaded.uid===user?.uid&&loaded.id===route.params?.id?loaded.post:null;
 const bookmark=usePostBookmark(post);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setBusy(true);setPost(null);setError('');postsApi('get',{id:route.params?.id},user?.uid).then(result=>{if(active)setPost({uid:user?.uid,id:route.params?.id,post:result.post});}).catch(e=>{if(active)setError(e.message||failure(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[route.params?.id,user?.uid,retry]);
 const photos=(Array.isArray(post?.images)?post.images:[]).map(image=>typeof image==='string'?{url:image}:image).filter(hasPostImage),vehicle=post?.vehicle;
 useEffect(()=>setSelected(0),[post?.id]);
 const date=typeof post?.createdAt==='number'&&Number.isFinite(post.createdAt)?new Date(post.createdAt).toLocaleDateString('en-ZA'):null;
 return <ShowcasePage title="Project showcase" navigation={navigation}>
  <Notice busy={busy} error={error}/>
  {!!error&&<Button title="Retry loading post" outline onPress={()=>setRetry(value=>value+1)}/>}
  {!busy&&!error&&!post&&<ShowcaseEmpty>This project is unavailable or you do not have access.</ShowcaseEmpty>}
  {post&&<>
   {photos.length?<View style={{gap:12}}><ShowcasePhoto postId={post.id} image={photos[Math.min(selected,photos.length-1)]} style={[ui.photo,{maxHeight:620}]} resizeMode="contain"/>
   {photos.length>1&&<><Text style={ui.muted}>Photo {selected+1} of {photos.length}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12}}>{photos.map((image,index)=><Interaction key={image.path||image.url||index} accessibilityRole="button" accessibilityLabel={'View project photo '+(index+1)} accessibilityState={{selected:selected===index}} onPress={()=>setSelected(index)} style={{padding:3,borderWidth:2,borderColor:selected===index?theme.accent:'transparent',borderRadius:14}}><ShowcasePhoto postId={post.id} image={image} style={{width:Math.min(100,width/4),height:80,borderRadius:10}}/></Interaction>)}</ScrollView></>}
   </View>:<ShowcaseEmpty>No project photos available.</ShowcaseEmpty>}
   <View style={ui.section}><Text accessibilityRole="header" weight="semibold" style={ui.title}>{post.title}</Text>
   {!!(post.serviceCategory||post.category)&&<Text style={ui.chip}>{post.serviceCategory||post.category}</Text>}
   {!!post.description&&<Text style={ui.body}>{post.description}</Text>}
   {(vehicle?.make||vehicle?.model||vehicle?.year)&&<Text style={ui.muted}>{[vehicle.year,vehicle.make,vehicle.model].filter(Boolean).join(' ')}</Text>}
   {!!date&&<Text style={ui.muted}>Published {date}</Text>}</View>
   <CustomerAction title={bookmark.saved?'Unsave post':'Save post'} icon={bookmark.saved?'bookmark':'bookmark-outline'} accessibilityState={{selected:bookmark.saved}} loading={bookmark.busy} disabled={bookmark.disabled||bookmark.busy} onPress={()=>void bookmark.toggle()}/>
   {!!bookmark.error&&<Text accessibilityRole="alert">{bookmark.error}</Text>}
   {!!bookmark.message&&<Text accessibilityLiveRegion="polite">{bookmark.message}</Text>}
   {!!post.shop&&<><WorkshopIdentity shop={post.shop}/><Button title="View workshop portfolio" outline onPress={()=>navigation.navigate('ShopProfile',{shop:post.shop})}/></>}
  </>}
 </ShowcasePage>;
}

export function ShareBuildButton({navigation}){return <Button title="Share a build" onPress={()=>navigation.navigate('PostForm',{type:'build'})}/>;}
export function ShopProfileScreen({navigation,route}){
 const shop=route.params?.shop;
 if(!shop?.id)return <ShowcasePage title="Workshop portfolio" navigation={navigation}><ShowcaseEmpty>Workshop unavailable. Return to the project and try again.</ShowcaseEmpty></ShowcasePage>;
 return <ShopPortfolio navigation={navigation} shop={shop}/>;
}
function ShopPortfolio({navigation,shop}){
 const {theme}=useTheme(),ui=showcaseStyles(theme),{width,fontScale}=useWindowDimensions();
 const feed=usePostsFeed({view:'feed',shopId:shop.id}),customer=useCustomerExperience();
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<240)feed.loadNext();};
 return <ShowcasePage title="Workshop portfolio" navigation={navigation} onScroll={onScroll} refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={()=>void feed.refresh()}/>}>
  {shop?.id?<><WorkshopIdentity shop={shop}/>
  {customer&&<>{!!shop.services?.length&&<View style={ui.section}><Text style={ui.heading}>Services</Text><Text style={ui.body}>{Array.isArray(shop.services)?shop.services.join(' / '):shop.services}</Text></View>}{shop.id&&<CustomerAction title="Request a service" icon="construct-outline" primary onPress={()=>navigation.navigate('RequestForm',{shop:{id:shop.id,shopName:shop.name,city:shop.city}})}/>}</>}
  <WorkshopReviews shopId={shop.id}/>
  <Text accessibilityRole="header" style={ui.heading}>{customer?'Workshop showcases':'Featured work'}</Text>
  <Notice busy={feed.busy} error={feed.error}/>
  {!!feed.error&&<Button title="Retry loading portfolio" outline onPress={()=>void feed.refresh()}/>}
  {customer?<CustomerGrid>{feed.items.map(post=><PostCard key={post.id} post={post} onOpen={()=>navigation.navigate('PostDetail',{id:post.id})}/>)}</CustomerGrid>:<WorkshopFeedColumn>{feed.items.map(post=><PostCard key={post.id} post={post} presentation="feed" onOpen={()=>navigation.navigate('PostDetail',{id:post.id})}/>)}</WorkshopFeedColumn>}
  {!feed.busy&&!feed.error&&!feed.items.length&&<ShowcaseEmpty>This workshop has not shared any showcases yet.</ShowcaseEmpty>}
  {!!feed.cursor&&<Button title="Load more showcases" outline disabled={feed.busy} onPress={()=>feed.loadNext()}/>}</>:<ShowcaseEmpty>Workshop unavailable. Return to the project and try again.</ShowcaseEmpty>}
 </ShowcasePage>;
}
