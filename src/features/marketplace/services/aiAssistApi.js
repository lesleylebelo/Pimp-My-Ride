export async function aiAssist(draft,uid){
 const {apiRequest}=require('../../../shared/services/api');
 const {kind,title,description,categoryId}=draft;
 let result;
 try{result=await apiRequest('ai/assist',{kind,title,description,categoryId},{expectedUid:uid});}
 catch(error){if(error.status===503||error.code==='api/connection-timeout'||error.code==='api/network-request-failed')throw Error('AI Assist is unavailable. Your draft is unchanged; continue editing normally.');throw error;}
 const max=kind==='request'?300:2000;
 if(typeof result?.title!=='string'||!result.title.trim()||result.title.length>100||typeof result.description!=='string'||!result.description.trim()||result.description.length>max||
  !Array.isArray(result.missingDetails)||result.missingDetails.length>5||result.missingDetails.some(item=>typeof item!=='string'||item.length>180)||
  result.category!==null&&(!result.category||typeof result.category.id!=='string'||typeof result.category.name!=='string'||result.category.name.length>100))throw Error('AI returned an invalid suggestion. Your draft is unchanged.');
 return result;
}
