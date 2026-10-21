const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream'),{EventEmitter}=require('node:events');
const {createDeviceGateway,createMetroBridge}=require('../backend/device-readonly-gateway.cjs');

test('Metro bridge never connects for other peers and forwards only to fixed loopback Metro',()=>{
 const calls=[];
 const socket=ip=>Object.assign(new EventEmitter(),{remoteAddress:ip,destroy(){this.destroyed=true;},setTimeout(){},pipe(){}});
 const upstream=socket('127.0.0.1');
 const bridge=createMetroBridge({host:'192.168.1.10',phone:'192.168.1.20',trusted:true,connect:options=>{calls.push(options);return upstream;}});
 const outsider=socket('172.16.2.100');bridge.emit('connection',outsider);assert.equal(outsider.destroyed,true);assert.equal(calls.length,0);
 const phone=socket('192.168.1.20');bridge.emit('connection',phone);assert.deepEqual(calls,[{host:'::1',port:8083}]);
 phone.emit('close');assert.equal(upstream.destroyed,true);
 assert.throws(()=>createMetroBridge({host:'192.168.1.10',phone:'192.168.1.20'}));
});
function fixture(){
 const calls=[];
 const server=createDeviceGateway({host:'192.168.1.10',phone:'192.168.1.20',trusted:true,request:(options,callback)=>{
  const upstream=new EventEmitter();upstream.setTimeout=()=>{};upstream.destroy=()=>{};
  upstream.end=body=>{calls.push({options,body});const response=Readable.from([Buffer.from(JSON.stringify(options.path==='/health'?{ok:true}:{data:{items:[],version:0,canManage:true}}))]);response.statusCode=200;callback(response);};return upstream;
 }});
 async function call({method='GET',url='/health',ip='192.168.1.20',host='192.168.1.10:3102',body,headers={}}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);
  Object.assign(req,{method,url,headers:{host,...headers},socket:{remoteAddress:ip}});
  return new Promise(resolve=>{const res=new EventEmitter();res.writeHead=status=>{res.status=status;};res.end=body=>resolve({status:res.status,body:JSON.parse(body)});server.emit('request',req,res);});
 }
 return {call,calls};
}
test('LAN gateway refuses unsafe configuration and source/header spoofing',async()=>{
 for(const extra of [{trusted:false},{host:'0.0.0.0'},{host:'8.8.8.8'},{phone:'8.8.8.8'},{host:'192.168.1.20'},{port:80},{upstreamPort:3000}])assert.throws(()=>createDeviceGateway({host:'192.168.1.10',phone:'192.168.1.20',trusted:true,...extra}));
 const f=fixture();
 for(const args of [{ip:'192.168.1.30',headers:{'x-forwarded-for':'192.168.1.20'}},{host:'evil.example'},{host:'192.168.1.10:3101'}])assert.equal((await f.call(args)).status,403);
 assert.equal(f.calls.length,0);
});
test('gateway forwards only health and designated vehicle list to fixed loopback backend',async()=>{
 const f=fixture();assert.deepEqual(await f.call(),{status:200,body:{ok:true,mode:'device-read-only'}});
 const body={op:'list',target:'vehicle',id:'78gG6bPHbGvCTOCuZAwR'},headers={Authorization:'Bearer synthetic-token','content-type':'application/json'};
 assert.equal((await f.call({method:'POST',url:'/api/photos',body,headers:{authorization:'Bearer synthetic-token','content-type':'application/json','x-forwarded-host':'evil.example'}})).status,200);
 assert.equal(f.calls[1].options.hostname,'127.0.0.1');assert.equal(f.calls[1].options.port,3101);
 assert.equal(f.calls[1].options.headers.Authorization,headers.Authorization);assert.equal(f.calls[1].options.headers['x-forwarded-host'],undefined);
 assert.deepEqual(JSON.parse(f.calls[1].body),body);
});
test('uploads, admin, sessions, previews, payments, extra fields and alternate vehicles never reach upstream',async()=>{
 const f=fixture(),headers={authorization:'Bearer synthetic-token','content-type':'application/json'};
 for(const url of ['/api/admin','/api/session','/api/profile','/api/marketplace','/api/photos/vehicles/car/1','/api/photos/requests/car','/api/posts/images','/__demo/media/photos','/api/documents/list','/api/photos?op=list','/api/%70hotos'])assert.equal((await f.call({method:'POST',url,headers,body:{}})).status,403);
 for(const body of [{op:'view',target:'vehicle',id:'78gG6bPHbGvCTOCuZAwR'},{op:'remove',target:'vehicle',id:'78gG6bPHbGvCTOCuZAwR'},{op:'list',target:'vehicle',id:'another-car'},{op:'list',target:'vehicle',id:'78gG6bPHbGvCTOCuZAwR',extra:true}])assert.equal((await f.call({method:'POST',url:'/api/photos',headers,body})).status,403);
 assert.equal((await f.call({method:'POST',url:'/api/photos',headers:{'content-type':'application/json'},body:{}})).status,401);
 assert.equal((await f.call({method:'POST',url:'/api/photos',headers,body:'invalid-json'})).status,400);
 assert.equal(f.calls.length,0);
});
