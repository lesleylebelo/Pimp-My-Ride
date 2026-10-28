import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useAuth} from '../../auth/context/AuthContext';
import {postsApi} from '../services/postsApi';
import {bookmarkSnapshot,publishBookmark,subscribeBookmarks} from '../services/bookmarkState';

export function usePostBookmark(post){
 const {user,profile,offline}=useAuth(),uid=user?.uid,id=post?.id;
 const shared=useSyncExternalStore(subscribeBookmarks,()=>bookmarkSnapshot(uid,id),()=>undefined);
 const [working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),generation=useRef(0);
 useEffect(()=>{++generation.current;lock.current=false;setWorking(false);setError('');setMessage('');return()=>{++generation.current;};},[uid,id]);
 const saved=shared?.saved??post?.saved===true,busy=working||shared?.pending===true;
 const eligible=!!uid&&['owner','shop'].includes(profile?.role)&&(!profile.accountStatus||profile.accountStatus==='active')&&!profile.statusOperation&&!profile.provisioningOperation&&(profile.role!=='shop'||profile.verificationStatus==='approved'&&!profile.reviewOperation);
 const showcase=post?.type!=='build'&&(post?.authorRole==='shop'||!post?.authorRole&&post?.type==='showcase');
 const disabled=offline||!eligible||!showcase;
 async function toggle(){
  if(lock.current||busy||disabled)return;
  const current=generation.current,next=!saved;lock.current=true;setWorking(true);setError('');setMessage('');
  try{
   await postsApi('save',{id,saved:next},uid);
   if(current!==generation.current)return;
   publishBookmark(uid,id,next);setMessage(next?'Post saved.':'Post removed from saved posts.');
   return next;
  }catch(e){if(current===generation.current)setError(e.message||'Unable to update saved posts. Try again.');}
  finally{if(current===generation.current){lock.current=false;setWorking(false);}}
 }
 return {saved,busy,error,message,disabled,toggle};
}
