const assert=require('node:assert/strict');
const {CONTROL_PATH,ATTEMPT_PREFIX}=require('../../ai-release-control.cjs');
function store(){
 const rows=new Map([[CONTROL_PATH,{version:1,attempts:1}]]);let tail=Promise.resolve();
 const db={rows,fail:false,uncertain:false,failUpdates:false,
  attempts:()=>[...rows].filter(([path])=>path.startsWith(ATTEMPT_PREFIX+'/')).map(([,row])=>row),
  doc(path){assert.notEqual(path,CONTROL_PATH,'Historical record must never be accessed');return {path,async update(fields){if(db.failUpdates)throw Error('private storage detail');assert.ok(rows.has(path));rows.set(path,{...rows.get(path),...fields});}};},
  runTransaction(fn){const result=tail.then(async()=>{
   if(db.fail)throw Error('private storage detail');const pending=[];
   const value=await fn({get:async ref=>({exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))}),
    set:(ref,row)=>pending.push([ref.path,row]),create:(ref,row)=>{assert.ok(!rows.has(ref.path));pending.push([ref.path,row]);}});
   for(const [path,row] of pending)rows.set(path,structuredClone(row));
   if(db.uncertain)throw Error('commit acknowledgement lost');return value;
  });tail=result.catch(()=>{});return result;},
 };
 return db;
}
module.exports={store};
