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

// Translate existing server errors at the presentation boundary only.
export function pimpPilotErrorMessage(error){
 if(error?.status===503||['api/connection-timeout','api/network-request-failed'].includes(error?.code))return pimpPilotCopy.unavailable;
 if(error?.status===429||error?.code==='api/resource-exhausted')return "PimpPilot's usage limit has been reached. Your draft is unchanged.";
 if(error?.status===403||error?.code==='api/permission-denied')return 'PimpPilot is not available for this account. Your draft is unchanged.';
 const message=typeof error?.message==='string'?error.message:'';
 if(/^(AI Assist|PimpPilot) is unavailable\b/.test(message))return pimpPilotCopy.unavailable;
 return message?message.replace(/\bAI Assist\b/g,pimpPilotCopy.name):pimpPilotCopy.unavailable;
}
