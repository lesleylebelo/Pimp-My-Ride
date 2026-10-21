import {useCallback,useEffect,useRef,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {marketApi} from '../services/marketApi';

export function useMarketData(op,input={},setCursor){
 const {user,offline}=useAuth(),uid=user?.uid,focused=useIsFocused();
 const key=JSON.stringify(input),generation=useRef(0),mounted=useRef(false),connection=useRef('');
 const [state,setState]=useState({data:null,busy:true,error:''});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current;};},[]);
 const refresh=useCallback(async(reset=true)=>{
  const current=++generation.current;
  if(reset&&setCursor&&JSON.parse(key).cursor){setCursor(null);return null;}
  if(!uid||offline){setState({data:null,busy:false,error:offline?'Connect to load marketplace data.':'Sign in to continue.'});return null;}
  setState(s=>({...s,busy:true,error:''}));
  try{
   const data=await marketApi(op,JSON.parse(key));
   if(op==='requests'&&!Array.isArray(data?.items))throw new Error('The server returned an unexpected requests response. Please try again.');
   if(mounted.current&&current===generation.current)setState({data,busy:false,error:''});
   return data;
  }catch(error){
   if(mounted.current&&current===generation.current)setState({data:null,busy:false,error:error.message||'Unable to load this page. Try again.'});
   throw error;
  }
 },[op,key,uid,offline,setCursor]);
 useEffect(()=>{
  ++generation.current;setState({data:null,busy:!!uid&&!offline&&focused,error:offline?'Connect to load marketplace data.':''});
  const nextConnection=JSON.stringify([uid,offline,focused]),reconnected=connection.current!==nextConnection;
  connection.current=nextConnection;
  if(focused){
   if(reconnected&&setCursor&&input.cursor)setCursor(null);
   else void refresh(false).catch(()=>{});
  }
  return()=>{++generation.current;};
 },[refresh,focused,uid,offline]);
 return {...state,refresh};
}
