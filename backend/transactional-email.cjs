const {createHash,randomUUID,timingSafeEqual}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const D=require('./domain.cjs');
const COLLECTION='transactionalEmailJobs';
const MAX_ATTEMPTS=6,LEASE_MS=90000,RETRY_WINDOW_MS=23*60*60*1000;
const NOTICE='SIMULATED PAYMENT — NO REAL MONEY WAS CHARGED';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eventKey=(kind,id)=>createHash('sha256').update(`v1/${kind}/${id}`).digest('hex');
// Called only within the authoritative marketplace transaction. Existing mutation
// replay and domain state guards prevent a second create for the same event.
function enqueueEmail(tx,db,{kind,id,bookingId,ownerId,snapshot}){
 tx.create(db.doc(`${COLLECTION}/${eventKey(kind,id)}`),{schemaVersion:1,kind,bookingId,recipientUid:ownerId,snapshot,
  status:'queued',attempts:0,polls:0,dueAt:0,createdAt:FieldValue.serverTimestamp()});
}
const option=value=>({pay_now:'Full payment',pay_deposit:'Deposit',pay_in_store:'Pay in store'}[value]||value||'Unavailable');
const money=value=>Number.isSafeInteger(value)&&value>=0?`ZAR ${(value/100).toFixed(2)}`:'Not recorded';
function renderEmail(job){
 const s=job.snapshot,b=s.booking||s,r=s.receipt;
 const title=job.kind==='booking_confirmed'?'Booking confirmed':job.kind==='pay_in_store_selected'?'Pay-in-store selection recorded':'Simulated payment receipt';
 const fields=[['Booking reference',job.bookingId],['Customer',r?.customer?.name||b.customerName],['Workshop',r?.shop?.name||b.shopName],['Service',r?.serviceTitle||b.requestTitle]];
 if(job.kind==='booking_confirmed'){
  fields.push(['Vehicle',[b.vehicle?.year,b.vehicle?.make,b.vehicle?.model,b.vehicle?.registration].filter(Boolean).join(' ')],['Status',b.status]);
  if(b.appointmentDate)fields.push(['Appointment',`${b.appointmentDate}${b.appointmentTime?' at '+b.appointmentTime:''} SAST (UTC+02:00)`]);
 }else if(r){
  fields.push(['Receipt reference',r.receiptReference],['Payment option',option(b.paymentMethod)],['Recorded method',r.method],['Simulated amount recorded',money(r.amountCents)],['Simulated outstanding balance',money(r.balanceDueCentsAfter)]);
 }else fields.push(['Payment option','Pay in store — selection only; payment is still due'],['Simulated amount paid',money(b.paidCents)],['Simulated outstanding balance',money(b.balanceDueCents)]);
 const at=job.createdAt?.toDate?.();
 if(at)fields.push(['Event recorded',at.toISOString()]);
 const present=fields.filter(([,v])=>v!==undefined&&v!==null&&v!=='');
 const instructions='Open PimpMyRide, go to Bookings and select the booking reference above. Your booking and any receipt remain available in the app.';
 const text=[title,NOTICE,...present.map(([k,v])=>`${k}: ${v}`),instructions].join('\n\n');
 const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#172033"><main style="max-width:600px;margin:24px auto;background:white;padding:24px;border-radius:12px"><p style="font-weight:bold">PimpMyRide</p><h1 style="font-size:24px">${escapeHtml(title)}</h1><p style="padding:16px;background:#fff3cd;font-weight:bold">${NOTICE}</p><table role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed">${present.map(([k,v])=>`<tr><td style="padding:10px 6px;border-bottom:1px solid #ddd;width:40%;vertical-align:top">${escapeHtml(k)}</td><td style="padding:10px 6px;border-bottom:1px solid #ddd;overflow-wrap:anywhere">${escapeHtml(v)}</td></tr>`).join('')}</table><p style="line-height:1.6">${instructions}</p></main></body></html>`;
 return {subject:`[SIMULATED / TEST] ${title}`,html,text};
}
function emailConfig(env=process.env){
 if(env.PMR_TRANSACTIONAL_EMAIL_ENABLED!=='true')return {enabled:false};
 if(!env.RESEND_API_KEY||!validEmail(env.PMR_EMAIL_FROM)||!env.PMR_EMAIL_DISPATCH_TOKEN||env.PMR_EMAIL_DISPATCH_TOKEN.length<32)throw Error('Configure server-only RESEND_API_KEY, PMR_EMAIL_FROM (verified bare address), and PMR_EMAIL_DISPATCH_TOKEN (32+ characters).');
 return {enabled:true,apiKey:env.RESEND_API_KEY,from:env.PMR_EMAIL_FROM,token:env.PMR_EMAIL_DISPATCH_TOKEN};
}
function validEmail(value){return typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value)&&!value.includes('..');}
// Node 22 native fetch avoids an extra SDK/runtime dependency. Never log bodies,
// recipient addresses, API keys or provider error messages.
function resendProvider({apiKey,fetchImpl=fetch}){
 const request=async(path,options={})=>{
  const response=await fetchImpl(`https://api.resend.com${path}`,{...options,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=Error('Email provider request failed');error.retryable=response.status===429||response.status>=500||response.status===409&&body.name==='concurrent_idempotent_requests';throw error;}
  return body;
 };
 return {send:async(payload,key)=>{const result=await request('/emails',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(payload)});if(typeof result.id!=='string'||!result.id)throw Error('Provider acceptance unknown');return result.id;},
  retrieve:id=>request(`/emails/${encodeURIComponent(id)}`)};
}
function createEmailDispatcher({db,auth,config,provider=resendProvider({apiKey:config.apiKey}),now=Date.now}){
 async function processJob(ref){
  const token=randomUUID(),time=now();
  const job=await db.runTransaction(async tx=>{
   const s=await tx.get(ref),j=s.data();
   if(!j||!['queued','processing','accepted'].includes(j.status)||j.dueAt>time)return null;
   if(j.status!=='accepted'&&(j.attempts>=MAX_ATTEMPTS||j.firstAttemptAt!==undefined&&time-j.firstAttemptAt>=RETRY_WINDOW_MS)){
    tx.update(ref,{status:'failed',failureCode:'retry_window_or_attempt_limit',requiresReview:true});return null;
   }
   tx.update(ref,{leaseToken:token,dueAt:time+LEASE_MS,...(j.status==='accepted'?{}:{status:'processing',attempts:j.attempts+1,firstAttemptAt:j.firstAttemptAt??time})});
   return {...j,attempts:j.attempts+(j.status==='accepted'?0:1)};
  });
  if(!job)return;
  const save=patch=>db.runTransaction(async tx=>{const current=(await tx.get(ref)).data();if(current?.leaseToken!==token)return false;tx.update(ref,{...patch,updatedAt:FieldValue.serverTimestamp()});return true;});
  if(job.status==='accepted'){
   try{
    const result=await provider.retrieve(job.providerId),last=result.last_event;
    if(last==='delivered')await save({status:'delivered',deliveredAt:FieldValue.serverTimestamp()});
    else if(['bounced','failed','suppressed','canceled'].includes(last))await save({status:'failed',failureCode:`provider_${last}`});
    else await save({polls:job.polls+1,dueAt:job.polls>=11?Number.MAX_SAFE_INTEGER:now()+3600000});
   }catch{await save({polls:job.polls+1,dueAt:job.polls>=11?Number.MAX_SAFE_INTEGER:now()+3600000});}
   return;
  }
  try{
   const [profile,user]=await Promise.all([db.doc(`users/${job.recipientUid}`).get(),auth.getUser(job.recipientUid)]);
   const p=profile.data();
   if(!D.active(p)||p.role!=='owner'||p.statusOperation||p.provisioningOperation||user.disabled||user.emailVerified!==true||!validEmail(user.email)){
    await save({status:'failed',failureCode:'recipient_unavailable'});return;
   }
   // Freeze the complete provider request before the first network attempt so
   // uncertain retries use exactly the same payload and idempotency key.
   const payload=job.payload||{...renderEmail(job),from:config.from,to:[user.email]};
   if(job.payload&&job.payload.to[0]!==user.email){await save({status:'failed',failureCode:'recipient_changed',requiresReview:true});return;}
   if(!await save({payload}))return;
   const providerId=await provider.send(payload,ref.id);
   await save({status:'accepted',providerId,acceptedAt:FieldValue.serverTimestamp(),dueAt:now()+60000});
  }catch(error){
   if(error.code==='auth/user-not-found'){await save({status:'failed',failureCode:'recipient_unavailable'});return;}
   const terminal=error.retryable===false||job.attempts>=MAX_ATTEMPTS;
   await save({status:terminal?'failed':'queued',failureCode:terminal?'send_failed':'transient_or_unknown',requiresReview:terminal,dueAt:now()+Math.min(3600000,60000*2**(job.attempts-1))});
  }
 }
 async function dispatch(){
  if(!config.enabled)return {enabled:false,processed:0};
  const snapshot=await db.collection(COLLECTION).where('status','in',['queued','processing','accepted']).where('dueAt','<=',now()).orderBy('dueAt').limit(3).get();
  for(const doc of snapshot.docs)await processJob(db.doc(`${COLLECTION}/${doc.id}`));
  return {enabled:true,processed:snapshot.docs.length};
 }
 return {dispatch,processJob};
}
function mountEmailDispatch(app,{dispatcher,config}){
 const {rateLimit}=require('express-rate-limit');
 app.post('/internal/email/dispatch',rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  const provided=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${config.token||''}`);
  if(!config.enabled||provided.length!==expected.length||!timingSafeEqual(provided,expected))return res.sendStatus(403);
  try{res.json(await dispatcher.dispatch());}catch{res.status(503).json({error:'Email dispatch unavailable'});}
 });
}
module.exports={COLLECTION,MAX_ATTEMPTS,RETRY_WINDOW_MS,NOTICE,enqueueEmail,eventKey,renderEmail,emailConfig,validEmail,resendProvider,createEmailDispatcher,mountEmailDispatch};
