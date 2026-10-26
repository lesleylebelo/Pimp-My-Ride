import {useCustomerExperience,CustomerPressable} from '../../customer/components/CustomerUI';
import React, {useCallback,useEffect,useRef,useState} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useIsFocused} from '@react-navigation/native';
import {usePhotoSource} from '../../../shared/components/PhotoSourceChooser';
import * as ImageManipulator from 'expo-image-manipulator';
import {useAuth} from '../../auth/context/AuthContext';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {Button,Card,Notice} from './MarketplaceUI';
import {listPhotos,viewPhoto,uploadVehiclePhoto,removeVehiclePhoto} from '../services/photoApi';
import {PHOTO_LIMIT,preparePhoto,photoFileError} from '../utils/photos';
import colors from '../../../shared/theme/colors';
import {isMediaUrl} from '../../../shared/services/mediaUrl';
import {useTheme} from '../../../shared/theme/ThemeContext';

function GalleryForAccount({target,id,editable,uid,offline,selectedIds=[],onSelectionChange,disabled=false,presentation}) {
 const {theme}=useTheme(),customer=useCustomerExperience(),garage=presentation==='garage',styles=makeStyles(customer||garage?theme:colors,garage),Interaction=customer?CustomerPressable:Pressable;
 const focused = useIsFocused();
 const photoSource=usePhotoSource({scopeKey:JSON.stringify([uid,target,id]),enabled:!offline&&!disabled&&editable});
 const [items,setItems] = useState([]), [version,setVersion] = useState(null), [canManage,setCanManage] = useState(false);
 const [loading,setLoading] = useState(false), [fresh,setFresh] = useState(false), [error,setError] = useState('');
 const [files,setFiles] = useState({}), [messages,setMessages] = useState({}), [busy,setBusy] = useState(false);
 const [preview,setPreview] = useState(null), [viewing,setViewing] = useState(null);
 const active = useRef(false), generation = useRef(0), viewGeneration = useRef(0), connectionEpoch = useRef(0), mutationLock = useRef(false), pickerLock = useRef(false), viewLock = useRef(false);
 const permission = useRef({});
 permission.current = {offline,focused,fresh,canManage,loading,busy,editable,version,disabled,selectedIds,onSelectionChange};
 const connected = !!uid && focused && !offline;
 const canChange = connected && editable && target === 'vehicle' && canManage && fresh && !loading && !busy && !disabled;
 useEffect(() => { active.current = true; return () => { active.current = false; ++generation.current; ++viewGeneration.current; }; },[]);

 const refresh = useCallback(async () => {
  const current = ++generation.current;
  ++viewGeneration.current; viewLock.current = false; setPreview(null); setViewing(null);
  if (!uid || permission.current.offline || !permission.current.focused) return false;
  setLoading(true); setFresh(false); setError('');
  try {
   const result = await listPhotos(target,id,uid);
   if (!active.current || current !== generation.current) return false;
   if (target === 'vehicle' && !Number.isSafeInteger(result.version)) throw new Error('Unable to read the current photo version. Refresh and try again.');
   setItems(result.items); setVersion(result.version ?? null); setCanManage(result.canManage === true); setFresh(true);
   return true;
  } catch (e) {
   if (active.current && current === generation.current) setError(e.message || 'Unable to load photos. Try again.');
   return false;
  } finally { if (active.current && current === generation.current) setLoading(false); }
 },[target,id,uid]);

 useEffect(() => {
  ++connectionEpoch.current;
  ++generation.current; ++viewGeneration.current; viewLock.current = false;
  setItems([]); setVersion(null); setFresh(false); setCanManage(false); setPreview(null); setViewing(null); setError(''); setLoading(false);
  if (connected) void refresh();
  return () => { ++connectionEpoch.current; ++generation.current; ++viewGeneration.current; };
 },[connected,refresh]);

 useEffect(() => {
  if (!preview?.url) return;
  const timer = setTimeout(() => setPreview(value => value?.photoId === preview.photoId ? {...value,url:null,error:'This preview expired. View the photo again.'} : value),Math.max(0,preview.expiresAt-Date.now()));
  return () => clearTimeout(timer);
 },[preview]);

 function mayChange() {
  const p = permission.current;
  return active.current && !p.offline && p.focused && !p.disabled && p.editable && p.canManage && p.fresh && !p.loading && !mutationLock.current && !pickerLock.current;
 }
 async function choose(slot) {
  if (!mayChange()) return;
  const epoch = connectionEpoch.current, current = generation.current;
  pickerLock.current = true; setMessages(value => ({...value,[slot]:''}));
  try {
   const picked = await photoSource.choose({maximum:1});
   let chosen=picked.assets?.[0];
   if(chosen)chosen={...chosen,name:chosen.fileName||chosen.name,size:chosen.fileSize??chosen.size};
   if(!picked.canceled&&chosen&&(picked.source==='camera'||!chosen.mimeType||!chosen.name||/image\/(heic|heif)/i.test(chosen.mimeType)||/\.(heic|heif)$/i.test(chosen.name||''))){
    chosen=await preparePhoto(chosen,ImageManipulator);
   }
   const p = permission.current;
   if (!active.current || epoch !== connectionEpoch.current || current !== generation.current || p.offline || !p.focused || p.disabled || !p.editable || !p.canManage || !p.fresh || p.loading || mutationLock.current || picked.canceled) return;
   const file = chosen, issue = photoFileError(file);
   if (issue) { setMessages(value => ({...value,[slot]:issue})); return; }
   setFiles(value => ({...value,[slot]:file}));
  } catch (e) { if (active.current && epoch === connectionEpoch.current && current === generation.current && !permission.current.offline && permission.current.focused) setMessages(value => ({...value,[slot]:e.message||'Unable to choose a photo. Try again.'})); }
  finally { pickerLock.current = false; }
 }
 async function mutate(slot,remove=false) {
  if (!mayChange()) return;
  const file = files[slot];
  if (!remove && photoFileError(file)) return;
  const epoch = connectionEpoch.current;
  mutationLock.current = true; setBusy(true); setFresh(false); setError('');
  ++generation.current; ++viewGeneration.current; setPreview(null); setViewing(null);
  setMessages(value => ({...value,[slot]:''}));
  let acknowledged = false;
  try {
   if (remove) await removeVehiclePhoto(id,slot,permission.current.version,uid);
   else await uploadVehiclePhoto(id,slot,permission.current.version,file,uid);
   if (!active.current || epoch !== connectionEpoch.current || permission.current.offline || !permission.current.focused) return;
   acknowledged = true;
   setFiles(value => ({...value,[slot]:null}));
   setMessages(value => ({...value,[slot]:remove ? 'Photo removed from this vehicle. Published requests keep their attached copy.' : 'Photo uploaded successfully.'}));
   const updated = await refresh();
   if (!updated && active.current && !permission.current.offline && permission.current.focused) setError('Your change was saved, but photo status could not refresh. Refresh photos before making another change.');
  } catch (e) {
   if (active.current && epoch === connectionEpoch.current && !permission.current.offline && permission.current.focused) {
    const message = `${e.message || 'Unable to save this change.'} ${remove ? '' : 'Your selected photo is kept. '}Refresh photos to check the latest saved status before retrying.`;
    setMessages(value => ({...value,[slot]:message}));
    throw new Error(message);
   }
  } finally {
   mutationLock.current = false;
   if (active.current) { setBusy(false); if (!acknowledged) setFresh(false); }
  }
 }
 async function view(photoId) {
  const p = permission.current;
  if (!active.current || p.offline || !p.focused || p.disabled || !p.fresh || p.loading || mutationLock.current || viewLock.current) return;
  const current = ++viewGeneration.current;
  viewLock.current = true; setViewing(photoId); setPreview(null);
  try {
   const result = await viewPhoto(target,id,photoId,uid), expiresAt = Math.min(Number(result.expiresAt),Date.now()+60000);
   if (!active.current || current !== viewGeneration.current || permission.current.offline || !permission.current.focused || permission.current.disabled) return;
   if (!isMediaUrl(result.url) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('This preview expired. View the photo again.');
   setPreview({photoId,url:result.url,expiresAt,error:''});
  } catch (e) {
   if (active.current && current === viewGeneration.current) setPreview({photoId,url:null,error:e.message || 'Unable to view this photo. Try again.'});
  } finally {
   if (current === viewGeneration.current) { viewLock.current = false; if (active.current) setViewing(null); }
  }
 }
 function toggle(item) {
  const p = permission.current;
  if (!active.current || target !== 'vehicle' || !p.onSelectionChange || p.offline || !p.focused || p.disabled || !p.fresh || p.loading) return;
  const next = p.selectedIds.includes(item.id) ? p.selectedIds.filter(value => value !== item.id) : p.selectedIds.length < PHOTO_LIMIT ? [...p.selectedIds,item.id] : p.selectedIds;
  if (next !== p.selectedIds) { permission.current.selectedIds = next; p.onSelectionChange(next); }
 }

 const photoCard = (item,slot) => {
  const isAttached = item && selectedIds.includes(item.id);
  return (
    <Card key={slot || item?.id} testID={`photo-${slot || item?.id}`} style={garage?styles.garageCard:undefined}>
      <Text style={styles.eyebrow}>{slot ? `PHOTO ${slot}` : 'PHOTO'}</Text>

      {item ? (
        <>
          <Text style={styles.photoName} numberOfLines={1}>{item.name || 'Saved photo'}</Text>
          <Text style={styles.photoMeta}>
            {Math.ceil(item.size/1024)} KB{item.uploadedAt ? ` · ${new Date(item.uploadedAt).toLocaleDateString()}` : ''}
          </Text>

          <Button
            title={viewing === item.id ? 'Opening…' : 'View photo'}
            outline
            disabled={disabled || !connected || !fresh || loading || busy || !!viewing}
            onPress={() => view(item.id)}
          />

          {target === 'vehicle' && !!onSelectionChange && (
            <Button
              title={isAttached ? 'Detach from request' : 'Attach to request'}
              outline={!isAttached}
              disabled={disabled || !connected || !fresh || loading || (!isAttached && selectedIds.length >= PHOTO_LIMIT)}
              onPress={() => toggle(item)}
            />
          )}

          {!garage && preview?.photoId === item.id && (
            <>
              {preview.url && (
                <Image
                  accessibilityLabel={`Preview of ${item.name}`}
                  source={{uri:preview.url,cache:'reload'}}
                  resizeMode="contain"
                  style={styles.preview}
                  onError={() => setPreview(value => value?.photoId === item.id && value.url === preview.url ? {...value,url:null,error:'Unable to load this preview. View the photo again.'} : value)}
                />
              )}
              {!!preview.error && <Text accessibilityRole="alert" style={styles.error}>{preview.error}</Text>}
            </>
          )}
        </>
      ) : (
        <Text style={styles.status}>
          {loading ? 'Checking saved status…' : busy ? 'Saving photo…' : error || !fresh ? 'Saved status unavailable. Refresh photos before retrying.' : 'No photo uploaded yet'}
        </Text>
      )}

      {slot && editable && canManage && (
        <>
          <Button
            title={item ? 'Choose replacement' : 'Choose photo'}
            outline={garage}
            disabled={!canChange}
            onPress={() => choose(slot)}
          />

          {!!files[slot] && (
            <>
              {garage&&<Image accessibilityLabel={`Selected photo: ${files[slot].name}`} source={{uri:files[slot].uri}} style={styles.selectedPreview} resizeMode="cover"/>}
              <Text style={styles.fileName} numberOfLines={1}>Selected: {files[slot].name}</Text>
              <ConfirmationButton
                palette={garage?theme:undefined}
                title={item ? 'Replace photo' : 'Upload photo'}
                message={item ? 'Replace this vehicle photo? Photos already attached to published requests will stay unchanged.' : 'Upload this photo to your private vehicle library? You can attach it when publishing a service request.'}
                disabled={!canChange}
                onConfirm={() => mutate(slot)}
              />
              <Button
                title="Discard selection"
                outline
                disabled={disabled || busy}
                onPress={() => { if (!permission.current.disabled && !mutationLock.current) setFiles(value => ({...value,[slot]:null})); }}
              />
            </>
          )}

          {!!item && (
            <ConfirmationButton
              palette={garage?theme:undefined}
              title="Remove photo"
              danger
              message="Remove this photo from your vehicle? Published requests will keep their attached copy."
              disabled={!canChange}
              onConfirm={() => mutate(slot,true)}
            />
          )}
        </>
      )}

      {!!messages[slot] && <Text accessibilityRole="status" style={styles.message}>{messages[slot]}</Text>}
    </Card>
  );
 };

 return (
  <View style={styles.container}>
    {photoSource.chooser}
    <View style={styles.intro}>
      <Text style={styles.heading}>{garage?'Private photo library':target === 'vehicle' ? 'Vehicle photos' : 'Request photos'}</Text>
      {editable && (
        <Text style={styles.introText}>
          Up to {PHOTO_LIMIT} photos. JPEG, PNG, WebP or HEIC, up to 5 MB each. Choose from your device, then confirm the upload.
        </Text>
      )}
    </View>

    {!uid ? (
      <Text style={styles.status}>Sign in to view photos.</Text>
    ) : offline ? (
      <Text style={styles.status}>Connect to view or manage photos.</Text>
    ) : focused && (
      <>
        <Notice busy={loading || busy} error={error} />
        {garage&&<>
          {!!items.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>
            {items.map(item=><Interaction key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.name||'saved photo'}`} accessibilityState={{selected:preview?.photoId===item.id,disabled:disabled||!connected||!fresh||loading||busy||!!viewing}} disabled={disabled||!connected||!fresh||loading||busy||!!viewing} onPress={()=>view(item.id)} style={[styles.thumbnail,preview?.photoId===item.id&&styles.selectedThumbnail]}>
              {preview?.photoId===item.id&&preview.url?<Image source={{uri:preview.url,cache:'reload'}} style={styles.thumbnailImage} resizeMode="cover" accessibilityLabel={`Thumbnail of ${item.name||'saved photo'}`}/>:<Ionicons name="image-outline" size={26} color={theme.textSecondary}/>}
              <Text style={styles.thumbnailLabel}>{item.slot?`Photo ${item.slot}`:'Photo'}</Text>
            </Interaction>)}
          </ScrollView>}
          {preview?.url?<Image accessibilityLabel="Large vehicle photo preview" source={{uri:preview.url,cache:'reload'}} resizeMode="contain" style={styles.largePreview} onError={()=>setPreview(value=>value?.photoId===preview.photoId&&value.url===preview.url?{...value,url:null,error:'Unable to load this preview. View the photo again.'}:value)}/>:<View style={styles.previewPlaceholder}><Ionicons name="images-outline" size={48} color={theme.textSecondary}/><Text style={styles.status}>{loading?'Loading your private library…':items.length?'Choose a thumbnail to open a private preview.':'Add your first vehicle photo below.'}</Text></View>}
          {!!preview?.error&&<Text accessibilityRole="alert" style={styles.error}>{preview.error}</Text>}
          <Text style={styles.introText}>Previews open on request and expire automatically. The first saved photo is used as your garage cover.</Text>
        </>}
        <View style={garage?styles.photoGrid:styles.container}>{editable && canManage
          ? Array.from({length:PHOTO_LIMIT},(_,i) => {
              const slot = String(i+1);
              return photoCard(items.find(item => String(item.slot) === slot), slot);
            })
          : items.map(item => photoCard(item))}</View>
        {!loading && fresh && !items.length && !(editable && canManage) && <Text style={styles.status}>No photos attached.</Text>}
        {editable && fresh && !canManage && <Text style={styles.status}>Photo changes are not available for this vehicle.</Text>}
        <Button
          title="Refresh photos"
          outline
          disabled={disabled || loading || busy}
          onPress={() => { if (!permission.current.disabled && !mutationLock.current && !permission.current.loading) void refresh(); }}
        />
      </>
    )}
  </View>
 );
}

export default function PhotoGallery({target,id,editable=false,selectedIds,onSelectionChange,disabled=false,presentation}) {
 const {user,offline} = useAuth(), uid = user?.uid;
 return <GalleryForAccount key={`${uid || 'signed-out'}:${target}:${id}`} target={target} id={id} editable={editable} uid={uid} offline={offline} selectedIds={selectedIds} onSelectionChange={onSelectionChange} disabled={disabled} presentation={presentation}/>;
}

const makeStyles = (colors,garage=false) => StyleSheet.create({
  container: { gap: 16 },
  intro: { gap: 6 },
  heading: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.2 },
  introText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: garage?colors.textSecondary:colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  photoName: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  photoMeta: { fontSize: 13, color: colors.textSecondary },
  status: { fontSize: 14, color: colors.textSecondary },
  fileName: { fontSize: 13, color: colors.textSecondary },
  message: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  error: { fontSize: 13, color: colors.error },
  preview: { width: '100%', height: 240, borderRadius: 12, marginTop: 4 },
  photoGrid:{flexDirection:'row',flexWrap:'wrap',gap:16},garageCard:{flexGrow:1,flexBasis:280,minWidth:0,borderWidth:0,borderRadius:20,padding:18,gap:12},
  thumbnails:{gap:12,paddingVertical:4},thumbnail:{width:100,minHeight:100,borderRadius:16,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center',padding:8,gap:5,borderWidth:2,borderColor:'transparent'},selectedThumbnail:{borderColor:colors.textPrimary},thumbnailImage:{width:80,height:64,borderRadius:10},thumbnailLabel:{fontSize:12,lineHeight:18,color:colors.textSecondary},
  largePreview:{width:'100%',height:360,borderRadius:20,backgroundColor:colors.surfaceMuted},previewPlaceholder:{height:260,borderRadius:20,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center',padding:24,gap:16},selectedPreview:{width:'100%',height:160,borderRadius:12},
});
