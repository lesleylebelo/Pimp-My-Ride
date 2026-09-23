import {useCallback,useEffect,useRef,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';

export function useMarketData(op,input={}){
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const key=JSON.stringify(input),generation=useRef(0),mounted=useRef(false);
 const [state,setState]=useState({data:null,busy:true,error:''});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current;};},[]);
 const refresh=useCallback(async()=>{
  const current=++generation.current;
  if(!uid||offline){setState({data:null,busy:false,error:offline?'Connect to load marketplace data.':'Sign in to continue.'});return null;}
  setState(s=>({...s,busy:true,error:''}));
  try{
   const data=await marketApi(op,JSON.parse(key));
   if(mounted.current&&current===generation.current)setState({data,busy:false,error:''});
   return data;
  }catch(error){
   if(mounted.current&&current===generation.current)setState({data:null,busy:false,error:error.message||'Unable to load this page. Try again.'});
   throw error;
  }
 },[op,key,uid,offline]);
 useEffect(()=>{
  ++generation.current;setState({data:null,busy:!!uid&&!offline&&focused,error:offline?'Connect to load marketplace data.':''});
  if(focused)void refresh().catch(()=>{});
  return()=>{++generation.current;};
 },[refresh,focused,uid,offline]);
 return {...state,refresh};
}
