import {apiRequest} from '../../../shared/services/api';
const CUSTOMER='aT6RWRl4AtQjtJKYIiD39eaR3x73',VEHICLE='78gG6bPHbGvCTOCuZAwR';
const NAME='pmr-synthetic-20261019-01.png',REQUEST='pmr_media_20261019_01_vehicle';
function stop(message){const error=new Error(message);error.userMessage=message;throw error;}
export async function approvedVehicleTest({auth,loadFixture,makeFormData=()=>new FormData(),onStage=()=>{}}){
 if(auth?.currentUser?.uid!==CUSTOMER)stop('The designated customer session is required.');
 const options={authClient:auth,expectedUid:CUSTOMER};
 onStage('Rechecking empty slot and revision…');
 const before=await apiRequest('photos',{op:'list',target:'vehicle',id:VEHICLE},options);
 if(before.version!==0||before.canManage!==true||!Array.isArray(before.items)||before.items.length!==0)stop('Vehicle slot or revision changed. No upload was sent.');
 const uri=await loadFixture();
 if(typeof uri!=='string'||!/^file:\/\//.test(uri))stop('The reviewed fixture is not available as a local device file.');
 const body=makeFormData();body.append('file',{uri,name:NAME,type:'image/png'});
 onStage('Uploading the one approved synthetic PNG…');
 const saved=await apiRequest(`photos/vehicles/${VEHICLE}/1?version=0&requestId=${REQUEST}`,body,{...options,multipart:true});
 if(saved?.ok!==true||saved.version!==1||saved.slot!=='1'||!/^[a-f0-9-]{36}$/.test(saved.id||''))stop('Upload acknowledgement is incomplete. Stop and inspect; do not retry.');
 onStage('Checking saved metadata…');
 const after=await apiRequest('photos',{op:'list',target:'vehicle',id:VEHICLE},options);
 if(after.version!==1||after.items?.length!==1||after.items[0].id!==saved.id||String(after.items[0].slot)!=='1')stop('Upload was acknowledged, but saved status needs inspection. Do not retry.');
 onStage('Requesting the single approved private preview…');
 const preview=await apiRequest('photos',{op:'view',target:'vehicle',id:VEHICLE,photoId:saved.id},options);
 let url;try{url=new URL(preview.url);}catch{stop('Preview response is invalid. Do not request another signed URL.');}
 const expected=`/storage/v1/object/sign/vehicle-images/photos/${CUSTOMER}/${VEHICLE}/${saved.id}`;
 if(url.protocol!=='https:'||url.hostname!=='nymiyrzdpjctyembixbe.supabase.co'||url.username||url.password||decodeURIComponent(url.pathname)!==expected||!Number.isFinite(preview.expiresAt)||preview.expiresAt<=Date.now()||preview.expiresAt>Date.now()+60000)stop('Preview scope or expiry is invalid. Stop for inspection.');
 return {assetId:saved.id,version:1,photoCount:1,preview};
}
