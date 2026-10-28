import {apiRequest} from '../../../shared/services/api';
import {firebase} from '../../../shared/services/firebase';
import {createReadCoordinator,invalidateReads} from '../../../shared/services/readCoordinator';
const read=createReadCoordinator(()=>firebase().auth.currentUser);
export async function serviceReviewsApi(op,data={},options={}){
 const uid=firebase().auth.currentUser?.uid;
 if(!uid)throw new Error('Sign in to continue.');
 const execute=async()=>{
  const result=await apiRequest('service-reviews',{op,...data},{expectedUid:uid});
  if(firebase().auth.currentUser?.uid!==uid)throw new Error('Your account changed. Reload this page.');
  return result;
 };
 if(op==='reviewSubmit'){try{return await execute();}finally{invalidateReads();}}
 return read([op,data],execute,{ttl:5000,...options});
}
