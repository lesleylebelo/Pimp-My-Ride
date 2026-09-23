import React, {useCallback,useEffect,useRef,useState} from 'react';
import {Image,Text,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import {useAuth} from '../../auth/context/AuthContext';
import ConfirmationButton from '../../../shared/components/ConfirmationButton';
import {Button,Card,Notice} from './MarketplaceUI';
import {listPhotos,viewPhoto,uploadVehiclePhoto,removeVehiclePhoto} from '../services/photoApi';
import {PHOTO_LIMIT,PHOTO_TYPES,photoFileError} from '../utils/photos';

function GalleryForAccount({target,id,editable,uid,offline,selectedIds=[],onSelectionChange,disabled=false}) {
 const focused = useIsFocused();
 const [items,setItems] = useState([]), [version,setVersion] = useState(null), [canManage,setCanManage] = useState(false);
 const [loading,setLoading] = useState(false), [fresh,setFresh] = useState(false), [error,setError] = useState('');
 const [files,setFiles] = useState({}), [messages,setMessages] = useState({}), [busy,setBusy] = useState(false);
 const [preview,setPreview] = useState(null), [viewing,setViewing] = useState(null);
 const active = useRef(false), generation = useRef(0), viewGeneration = useRef(0), mutationLock = useRef(false), pickerLock = useRef(false), viewLock = useRef(false);
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
  ++generation.current; ++viewGeneration.current; viewLock.current = false;
  setItems([]); setVersion(null); setFresh(false); setCanManage(false); setPreview(null); setViewing(null); setError(''); setLoading(false);
  // Blurred screens and disconnected sessions do not keep private metadata or links.
  if (connected) void refresh();
  return () => { ++generation.current; ++viewGeneration.current; };
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
  pickerLock.current = true; setMessages(value => ({...value,[slot]:''}));
  try {
   const picked = await DocumentPicker.getDocumentAsync({type:PHOTO_TYPES,multiple:false,copyToCacheDirectory:true});
   if (!active.current || permission.current.offline || !permission.current.focused || picked.canceled) return;
   const file = picked.assets?.[0], issue = photoFileError(file);
   if (issue) { setMessages(value => ({...value,[slot]:issue})); return; }
   setFiles(value => ({...value,[slot]:file}));
  } catch (_) { if (active.current) setMessages(value => ({...value,[slot]:'Unable to choose a photo. Try again.'})); }
  finally { pickerLock.current = false; }
 }
 async function mutate(slot,remove=false) {
  if (!mayChange()) return;
  const file = files[slot];
  if (!remove && photoFileError(file)) return;
  mutationLock.current = true; setBusy(true); setFresh(false); setError('');
  ++generation.current; ++viewGeneration.current; setPreview(null); setViewing(null);
  setMessages(value => ({...value,[slot]:''}));
  let acknowledged = false;
  try {
   if (remove) await removeVehiclePhoto(id,slot,permission.current.version,uid);
   else await uploadVehiclePhoto(id,slot,permission.current.version,file,uid);
   if (!active.current) return;
   acknowledged = true;
   setFiles(value => ({...value,[slot]:null}));
   setMessages(value => ({...value,[slot]:remove ? 'Photo removed from this vehicle. Published requests keep their attached copy.' : 'Photo uploaded successfully.'}));
   const updated = await refresh();
   if (!updated && active.current && !permission.current.offline && permission.current.focused) setError('Your change was saved, but photo status could not refresh. Refresh photos before making another change.');
  } catch (e) {
   if (active.current) setMessages(value => ({...value,[slot]:`${e.message || 'Unable to save this change.'} ${remove ? '' : 'Your selected photo is kept. '}Refresh photos to check the latest saved status before retrying.`}));
  } finally {
   mutationLock.current = false;
   if (active.current) { setBusy(false); if (!acknowledged) setFresh(false); }
  }
 }
 async function view(photoId) {
  const p = permission.current;
  if (!active.current || p.offline || !p.focused || p.disabled || p.loading || mutationLock.current || viewLock.current) return;
  const current = ++viewGeneration.current;
  viewLock.current = true; setViewing(photoId); setPreview(null);
  try {
   const result = await viewPhoto(target,id,photoId,uid), expiresAt = Math.min(Number(result.expiresAt),Date.now()+60000);
   if (!active.current || current !== viewGeneration.current) return;
   if (typeof result.url !== 'string' || !result.url.startsWith('https://') || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('This preview expired. View the photo again.');
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
 const photoCard = (item,slot) => <Card key={slot || item.id} testID={`photo-${slot || item.id}`}>
  <Text style={{fontWeight:'700'}}>{slot ? `Photo ${slot}` : item.name || 'Request photo'}</Text>
  <Text>{item ? `Saved: ${item.name}` : loading || error || !fresh ? 'Saved status not confirmed.' : 'No photo uploaded.'}</Text>
  {!!item && <>
   <Text>{Math.ceil(item.size/1024)} KB{item.uploadedAt ? ` · Uploaded ${new Date(item.uploadedAt).toLocaleDateString()}` : ''}</Text>
   <Button title={viewing === item.id ? 'Opening photo...' : `View ${item.name}`} disabled={disabled || !connected || loading || busy || !!viewing} onPress={() => view(item.id)}/>
   {target === 'vehicle' && !!onSelectionChange && <Button title={`${selectedIds.includes(item.id) ? 'Detach' : 'Attach'} photo ${item.slot || item.name}`} outline disabled={disabled || !connected || !fresh || loading || (!selectedIds.includes(item.id) && selectedIds.length >= PHOTO_LIMIT)} onPress={() => toggle(item)}/>}
   {preview?.photoId === item.id && <>
    {preview.url && <Image accessibilityLabel={`Preview of ${item.name}`} source={{uri:preview.url,cache:'reload'}} resizeMode="contain" style={{width:'100%',height:240,borderRadius:8}} onError={() => setPreview(value => value?.photoId === item.id ? {...value,url:null,error:'Unable to load this preview. View the photo again.'} : value)}/>}
    {!!preview.error && <Text accessibilityRole="alert">{preview.error}</Text>}
   </>}
  </>}
  {slot && editable && canManage && <>
   <Button title={item ? `Choose replacement for photo ${slot}` : `Choose photo ${slot}`} outline disabled={!canChange} onPress={() => choose(slot)}/>
   {!!files[slot] && <>
    <Text>Selected: {files[slot].name}</Text>
    <ConfirmationButton title={item ? `Replace photo ${slot}` : `Upload photo ${slot}`} message={item ? 'Replace this vehicle photo? Photos already attached to published requests will stay unchanged.' : 'Upload this photo to your private vehicle library? You can attach it when publishing a service request.'} disabled={!canChange} onConfirm={() => mutate(slot)}/>
    <Button title={`Discard selected photo ${slot}`} outline disabled={disabled || busy} onPress={() => { if (!permission.current.disabled && !mutationLock.current) setFiles(value => ({...value,[slot]:null})); }}/>
   </>}
   {!!item && <ConfirmationButton title={`Remove photo ${slot}`} danger message="Remove this photo from your vehicle? Published requests will keep their attached copy." disabled={!canChange} onConfirm={() => mutate(slot,true)}/>}
  </>}
  {!!messages[slot] && <Text accessibilityRole="status">{messages[slot]}</Text>}
 </Card>;
 return <View style={{gap:12}}>
  <Text style={{fontSize:20,fontWeight:'700'}}>{target === 'vehicle' ? 'Vehicle photos' : 'Request photos'}</Text>
  {editable && <Text>Up to {PHOTO_LIMIT} photos. JPEG or PNG, up to 5 MB each. Choose photos from your device, then confirm the upload.</Text>}
  {!uid ? <Text>Sign in to view photos.</Text> : offline ? <Text>Connect to view or manage photos.</Text> : focused && <>
   <Notice busy={loading || busy} error={error}/>
   {editable && canManage ? Array.from({length:PHOTO_LIMIT},(_,i) => {const slot=String(i+1);return photoCard(items.find(item => String(item.slot) === slot),slot);}) : items.map(item => photoCard(item))}
   {!loading && fresh && !items.length && !(editable && canManage) && <Text>No photos attached.</Text>}
   {editable && fresh && !canManage && <Text>Photo changes are not available for this vehicle.</Text>}
   <Button title="Refresh photos" outline disabled={disabled || loading || busy} onPress={() => { if (!permission.current.disabled && !mutationLock.current && !permission.current.loading) void refresh(); }}/>
  </>}
 </View>;
}

export default function PhotoGallery({target,id,editable=false,selectedIds,onSelectionChange,disabled=false}) {
 const {user,offline} = useAuth(), uid = user?.uid;
 return <GalleryForAccount key={`${uid || 'signed-out'}:${target}:${id}`} target={target} id={id} editable={editable} uid={uid} offline={offline} selectedIds={selectedIds} onSelectionChange={onSelectionChange} disabled={disabled}/>;
}
