const {ApiError}=require('./errors.cjs');
const reasons={
 configuration:'configuration',provider_auth:'provider',model_unavailable:'provider',provider_quota:'provider',
 provider_timeout:'provider',provider_http:'provider',provider_network:'provider',provider_blocked:'output',
 malformed_output:'output',grounding_rejected:'validation',quota_storage:'storage',diagnostic_storage:'storage',
 reservation_expired:'quota',account_changed:'access',category_changed:'validation',unknown:'backend',
};
const validationFields=['title','description','missingDetails','categoryId'];
const validationRules=['negation_changed','number_changed','currency_changed','work_status_changed','new_content_term','sensitive_structure_changed','source_fact_omitted','question_numeric_reference','question_assumption','question_unprovided_term','category_unsupported'];
class AIFailure extends ApiError{
 constructor(reason='unknown',details={}){
  super('unavailable','AI Assist is unavailable. Your draft is unchanged; you can continue editing normally.');
  this.reason=Object.hasOwn(reasons,reason)?reason:'unknown';this.stage=reasons[this.reason];
  this.rejectedField=validationFields.includes(details?.rejectedField)?details.rejectedField:null;
  this.validationRule=validationRules.includes(details?.validationRule)?details.validationRule:null;
 }
}
const failure=(reason,details)=>new AIFailure(reason,details);
module.exports={AIFailure,failure};
