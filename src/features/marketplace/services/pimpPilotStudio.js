import {apiRequest} from '../../../shared/services/api';

export function createStudioPlan(input,uid){return apiRequest('ai/studio',input,{expectedUid:uid});}

export function studioRequestDraft(plan,selected){
 const scopes=plan.modifications.filter((_,index)=>selected.includes(index)).map(item=>item.scope);
 const description=`Proposed work: ${scopes.join('; ')}`;
 if(!scopes.length||description.length>300)return null;
 return {title:'Vehicle customisation plan',description};
}
