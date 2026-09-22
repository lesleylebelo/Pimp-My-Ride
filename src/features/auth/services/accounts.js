import {apiRequest} from '../../../shared/services/api';
import {Platform} from 'react-native';
import {guardedLogin} from './loginCooldown';
import { requireConnection } from '../../../shared/services/network';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, getIdTokenResult, sendEmailVerification } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { firebase } from '../../../shared/services/firebase';
import { DOCUMENT_KEYS, fileError } from '../utils/registration';
export async function login(email, password) {
 await requireConnection();
 const { auth, db } = firebase();
 const { user } = await guardedLogin(() => signInWithEmailAndPassword(auth, email.trim(), password));
 try {
  const snapshot = await getDocFromServer(doc(db, 'users', user.uid));
  if (!snapshot.exists()) return user; 
  if (snapshot.data().accountStatus && snapshot.data().accountStatus !== 'active') throw new Error('This account is restricted. Contact the project administrator.');
  const role = snapshot.data().role;
  if (!['owner','shop','admin'].includes(role)) throw new Error('Account access is unavailable. Contact the project administrator.');
  if (role === 'admin' && (await getIdTokenResult(user,true)).claims.admin !== true) throw new Error('This account does not have administrator access.');
  return user;
 } catch (error) { await signOut(auth); throw error; }
}
export async function register(form, role) {
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 await requireConnection();
 const { auth, db } = firebase();
 await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
 await completeProfile(form, role);
}

export async function completeProfile(form, role) {
 await requireConnection();
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 const { auth, db } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 const data = {
  fullName: form.fullName.trim(), email: user.email, phone: form.phone.replace(/[\s()-]/g,''), role,
  termsVersion: 'academic-v2', agreed: form.agreed === true,
 };
 if (role === 'shop') {
  data.shop = Object.fromEntries(['shopName','regNumber','address','city','province','services'].map(k => [k, form[k].trim()]));
  data.verificationStatus = 'pending';
 }
 await apiRequest('profile',data);
 try { await sendEmailVerification(user); } catch (_) {  }
}
export async function listDocuments(expectedUid) {
 const user = firebase().auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 const result = await apiRequest('documents/list', {}, {expectedUid:expectedUid || user.uid});
 if (!Array.isArray(result?.items)) throw new Error('Unable to read document status. Please refresh and try again.');
 return result.items.filter(item => DOCUMENT_KEYS.includes(item.id)).map(({id,name,size,contentType,uploadedAt}) => ({id,name,size,contentType,uploadedAt}));
}
export async function uploadDocument(kind, file, expectedUid) {
 await requireConnection();
 const { auth } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 if (expectedUid && user.uid !== expectedUid) throw new Error('Your account changed. Please choose the document again.');
 if (!user.emailVerified) throw new Error('Verify your email before uploading shop documents.');
 if (!DOCUMENT_KEYS.includes(kind)) throw new Error('Choose a supported verification document.');
 const error = fileError(file);
 if (error) throw new Error(error);
 const body = new FormData();
 if (Platform.OS === 'web') {
  const response = await fetch(file.uri);
  if (!response.ok) throw new Error('Unable to read the selected file. Please choose it again.');
  body.append('file', await response.blob(), file.name);
 } else {
  body.append('file', {uri:file.uri,name:file.name,type:file.mimeType});
 }
 if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Please choose the document again.');
 return apiRequest(`documents/${kind}`, body, {multipart:true,expectedUid:user.uid});
}
// Retained for existing callers; the account screen uploads each document separately.
export async function uploadDocuments(files) {
 for (const kind of DOCUMENT_KEYS) {
  const error = fileError(files[kind]);
  if (error) throw new Error(error);
 }
 for (const kind of DOCUMENT_KEYS) await uploadDocument(kind, files[kind]);
}
