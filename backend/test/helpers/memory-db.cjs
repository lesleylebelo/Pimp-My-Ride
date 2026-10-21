const {Timestamp}=require('firebase-admin/firestore');
// Transactional test double; production services never import it.
function memoryDb(seed={}) {
 const rows=new Map(Object.entries(seed));let sequence=0,count=0,transactionTail=Promise.resolve();
 const copy=value=>value instanceof Timestamp?value:Array.isArray(value)?value.map(copy):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)])):value;
 const apply=(previous,value)=>{const next={...previous};for(const [k,v] of Object.entries(value)){if(v?.constructor?.name==='DeleteTransform')delete next[k];else if(v?.constructor?.name==='ServerTimestampTransform')next[k]=Timestamp.now();else next[k]=copy(v);}return next;};
 const snapshot=p=>({id:p.split('/').pop(),exists:rows.has(p),data:()=>copy(rows.get(p))});
 function doc(p){return {path:p,id:p.split('/').pop(),get:async()=>snapshot(p),collection:n=>collection(`${p}/${n}`),set:async v=>rows.set(p,apply({},v)),update:async v=>rows.set(p,apply(rows.get(p),v))};}
 function collection(p){return {doc:(id=`id${++sequence}`)=>doc(`${p}/${id}`),add:async v=>{const r=doc(`${p}/id${++sequence}`);await r.set(v);return r;}};}
 const db={doc,collection,rows,before:null,after:null,runTransaction:async fn=>{
  let release;const previous=transactionTail;transactionTail=new Promise(resolve=>{release=resolve;});await previous;
  try{
   const n=++count;if(db.before)await db.before(n);const writes=[];
   const result=await fn({get:async r=>snapshot(r.path),create:(r,v)=>writes.push(()=>{if(rows.has(r.path))throw Error('already exists');rows.set(r.path,apply({},v));}),set:(r,v,options)=>writes.push(()=>rows.set(r.path,apply(options?.merge?rows.get(r.path):{},v))),update:(r,v)=>writes.push(()=>{if(!rows.has(r.path))throw Error('missing');rows.set(r.path,apply(rows.get(r.path),v));})});
   writes.forEach(fn=>fn());if(db.after)await db.after(n);return result;
  }finally{release();}
 }};
 return db;
}
module.exports={memoryDb};
