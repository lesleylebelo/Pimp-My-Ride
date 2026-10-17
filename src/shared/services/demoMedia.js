import {Platform} from 'react-native';
import {localDemo} from './localDemo';
// No selected bytes are sent in demo mode. All upload routes receive this fixture.
export async function demoUploadBody(original){
 if(!localDemo)return original;
 const url=`${localDemo.apiURL}/__demo/fixture.png`,body=new FormData();
 if(Platform.OS==='web'){
  const response=await fetch(url,{redirect:'error'});if(!response.ok)throw Error('Synthetic demo fixture unavailable.');body.append('file',await response.blob(),'synthetic.png');
 }else{
  const {Asset}=await import('expo-asset');const asset=await Asset.fromURI(url).downloadAsync();
  if(!asset.localUri)throw Error('Synthetic demo fixture could not be cached.');
  body.append('file',{uri:asset.localUri,name:'synthetic.png',type:'image/png'});
 }
 return body;
}
