import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { initializeAuth, getAuth, connectAuthEmulator, getReactNativePersistence, inMemoryPersistence, signOut } from 'firebase/auth';
import {securePersistence} from './securePersistence';
import { Platform } from 'react-native';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
// Keep the ordinary initialization path independent of demo-only dependencies.
const demoSupport=process.env.EXPO_PUBLIC_PMR_LOCAL_DEMO||process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID==='demo-pmr-security'?require('./localDemo'):{localDemo:null,prepareLocalDemo:async()=>{}};
export const {localDemo,prepareLocalDemo}=demoSupport;
const config = localDemo?.firebase || {
 apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
 authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
 projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
 messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
 appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
let instance;
let isolatedSequence = 0;
function services(app,isolated=false,onAuth=()=>{}){
 if(localDemo&&app.__pmrDemo){if(app.__pmrDemo.host!==localDemo.host)throw Error('Restart Expo before changing demo hosts.');return app.__pmrDemo.value;}
 let auth;
 try{auth=isolated||localDemo?initializeAuth(app,{persistence:inMemoryPersistence}):Platform.OS==='web'?getAuth(app):initializeAuth(app,{persistence:getReactNativePersistence(securePersistence)});}
 catch(error){if(error.code!=='auth/already-initialized')throw error;auth=getAuth(app);}
 onAuth(auth);
 if(localDemo)connectAuthEmulator(auth,localDemo.authURL,{disableWarnings:false});
 const db=getFirestore(app);
 if(localDemo){connectFirestoreEmulator(db,localDemo.host,localDemo.firestorePort);app.__pmrDemo={host:localDemo.host,value:{auth,db}};}
 return {auth,db};
}
// Registration and credential checks must never persist an unverified app session.
// A separate Firebase app also binds its Firestore reads to the temporary user.
export async function withIsolatedAuth(operation) {
 if (!configured) throw new Error('Firebase setup is missing. Follow docs/OPERATIONS.md and restart Expo.');
 await prepareLocalDemo();
 const app = initializeApp(config, `pmr-verification-${++isolatedSequence}`);
 let auth;
 try {
  const value=services(app,true,value=>{auth=value;});
  return await operation(value);
 } finally {
  try { if (auth) await signOut(auth); }
  finally { await deleteApp(app); }
 }
}
export function firebase() {
 if (!configured) throw new Error('Firebase setup is missing. Follow docs/OPERATIONS.md and restart Expo.');
 if(localDemo)demoSupport.assertLocalDemoPrepared();
 if (instance) return instance;
 const name=localDemo?'pmr-local-demo':'[DEFAULT]';
 const app = getApps().some(app => app.name === name) ? getApp(name) : initializeApp(config,name);
 instance = services(app);
 return instance;
}
