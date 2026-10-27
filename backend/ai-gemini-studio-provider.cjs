const {AIFailure,failure}=require('./ai-errors.cjs');
const {schema,instructions}=require('./ai-studio-contract.cjs');
// Studio uses the existing Gemini configuration. Drafting's provider remains unchanged.
function createAIStudioProvider({env=process.env,fetcher=fetch}={}){
 const model=env.PMR_AI_MODEL?.trim(),key=env.GEMINI_API_KEY?.trim();
 const enabled=env.PMR_AI_STUDIO_ENABLED==='true'&&env.PMR_AI_PROVIDER?.trim()==='gemini'&&!!key&&['gemini-2.5-flash-lite','gemini-3.5-flash-lite'].includes(model);
 return {enabled,async suggest(draft,{signal}){
  if(!enabled)throw failure('configuration');
  try{
   const response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
    method:'POST',signal,headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({
     systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:JSON.stringify({...draft,image:undefined})},...(draft.image?[{inlineData:{mimeType:draft.image.mimeType,data:draft.image.data}}]:[])]}],
     // Gemini 3 does not support candidateCount; still require exactly one returned candidate.
     generationConfig:{...(model==='gemini-2.5-flash-lite'?{candidateCount:1}:{}),maxOutputTokens:4000,responseMimeType:'application/json',responseJsonSchema:schema},
    }),
   });
   if(!response.ok){
    let reason=response.status===401||response.status===403?'provider_auth':response.status===402?'provider_billing':response.status===404?'model_unavailable':response.status===429?'provider_quota':'provider_http';
    // Gemini can report an invalid key as HTTP 400. Inspect only an allowlisted
    // machine reason; never retain/log error text, metadata or raw response.
    if(response.status===400){
     const text=await response.text();
     if(text.length<=8192){try{
      const error=JSON.parse(text)?.error;
      if(error?.status==='UNAUTHENTICATED'||Array.isArray(error?.details)&&error.details.some(detail=>['API_KEY_INVALID','API_KEY_EXPIRED'].includes(detail?.reason)))reason='provider_auth';
     }catch{ /* Preserve the generic status classification. */ }}
    }
    throw failure(reason);
   }
   const bad=(outputStage,outputRule,reason='malformed_output')=>failure(reason,{outputStage,outputRule});
   const body=await response.text();if(body.length>65536)throw bad('envelope','body_too_large');
   let result;try{result=JSON.parse(body);}catch{throw bad('envelope','envelope_json');}
   if(!result||typeof result!=='object'||Array.isArray(result))throw bad('envelope','envelope_type');
   if(result.promptFeedback?.blockReason)throw bad('envelope','prompt_blocked','provider_blocked');
   if(!Array.isArray(result.candidates))throw bad('candidate','candidates_missing');
   if(!result.candidates.length)throw bad('candidate','candidates_empty');
   if(result.candidates.length!==1)throw bad('candidate','candidate_count');
   const candidate=result.candidates[0];
   if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw bad('candidate','candidate_type');
   if(['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII','IMAGE_SAFETY','IMAGE_PROHIBITED_CONTENT'].includes(candidate.finishReason))throw bad('candidate','candidate_blocked','provider_blocked');
   if(candidate.finishReason==='MAX_TOKENS')throw bad('candidate','finish_max_tokens');
   if(candidate.finishReason==='CONTINUATION')throw bad('candidate','finish_continuation');
   if(candidate.finishReason!=='STOP')throw bad('candidate','finish_not_stop');
   if(candidate.content?.role!=='model')throw bad('candidate','content_role');
   const parts=candidate.content.parts;
   if(!Array.isArray(parts)||!parts.length)throw bad('parts','parts_missing');
   const answer=[];
   for(const part of parts){
    if(!part||typeof part!=='object'||Array.isArray(part)||typeof part.text!=='string')throw bad('parts','part_type');
    // Documented thought flags/signatures are transport metadata, not JSON.
    // Discard thought summaries and signatures in this stateless flow.
    if(Object.keys(part).some(key=>!['text','thought','thoughtSignature'].includes(key))||
     Object.hasOwn(part,'thought')&&typeof part.thought!=='boolean'||
     Object.hasOwn(part,'thoughtSignature')&&typeof part.thoughtSignature!=='string')throw bad('parts','part_metadata');
    if(part.thought!==true)answer.push(part.text);
   }
   const text=answer.join('');if(!text.trim())throw bad('parts','answer_text_missing');
   // Repair only an entire, explicitly JSON-marked fence. Never extract a
   // substring, complete truncated JSON, change facts or call the provider again.
   const fenced=/^```json\s*\n([\s\S]*?)\n```$/i.exec(text.trim());
   try{return JSON.parse(fenced?fenced[1]:text);}catch{throw bad('json','answer_json');}
  }catch(error){if(error instanceof AIFailure)throw error;throw failure(signal?.aborted?'provider_timeout':'provider_network');}
 }};
}
module.exports={createAIStudioProvider};
