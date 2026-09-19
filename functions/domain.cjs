const {HttpsError}=require('firebase-functions/v2/https');
const fail=(message,code='invalid-argument')=>{throw new HttpsError(code,message);};
function text(value,label,max=200){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label} is required (maximum ${max} characters).`);return value.trim();}
function id(value){const v=text(value,'ID',128);if(!/^[a-zA-Z0-9_-]+$/.test(v))fail('Invalid ID.');return v;}
function active(profile){return !!profile && (!profile.accountStatus||profile.accountStatus==='active');}
function editable(input){
 const fullName=text(input.fullName,'Name'); const phone=text(input.phone,'Phone',30).replace(/[\s()-]/g,'');
 if(!/^(0\d{9}|\+27\d{9})$/.test(phone))fail('Enter a valid South African phone number.');
 return {fullName,phone};
}
function shop(input){return Object.fromEntries(['shopName','regNumber','address','city','province','services'].map(k=>[k,text(input?.[k],k,500)]));}
function category(input){return {name:text(input.name,'Category name',80),description:text(input.description,'Description',500)};}
function protect(actor,uid,profile){if(actor===uid||profile.role==='admin')fail('Administrator accounts are managed by the trusted provisioning process.','permission-denied');}
const kinds=['cipcCert','proofOfAddress','ownerId'];
function validObject(m){return Number(m.size)>0&&Number(m.size)<=5242880&&['application/pdf','image/jpeg','image/png'].includes(m.contentType);}
module.exports={fail,text,id,active,editable,shop,category,protect,kinds,validObject};
