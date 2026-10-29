import {createReadCoordinator,invalidateReads} from '../../../shared/services/readCoordinator';
import {registerSessionCache} from '../../../shared/services/sessionCaches';
import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
const writes = new Set(['open','enquire','consent','send','read']), pending = new Map();
let lastUid;
registerSessionCache(()=>{pending.clear();lastUid=undefined;});
const canonical = value => value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
async function executemessageApi(op, data = {}) {
  const uid = firebase().auth.currentUser?.uid;
  if (uid !== lastUid) {pending.clear();lastUid = uid;}
  if (!uid) throw new Error('Sign in to use messages.');
  const payload = {...data,op}, key = JSON.stringify([uid,canonical(payload)]);
  if (writes.has(op) && !payload.requestId) {
    payload.requestId = pending.get(key) || `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pending.set(key,payload.requestId);if (pending.size > 100) pending.delete(pending.keys().next().value);
  }
  const result = await apiRequest('messaging',payload,{expectedUid:uid});
  if (firebase().auth.currentUser?.uid !== uid) throw new Error('Your account changed. Reload messages.');
  pending.delete(key);return result;
}

const coordinatedRead=createReadCoordinator(()=>firebase().auth.currentUser);
export async function messageApi(op,data={},options={}){
 if(!['list','get','summary'].includes(op)){try{return await executemessageApi(op,data);}finally{invalidateReads();}}
 return coordinatedRead([op,data],()=>executemessageApi(op,data),{ttl:op==='summary'?30000:op==='get'?0:5000,...options});
}
