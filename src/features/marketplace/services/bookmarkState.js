// Shared presentation state only. Firestore through postsApi remains authoritative.
let session,revision=0;
const records=new Map(),listeners=new Set();
const key=(uid,id)=>JSON.stringify([uid,id]);
const emit=()=>{for(const listener of listeners)listener();};
export function bookmarkSession(user){
 if(session!==user){session=user;++revision;records.clear();emit();}
}
export const bookmarkRevision=()=>revision;
export const subscribeBookmarks=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const bookmarkSnapshot=(uid,id)=>records.get(key(uid,id));
export function publishBookmark(uid,id,saved,started=Infinity){
 const index=key(uid,id),previous=records.get(index);
 if(previous?.pending||previous?.revision>started||typeof saved!=='boolean')return;
 if(previous?.saved===saved&&!previous.error)return;
 records.set(index,{saved,pending:false,revision:++revision});
 if(records.size>1000){for(const [old,record] of records){if(old!==index&&!record.pending){records.delete(old);break;}}}
 emit();
}
export function saveBookmark(uid,id,saved,execute){
 const index=key(uid,id),previous=records.get(index);
 if(previous?.pending){
  if(previous.desired===saved)return previous.promise;
  const owner=session;
  return previous.promise.catch(()=>{}).then(()=>{if(owner!==session)throw Error('Your account changed. Please try again.');return saveBookmark(uid,id,saved,execute);});
 }
 const owner=session,entry={saved:previous?.saved,pending:true,desired:saved,revision:++revision};
 records.set(index,entry);
 entry.promise=Promise.resolve().then(()=>{if(owner!==session)throw Error('Your account changed. Please try again.');return execute();}).then(result=>{
  if(owner!==session)throw Error('Your account changed. Please try again.');
  if(result?.id!==id||result?.saved!==saved)throw Error('The bookmark update could not be confirmed. Try again.');
  if(records.get(index)===entry){records.set(index,{saved,pending:false,revision:++revision});emit();}
  return result;
 }).finally(()=>{
  if(records.get(index)===entry){records.set(index,{saved:previous?.saved,pending:false,revision:++revision});emit();}
 });
 emit();return entry.promise;
}
