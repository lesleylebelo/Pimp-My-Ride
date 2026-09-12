import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, getIdTokenResult, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { firebase } from './firebase';
import { DOCUMENT_KEYS, fileError } from '../utils/registration';
export async function login(email, password, role) {
 const { auth, db } = firebase();
 const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
 try {
  const snapshot = await getDoc(doc(db, 'users', user.uid));
  if (!snapshot.exists()) { if(role === 'admin') throw new Error('Your administrator profile is missing. Contact the project administrator.'); return user; }
  if (snapshot.data().role !== role) throw new Error('This account belongs to a different role. Choose the correct sign-in role.');
  if (role === 'admin' && !(await getIdTokenResult(user,true)).claims.admin) throw new Error('This account does not have administrator access.');
  return user;
 } catch (error) { await signOut(auth); throw error; }
}
export async function register(form, role) {
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 const { auth, db } = firebase();
 await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
 await completeProfile(form, role);
}
// Can be retried after a partial failure without creating another Auth account.
export async function completeProfile(form, role) {
 if (!['owner','shop'].includes(role)) throw new Error('This role cannot register.');
 const { auth, db } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
 const data = {
  fullName: form.fullName.trim(), email: user.email, phone: form.phone.trim(), role,
  createdAt: serverTimestamp(), termsVersion: 'academic-v1', termsAcceptedAt: serverTimestamp(),
 };
 if (role === 'shop') {
  data.shop = Object.fromEntries(['shopName','regNumber','address','city','province','services'].map(k => [k, form[k].trim()]));
  data.verificationStatus = 'pending';
 }
 await setDoc(doc(db,'users',user.uid), data);
 // Verification can also be resent from the account screen if this fails.
 try { await sendEmailVerification(user); } catch (_) { /* Resend remains available. */ }
}
export async function uploadDocuments(files) {
 const { auth, storage, db } = firebase();
 const user = auth.currentUser;
 if (!user) throw new Error('Please sign in again.');
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
  // Store private paths, never public download-token URLs.
  await setDoc(doc(db,'users',user.uid,'documents',kind), {
   path, name:file.name, size:file.size, contentType:file.mimeType, uploadedAt:serverTimestamp(),
  });
 }
}
