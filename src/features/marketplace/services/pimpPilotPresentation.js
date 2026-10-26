export const pimpPilotCopy={
 name:'PimpPilot',
 subtitle:'Your AI-powered automotive assistant',
 trigger:'Optimise with PimpPilot',
 heading:'PimpPilot Suggestions',
 loading:'PimpPilot is working on your description...',
 ready:'Your PimpPilot suggestions are ready.',
 unavailable:'PimpPilot is temporarily unavailable. Please try again. Your draft is unchanged.',
 regenerate:'Regenerate Suggestions',
};

// Operational limits are temporary service protection, never personal allowances.
export function pimpPilotErrorMessage(error){
 const reason=error?.aiReason||error?.responseBody?.fields?.aiReason;
 const unchanged=' Your draft is unchanged.';
 const messages={
  busy:'PimpPilot is temporarily busy. Please try again shortly.',rate_limit:'PimpPilot is temporarily busy. Please try again shortly.',
  account_eligibility:"PimpPilot isn't available for this account's current status.",
  account_access:"PimpPilot isn't available for this account's current status. Refresh your session or contact support.",
  account_changed:'Your account access changed. Refresh your session before trying again.',
  draft_type:'PimpPilot is unavailable for this draft type.',
  request_conflict:'A different draft is already being processed. Wait for it to finish before trying again.',
  provider_limit:'PimpPilot is temporarily busy. Please try again shortly.',
  provider_billing:'PimpPilot is unavailable because its AI provider requires a billing review. Contact the project owner.',
  provider_timeout:'PimpPilot took too long to respond. Please try again.',
  provider_network:'PimpPilot could not reach its AI provider. Please try again.',
  suggestion_rejected:"PimpPilot couldn't prepare a reliable suggestion. Please try again or continue editing.",
  configuration:'PimpPilot is temporarily unavailable.',
  // Compatibility with an old backend during a backend-first release. These
  // obsolete classifications never describe a new application allowance.
  daily_allowance:'PimpPilot is temporarily unavailable.',tester_required:'PimpPilot is temporarily unavailable.',
 };
 if(Object.hasOwn(messages,reason))return messages[reason]+unchanged;
 if(['api/network-request-failed','auth/network-request-failed','app/offline'].includes(error?.code))return "Couldn't connect to PimpPilot. Check your connection and try again."+unchanged;
 if(error?.code==='api/connection-timeout')return messages.provider_timeout+unchanged;
 if(error?.status===401||error?.code==='api/unauthenticated')return 'Your session has expired. Sign in again.'+unchanged;
 if(error?.status===429||error?.code==='api/resource-exhausted')return messages.busy+unchanged;
 if(error?.status===403||error?.code==='api/permission-denied')return 'PimpPilot access could not be authorised. Refresh your session or contact support.'+unchanged;
 if(error?.status===400&&error?.code==='api/invalid-argument')return typeof error.message==='string'?error.message:pimpPilotCopy.unavailable;
 const message=typeof error?.message==='string'?error.message:'';
 if(message.startsWith('Your draft changed.')||message.startsWith('Your account changed.')||message.startsWith('PimpPilot returned an invalid suggestion.'))return message;
 return pimpPilotCopy.unavailable;
}
