const {ApiError}=require('./errors.cjs');
const {unavailable}=require('./ai-provider.cjs');
// A permanent, project-wide one-attempt ceiling for the initial release.
// Never rotate this ID by instance, release SHA, date, model or account.
const CONTROL_PATH='aiAssistControl/initial-provider-test-v1';
function createAIReleaseControl({db,env=process.env}={}){
 const testUid=env.PMR_AI_TEST_UID?.trim();
 return {
  authorize(uid){
   if(!testUid||testUid.length>128||/[\s\u0000-\u001f\u007f]/.test(testUid))throw unavailable();
   if(uid!==testUid)throw new ApiError('permission-denied','AI Assist is restricted to the designated test account.');
  },
  async reserve(){
   // The reservation commits BEFORE the provider is called. No refunds/retries:
   // crashes, provider errors and timeouts consume the single attempt as well.
   // A failed/uncertain transaction must never proceed to the provider.
   try{
    await db.runTransaction(async tx=>{
     const ref=db.doc(CONTROL_PATH),snapshot=await tx.get(ref);
     if(snapshot.exists){
      const value=snapshot.data();
      if(value?.version!==1||value.attempts!==1)throw unavailable();
      throw new ApiError('resource-exhausted','The initial AI test allowance has been used. AI Assist remains optional.');
     }
     tx.create(ref,{version:1,attempts:1});
    });
   }catch(error){
    if(error instanceof ApiError&&error.code==='resource-exhausted')throw error;
    throw unavailable();
   }
  },
 };
}
module.exports={createAIReleaseControl,CONTROL_PATH};
