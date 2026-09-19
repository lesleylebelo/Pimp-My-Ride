import {useEffect} from 'react';
import {firebase} from '../../shared/services/firebase';
import {AppState} from 'react-native';
import {useAuth} from '../auth/context/AuthContext';
import {callFunction} from '../admin/services/adminApi';
import {setPresenceStop} from './sessionLifecycle';
export default function PresenceTracker(){
 const {user,profile,offline}=useAuth();
 useEffect(()=>{
  if(!user?.emailVerified||!profile||offline||(profile.accountStatus&&profile.accountStatus!=='active'))return;

  const session=`s${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let stopped=false,heartbeatPending=false,queue=Promise.resolve();
  const send=state=>{
   if(state==='heartbeat'&&heartbeatPending)return queue;
   if(state==='heartbeat')heartbeatPending=true;
  
   queue=queue.then(async()=>{
    if(firebase().auth.currentUser?.uid!==user.uid)return;
    if(state==='heartbeat'&&(stopped||AppState.currentState!=='active'))return;
    await callFunction('sessionEvent',{session,state});
   }).catch(()=>{}).finally(()=>{
    if(state==='heartbeat')heartbeatPending=false;
   });
   return queue;
  };
  const tick=()=>{if(!stopped&&AppState.currentState==='active')void send('heartbeat');};
  setPresenceStop(async()=>{stopped=true;await Promise.race([send('offline'),new Promise(resolve=>setTimeout(resolve,1500))]);});
  tick();const timer=setInterval(tick,30000);
  const listener=AppState.addEventListener('change',state=>{if(state==='active')tick();else void send('offline');});
  return()=>{stopped=true;clearInterval(timer);listener.remove();void send('offline');setPresenceStop(async()=>{});};
 },[user?.uid,user?.emailVerified,profile?.role,profile?.accountStatus,offline]);
 return null;
}
