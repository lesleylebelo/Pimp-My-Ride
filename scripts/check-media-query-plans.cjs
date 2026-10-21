// Read-only development preflight. Never executes queries or changes indexes.
const path=require('node:path');
const PROJECT='pimp-my-ride-a26fc';
const OWNER='aT6RWRl4AtQjtJKYIiD39eaR3x73';
const SHOP='vsZYsbWkD4Urq2S5OmWEKUNs6rZ2';
const shapes=[
 ['Discover all','posts',['status','authorRole'],['published','shop']],
 ['Discover category','posts',['status','authorRole','category'],['published','shop','Other']],
 ['Discover shop / My Posts','posts',['status','authorRole','authorId'],['published','shop',SHOP]],
 ['Discover category and shop','posts',['status','authorRole','category','authorId'],['published','shop','Other',SHOP]],
 ['Find Jobs open','serviceRequests',['visibility','status'],['open','open']],
 ['Owner My Requests','serviceRequests',['ownerId'],[OWNER]],
 ['Find Jobs direct','serviceRequests',['visibility','shopId','status'],['direct',SHOP,'open']],
 ['Garage listing','vehicles',['ownerId','archived'],[OWNER,false]],
 ['Find Jobs quotation lookup','quotations',['shopId','serviceRequestId'],[SHOP,['pmr_plan_only_test_request']]],
];
function planRequest(shape){
 const [,collection,fields,values]=shape;
 const value=entry=>Array.isArray(entry)?{arrayValue:{values:entry.map(stringValue=>({stringValue}))}}:typeof entry==='boolean'?{booleanValue:entry}:{stringValue:entry};
 const filters=fields.map((field,i)=>({fieldFilter:{field:{fieldPath:field},op:Array.isArray(values[i])?'IN':'EQUAL',value:value(values[i])}}));
 const orderBy=collection==='vehicles'?[{field:{fieldPath:'__name__'},direction:'ASCENDING'}]:collection==='quotations'?[]:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'},{field:{fieldPath:'__name__'},direction:'DESCENDING'}];
 return {structuredQuery:{from:[{collectionId:collection}],where:filters.length===1?filters[0]:{compositeFilter:{op:'AND',filters}},...(orderBy.length?{orderBy}:{}),limit:collection==='posts'?40:21},explainOptions:{analyze:false}};
}
function classifyPlanResponse(response){
 let body=response.body;
 if(typeof body==='string'){try{body=JSON.parse(body);}catch{return {status:'READ_FAILED',reason:'Malformed planner response'};}}
 const rows=Array.isArray(body)?body:[body];
 if(rows.some(row=>row?.document))throw Error('Unexpected document execution response; stop the preflight.');
 const error=rows.find(row=>row?.error)?.error;
 if(error){
  if(error.status==='FAILED_PRECONDITION'&&/no matching index found|requires an index/i.test(error.message||''))return {status:'MISSING_INDEX',code:error.code,reason:'No matching index found'};
  return {status:'READ_FAILED',code:error.code||response.status,reason:'Planner rejected the request'};
 }
 if(response.status>=400)return {status:'READ_FAILED',code:response.status,reason:'Planner request failed'};
 const summary=rows.find(row=>row?.explainMetrics)?.explainMetrics?.planSummary;
 return summary?{status:'PLANNABLE',planSummary:summary}:{status:'READ_FAILED',reason:'No plan summary returned'};
}
async function main(){
 const root=path.resolve(__dirname,'..'),base=path.join(root,'node_modules/firebase-tools/lib');
 require(path.join(base,'logger.js')).logger.silent=true;
 const auth=require(path.join(base,'auth.js')),options={project:PROJECT,projectId:PROJECT,nonInteractive:true,cwd:root};
 const account=auth.getProjectDefaultAccount(root);if(account)auth.setActiveAccount(options,account);
 await require(path.join(base,'requireAuth.js')).requireAuth(options);
 const api=new(require(path.join(base,'firestore/api.js')).FirestoreApi)(),results=[];
 for(const shape of shapes){
  const request=planRequest(shape);
  // Keep resolveOnHTTPError: the CLI otherwise obscures streamed error arrays
  // as a generic HTTP error instead of the actual missing-index response.
  const response=await api.apiClient.post(`projects/${PROJECT}/databases/(default)/documents:runQuery`,request,{resolveOnHTTPError:true});
  results.push({query:shape[0],collectionGroup:shape[1],...classifyPlanResponse(response)});
 }
 console.log(JSON.stringify({projectId:PROJECT,database:'(default)',analyze:false,remoteWrites:0,results},null,2));
 process.exitCode=results.some(row=>row.status==='READ_FAILED')?1:results.some(row=>row.status==='MISSING_INDEX')?2:0;
}
if(require.main===module)main().catch(()=>{console.error('Read-only query planning failed. No credentials or raw service responses printed.');process.exitCode=1;});
module.exports={PROJECT,shapes,planRequest,classifyPlanResponse};
