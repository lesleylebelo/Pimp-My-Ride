import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../auth/context/AuthContext';
import {messageApi} from '../services/messageApi';

export function useMessages(id = null) {
  const {user,offline} = useAuth(), focused = useIsFocused();
  const [state,setState] = useState({items:[],data:null,cursor:null,busy:true,error:''});
  const current = useRef(state), generation = useRef(0), loading = useRef(false), permitted = useRef(false);
  current.current = state;permitted.current = !!user?.uid && !offline && focused;
  const fetchPage = useCallback(async (older = false, reset = false) => {
    if (!permitted.current || AppState.currentState !== 'active' || loading.current) return;
    const epoch = generation.current, cursor = older ? current.current.cursor : null;
    if (older && !cursor) return;
    loading.current = true;setState(previous => ({...previous,busy:true,error:''}));
    try {
      const result = await messageApi(id?'get':'list',{...(id?{id}:{}),...(cursor?{cursor}:{})});
      if (epoch !== generation.current || !permitted.current) return;
      setState(previous => {
        const incoming = id ? result.messages : result.items;
        const gap = id && !older && previous.items.length && incoming.length && incoming[0].sequence > previous.items[previous.items.length-1].sequence+1;
        const rows = new Map((reset || gap ? [] : previous.items).map(item => [item.id,item]));
        incoming.forEach(item => rows.set(item.id,item));
        const items = [...rows.values()].sort(id ? (a,b)=>a.sequence-b.sequence : (a,b)=>(b.updatedAt || 0)-(a.updatedAt || 0) || a.id.localeCompare(b.id));
        return {items,data:id?result.conversation:null,cursor:older || reset || gap || !previous.items.length?result.cursor:previous.cursor,busy:false,error:''};
      });
    } catch (error) {
      if (epoch === generation.current && permitted.current) setState({items:[],data:null,cursor:null,busy:false,error:error.message || 'Unable to load messages.'});
    } finally {if (epoch === generation.current) loading.current = false;}
  },[id,user?.uid]);
  useEffect(() => {
    ++generation.current;loading.current = false;setState({items:[],data:null,cursor:null,busy:!offline && focused,error:offline?'Connect to view messages.':''});
    if (!user?.uid || offline || !focused) return undefined;
    void fetchPage(false,true);
    const interval = setInterval(()=>void fetchPage(),id?4000:15000);
    const listener = AppState.addEventListener('change',value=>{if (value === 'active') void fetchPage();else {++generation.current;loading.current=false;}});
    return () => {++generation.current;loading.current=false;clearInterval(interval);listener.remove();};
  },[fetchPage,offline,focused,user?.uid]);
  return {...state,refresh:()=>fetchPage(false,true),loadMore:()=>fetchPage(true)};
}
