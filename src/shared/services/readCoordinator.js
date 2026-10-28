// Memory only. Successful mutations invalidate all participating read caches.
// No automatic retry: callers/polls may try again after the shared cooldown.
const coordinators=new Set();
export function invalidateReads(){for(const invalidate of coordinators)invalidate();}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function createReadCoordinator(session){
 let owner,epoch=0,cooldown=null;
 const entries=new Map();
 const clear=()=>{++epoch;entries.clear();};coordinators.add(clear);
 function account(){const next=session();if(next!==owner){owner=next;clear();cooldown=null;}return next;}
 return async function read(input,execute,{ttl=5000,force=false}={}){
  const user=account();if(!user)throw Error('Sign in to continue.');
  const key=JSON.stringify(canonical(input)),now=Date.now(),previous=entries.get(key);
  if(cooldown&&now<cooldown.until)throw cooldown.error;
  if(previous?.promise)return previous.promise;
  if(previous?.error&&now<previous.until)throw previous.error;
  if(!force&&previous?.value!==undefined&&now<previous.until)return previous.value;
  if(!entries.has(key)&&entries.size>=200){
   const removable=[...entries].find(([,item])=>!item.promise);
   if(removable)entries.delete(removable[0]);else throw Error('Too many concurrent reads. Try again shortly.');
  }
  const generation=epoch,entry={failures:previous?.failures||0};
  entry.promise=(async()=>{
   try{
    const value=await Promise.resolve().then(execute);
    if(account()!==user)throw Error('Your account changed. Reload this page.');
    // Never cache an in-flight read that began before a mutation completed.
    if(generation===epoch){entry.value=value;entry.until=Date.now()+ttl;entry.failures=0;}
    return value;
   }catch(error){
    if(account()===user&&generation===epoch){
     entry.error=error;entry.failures++;
     entry.until=Date.now()+Math.min(60000,5000*2**Math.min(entry.failures-1,4));
     if(error.status===429||error.code==='api/resource-exhausted'){
      entry.until=Math.max(entry.until,error.retryAt||Date.now()+60000);
      if(!cooldown||entry.until>cooldown.until)cooldown={until:entry.until,error};
     }
    }
    throw error;
   }finally{entry.promise=null;}
  })();
  entries.delete(key);entries.set(key,entry);
  if(entries.size>200){for(const [old,item] of entries){if(!item.promise&&old!==key){entries.delete(old);break;}}}
  return entry.promise;
 };
}
