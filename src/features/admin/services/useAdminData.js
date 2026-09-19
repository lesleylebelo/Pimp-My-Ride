import {useCallback,useEffect,useRef,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {adminApi,adminError} from './adminApi';
export function useAdminData(op,args={}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=JSON.stringify(args),focused=useIsFocused(),generation=useRef(0);
 const refresh=useCallback(async()=>{const ticket=++generation.current;setBusy(true);setError('');
  try{const next=await adminApi(op,JSON.parse(key));if(ticket===generation.current)setData(next);}
  catch(e){if(ticket===generation.current){setData(null);setError(adminError(e));}}
  finally{if(ticket===generation.current)setBusy(false);}
 },[op,key]);
 useEffect(()=>{if(focused)void refresh();return()=>{++generation.current;setData(null);};},[focused,refresh]);
 return {data,busy,error,refresh};
}
