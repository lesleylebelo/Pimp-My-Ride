const {createHash}=require('node:crypto');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs');
const MAX_BYTES=5*1024*1024,MAX_PHOTOS=5;
const hash=value=>createHash('sha256').update(value).digest('hex');
const slots=['1','2','3','4','5'];
function slot(value){if(!slots.includes(value))D.fail('Choose a photo slot from 1 to 5.');return value;}
const version=value=>M.integer(value,'Photo version',0,Number.MAX_SAFE_INTEGER);
function eligible(profile,role){return profile?.role===role&&D.active(profile)&&!profile.statusOperation&&!profile.provisioningOperation&&(role!=='shop'||(profile.verificationStatus==='approved'&&!profile.reviewOperation));}
function photoIds(value=[]){if(!Array.isArray(value)||value.length>MAX_PHOTOS)D.fail('Choose up to five vehicle photos.');const result=value.map(D.id);if(new Set(result).size!==result.length)D.fail('Choose each photo only once.');return result;}
function dimensions(width,height){if(width<1||height<1||width>12000||height>12000||width*height>40000000)D.fail('Choose a photo up to 12,000 pixels per side and 40 megapixels.');}
function validatePhoto(file){
 if(!Buffer.isBuffer(file?.buffer)||!file.buffer.length||file.buffer.length>MAX_BYTES)D.fail('Choose a non-empty JPG or PNG photo up to 5 MB.');
 const b=file.buffer;let type;
 if(b.length>=33&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  if(b.readUInt32BE(8)!==13||b.subarray(12,16).toString()!=='IHDR')D.fail('This PNG photo has an invalid image header.');
  dimensions(b.readUInt32BE(16),b.readUInt32BE(20));
  let position=8,hasData=false,ended=false;
  while(position+12<=b.length){const length=b.readUInt32BE(position),kind=b.subarray(position+4,position+8).toString();if(position+12+length>b.length)break;
   if(kind==='IDAT'&&length>0)hasData=true;position+=12+length;
   if(kind==='IEND'){ended=length===0&&position===b.length;break;}
  }
  if(!hasData||!ended)D.fail('This PNG photo is incomplete.');type='image/png';
 }else if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255){
  let position=2,found=false,scan=false;
  while(position<b.length){
   if(b[position++]!==255)break;
   while(position<b.length&&b[position]===255)position++;
   const marker=b[position++];if(marker===0xd9)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   if(position+2>b.length)break;const length=b.readUInt16BE(position);
   if(length<2||position+length>b.length)break;
   if(marker===0xda){scan=length>=6&&position+length<b.length-2;break;}
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(length<8)break;dimensions(b.readUInt16BE(position+5),b.readUInt16BE(position+3));found=true;
   }
   position+=length;
  }
  if(!found||!scan||b[b.length-2]!==255||b[b.length-1]!==217)D.fail('This JPG photo has an invalid image header or ending.');type='image/jpeg';
 }else if(b.length>=30&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'&&b.readUInt32LE(4)+8===b.length){
  const kind=b.toString('ascii',12,16);
  if(kind==='VP8X'&&b.length>=32){
   dimensions(1+b.readUIntLE(26,3),1+b.readUIntLE(29,3));
  }else if(kind==='VP8 '&&b.length>=30&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a){
   dimensions(b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff);
  }else if(kind==='VP8L'&&b.length>=25&&b[20]===0x2f){
   dimensions(1+(b[21]|((b[22]&0x3f)<<8)),1+((b[22]>>6)|(b[23]<<2)|((b[24]&0x0f)<<10)));
  }else D.fail('This WebP photo has an invalid image header.');
  type='image/webp';
 }
 if(!type||file.mimetype!==type)D.fail('The photo content must match JPG, PNG or WebP.');
 const name=D.text(file.originalname,'Photo name',255).replace(/[\u0000-\u001f\u007f/\\]/g,'_');
 return {buffer:b,name,contentType:type,size:b.length,contentHash:hash(b)};
}
function safePhoto(value,id){return {id,name:value.name,size:value.size,contentType:value.contentType,uploadedAt:value.uploadedAt?.toMillis?.()??value.uploadedAt??null};}
async function snapshotRequestPhotos(tx,db,vehicle,ownerId,vehicleId,selected){
 const ids=photoIds(selected),current=new Set(Object.values(vehicle.photoSlots||{}));
 const records=await Promise.all(ids.map(id=>tx.get(db.doc(`marketplacePhotos/${id}`))));
 return records.map((doc,index)=>{const value=doc.data(),id=ids[index];if(!current.has(id)||!value||value.ownerId!==ownerId||value.vehicleId!==vehicleId||value.path!==`photos/${ownerId}/${vehicleId}/${id}`)D.fail('A selected photo changed. Refresh the vehicle photos before submitting.','failed-precondition');return safePhoto(value,id);});
}
module.exports={MAX_BYTES,MAX_PHOTOS,hash,slots,slot,version,eligible,photoIds,validatePhoto,safePhoto,snapshotRequestPhotos};
