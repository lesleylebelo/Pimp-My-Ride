import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {onAuthStateChanged, reload, getIdToken, getIdTokenResult, signOut} from 'firebase/auth';
import {doc, getDoc} from 'firebase/firestore';
import {firebase, configured} from '../services/firebase';
import {authError} from '../utils/authErrors';
const Context = createContext(null);
export const useAuth = () => useContext(Context);
export function AuthProvider({children}) {
 const [user,setUser] = useState(null), [profile,setProfile] = useState(null);
 const [initializing,setInitializing] = useState(true), [error,setError] = useState('');
 const [working,setWorking] = useState(false);
 const lock = useRef(false), sequence = useRef(0);
 async function sync() {
  const current = ++sequence.current;
  const u = firebase().auth.currentUser;
  let data = null, problem = '';
  try { if (u) { data = (await getDoc(doc(firebase().db,'users',u.uid))).data() || null; if(data?.role === 'admin' && !(await getIdTokenResult(u)).claims.admin) {data=null;problem='Administrator authorization is missing. Contact the project administrator.';} } }
  catch(e) { problem = authError(e); }
  if (current !== sequence.current) return;
  setUser(u); setProfile(data); setError(problem); setInitializing(false);
 }
 useEffect(() => {
  if (!configured) { setInitializing(false); return; }
  return onAuthStateChanged(firebase().auth, () => { if (!lock.current) sync(); });
 }, []);
 async function run(operation) {
  if (lock.current) return;
  lock.current = true; setWorking(true); ++sequence.current;
  try { return await operation(); }
  finally { try { await sync(); } finally { lock.current=false;setWorking(false); } }
 }
 async function refresh() {
  const u = firebase().auth.currentUser;
  if (u) { await reload(u); await getIdToken(u,true); }
  await sync();
 }
 return <Context.Provider value={{user,profile,initializing,error,working,run,refresh,logout:()=>run(()=>signOut(firebase().auth))}}>{children}</Context.Provider>;
}
