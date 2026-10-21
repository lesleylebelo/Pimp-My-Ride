const {test}=require('node:test'),assert=require('node:assert/strict');
const {shapes,planRequest,classifyPlanResponse}=require('../scripts/check-media-query-plans.cjs');

test('streamed Firestore missing-index errors remain distinct from authentication and network failures',()=>{
 const missing={error:{code:400,status:'FAILED_PRECONDITION',message:'no matching index found.'}};
 assert.equal(classifyPlanResponse({status:400,body:[missing]}).status,'MISSING_INDEX');
 assert.equal(classifyPlanResponse({status:400,body:JSON.stringify([missing])}).status,'MISSING_INDEX');
 assert.equal(classifyPlanResponse({status:403,body:[{error:{code:403,status:'PERMISSION_DENIED',message:'Denied'}}]}).status,'READ_FAILED');
 assert.equal(classifyPlanResponse({status:500,body:[]}).status,'READ_FAILED');
});

test('plan-only checks never request execution and reject any unexpected document result',()=>{
 for(const shape of shapes)assert.deepEqual(planRequest(shape).explainOptions,{analyze:false});
 assert.throws(()=>classifyPlanResponse({status:200,body:[{document:{name:'unexpected'}}]}),/Unexpected document/);
 const summary={indexesUsed:[{properties:'(ownerId ASC, __name__ ASC)'}]};
 assert.deepEqual(classifyPlanResponse({status:200,body:[{explainMetrics:{planSummary:summary}}]}),{status:'PLANNABLE',planSummary:summary});
});
