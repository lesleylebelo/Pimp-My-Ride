// Retired iPhone-testing helpers retained for regression tests. CLI startup is disabled.
const http=require('node:http'),net=require('node:net'),os=require('node:os');
const VEHICLE='78gG6bPHbGvCTOCuZAwR';
function privateIPv4(ip){return net.isIP(ip)===4&&(/^10\./.test(ip)||/^192\.168\./.test(ip)||(/^172\./.test(ip)&&Number(ip.split('.')[1])>=16&&Number(ip.split('.')[1])<=31));}
function createDeviceGateway({host,phone,upstreamPort=3101,port=3102,trusted=false,request=http.request,v1=null}={}){
 if(!trusted||!privateIPv4(host)||!privateIPv4(phone)||host===phone||port!==3102||upstreamPort!==3101)throw Error('A trusted LAN and distinct private laptop/iPhone IPv4 addresses are required.');
 const local=Object.values(os.networkInterfaces()).flat().some(item=>item?.address===host);
 if(!local&&require.main===module)throw Error('The selected laptop address is not assigned locally.');
 const allowed=new Set([host,phone]);
 const reply=(res,status,data)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
 const denied=res=>reply(res,403,{error:{code:'permission-denied',message:'This device connection permits health and designated vehicle metadata only.'}});
 const server=http.createServer(async(req,res)=>{
  const ip=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  if(!allowed.has(ip)||req.headers.host!==`${host}:${port}`)return denied(res);
  if(v1&&await v1.handle(req,res))return;
  const health=req.method==='GET'&&req.url==='/health';
  const metadata=req.method==='POST'&&req.url==='/api/photos'&&/^application\/json(?:;|$)/i.test(req.headers['content-type']||'');
  if(!health&&!metadata)return denied(res);
  let body;
  if(metadata){
   if(!/^Bearer [^\s]{1,8192}$/.test(req.headers.authorization||''))return reply(res,401,{error:{code:'unauthenticated',message:'Sign in with the existing test account.'}});
   let bytes=0;const chunks=[];
   try{for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){reply(res,413,{error:{code:'invalid-argument',message:'Metadata request is too large.'}});return;}chunks.push(chunk);}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(v1&&await v1.preview(req,res,data))return;
    if(!data||Array.isArray(data)||Object.keys(data).sort().join(',')!=='id,op,target'||data.op!=='list'||data.target!=='vehicle'||data.id!==VEHICLE)return denied(res);
   }catch{return reply(res,400,{error:{code:'invalid-argument',message:'Expected designated vehicle metadata JSON.'}});}
   body=JSON.stringify({op:'list',target:'vehicle',id:VEHICLE});
  }
  // Fixed loopback target, no redirect handling, cookies, forwarded headers or logging.
  const upstream=request({hostname:'127.0.0.1',port:upstreamPort,path:health?'/health':'/api/photos',method:health?'GET':'POST',headers:metadata?{Authorization:req.headers.authorization,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{}},response=>{
   let size=0;const chunks=[];
   response.on('data',chunk=>{size+=chunk.length;if(size>32768)upstream.destroy();else chunks.push(chunk);});
   response.on('error',()=>reply(res,502,{error:{code:'unavailable',message:'Local backend response interrupted.'}}));
   response.on('end',()=>{
    try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));reply(res,response.statusCode,health&&response.statusCode===200?{ok:data.ok===true,mode:v1?'approved-vehicle-v1':'device-read-only'}:data);}
    catch{reply(res,502,{error:{code:'unavailable',message:'Local backend response unavailable.'}});}
   });
  });
  upstream.setTimeout(20000,()=>upstream.destroy());
  upstream.on('error',()=>reply(res,502,{error:{code:'unavailable',message:'Local backend unavailable.'}}));
  res.on('close',()=>upstream.destroy());upstream.end(body);
 });
 server.headersTimeout=10000;server.requestTimeout=15000;server.maxRequestsPerSocket=20;
 return server;
}
function createMetroBridge({host,phone,trusted=false,connect=net.connect}={}){
 if(!trusted||!privateIPv4(host)||!privateIPv4(phone)||host===phone)throw Error('A trusted private device network is required.');
 const allowed=new Set([host,phone]);
 return net.createServer(socket=>{
  if(!allowed.has((socket.remoteAddress||'').replace(/^::ffff:/,''))){socket.destroy();return;}
  const upstream=connect({host:'::1',port:8083});
  const close=()=>{socket.destroy();upstream.destroy();};
  socket.setTimeout(120000,close);upstream.setTimeout(120000,close);
  socket.on('error',close);upstream.on('error',close);
  socket.on('close',()=>upstream.destroy());upstream.on('close',()=>socket.destroy());
  socket.pipe(upstream);upstream.pipe(socket);
 });
}
if(require.main===module){
 console.error('Temporary iPhone gateway retired. Normal development uses the Render API; no local listener was started.');
 process.exitCode=1;
}
module.exports={createDeviceGateway,createMetroBridge,privateIPv4};
