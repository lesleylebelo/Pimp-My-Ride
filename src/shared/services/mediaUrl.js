import {localDemo} from './localDemo';

export function isMediaUrl(value,demo=localDemo){
 if(typeof value!=='string')return false;
 try{
  const url=new URL(value);
  if(url.username||url.password)return false;
  if(demo)return url.origin===demo.apiURL&&/^\/__demo\/media\/(photos|requests|posts)$/.test(url.pathname);
  return url.protocol==='https:';
 }catch{return false;}
}
