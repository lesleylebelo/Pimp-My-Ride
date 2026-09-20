const D=require('./domain.cjs');
function validateFile(file){
 if(!file?.buffer?.length||file.buffer.length>5242880)D.fail('Choose a non-empty file up to 5 MB.');
 const b=file.buffer;
 const detected=b.subarray(0,5).toString()==='%PDF-'?'application/pdf':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':null;
 if(!detected||file.mimetype!==detected)D.fail('The file content must match PDF, JPG or PNG.');
 const name=D.text(file.originalname,'File name',255).replace(/[\r\n/\\]/g,'_');
 return {name,contentType:detected,buffer:b};
}
module.exports={validateFile};
