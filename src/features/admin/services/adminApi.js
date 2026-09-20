import {apiRequest} from '../../../shared/services/api';
export const callBackend=(name,data)=>apiRequest(name==='sessionEvent'?'session':'admin',data);
export const adminApi=(op,data={})=>apiRequest('admin',{...data,op});
export function adminError(e){
 if(e?.code==='api/unauthenticated')return 'Your session expired. Sign out and sign in again.';
 return e?.message||'Unable to complete this action. Please refresh before retrying.';
}
