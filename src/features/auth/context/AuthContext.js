import {endPresence} from '../../activity/sessionLifecycle';
import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {onAuthStateChanged, reload, getIdTokenResult, signOut} from 'firebase/auth';
import {doc, getDocFromServer, onSnapshot} from 'firebase/firestore';
import {firebase, configured, localDemo, prepareLocalDemo} from '../../../shared/services/firebase';
import {isOffline, isNetworkError, requireConnection} from '../../../shared/services/network';
import {readProfileCache, saveProfileCache, clearProfileCache, retryProfileCacheCleanup, CACHE_AGE} from '../../../shared/offline/profileCache';
import {clearSessionCaches} from '../../../shared/services/sessionCaches';
import {authError} from '../utils/authErrors';
const Context = createContext(null);
export const useAuth = () => useContext(Context);
const timeout = promise => new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Object.assign(new Error('Connection timed out.'),{code:'unavailable'})),12000);
 promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
});
export function AuthProvider({children}) {
 const [state,setState]=useState({user:null,profile:null,initializing:true,error:'',offline:false,cachedAt:null});
 const [working,setWorking]=useState(false);
 const lock=useRef(false),epoch=useRef(0),active=useRef(true),inFlight=useRef(false),online=useRef(true);
 const blockedUser=useRef(null),verificationRequired=useRef(false);
 const observedUser=useRef(undefined),closingUser=useRef(null);
 const observeIdentity=useCallback(()=>{
  const next=firebase().auth.currentUser,previous=observedUser.current;
  if(next===previous)return;
  observedUser.current=next;closingUser.current=null;++epoch.current;
  clearSessionCaches();
  // This runs even during run(): the old navigator must unmount before any
  // asynchronous validation, storage cleanup or replacement account action.
  setState({user:null,profile:null,initializing:!!next,error:verificationRequired.current?'Please verify your email before signing in.':'',offline:!online.current,cachedAt:null});
  if(previous?.uid)void clearProfileCache(previous.uid).catch(()=>{});
 },[]);
 const sync=useCallback(async()=>{
  observeIdentity();
  void retryProfileCacheCleanup();
  const generation=++epoch.current;
  const u=firebase().auth.currentUser;
  const current=()=>generation===epoch.current&&active.current&&firebase().auth.currentUser===u;
  inFlight.current=true;
  let profile=null,error=verificationRequired.current?'Please verify your email before signing in.':'',offline=!online.current,cachedAt=null;
  const rejectUnverified=async()=>{
   if(generation!==epoch.current || !active.current || firebase().auth.currentUser!==u)return;
   blockedUser.current=u;verificationRequired.current=true;
   const guest={user:null,profile:null,error:'Please verify your email before signing in.',offline:!online.current,cachedAt:null,initializing:false};
   // Clear app access before asynchronous cleanup, including when the device is
   // offline or Firebase cannot remove an old persisted session.
   if(generation===epoch.current && active.current)setState(guest);
   await clearProfileCache(u.uid).catch(()=>{});
   if(generation!==epoch.current || !active.current || firebase().auth.currentUser!==u)return;
   await signOut(firebase().auth).catch(()=>{});
   if(generation===epoch.current && active.current)setState(guest);
  };
  try {
   if(u){
    if(closingUser.current===u){error='Unable to finish signing out. Try signing out again.';return setState({user:{uid:u.uid,email:u.email,emailVerified:u.emailVerified},profile:null,initializing:false,error,offline,cachedAt:null});}
    if(!u.emailVerified || blockedUser.current===u){await rejectUnverified();return;}
    blockedUser.current=null;verificationRequired.current=false;error='';
    if(offline)throw Object.assign(new Error('Offline'),{code:'app/offline'});
    await timeout(reload(u));
    if(generation!==epoch.current || !active.current || firebase().auth.currentUser!==u)return;
    if(!u.emailVerified){await rejectUnverified();return;}
    const token=await timeout(getIdTokenResult(u,true));
    if(!current())return;
    const snapshot=await timeout(getDocFromServer(doc(firebase().db,'users',u.uid)));
    if(!current())return;
    profile=snapshot.data()||null;
    if(profile?.role==='admin' && token.claims.admin!==true){
     profile=null;error='Administrator authorization is missing. Contact the project administrator.';
    }
    if(generation===epoch.current){
     if(u.emailVerified && !error)await saveProfileCache(u.uid,profile).catch(()=>{});
     else await clearProfileCache(u.uid).catch(()=>{});
    }
   }else blockedUser.current=null;
  }catch(e){
   if(!current())return;
   if(isNetworkError(e)){
    offline=true;
    const cache=u?.emailVerified ? await readProfileCache(u.uid).catch(()=>null) : null;
    profile=cache?.profile||null;cachedAt=cache?.savedAt||null;
    if(u && !profile)error='Connect to the internet to verify your account access. No available offline landing page.';
   }else if(['auth/user-disabled','auth/user-not-found','auth/user-token-expired','auth/invalid-user-token'].includes(e.code)){
    await clearProfileCache(u?.uid).catch(()=>{});
    if(!current())return;
    await signOut(firebase().auth);
    if(current())setState({user:null,profile:null,error:'',offline:false,cachedAt:null,initializing:false});
    return;
   }else{
    profile=null;error=authError(e);
    await clearProfileCache(u?.uid).catch(()=>{});
   }
  }finally{if(generation===epoch.current)inFlight.current=false;}
  if(!current())return;
  setState({user:u ? {uid:u.uid,email:u.email,emailVerified:u.emailVerified} : null,profile,error,offline,cachedAt,initializing:false});
 },[observeIdentity]);
 useEffect(()=>{
  active.current=true;
  if(!configured){setState(s=>({...s,initializing:false,error:'Firebase configuration is missing.'}));return;}
  let disposed=false,dispose=()=>{};
  function start(){
  if(disposed||!active.current)return;
  const network=NetInfo.addEventListener(value=>{
   const next=!isOffline(value),changed=next!==online.current;online.current=next;
   if(!next)setState(s=>({...s,offline:true,profile:s.profile?.role==='admin'?null:s.profile,error:s.profile?.role==='admin'?'Administrator access requires an internet connection.':s.error}));
   if(changed && !lock.current)void sync();
  });
  const unsubscribe=onAuthStateChanged(firebase().auth,()=>{observeIdentity();if(!lock.current)void sync();},e=>{++epoch.current;clearSessionCaches();setState({user:null,profile:null,initializing:false,offline:!online.current,cachedAt:null,error:authError(e)});});
  const app=AppState.addEventListener('change',status=>{
   if(status==='active' && !lock.current)void sync();
  });
  dispose=()=>{network();unsubscribe();app.remove();};
  }
  if(localDemo)prepareLocalDemo().then(start).catch(e=>{if(!disposed&&active.current)setState(s=>({...s,initializing:false,error:e.message}));});
  else start();
  return()=>{disposed=true;active.current=false;++epoch.current;dispose();};
 },[sync,observeIdentity]);
 useEffect(()=>{
  if(!state.user)return;
  const timer=setInterval(()=>{
   if(AppState.currentState==='active' && online.current && !lock.current && !inFlight.current)void sync();
  },60000);
  return()=>clearInterval(timer);
 },[state.user?.uid,state.user?.emailVerified,sync]);
 useEffect(()=>{
  if(!state.user || state.offline)return;
  let first=true;
  return onSnapshot(doc(firebase().db,'users',state.user.uid),{includeMetadataChanges:true},snapshot=>{
   if(snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)return;
   if(first){first=false;return;}
   if(!lock.current)void sync();
  },()=>{if(!lock.current)void sync();});
 },[state.user?.uid,state.offline,sync]);
 useEffect(()=>{
  if(!state.offline || !state.cachedAt)return;
  const timer=setTimeout(()=>{if(!lock.current)void sync();},Math.max(1,state.cachedAt+CACHE_AGE-Date.now()+1));
  return()=>clearTimeout(timer);
 },[state.offline,state.cachedAt,sync]);
 async function run(operation){
  if(lock.current)throw new Error('Another account action is in progress.');
  lock.current=true;setWorking(true);++epoch.current;
  try{return await operation();}
  finally{try{await sync();}finally{lock.current=false;setWorking(false);}}
 }
 async function logout(){
  return run(async()=>{
   const auth=firebase().auth,u=auth.currentUser;
   closingUser.current=u;clearSessionCaches();
   setState(s=>({...s,profile:null,cachedAt:null,error:'Signing out…'}));
   try{await endPresence();if(auth.currentUser===u)await signOut(auth);}
   finally{await clearProfileCache(u?.uid);}
  });
 }
 return <Context.Provider value={{...state,working,run,refresh:sync,logout,requireConnection}}>{children}</Context.Provider>;
}
