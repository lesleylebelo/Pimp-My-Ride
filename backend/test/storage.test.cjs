const {test}=require('node:test');const assert=require('node:assert/strict');const {createStorage}=require('../storage.cjs');const {validateFile}=require('../files.cjs');
const path='verification/shop/ownerId/1234-abcd';
test('public buckets fail closed before uploads or signed links',async()=>{
 let used=false;const client={storage:{getBucket:async()=>({data:{public:true}}),from:()=>{used=true;}}};const s=createStorage({client});
 await assert.rejects(()=>s.upload(path,Buffer.from('x'),'application/pdf'));
 await assert.rejects(()=>s.signedUrl(path));assert.equal(used,false);
});
test('private storage uses immutable object paths and sixty-second URLs',async()=>{
 const calls=[];const client={storage:{getBucket:async()=>({data:{public:false}}),from:()=>({upload:async(...args)=>{calls.push(['upload',...args]);return {};},createSignedUrl:async(...args)=>{calls.push(['sign',...args]);return {data:{signedUrl:'https://example.test/signed'}};},list:async()=>({data:[{name:'1234-abcd',metadata:{size:8,mimetype:'application/pdf'}}]})})}};
 const s=createStorage({client});await s.upload(path,Buffer.from('%PDF-1.7'),'application/pdf');assert.equal(calls[0][3].upsert,false);
 assert.equal(await s.signedUrl(path),'https://example.test/signed');assert.equal(calls[1][2],60);assert.equal((await s.inspect(path)).size,8);
 await assert.rejects(()=>s.signedUrl('../other-file'));
});
test('content sniffing rejects disguised files and unknown MIME types',()=>{
 const f={buffer:Buffer.from('%PDF-1.7'),mimetype:'application/pdf',originalname:'test.pdf'};assert.equal(validateFile(f).contentType,'application/pdf');
 assert.throws(()=>validateFile({...f,mimetype:'image/jpeg'}));assert.throws(()=>validateFile({...f,buffer:Buffer.from('<script>')}));
});
