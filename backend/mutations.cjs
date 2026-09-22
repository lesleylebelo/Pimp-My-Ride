const {createHash,randomUUID}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const D=require('./domain.cjs');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>createHash('sha256').update(value).digest('hex');
function mutation(db,actor,op,input) {
 // Older clients remain compatible; updated clients always send a stable retry key.
 const requestId=input.requestId===undefined?randomUUID():D.id(input.requestId);
 const {requestId:ignored,...payload}=input;
 const fingerprint=hash(JSON.stringify(canonical(payload))),id=hash(`${actor}\n${op}\n${requestId}`);
 const ref=db.doc(`mutationReceipts/${id}`);
 function check(record){if(record&&(record.fingerprint!==fingerprint||record.actor!==actor||record.op!==op))D.fail('This request key was already used with different data.','already-exists');}
 async function atomic(change){return db.runTransaction(async tx=>{
  const saved=(await tx.get(ref)).data();check(saved);if(saved)return saved.result;
  const result=await change(tx);
  tx.create(ref,{actor,op,fingerprint,result,createdAt:FieldValue.serverTimestamp()});return result;
 });}
 return {id,fingerprint,atomic,check};
}
module.exports={mutation};
