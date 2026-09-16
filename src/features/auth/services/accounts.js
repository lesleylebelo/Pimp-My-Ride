import { requireConnection } from '../../../shared/services/network';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, getIdTokenResult, sendEmailVerification } from 'firebase/auth';
import { doc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { firebase } from '../../../shared/services/firebase';
import { DOCUMENT_KEYS, fileError } from '../utils/registration';
export async function login(email, password) {
 await requireConnection();
 const { auth, db } = firebase();
 const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
 try {
  const snapshot = await getDocFromServer(doc(db, 'users', user.uid));
  if (!snapshot.exists()) return user; 
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
  createdAt: serverTimestamp(), termsVersion: 'academic-v1', termsAcceptedAt: serverTimestamp(),
 };
 if (role === 'shop') {
  data.shop = Object.fromEntries(['shopName','regNumber','address','city','province','services'].map(k => [k, form[k].trim()]));
  data.verificationStatus = 'pending';
 }
 await setDoc(doc(db,'users',user.uid), data);
 try { await sendEmailVerification(user); } catch (_) {}
}
export async function uploadDocuments(files) {
 await requireConnection();
 const { auth, storage, db } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 if (!user.emailVerified) throw new Error('Verify your email before uploading shop documents.');
 for (const kind of DOCUMENT_KEYS) {
  const error = fileError(files[kind]); if (error) throw new Error(error);
 }
 for (const kind of DOCUMENT_KEYS) {
  const file = files[kind];
  const path = `verification/${user.uid}/${kind}`;
  const response = await fetch(file.uri);
  const blob = await response.blob();
  try { await uploadBytes(ref(storage,path), blob, {contentType:file.mimeType}); }
  finally { if (blob.close) blob.close(); }
  await setDoc(doc(db,'users',user.uid,'documents',kind), {
   path, name:file.name, size:file.size, contentType:file.mimeType, uploadedAt:serverTimestamp(),
  });
 }
}
