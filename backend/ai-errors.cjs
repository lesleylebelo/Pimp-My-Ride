const {ApiError}=require('./errors.cjs');
const reasons={
 configuration:'configuration',provider_auth:'provider',model_unavailable:'provider',provider_quota:'provider',
 provider_timeout:'provider',provider_http:'provider',provider_network:'provider',provider_blocked:'output',
 malformed_output:'output',grounding_rejected:'validation',quota_storage:'storage',diagnostic_storage:'storage',
 reservation_expired:'quota',account_changed:'access',category_changed:'validation',unknown:'backend',
};
const validationFields=['title','description','missingDetails','categoryId'];
const validationRules=['negation_changed','number_changed','currency_changed','work_status_changed','new_content_term','sensitive_structure_changed','source_fact_omitted','question_numeric_reference','question_assumption','question_unprovided_term','category_unsupported'];
const outputStages=['envelope','candidate','parts','json','suggestion'];
const outputRules=['body_too_large','envelope_json','envelope_type','prompt_blocked','candidates_missing','candidates_empty','candidate_count','candidate_type','candidate_blocked','finish_max_tokens','finish_continuation','finish_not_stop','content_role','parts_missing','part_type','part_metadata','answer_text_missing','answer_json','object_type','unknown_field','required_field','title_type','title_empty','title_length','description_type','description_empty','description_length','category_type','category_unsupported','questions_type','questions_count','question_type','question_empty','question_length','question_format','unexpected_validation'];
class AIFailure extends ApiError{
 constructor(reason='unknown',details={}){
  super('unavailable','AI Assist is unavailable. Your draft is unchanged; you can continue editing normally.');
  this.reason=Object.hasOwn(reasons,reason)?reason:'unknown';this.stage=reasons[this.reason];
  this.rejectedField=validationFields.includes(details?.rejectedField)?details.rejectedField:null;
  this.validationRule=validationRules.includes(details?.validationRule)?details.validationRule:null;
  this.outputStage=outputStages.includes(details?.outputStage)?details.outputStage:null;
  this.outputRule=outputRules.includes(details?.outputRule)?details.outputRule:null;
 }
}
const failure=(reason,details)=>new AIFailure(reason,details);
module.exports={AIFailure,failure};
