import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function createSecurePersistence(store, legacy) {
 let queue=Promise.resolve();
 const options={keychainAccessible:store.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
 const encode=key=>'pmr.auth.'+Array.from(key).map(c=>c.codePointAt(0).toString(16)).join('_');
 const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const manifest=async key=>{const raw=await store.getItemAsync(key,options);return raw?JSON.parse(raw):null;};
 const clean=async(key,m)=>{if(m)await Promise.all(Array.from({length:m.count},(_,i)=>store.deleteItemAsync(`${key}.${m.id}.${i}`,options)));};
 return {
  getItem:key=>serial(async()=>{
   await legacy.removeItem(key);
   const root=encode(key),m=await manifest(root);
   if(!m)return null;
   if(!Number.isInteger(m.count)||m.count<1||m.count>128)throw new Error('Invalid saved session.');
   const chunks=await Promise.all(Array.from({length:m.count},(_,i)=>store.getItemAsync(`${root}.${m.id}.${i}`,options)));
   if(chunks.some(c=>c===null))return null;
   return chunks.join('');
  }),
  setItem:(key,value)=>serial(async()=>{
   const root=encode(key),old=await manifest(root),id=Date.now().toString(36)+Math.random().toString(36).slice(2);
   const chars=Array.from(value),parts=[];
   for(let i=0;i<chars.length;i+=450)parts.push(chars.slice(i,i+450).join(''));
   if(parts.length===0)parts.push('');
   if(parts.length>128)throw new Error('Saved session is too large.');
   const next={id,count:parts.length};
   try {
    for(let i=0;i<parts.length;i++)await store.setItemAsync(`${root}.${id}.${i}`,parts[i],options);
    await store.setItemAsync(root,JSON.stringify(next),options);
   } catch(error){await clean(root,next).catch(()=>{});throw error;}
   await clean(root,old).catch(()=>{});
   await legacy.removeItem(key);
  }),
  removeItem:key=>serial(async()=>{
   const root=encode(key),old=await manifest(root);
   await store.deleteItemAsync(root,options);
   await clean(root,old);
   await legacy.removeItem(key);
  }),
 };
}
export const securePersistence=createSecurePersistence(SecureStore,AsyncStorage);
