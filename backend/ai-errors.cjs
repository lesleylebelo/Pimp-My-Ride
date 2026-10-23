const {ApiError}=require('./errors.cjs');
const reasons={
 configuration:'configuration',provider_auth:'provider',model_unavailable:'provider',provider_quota:'provider',
 provider_timeout:'provider',provider_http:'provider',provider_network:'provider',provider_blocked:'output',
 malformed_output:'output',grounding_rejected:'validation',quota_storage:'storage',diagnostic_storage:'storage',
 reservation_expired:'quota',account_changed:'access',category_changed:'validation',unknown:'backend',
};
class AIFailure extends ApiError{
 constructor(reason='unknown'){
  super('unavailable','AI Assist is unavailable. Your draft is unchanged; you can continue editing normally.');
  this.reason=Object.hasOwn(reasons,reason)?reason:'unknown';this.stage=reasons[this.reason];
 }
}
const failure=reason=>new AIFailure(reason);
module.exports={AIFailure,failure};
