// Closed allowlists only. Never copy SDK messages, stacks, bodies, URLs, or
// arbitrary error-code/parameter/header values into operational telemetry.
const {invalidValueClassification,classifications}=require('./ai-azure-invalid-value.cjs');
const stages=new Set(['sdk_initialization','request_serialization','token_acquisition','responses_request','output_extraction']);
const types=new Set(['Error','TypeError','ReferenceError','SyntaxError','OpenAIError','APIError','APIConnectionError','APIConnectionTimeoutError','APIUserAbortError','BadRequestError','AuthenticationError','PermissionDeniedError','NotFoundError','ConflictError','UnprocessableEntityError','RateLimitError','InternalServerError','CredentialUnavailableError','AuthenticationRequiredError','AggregateAuthenticationError','ClientAuthError','ClientConfigurationError','RestError','AbortError']);
const codes=new Set(['invalid_request_error','invalid_request','InvalidRequest','BadRequest','InvalidArgument','unsupported_parameter','UnsupportedParameter','unsupported_value','invalid_value','invalid_json_schema','DeploymentNotFound','ModelNotFound','AgentNotFound','ResourceNotFound','InvalidApiVersionParameter','InvalidAuthenticationTokenAudience','invalid_resource','invalid_client','unauthorized_client','access_denied','AuthorizationPermissionMismatch','AuthorizationFailed','Forbidden','InternalServerError','ServiceUnavailable','ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID']);
const params=new Set(['instructions','input','store','stream','tools','tool_choice','max_output_tokens','reasoning','reasoning.effort','text','text.format','text.format.type','text.format.schema','text.format.schema.properties.title','text.format.schema.properties.description','conversation','model','previous_response_id','api-version']);
const credentialStates=new Set(['not_observed','acquired','failed']);
const subcodes=new Set(['azure_sdk_initialization','azure_request_serialization','azure_credential_failed','azure_client_credentials','azure_token_audience','azure_unsupported_parameter','azure_output_rejected','azure_timeout','azure_dns','azure_tls','azure_connection','azure_network_or_sdk']);
function httpStatus(value){
 const status=typeof value==='string'&&/^[1-5]\d{2}$/.test(value)?Number(value):value;
 return Number.isInteger(status)&&status>=100&&status<=599?status:null;
}
function requestId(value){return typeof value==='string'&&value.length<=96&&(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)||/^[a-f0-9]{32}$/i.test(value)||/^req_[A-Za-z0-9]{16,64}$/.test(value))?value:null;}
function header(headers,name){try{return typeof headers?.get==='function'?headers.get(name):headers?.[name];}catch{return null;}}
function sanitizeDiagnostic(value={}){
 return {
  providerFailureStage:stages.has(value.providerFailureStage)?value.providerFailureStage:null,
  providerErrorType:types.has(value.providerErrorType)?value.providerErrorType:null,
  providerHttpStatus:httpStatus(value.providerHttpStatus),
  providerErrorCode:codes.has(value.providerErrorCode)?value.providerErrorCode:null,
  providerErrorParam:params.has(value.providerErrorParam)?value.providerErrorParam:null,
  providerRequestId:requestId(value.providerRequestId),
  providerFailureSubcode:subcodes.has(value.providerFailureSubcode)||/^azure_http_[1-5]\d{2}$/.test(value.providerFailureSubcode||'')?value.providerFailureSubcode:null,
  providerCredentialState:credentialStates.has(value.providerCredentialState)?value.providerCredentialState:null,
  providerInvalidValueClassification:classifications.has(value.providerInvalidValueClassification)?value.providerInvalidValueClassification:value.providerErrorCode==='invalid_value'&&value.providerFailureStage==='responses_request'&&httpStatus(value.providerHttpStatus)===400?'unknown':null,
 };
}
function azureDiagnostic(error,context={}){
 const chain=[],seen=new Set();
 for(let source=error;source&&typeof source==='object'&&chain.length<4&&!seen.has(source);source=source.cause){seen.add(source);chain.push(source);}
 const type=chain.map(source=>[source.constructor?.name,source.name].find(name=>types.has(name)&&name!=='Error')).find(Boolean)||'Error';
 const status=chain.map(source=>httpStatus(source.status)??httpStatus(source.statusCode)??httpStatus(source.response?.status)).find(value=>value!==null)??httpStatus(context.httpStatus);
 const code=chain.flatMap(source=>[source.code,source.error?.code,source.error?.innererror?.code]).find(value=>codes.has(value))??null;
 const param=chain.flatMap(source=>[source.param,source.error?.param]).find(value=>params.has(value))??null;
 let id=null;
 for(const source of chain){
  const headers=source.headers||source.response?.headers;
  id=[source.requestID,source.request_id,header(headers,'x-ms-request-id'),header(headers,'apim-request-id'),header(headers,'x-request-id'),header(headers,'x-ms-correlation-request-id')].map(requestId).find(Boolean)||id;
  if(id)break;
 }
 let subcode=context.stage==='sdk_initialization'?'azure_sdk_initialization':context.stage==='request_serialization'?'azure_request_serialization':context.stage==='token_acquisition'?'azure_credential_failed':context.stage==='output_extraction'?'azure_output_rejected':'azure_network_or_sdk';
 if(context.stage==='token_acquisition'&&['invalid_client','unauthorized_client'].includes(code))subcode='azure_client_credentials';
 else if(['invalid_resource','InvalidAuthenticationTokenAudience'].includes(code))subcode='azure_token_audience';
 else if(context.aborted||['AbortError','APIUserAbortError','APIConnectionTimeoutError'].includes(type))subcode='azure_timeout';
 else if(context.stage==='responses_request'&&status!==null)subcode=['unsupported_parameter','UnsupportedParameter'].includes(code)?'azure_unsupported_parameter':`azure_http_${status}`;
 else if(['ENOTFOUND','EAI_AGAIN'].includes(code))subcode='azure_dns';
 else if(['CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))subcode='azure_tls';
 else if(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(code))subcode='azure_connection';
 const classification=invalidValueClassification(chain,code,context.stage,status);
 return sanitizeDiagnostic({providerFailureStage:context.stage,providerErrorType:type,providerHttpStatus:status,providerErrorCode:code,providerErrorParam:param,providerRequestId:id,providerFailureSubcode:subcode,providerCredentialState:context.credentialState,providerInvalidValueClassification:classification});
}
module.exports={azureDiagnostic,sanitizeDiagnostic,httpStatus};
