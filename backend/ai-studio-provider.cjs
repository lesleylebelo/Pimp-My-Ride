const {createAIStudioProvider:gemini}=require('./ai-gemini-studio-provider.cjs');
const {createAzureProvider}=require('./ai-azure-provider.cjs');
function createAIStudioProvider(options={}){
 const env=options.env||process.env;
 return env.PMR_AI_PROVIDER?.trim()==='azure'?createAzureProvider({...options,env,studio:true}):gemini({...options,env});
}
module.exports={createAIStudioProvider};
