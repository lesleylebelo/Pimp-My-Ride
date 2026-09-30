import {useCallback,useEffect,useRef,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {postsApi} from '../services/postsApi';

export function usePostsFeed({view='feed',source='all',authorId,cursor=null}={}){
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const [items,setItems]=useState([]),[nextCursor,setNextCursor]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const generation=useRef(0),requested=useRef(new Set());
 const load=useCallback(async(next=null,replace=false)=>{
  if(!uid||offline){setBusy(false);setError(offline?'Connect to load posts.':'Sign in to continue.');return;}
  const current=++generation.current;setBusy(true);setError('');
  try{
   const data=await postsApi(view,{...(view==='feed'?{source}:{}),...(authorId?{authorId}:{}),...(next?{cursor:next}:{})},uid);
   if(current!==generation.current)return;
   setItems(previous=>{
    const prior=replace?[]:previous,indexes=new Map(prior.map((post,index)=>[post.id,index])),result=[...prior];
    for(const post of data.items||[]){const index=indexes.get(post.id);if(index===undefined){indexes.set(post.id,result.length);result.push(post);}else result[index]=post;}
    return result;
   });
   setNextCursor(data.cursor||null);
  }catch(e){if(current===generation.current)setError(e.message||'Unable to load posts. Refresh and try again.');}
  finally{if(current===generation.current)setBusy(false);}
 },[uid,offline,view,source,authorId]);
 useEffect(()=>{
  ++generation.current;requested.current.clear();setItems([]);setNextCursor(null);setError('');
  if(focused)void load(null,true);
  return()=>{++generation.current;};
 },[focused,uid,offline,load]);
 const loadNext=()=>{if(nextCursor&&!busy&&!requested.current.has(nextCursor)){requested.current.add(nextCursor);void load(nextCursor);}};
 const refresh=()=>{requested.current.clear();return load(null,true);};
 return {items,busy,error,cursor:nextCursor,loadNext,refresh};
}
