import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, inMemoryPersistence, signOut } from 'firebase/auth';
import {securePersistence} from './securePersistence';
import { Platform } from 'react-native';
import { getFirestore } from 'firebase/firestore';
const config = {
 apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
 authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
 projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
 messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
 appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
let instance;
let isolatedSequence = 0;
// Registration and credential checks must never persist an unverified app session.
// A separate Firebase app also binds its Firestore reads to the temporary user.
export async function withIsolatedAuth(operation) {
 if (!configured) throw new Error('Firebase setup is missing. Follow docs/OPERATIONS.md and restart Expo.');
 const app = initializeApp(config, `pmr-verification-${++isolatedSequence}`);
 let auth;
 try {
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  return await operation({ auth, db: getFirestore(app) });
 } finally {
  try { if (auth) await signOut(auth); }
  finally { await deleteApp(app); }
 }
}
export function firebase() {
 if (!configured) throw new Error('Firebase setup is missing. Follow docs/OPERATIONS.md and restart Expo.');
 if (instance) return instance;
 const app = getApps().some(app => app.name === '[DEFAULT]') ? getApp() : initializeApp(config);
 let auth;
 try { auth = Platform.OS === 'web' ? getAuth(app) : initializeAuth(app, { persistence: getReactNativePersistence(securePersistence) }); }
 catch (error) { if (error.code !== 'auth/already-initialized') throw error; auth = getAuth(app); }
 instance = { auth, db: getFirestore(app) };
 return instance;
}
