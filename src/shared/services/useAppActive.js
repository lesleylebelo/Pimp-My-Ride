import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
export function useAppActive(){
 const [active,setActive]=useState(AppState.currentState==='active');
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>setActive(state==='active'));return()=>listener.remove();},[]);
 return active;
}
