import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
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

 return (
  <View style={styles.container}>
   <View style={styles.intro}>
    <Text style={styles.heading}>Verification documents</Text>
    <Text style={styles.introText}>PDF, JPG or PNG, up to 5 MB each. Use fictional sample documents for this academic demo.</Text>
   </View>

   {offline ? (
    <Text style={styles.muted}>Connect to view current document status or upload files.</Text>
   ) : (
    <>
     {loading && <Text accessibilityRole="status" style={styles.muted}>Checking saved documents…</Text>}
     {!!loadError && (
      <Text accessibilityRole="alert" style={styles.error}>
       Could not refresh saved documents: {loadError} An upload marked successful below is already saved.
      </Text>
     )}

     {DOCUMENT_KEYS.map(kind => (
      <View key={kind} testID={`document-${kind}`} style={styles.docCard}>
       <Text style={styles.eyebrow}>{labels[kind].toUpperCase()}</Text>

       <Text style={saved[kind] ? styles.savedName : styles.status}>
        {saved[kind]
         ? saved[kind].name
         : loading || loadError
          ? 'Checking saved status…'
          : 'No document uploaded yet'}
       </Text>

       {saved[kind] && (
        <Text style={styles.meta}>
         {Math.ceil(saved[kind].size / 1024)} KB
         {saved[kind].uploadedAt ? ` · Uploaded ${new Date(saved[kind].uploadedAt).toLocaleDateString()}` : ''}
        </Text>
       )}

       {canUpload && (
        <>
         <DocumentPickerField
          label={saved[kind] ? `Choose replacement` : `Choose document`}
          value={files[kind]}
          disabled={disabled || !!uploading}
          onChange={file => {
           setFiles(value => ({...value,[kind]:file}));
           setMessages(value => ({...value,[kind]:''}));
          }}
         />
         <PrimaryButton
          testID={`upload-${kind}`}
          title={saved[kind] ? 'Replace document' : 'Upload document'}
          loading={uploading === kind}
          disabled={disabled || !!uploading || !files[kind]}
          onPress={() => upload(kind)}
         />
        </>
       )}

       {!!messages[kind] && (
        <Text accessibilityRole="alert" style={styles.message}>{messages[kind]}</Text>
       )}
      </View>
     ))}

     <PrimaryButton
      title="Refresh document status"
      testID="refresh-documents"
      loading={loading}
      disabled={disabled || !!uploading}
      onPress={refreshDocuments}
     />
    </>
   )}
  </View>
 );
}

export default function VerificationDocuments(props) {
 return <DocumentsForAccount key={props.uid} {...props}/>;
}

const styles = StyleSheet.create({
 container: { gap: 16 },
 intro: { gap: 6 },
 heading: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.2 },
 introText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

 docCard: {
  gap: 10,
  padding: 20,
  backgroundColor: colors.surfaceCard,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 20,
 },

 eyebrow: {
  fontSize: 11,
  letterSpacing: 1.5,
  color: colors.textMuted,
  fontWeight: '600',
 },

 savedName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
 status: { fontSize: 14, color: colors.textSecondary },
 meta: { fontSize: 12, color: colors.textSecondary },

 muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
 message: { fontSize: 13, color: colors.textSecondary },
 error: { fontSize: 13, color: colors.error, lineHeight: 20 },
});