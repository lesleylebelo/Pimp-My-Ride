const {test}=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {configuration,proxyServer,firestoreProxyServer}=require('../local-demo.cjs');
const {createDemoStorage,FIXTURE}=require('../demo-storage.cjs');
const env={PMR_LOCAL_DEMO:'true',NODE_ENV:'test',PMR_DEMO_STORAGE:'memory-fixtures',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:'demo-pmr-security',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
test('local demo requires opt-in, fixture storage, loopback emulators and the unchanged mock gate',()=>{
 assert.equal(configuration(env).bind,'127.0.0.1');
 assert.throws(()=>configuration({...env,RENDER:'true'}));assert.throws(()=>configuration({...env,EXPO_PUBLIC_FIREBASE_PROJECT_ID:'production'}));
 assert.throws(()=>configuration({...env,EXPO_PUBLIC_FIREBASE_API_KEY:'production-key'}));assert.throws(()=>configuration({...env,EXPO_PUBLIC_API_URL:'https://production.invalid'}));
 assert.throws(()=>configuration({...env,FIREBASE_CONFIG:JSON.stringify({projectId:'production'})}));
 assert.equal(configuration({...env,FIREBASE_CONFIG:JSON.stringify({projectId:'demo-pmr-security'})}).bind,'127.0.0.1');
 for(const patch of [{PMR_LOCAL_DEMO:''},{NODE_ENV:'production'},{PMR_DEMO_STORAGE:'supabase'},{FIREBASE_PROJECT_ID:'pimp-my-ride-a26fc'},{PMR_MOCK_PAYMENTS_ENABLED:'false'},{FIRESTORE_EMULATOR_HOST:'192.168.1.2:8080'},{GOOGLE_CLOUD_PROJECT:'production'},{SUPABASE_SECRET_KEY:'forbidden'},{GOOGLE_APPLICATION_CREDENTIALS:'forbidden'},{PMR_DEMO_BIND_HOST:'0.0.0.0'},{PMR_DEMO_PUBLIC_HOST:'example.com'},{PMR_DEMO_ALLOWED_CLIENT_IPS:'8.8.8.8'}])assert.throws(()=>configuration({...env,...patch}),JSON.stringify(Object.keys(patch)));
 assert.equal(configuration({...env,PMR_DEMO_BIND_HOST:'192.168.1.2',PMR_DEMO_ALLOWED_CLIENT_IPS:'127.0.0.1,192.168.1.3'}).host,'192.168.1.2');
});
test('storage only accepts synthetic bytes, keeps public-post objects and signs private reads',async()=>{
 const m=createDemoStorage({origin:'http://127.0.0.1:3000'}),id='12345678-1234-4123-8123-123456789abc',post='posts/shop/'+id,photo='photos/owner/vehicle/'+id;
 await assert.rejects(()=>m.postStorage.upload(post,Buffer.from('real image'),'image/png'));
 await m.postStorage.upload(post,FIXTURE,'image/png');assert.equal(m.postStorage.remove,undefined);
 assert.deepEqual(await m.postStorage.inspect(post),{size:FIXTURE.length,contentType:'image/png'});assert.ok(m.read('posts',post).equals(FIXTURE));
 await assert.rejects(()=>m.postStorage.upload(post,FIXTURE,'image/png'));
 await m.photoStorage.upload(photo,FIXTURE,'image/png');const url=new URL(await m.photoStorage.signedUrl(photo));
 assert.ok(m.read('photos',photo,url.searchParams.get('expires'),url.searchParams.get('signature')).equals(FIXTURE));
 assert.throws(()=>m.read('photos',photo,Date.now()-1,'wrong'));
 assert.throws(()=>m.read('photos',post));await assert.rejects(()=>m.photoStorage.inspect('../outside'));
 assert.throws(()=>createDemoStorage({origin:'https://production.example'}));
});
test('gateway rejects unlisted source IPs and never falls back when upstream is absent',async()=>{
 const blocked=proxyServer({allowed:[],targetPort:1});try{await request(blocked).get('/').expect(403);}finally{blocked.close();}
 const unavailable=proxyServer({allowed:['127.0.0.1'],targetPort:1});try{await request(unavailable).get('/').expect(503);}finally{unavailable.close();}
});
test('Firestore TCP gateway denies non-allowlisted clients before forwarding',async()=>{
 const server=firestoreProxyServer({allowed:[]});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let bytes=0;try{await new Promise((resolve,reject)=>{const socket=require('node:net').connect(server.address().port,'127.0.0.1');socket.setTimeout(2000,()=>{socket.destroy();reject(Error('Denied socket did not close.'));});socket.on('data',b=>{bytes+=b.length;});socket.on('error',()=>{});socket.on('close',resolve);});assert.equal(bytes,0);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
