import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import {securePersistence} from './securePersistence';
import { Platform } from 'react-native';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
const config = {
 apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
 authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
 projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
 storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
 messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
 appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
let instance;
export function firebase() {
 if (!configured) throw new Error('Firebase setup is missing. Follow SECURITY_AND_OFFLINE.md and restart Expo.');
 if (instance) return instance;
 const app = getApps().length ? getApp() : initializeApp(config);
 let auth;
 try { auth = Platform.OS === 'web' ? getAuth(app) : initializeAuth(app, { persistence: getReactNativePersistence(securePersistence) }); }
 catch (error) { if (error.code !== 'auth/already-initialized') throw error; auth = getAuth(app); }
 instance = { auth, db: getFirestore(app), storage: getStorage(app) };
 return instance;
}
