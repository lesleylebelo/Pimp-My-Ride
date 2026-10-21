const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const request=require('../backend/node_modules/supertest');
const {createV1Test,UPLOAD,NAME,CUSTOMER,VEHICLE}=require('../backend/device-v1-test.cjs');
const fixture=fs.readFileSync('.local-checks/existing-infra-20261018-01/synthetic-media.png'),ASSET='12345678-1234-4123-8123-123456789abc';
function setup(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pmr-v1-')),calls=[];
 t.after(()=>{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});
 const config={fixture,uploadStateFile:path.join(dir,'upload.json'),previewStateFile:path.join(dir,'preview.json'),verifyToken:async token=>({uid:token==='customer'?CUSTOMER:'other',email_verified:true}),validatePersisted:async()=>true,
  forward:async(route,body,authorization,contentType)=>{
   calls.push({route,body,authorization,contentType});
   if(route===UPLOAD){if(options.lost)throw Error('Lost acknowledgement');return {status:200,body:{data:{ok:true,id:ASSET,slot:'1',version:1}}};}
   const data=JSON.parse(body);return data.op==='list'?{status:200,body:{data:{items:options.occupied?[{id:'existing'}]:[],version:options.version??0,canManage:true}}}:{status:200,body:{data:{url:'https://private.example.invalid/new-asset',expiresAt:Date.now()+60000}}};
  },...options.config};
 function server(){const v1=createV1Test(config);return http.createServer(async(req,res)=>{
  if(await v1.handle(req,res))return;
  if(req.url==='/api/photos'){const chunks=[];for await(const chunk of req)chunks.push(chunk);if(await v1.preview(req,res,JSON.parse(Buffer.concat(chunks))))return;}
  res.writeHead(403);res.end('{}');
 });}
 return {server:server(),restarted:server,calls,config};
}
const upload=(server,buffer=fixture,name=NAME,token='customer')=>request(server).post(UPLOAD).set('Authorization','Bearer '+token).attach('file',buffer,{filename:name,contentType:'image/png'});
const view={op:'view',target:'vehicle',id:VEHICLE,photoId:ASSET};
test('approved V1 allows one exact multipart fixture and one new-asset preview; budgets survive restart',async t=>{
 const s=setup(t);await upload(s.server).expect(200);assert.equal(s.calls.length,2);assert.equal(s.calls[1].route,UPLOAD);assert.ok(s.calls[1].body.includes(fixture));assert.match(s.calls[1].contentType,/multipart\/form-data; boundary=/);
 await upload(s.restarted()).expect(409);assert.equal(s.calls.length,2);
 await request(s.server).post('/api/photos').set('Authorization','Bearer customer').send({...view,photoId:'another-asset'}).expect(409);
 await request(s.server).post('/api/photos').set('Authorization','Bearer customer').send(view).expect(200);
 await request(s.restarted()).post('/api/photos').set('Authorization','Bearer customer').send(view).expect(409);
 assert.equal(s.calls.length,3);assert.ok(!fs.readFileSync(s.config.uploadStateFile,'utf8').includes('https:'));assert.ok(!fs.readFileSync(s.config.previewStateFile,'utf8').includes('https:'));
});
test('wrong customer, file or filename cannot reserve budget or reach backend',async t=>{
 const s=setup(t);await upload(s.server,fixture,NAME,'other').expect(401);
 await upload(s.server,Buffer.from('not-the-fixture')).expect(400);await upload(s.server,fixture,'another.png').expect(400);
 await request(s.server).post('/api/photos/requests/'+VEHICLE).set('Authorization','Bearer customer').attach('file',fixture,{filename:NAME}).expect(403);
 assert.equal(s.calls.length,0);assert.equal(fs.existsSync(s.config.uploadStateFile),false);
});
test('occupied or changed revision stops before upload and before durable reservation',async t=>{
 for(const options of [{occupied:true},{version:1}]){const s=setup(t,options);await upload(s.server).expect(409);assert.equal(s.calls.length,1);assert.equal(fs.existsSync(s.config.uploadStateFile),false);}
});
test('lost upload acknowledgement closes the budget without an automatic or manual second upload',async t=>{
 const s=setup(t,{lost:true});await upload(s.server).expect(409);assert.equal(s.calls.length,2);assert.equal(fs.existsSync(s.config.uploadStateFile),true);
 await upload(s.restarted()).expect(409);assert.equal(s.calls.length,2);
 await request(s.server).post('/api/photos').set('Authorization','Bearer customer').send(view).expect(409);assert.equal(fs.existsSync(s.config.previewStateFile),false);
});
