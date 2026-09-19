import {getFunctions,httpsCallable} from 'firebase/functions';
import {getApp} from 'firebase/app';
import {firebase} from '../../../shared/services/firebase';
import {requireConnection} from '../../../shared/services/network';
export async function callFunction(name,data){
 await requireConnection();firebase();
 return (await httpsCallable(getFunctions(getApp(),'us-central1'),name,{timeout:30000})(data)).data;
}
export const adminApi=(op,data={})=>callFunction('adminApi',{...data,op});
export function adminError(e){
 if(e?.code==='functions/failed-precondition')return e.message;
 if(e?.code==='functions/unauthenticated')return 'Your session expired. Sign out and sign in again.';
 if(e?.code==='functions/not-found')return 'Not found. If this is your first run, deploy the Firebase Functions in ADMIN_SETUP.md.';
 if(e?.code==='functions/internal')return 'The server could not complete this action. Refresh before retrying; check adminOperations if an account remains restricted.';
 return e?.message||'Unable to complete this action. Try again.';
}
