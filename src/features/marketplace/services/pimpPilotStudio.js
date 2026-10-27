import {apiRequest} from '../../../shared/services/api';

export function createStudioPlan(input,uid){return apiRequest('ai/studio',input,{expectedUid:uid});}

// Guard rendering at the API boundary; the server remains the schema authority.
export function isStudioPlan(plan){
 const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
 return !!plan&&typeof plan.objective==='string'&&['observations','assumptions','considerations','questions'].every(key=>strings(plan[key]))&&Array.isArray(plan.modifications)&&plan.modifications.every(item=>item&&['title','scope','tradeOffs'].every(key=>typeof item[key]==='string')&&strings(item.parts));
}

export function studioRequestDraft(plan,selected){
 const scopes=plan.modifications.filter((_,index)=>selected.includes(index)).map(item=>item.scope);
 const description=`Proposed work: ${scopes.join('; ')}`;
 if(!scopes.length||description.length>300)return null;
 return {title:'Vehicle customisation plan',description};
}
