import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import PrimaryButton from '../../../shared/components/PrimaryButton';
import DocumentPickerField from './DocumentPickerField';
import {listDocuments, uploadDocument} from '../services/accounts';
import {DOCUMENT_KEYS} from '../utils/registration';
import {authError} from '../utils/authErrors';
import colors from '../../../shared/theme/colors';

const labels = {cipcCert:'CIPC certificate',proofOfAddress:'Proof of address',ownerId:'Representative ID'};

function DocumentsForAccount({uid, offline, canUpload, disabled, onBusyChange, refreshKey}) {
 const [saved, setSaved] = useState({});
 const [files, setFiles] = useState({});
 const [messages, setMessages] = useState({});
 const [loading, setLoading] = useState(false);
 const [loadError, setLoadError] = useState('');
 const [uploading, setUploading] = useState(null);
 const active = useRef(true), request = useRef(0), uploadLock = useRef(false);
 const permission = useRef({offline,canUpload,disabled});
 permission.current = {offline,canUpload,disabled};

 useEffect(() => {
  active.current = true;
  return () => { active.current = false; ++request.current; onBusyChange?.(false); };
 }, [onBusyChange]);

 const refreshDocuments = useCallback(async () => {
  if (permission.current.offline) return;
  const generation = ++request.current;
  setLoading(true); setLoadError('');
  try {
   const items = await listDocuments(uid);
   if (active.current && generation === request.current) {
    setSaved(Object.fromEntries(items.map(item => [item.id,item])));
   }
  } catch (error) {
   if (active.current && generation === request.current) setLoadError(authError(error));
  } finally {
   if (active.current && generation === request.current) setLoading(false);
  }
 }, [uid]);

 // Metadata and selected file references remain in this mounted account only.
 // Focus, reconnect, and an explicit account refresh all read the server again.
 useFocusEffect(useCallback(() => {
  if (offline) {
   ++request.current; setSaved({}); setLoading(false); setLoadError('');
  } else {
   void refreshDocuments();
  }
  return () => { ++request.current; };
 }, [offline,refreshKey,refreshDocuments]));

 async function upload(kind) {
  if (uploadLock.current || permission.current.offline || !permission.current.canUpload || permission.current.disabled) return;
  uploadLock.current = true;
  setUploading(kind); setMessages(value => ({...value,[kind]:''})); onBusyChange?.(true);
  const file = files[kind];
  // Invalidate any list that started before the upload to avoid stale replacement metadata.
  ++request.current; setLoading(false);
  try {
   await uploadDocument(kind, file, uid);
   if (!active.current) return;
   setSaved(value => ({...value,[kind]:{id:kind,name:file.name,size:file.size,contentType:file.mimeType}}));
   setFiles(value => ({...value,[kind]:null}));
   setMessages(value => ({...value,[kind]:'Uploaded successfully.'}));
   await refreshDocuments();
  } catch (error) {
   if (active.current) setMessages(value => ({...value,[kind]:`${authError(error)} Your selected file is kept for retry. If the connection failed, refresh document status first to check whether it was saved.`}));
  } finally {
   uploadLock.current = false;
   if (active.current) { setUploading(null); onBusyChange?.(false); }
  }
 }

 return <View style={{gap:16}}>
  <Text style={{fontSize:20,fontWeight:'500'}}>Verification documents</Text>
  <Text>PDF, JPG or PNG, up to 5 MB each. Use fictional sample documents for this academic demo.</Text>
  {offline ? <Text>Connect to view current document status or upload files.</Text> : <>
   {loading && <Text accessibilityRole="status">Checking saved documents...</Text>}
   {!!loadError && <Text accessibilityRole="alert">Could not refresh saved documents: {loadError} An upload marked successful below is already saved.</Text>}
   {DOCUMENT_KEYS.map(kind => <View key={kind} testID={`document-${kind}`} style={{gap:8,padding:16,backgroundColor:colors.surfaceCard,borderWidth:1,borderColor:colors.border,borderRadius:12}}>
    <Text style={{fontWeight:'500'}}>{labels[kind]}</Text>
    <Text>{saved[kind] ? `Saved: ${saved[kind].name}` : loading || loadError ? 'Saved status not yet confirmed.' : 'No document uploaded yet.'}</Text>
    {saved[kind] && <Text>{Math.ceil(saved[kind].size / 1024)} KB{saved[kind].uploadedAt ? ` • Uploaded ${new Date(saved[kind].uploadedAt).toLocaleString()}` : ''}</Text>}
    {canUpload && <>
     <DocumentPickerField label={saved[kind] ? `Choose replacement ${labels[kind]}` : `Choose ${labels[kind]}`} value={files[kind]} disabled={disabled || !!uploading} onChange={file => {
      setFiles(value => ({...value,[kind]:file})); setMessages(value => ({...value,[kind]:''}));
     }}/>
     <PrimaryButton testID={`upload-${kind}`} title={saved[kind] ? `Replace ${labels[kind]}` : `Upload ${labels[kind]}`} loading={uploading === kind} disabled={disabled || !!uploading || !files[kind]} onPress={() => upload(kind)}/>
    </>}
    {!!messages[kind] && <Text accessibilityRole="alert">{messages[kind]}</Text>}
   </View>)}
   <PrimaryButton title="Refresh document status" testID="refresh-documents" loading={loading} disabled={disabled || !!uploading} onPress={refreshDocuments}/>
  </>}
 </View>;
}

// Remounting on UID change clears all metadata and local selections immediately.
export default function VerificationDocuments(props) {
 return <DocumentsForAccount key={props.uid} {...props}/>;
}
