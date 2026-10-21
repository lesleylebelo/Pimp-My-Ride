// Explicit local-only entry point. Never imported by the production server.
const http=require('node:http'),net=require('node:net');
const {assertMockPaymentsEnabled}=require('./mock-payment-gate.cjs');
const {createDemoStorage}=require('./demo-storage.cjs');
function privateIP(host){return net.isIP(host)===4&&(/^(127\.|10\.|192\.168\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host));}
function configuration(env){
 if(env.PMR_LOCAL_DEMO!=='true'||!['development','test'].includes(env.NODE_ENV)||env.PMR_DEMO_STORAGE!=='memory-fixtures')throw Error('Explicit development demo and memory-fixtures storage required.');
 if(env.RENDER||env.EXPO_PUBLIC_FIREBASE_PROJECT_ID&&env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!=='demo-pmr-security')throw Error('Hosted/production Firebase configuration is forbidden in the local demo.');
 for(const [name,value]of Object.entries({EXPO_PUBLIC_FIREBASE_API_KEY:'demo-only-key',EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:'demo-pmr-security.invalid',EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:'1234567890',EXPO_PUBLIC_FIREBASE_APP_ID:'demo-local-app'}))if(env[name]&&env[name]!==value)throw Error('Non-demo Firebase client configuration is forbidden.');
 if(Object.keys(env).some(k=>((k.startsWith('SUPABASE_')||['FIREBASE_SERVICE_ACCOUNT_JSON','GOOGLE_APPLICATION_CREDENTIALS'].includes(k))&&env[k])))throw Error('Production/storage credentials are forbidden in demo mode.');
 if(env.FIREBASE_CONFIG){let value;try{value=JSON.parse(env.FIREBASE_CONFIG);}catch{throw Error('Invalid Firebase configuration.');}if(value.projectId!=='demo-pmr-security'||Object.keys(value).some(k=>!['projectId','storageBucket','databaseURL'].includes(k))||(value.storageBucket&&value.storageBucket!=='demo-pmr-security.appspot.com')||(value.databaseURL&&value.databaseURL!=='https://demo-pmr-security.firebaseio.com'))throw Error('Production Firebase configuration is forbidden.');}
 if(env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Demo backend requires the exact loopback emulator endpoints.');
 assertMockPaymentsEnabled(env,{projectId:'demo-pmr-security'});
 const bind=env.PMR_DEMO_BIND_HOST||'127.0.0.1',host=env.PMR_DEMO_PUBLIC_HOST||bind;
 const allowed=(env.PMR_DEMO_ALLOWED_CLIENT_IPS||'127.0.0.1').split(',').map(s=>s.trim());
 if(!privateIP(bind)||!privateIP(host)||!allowed.length||!allowed.every(privateIP))throw Error('Explicit private IPv4 bind/public host and device allowlist required.');
 if(env.EXPO_PUBLIC_API_URL&&env.EXPO_PUBLIC_API_URL!=='http://'+host+':3000')throw Error('Non-demo API configuration is forbidden.');
 return {bind,host,allowed,origin:'http://'+host+':3000'};
}
function permitted(req,allowed){const ip=req.socket.remoteAddress?.replace(/^::ffff:/,'');return allowed.includes(ip);}
function proxyServer({allowed,targetPort}){return http.createServer((req,res)=>{
 if(!permitted(req,allowed)){res.writeHead(403);return res.end('Device is not allowlisted.');}
 const upstream=http.request({host:'127.0.0.1',port:targetPort,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:'+targetPort}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Local emulator unavailable; no fallback.');});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
 });}
