// Offline only: validate configuration and SDK loading without acquiring tokens.
const {azureConfiguration,loadAzureSDK}=require('./ai-azure-provider.cjs');
async function check(env=process.env){
 if(env.PMR_AI_PROVIDER?.trim()!=='azure')return {provider:env.PMR_AI_PROVIDER?.trim()||'unset',azureSelected:false};
 azureConfiguration(env);
 const sdk=await loadAzureSDK();
 if(typeof sdk.AIProjectClient!=='function'||typeof sdk.ClientSecretCredential!=='function')throw Error('Azure SDK exports are unavailable.');
 return {provider:'azure',azureSelected:true,configurationValid:true,sdkLoaded:true,assistantEnabled:env.PMR_AI_ASSIST_ENABLED==='true',studioEnabled:env.PMR_AI_STUDIO_ENABLED==='true',liveAuthenticationVerified:false};
}
module.exports={check};
if(require.main===module)check().then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message.startsWith('Set AZURE_')||error.message.startsWith('AZURE_')||error.message.startsWith('Invalid AZURE_')?error.message:'Azure SDK verification failed. Check installed dependencies and Node.js 22.');process.exitCode=1;});
