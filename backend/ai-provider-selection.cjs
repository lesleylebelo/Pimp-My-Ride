const {createAIProvider:gemini,unavailable}=require('./ai-provider.cjs');
const {createAzureProvider}=require('./ai-azure-provider.cjs');
function createAIProvider(options={}){
 const env=options.env||process.env;
 // Explicit selection: an Azure failure never attempts another provider.
 return env.PMR_AI_PROVIDER?.trim()==='azure'?createAzureProvider({...options,env}):gemini({...options,env});
}
module.exports={createAIProvider,unavailable};
