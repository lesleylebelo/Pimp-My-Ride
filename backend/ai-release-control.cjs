const {randomUUID}=require('node:crypto');
const {ApiError}=require('./errors.cjs');
const {AIFailure,failure}=require('./ai-errors.cjs');
// Historical evidence only. Never read, update, delete or reuse as a daily counter.
const CONTROL_PATH='aiAssistControl/initial-provider-test-v1';
const DAILY_PREFIX='aiAssistDaily',ATTEMPT_PREFIX='aiAssistAttempts',DAILY_LIMIT=5;
function createAIReleaseControl({db,env=process.env,now=Date.now}={}){
 const configured=env.PMR_AI_TEST_UIDS??env.PMR_AI_TEST_UID??'';
 const uids=configured.split(',').map(uid=>uid.trim());
 const valid=uids.length<=50&&uids.every(uid=>uid.length>0&&uid.length<=128&&!/[\s\u0000-\u001f\u007f]/.test(uid));
 return {
  authorize(uid){
   if(!valid)throw failure('configuration');
   if(!uids.includes(uid))throw new ApiError('permission-denied','AI Assist is restricted to designated test accounts.');
  },
  async reserve(){
   const correlationId=randomUUID(),reservedAt=new Date(now()),day=reservedAt.toISOString().slice(0,10);
   let attempt;
   try{
    const counter=db.doc(DAILY_PREFIX+'/'+day);attempt=db.doc(ATTEMPT_PREFIX+'/'+correlationId);
    // Transaction callbacks perform no external work. Only a confirmed commit
    // may dispatch; ambiguous commits retain their consumed reservation.
    await db.runTransaction(async tx=>{
     const snapshot=await tx.get(counter),value=snapshot.data();
     if(snapshot.exists&&(value?.version!==1||value.day!==day||!Number.isInteger(value.attempts)||value.attempts<1||value.attempts>DAILY_LIMIT))throw failure('quota_storage');
     const attempts=snapshot.exists?value.attempts:0;
     if(attempts>=DAILY_LIMIT)throw new ApiError('resource-exhausted','The daily AI test allowance has been used. Your draft is unchanged.');
     tx.set(counter,{version:1,day,attempts:attempts+1});
     tx.create(attempt,{version:1,correlationId,day,reservedAt,dispatchInitiatedAt:null,responseReceivedAt:null,
      providerHttpStatus:null,outputValidated:false,failureStage:null,reasonCode:null,rejectedField:null,validationRule:null,state:'unknown',finishedAt:null});
    });
   }catch(error){if(error instanceof ApiError&&error.code==='resource-exhausted')throw error;
    console.warn('AI Assist control unavailable',{correlationId,failureStage:'storage',reasonCode:'quota_storage'});throw failure('quota_storage');}
   let closed=false;
   async function update(fields){
    try{await attempt.update(fields);}catch{console.warn('AI Assist diagnostics unavailable',{correlationId,failureStage:'storage',reasonCode:'diagnostic_storage'});throw failure('diagnostic_storage');}
   }
   return {
    correlationId,
    async dispatch(){
     if(closed)throw failure('diagnostic_storage');
     const checkDay=()=>{if(new Date(now()).toISOString().slice(0,10)!==day)throw failure('reservation_expired');};
     checkDay();await update({dispatchInitiatedAt:new Date(now())});checkDay();
    },
    async response(status){if(closed)return;await update({responseReceivedAt:new Date(now()),providerHttpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null});},
    async finish({error,outputValidated=false}={}){
     if(closed)throw failure('diagnostic_storage');closed=true;
     const safe=error instanceof AIFailure?error:error?failure('unknown'):null;
     // A crash leaves unknown. Success means backend completion, not UI delivery.
     await update({state:safe?(safe.stage==='storage'?'unknown':'failed'):'successful',outputValidated:outputValidated===true,
      failureStage:safe?.stage??null,reasonCode:safe?.reason??null,rejectedField:safe?.rejectedField??null,validationRule:safe?.validationRule??null,finishedAt:new Date(now())});
    },
   };
  },
 };
}
module.exports={createAIReleaseControl,CONTROL_PATH,DAILY_PREFIX,ATTEMPT_PREFIX,DAILY_LIMIT};
