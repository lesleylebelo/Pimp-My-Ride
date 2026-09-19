import {useEffect,useState} from 'react';
import {cooldownRemaining} from '../services/loginCooldown';
export function useLoginCooldown(){
 const [seconds,setSeconds]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;const tick=()=>cooldownRemaining().then(n=>{if(alive){setSeconds(n);setError('');}}).catch(()=>{if(alive){setSeconds(null);setError('Unable to read sign-in protection. Restart the app and try again.');}});
 tick();const timer=setInterval(tick,500);return()=>{alive=false;clearInterval(timer);};},[]);
 return {seconds,error};
}