// Firestore SDKs use both HTTP/WebChannel and HTTP/2 gRPC. Transparent TCP
// forwarding preserves both transports without changing the loopback upstream.
function firestoreProxyServer({allowed}){
 const sockets=new Set();
 const server=net.createServer(client=>{
  if(!allowed.includes(client.remoteAddress?.replace(/^::ffff:/,''))){client.destroy();return;}
  const upstream=net.createConnection({host:'127.0.0.1',port:8080});
  for(const socket of [client,upstream]){sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{client.destroy();upstream.destroy();});}
  client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());client.pipe(upstream);upstream.pipe(client);
 });
 server.closeAllConnections=()=>{for(const socket of sockets)socket.destroy();};
 return server;
}
async function createDemo({env=process.env,seed=false}={}){
 const config=configuration(env);
 // Admin SDK resolves emulator addresses from process.env, not a caller object.
 for(const key of ['FIREBASE_PROJECT_ID','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'])if(env[key]!==process.env[key])throw Error('Demo process environment mismatch.');
 await Promise.all([9099,8080].map(port=>new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{socket.destroy();reject(Error('Required local emulator is unavailable on '+port));});socket.once('timeout',()=>{socket.destroy();reject(Error('Local emulator connection timed out.'));});})));
 const {initializeApp,deleteApp}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
 const firebase=initializeApp({projectId:'demo-pmr-security'},'pmr-demo-'+Date.now()),auth=getAuth(firebase),db=getFirestore(firebase);
 const media=createDemoStorage({origin:config.origin});
 async function ready(){assertMockPaymentsEnabled(env,db);await Promise.all([auth.listUsers(1),db.doc('__demo/health').get()]);}
 try{await ready();}catch(error){await db.terminate();await deleteApp(firebase);throw Error('Local emulators unavailable: '+error.message);}
 const express=require('express'),app=express();
 app.use((req,res,next)=>permitted(req,config.allowed)?next():res.status(403).json({error:{message:'Device is not allowlisted.'}}));
 app.use(require('cors')({origin:['http://localhost:8081','http://127.0.0.1:8081','http://'+config.host+':8081']}));
 app.get('/__demo/ready',async(req,res)=>{try{await ready();res.json({projectId:'demo-pmr-security',storage:'memory-fixtures',mockPayments:true,authPort:19099,firestorePort:18080});}catch{res.status(503).json({error:'Local demo dependencies unavailable.'});}});
 app.get('/__demo/fixture.png',(req,res)=>res.type('png').set('Cache-Control','no-store').send(media.fixture));
 app.get('/__demo/media/:scope',(req,res)=>{try{res.type('png').set('Cache-Control','no-store').send(media.read(req.params.scope,req.query.path,req.query.expires,req.query.signature));}catch{res.sendStatus(404);}});
 const {createServices}=require('./services.cjs'),{createApp}=require('./app.cjs');
 app.use(createApp({auth,services:createServices({db,auth,...media,mockPaymentEnv:env}),allowedOrigins:['http://localhost:8081','http://127.0.0.1:8081','http://'+config.host+':8081']}));
 if(seed)try{await require('../scripts/seed-local-demo.cjs').seedDemo({auth,db});}catch(error){await db.terminate();await deleteApp(firebase);throw error;}
 const servers=[];
 async function listen(server,port){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,config.bind,resolve);});servers.push(server);}
 async function close(){await Promise.all(servers.map(s=>new Promise(resolve=>{s.close(resolve);s.closeAllConnections?.();})));await db.terminate();await deleteApp(firebase);}
 return {app,auth,db,media,config,ready,close,async start(){try{await listen(http.createServer(app),3000);await listen(proxyServer({allowed:config.allowed,targetPort:9099}),19099);await listen(firestoreProxyServer({allowed:config.allowed}),18080);}catch(e){await close();throw e;}}};
}
if(require.main===module)createDemo({seed:process.argv.includes('--seed')}).then(async demo=>{await demo.start();console.log('LOCAL SYNTHETIC DEMO ONLY: '+demo.config.origin+'; emulators forwarded on 19099/18080; memory storage; no emails or real payments.');for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>demo.close().then(()=>process.exit(0)));}).catch(error=>{console.error('Local demo refused startup:',error.message);process.exitCode=1;});
module.exports={configuration,privateIP,permitted,proxyServer,firestoreProxyServer,createDemo};
