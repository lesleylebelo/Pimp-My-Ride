const {FieldValue}=require('firebase-admin/firestore');
const D=require('./domain.cjs');
function createPresence({db,actor,now=Date.now}) {
 return async function sessionEvent(request){
  const a=await actor(request),input=request.data||{},session=D.id(input.session),at=now();
  if(!['heartbeat','offline'].includes(input.state))D.fail('Invalid session event.');
  const ref=db.doc(`presence/${a.uid}`);
  await db.runTransaction(async tx=>{
   const current=(await tx.get(db.doc('users/'+a.uid))).data();if(!D.active(current)||current.statusOperation||current.provisioningOperation)D.fail('Account access changed.','permission-denied');
   const snapshot=await tx.get(ref),sessions={...(snapshot.data()?.sessions||{})};
   const previous=sessions[session];
   for(const [key,deadline] of Object.entries(sessions))if(deadline<=at)delete sessions[key];
   if(input.state==='heartbeat'&&previous>at+70000)return;
   if(input.state==='heartbeat')sessions[session]=at+90000;else delete sessions[session];
   // Keep this heartbeat when several tabs share the same clock tick; otherwise
   // the newest tab can be dropped and log a new session on every retry.
   const live=Object.fromEntries(Object.entries(sessions).sort((a,b)=>b[1]-a[1]||(a[0]===session?-1:b[0]===session?1:0)).slice(0,20));
   tx.set(ref,{uid:a.uid,role:a.profile.role,fullName:a.profile.fullName,lastSeen:FieldValue.serverTimestamp(),sessions:live});
   const beginning=input.state==='heartbeat'&&(!previous||previous<=at);
   const ending=input.state==='offline'&&previous>at;
   if(beginning||ending)tx.create(db.collection('auditLogs').doc(),{actor:a.uid,action:beginning?'session.active':'session.inactive',target:a.uid,details:{},createdAt:FieldValue.serverTimestamp()});
  });return {ok:true};
 };
}
module.exports={createPresence};
