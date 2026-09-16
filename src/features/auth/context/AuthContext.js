import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {onAuthStateChanged, reload, getIdTokenResult, signOut} from 'firebase/auth';
import {doc, getDocFromServer, onSnapshot} from 'firebase/firestore';
import {firebase, configured} from '../../../shared/services/firebase';
import {isOffline, isNetworkError, requireConnection} from '../../../shared/services/network';
import {readProfileCache, saveProfileCache, clearProfileCache, CACHE_AGE} from '../../../shared/offline/profileCache';
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
 const sync=useCallback(async()=>{
  const generation=++epoch.current;
  const u=firebase().auth.currentUser;
  inFlight.current=true;
  let profile=null,error='',offline=!online.current,cachedAt=null;
  try {
   if(u){
    if(offline)throw Object.assign(new Error('Offline'),{code:'app/offline'});
    await timeout(reload(u));
    const token=await timeout(getIdTokenResult(u,true));
    const snapshot=await timeout(getDocFromServer(doc(firebase().db,'users',u.uid)));
    profile=snapshot.data()||null;
    if(profile?.role==='admin' && token.claims.admin!==true){
     profile=null;error='Administrator authorization is missing. Contact the project administrator.';
    }
    if(generation===epoch.current){
     if(u.emailVerified && !error)await saveProfileCache(u.uid,profile).catch(()=>{});
     else await clearProfileCache(u.uid).catch(()=>{});
    }
   }
  }catch(e){
   if(generation!==epoch.current)return;
   if(isNetworkError(e)){
    offline=true;
    const cache=u?.emailVerified ? await readProfileCache(u.uid).catch(()=>null) : null;
    profile=cache?.profile||null;cachedAt=cache?.savedAt||null;
    if(u && !profile)error='Connect to the internet to verify your account access. No available offline landing page.';
   }else if(['auth/user-disabled','auth/user-not-found','auth/user-token-expired','auth/invalid-user-token'].includes(e.code)){
    await clearProfileCache(u?.uid).catch(()=>{});
    await signOut(firebase().auth);
    if(active.current)setState({user:null,profile:null,error:'',offline:false,cachedAt:null,initializing:false});
    return;
   }else{
    profile=null;error=authError(e);
    await clearProfileCache(u?.uid).catch(()=>{});
   }
  }finally{if(generation===epoch.current)inFlight.current=false;}
  if(generation!==epoch.current || !active.current || firebase().auth.currentUser?.uid!==u?.uid)return;
  setState({user:u ? {uid:u.uid,email:u.email,emailVerified:u.emailVerified} : null,profile,error,offline,cachedAt,initializing:false});
 },[]);
 useEffect(()=>{
  active.current=true;
  if(!configured){setState(s=>({...s,initializing:false,error:'Firebase configuration is missing.'}));return;}
  const network=NetInfo.addEventListener(value=>{
   const next=!isOffline(value),changed=next!==online.current;online.current=next;
   if(!next)setState(s=>({...s,offline:true,profile:s.profile?.role==='admin'?null:s.profile,error:s.profile?.role==='admin'?'Administrator access requires an internet connection.':s.error}));
   if(changed && !lock.current)void sync();
  });
  const unsubscribe=onAuthStateChanged(firebase().auth,()=>{if(!lock.current)void sync();},e=>setState(s=>({...s,initializing:false,error:authError(e)})));
  const app=AppState.addEventListener('change',status=>{
   if(status==='active' && !lock.current)void sync();
  });
  return()=>{active.current=false;++epoch.current;network();unsubscribe();app.remove();};
 },[sync]);
 useEffect(()=>{
  if(!state.user)return;
  const timer=setInterval(()=>{
   if(AppState.currentState==='active' && online.current && !lock.current && !inFlight.current)void sync();
  },state.user.emailVerified?60000:5000);
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
   const uid=firebase().auth.currentUser?.uid;
   await signOut(firebase().auth);
   await clearProfileCache(uid);
  });
 }
 return <Context.Provider value={{...state,working,run,refresh:sync,logout,requireConnection}}>{children}</Context.Provider>;
}
