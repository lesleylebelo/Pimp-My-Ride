export const pimpPilotCopy={
 name:'PimpPilot',
 subtitle:'Your AI-powered automotive assistant',
 trigger:'Optimise with PimpPilot',
 heading:'PimpPilot Suggestions',
 loading:'PimpPilot is working on your description...',
 ready:'Your PimpPilot suggestions are ready.',
 unavailable:'PimpPilot is temporarily unavailable. Your draft is unchanged.',
 regenerate:'Regenerate Suggestions',
};

// HTTP status alone cannot distinguish daily allowance from transient throttling.
// Older servers remain supported without inventing a quota reset or eligibility reason.
export function pimpPilotErrorMessage(error){
 const reason=error?.aiReason||error?.responseBody?.fields?.aiReason;
 const unchanged=' Your draft is unchanged.';
 if(reason==='daily_allowance'){
  const resetAt=error?.resetAt??error?.responseBody?.fields?.resetAt;
  const reset=typeof resetAt==='number'&&Number.isFinite(resetAt)&&resetAt>0&&resetAt<=8640000000000000?` The allowance resets at ${new Date(resetAt).toISOString().replace('T',' ').replace('.000Z',' UTC')}.`:'';
  return 'The shared daily PimpPilot test allowance has been reached.'+reset+unchanged;
 }
 const messages={
  busy:'PimpPilot is busy. Please try again later.',rate_limit:'PimpPilot is busy. Please try again later.',
  tester_required:'PimpPilot is currently restricted to designated test accounts. Contact the project owner for access.',
  account_eligibility:'PimpPilot requires an active Customer or approved Workshop account.',
  account_access:'Your account access could not be verified. Refresh your session or contact support.',
  account_changed:'Your account access changed. Refresh your session before trying again.',
  draft_type:'PimpPilot is unavailable for this draft type.',
  provider_limit:'PimpPilot’s AI provider has reached a usage or capacity limit. Please try again later.',
  provider_billing:'PimpPilot is unavailable because its AI provider requires a billing review. Contact the project owner.',
  provider_timeout:'PimpPilot took too long to respond. Please try again later.',
  provider_network:'PimpPilot could not reach its AI provider. Please try again later.',
  suggestion_rejected:'PimpPilot could not validate a suggestion. You can continue editing your draft normally.',
 };
 if(messages[reason])return messages[reason]+unchanged;
 if(error?.code==='api/network-request-failed'||error?.code==='app/offline')return "Couldn't connect to PimpPilot. Check your connection and try again."+unchanged;
 if(error?.code==='api/connection-timeout')return 'PimpPilot took too long to respond. Please try again later.'+unchanged;
 if(error?.status===401||error?.code==='api/unauthenticated')return 'Your session expired. Sign in again to use PimpPilot.'+unchanged;
 if(error?.status===503)return pimpPilotCopy.unavailable;
 if(error?.status===429||error?.code==='api/resource-exhausted')return 'PimpPilot is busy or its test allowance has been reached. Please try again later.'+unchanged;
 if(error?.status===403||error?.code==='api/permission-denied')return 'PimpPilot access could not be authorised. Refresh your session or contact the project owner.'+unchanged;
 const message=typeof error?.message==='string'?error.message:'';
 if(/^(AI Assist|PimpPilot) is unavailable\b/.test(message))return pimpPilotCopy.unavailable;
 return message?message.replace(/\bAI Assist\b/g,pimpPilotCopy.name):pimpPilotCopy.unavailable;
}
