const {test}=require('node:test');const assert=require('node:assert/strict');const {createStorage}=require('../storage.cjs');const {validateFile}=require('../files.cjs');
const path='verification/shop/ownerId/1234-abcd';

test('every configured deletion scope validates exact ownership and removes only that namespace',async()=>{
 const id='12345678-1234-4123-8123-123456789abc';
 for(const [scope,bucket,prefix,suffix] of [['verification','verification','verification','ownerId/'+id],['photos','vehicle-images','photos','vehicle/'+id],['photos','marketplace-photos','photos','vehicle/'+id],['requests','request-images','requests','request/'+id],['profiles','vehicle-images','profiles',id],['showcase','showcase-images','posts',id],['public-posts','public-posts','posts',id]]){
  const owned=`${prefix}/own/${suffix}`,foreign=`${prefix}/other/${suffix}`,similar=`${prefix}/own-other/${suffix}`,files=new Set([owned,foreign,similar]);
  const client={storage:{getBucket:async()=>({data:{public:scope==='public-posts'}}),from:()=>({
   list:async folder=>{const rows=new Map();for(const value of files)if(value.startsWith(folder+'/')){const rest=value.slice(folder.length+1),nested=rest.includes('/'),name=rest.split('/')[0];rows.set(name,{name,id:nested?null:'file',metadata:nested?null:{}});}return {data:[...rows.values()]};},
   remove:async paths=>{assert.ok(paths.every(value=>value===owned));for(const value of paths)files.delete(value);return {};}
  })}};
  const store=createStorage({client,scope,bucket});store.checkOwnerReference('own',{path:owned,bucket,provider:'supabase'});
  for(const reference of [{path:foreign,bucket},{path:similar,bucket},{path:owned,bucket:'unconfigured'},{path:owned,bucket,provider:'unknown'},{path:owned.replace('/own/','/own/../other/'),bucket}])assert.throws(()=>store.checkOwnerReference('own',reference));
  assert.equal((await store.purgeOwnerPage('own')).done,false);assert.equal((await store.purgeOwnerPage('own')).done,true);assert.deepEqual([...files],[foreign,similar]);
 }
});

test('account cleanup scans bounded owner namespaces including orphans and never removes another account',async()=>{
 const {createMediaStorage}=require('../storage.cjs'),files=new Map(),removed=[];
 const object=(uid,i)=>`photos/${uid}/vehicle/12345678-1234-4123-8123-${String(i).padStart(12,'0')}`;
 for(const bucket of ['current','legacy']){files.set(bucket,new Set(Array.from({length:25},(_,i)=>object('own',i))));files.get(bucket).add(object('other',1));}
 const client={storage:{getBucket:async()=>({data:{public:false}}),from:bucket=>({
  list:async(prefix,options)=>{assert.ok(options.limit<=21);const rows=new Map();for(const value of files.get(bucket)){if(!value.startsWith(prefix+'/'))continue;const rest=value.slice(prefix.length+1),nested=rest.includes('/'),name=rest.split('/')[0];rows.set(name,nested?{name,id:null,metadata:null}:{name,id:'synthetic',metadata:{}});}return {data:[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,options.limit)};},
  remove:async paths=>{assert.ok(paths.length<=20);removed.push(...paths);for(const value of paths)files.get(bucket).delete(value);return {};},
 })}};
 const store=createMediaStorage({client,bucket:'current',legacyBucket:'legacy',scope:'photos'});
 for(let i=0;i<10;i++){if((await store.purgeOwnerPage('own')).done)break;}
 assert.equal(removed.length,50);assert.ok(removed.every(value=>value.startsWith('photos/own/')));assert.ok([...files.values()].every(set=>set.size===1));
 await assert.rejects(()=>store.purgeOwnerPage('../other'),{code:'invalid-argument'});
});

test('account storage cleanup fails closed on listing/removal failures and unexpected path ownership',async()=>{
 let removeFailed=true;const file='12345678-1234-4123-8123-123456789abc';
 const client={storage:{getBucket:async()=>({data:{public:false}}),from:()=>({list:async()=>({data:[{name:file,id:'file',metadata:{}}]}),remove:async()=>removeFailed?{error:{message:'Synthetic outage'}}:{}})}};
 const store=createStorage({client,scope:'profiles'});await assert.rejects(()=>store.purgeOwnerPage('own'),{code:'unavailable'});removeFailed=false;assert.equal((await store.purgeOwnerPage('own')).done,false);
 client.storage.from=()=>({list:async()=>({data:[{name:'../other',id:'file',metadata:{}}]})});await assert.rejects(()=>store.purgeOwnerPage('own'),{code:'failed-precondition'});
});

test('private photo WebP uploads keep MIME, bucket isolation and immutable options; storage failures remain failures',async()=>{
 const photo='photos/owner/car/12345678-1234-4123-8123-123456789abc',calls=[];let failed=false;
 const client={storage:{getBucket:async bucket=>{assert.equal(bucket,'marketplace-photos');return {data:{public:false}};},from:()=>({upload:async(...args)=>{calls.push(args);return failed?{error:{message:'synthetic outage'}}:{};}})}};
 const store=createStorage({client,scope:'photos',bucket:'marketplace-photos'});
 await store.upload(photo,Buffer.from('synthetic fixture'),'image/webp');
 assert.deepEqual(calls[0][2],{contentType:'image/webp',upsert:false,cacheControl:'0'});
 failed=true;await assert.rejects(()=>store.upload(photo,Buffer.from('fixture'),'image/webp'),{code:'unavailable'});
 const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../photo-storage-setup.sql'),'utf8');
 assert.match(sql,/array\['image\/jpeg','image\/png','image\/webp'\]/);assert.doesNotMatch(sql,/image\/heic/);
});
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

test('photo storage is a separate private scope and never accepts document or traversal paths',async()=>{
 const calls=[],photo='photos/owner/vehicle/12345678-1234-4123-8123-123456789abc';
 const client={storage:{getBucket:async bucket=>{calls.push(['bucket',bucket]);return {data:{public:false}};},from:bucket=>({upload:async(p,b,options)=>{calls.push(['upload',bucket,p,options]);return {};},createSignedUrl:async(p,seconds)=>{calls.push(['sign',bucket,p,seconds]);return {data:{signedUrl:'https://example.invalid/photo'}};}})}};
 const s=createStorage({client,scope:'photos',bucket:'marketplace-photos'});
 await s.upload(photo,Buffer.from('synthetic image'),'image/jpeg');assert.equal(calls.find(c=>c[0]==='upload')[3].upsert,false);assert.equal(calls[0][1],'marketplace-photos');
 assert.equal(await s.signedUrl(photo),'https://example.invalid/photo');assert.equal(calls.find(c=>c[0]==='sign')[3],60);
 for(const bad of [path,'photos/owner/../x','photos/owner/vehicle/not-a-uuid'])await assert.rejects(()=>s.signedUrl(bad));
 await assert.rejects(()=>createStorage({client}).signedUrl(photo));
 let used=false;const publicClient={storage:{getBucket:async()=>({data:{public:true}}),from:()=>{used=true;}}};
 await assert.rejects(()=>createStorage({client:publicClient,scope:'photos'}).upload(photo,Buffer.from('x'),'image/jpeg'));assert.equal(used,false);
});

test('public showcase storage supports upload and reads but exposes no delete operation',async()=>{
 const calls=[],path='posts/shop/12345678-1234-4123-8123-123456789abc';
 const client={storage:{
  getBucket:async()=>({data:{public:true}}),
  from:()=>({
   upload:async(...args)=>{calls.push(['upload',...args]);return {};},
   list:async()=>({data:[{name:path.split('/').at(-1),metadata:{size:8,mimetype:'image/png'}}]}),
   getPublicUrl:()=>({data:{publicUrl:`https://example.test/${path}`}}),
   remove:async()=>{calls.push(['remove']);}
  })
 }};
 const s=createStorage({client,scope:'public-posts',bucket:'public-posts'});
 await s.upload(path,Buffer.from('image'),'image/png');
 assert.deepEqual(await s.inspect(path),{size:8,contentType:'image/png'});
 assert.equal(s.publicUrl(path),`https://example.test/${path}`);
 assert.equal(s.remove,undefined);assert.equal(calls.some(([operation])=>operation==='remove'),false);
 assert.equal(calls[0][1],path);assert.equal(calls[0][3].upsert,false);
});

test('bucket router preserves legacy references, isolates private buckets and rejects arbitrary buckets',async()=>{
 const {createMediaStorage}=require('../storage.cjs'),calls=[];
 const client={storage:{getBucket:async bucket=>({data:{public:bucket==='public-posts'}}),from:bucket=>({
  upload:async(path,bytes,options)=>{calls.push({op:'upload',bucket,path,options});return {};},
  createSignedUrl:async(path,seconds)=>{calls.push({op:'sign',bucket,path,seconds});return {data:{signedUrl:'https://synthetic.invalid/signed'}};},
  getPublicUrl:path=>({data:{publicUrl:'https://synthetic.invalid/public/'+path}})
 })}};
 const id='12345678-1234-4123-8123-123456789abc',path='posts/shop/'+id;
 const posts=createMediaStorage({client,bucket:'showcase-images',legacyBucket:'public-posts',scope:'showcase'});
 assert.doesNotThrow(()=>posts.checkOwnerReference('shop',{path,bucket:'showcase-images'}));assert.doesNotThrow(()=>posts.checkOwnerReference('shop',{path}));
 for(const reference of [{path,bucket:'unknown'},{path:path.replace('/shop/','/other/'),bucket:'showcase-images'},{path,bucket:'showcase-images',provider:'unknown'}])assert.throws(()=>posts.checkOwnerReference('shop',reference));
 assert.equal(posts.remove,undefined);assert.equal(posts.publicUrl,undefined);
 await posts.upload(path,Buffer.from('fixture'),'image/png');
 await posts.forReference({bucket:'showcase-images'}).signedUrl(path);
 assert.equal(posts.forReference({}).publicUrl(path),'https://synthetic.invalid/public/'+path);
 assert.equal(posts.forReference({bucket:'public-posts'}).remove,undefined);
 assert.throws(()=>posts.forReference({bucket:'verification'}));
 assert.equal(posts.forReference({bucket:'showcase-images'}).remove,undefined);
 const vehicle=createMediaStorage({client,bucket:'vehicle-images',legacyBucket:'marketplace-photos',scope:'photos'});
 await vehicle.forReference({}).signedUrl('photos/owner/car/'+id);
 await vehicle.forReference({bucket:'vehicle-images'}).signedUrl('photos/owner/car/'+id);
 const requests=createMediaStorage({client,bucket:'request-images',scope:'requests'});
 await requests.upload('requests/owner/car/'+id,Buffer.from('fixture'),'image/png');
 await requests.forReference({bucket:'request-images'}).signedUrl('requests/owner/car/'+id);
 await assert.rejects(()=>requests.signedUrl('photos/owner/car/'+id));assert.throws(()=>requests.forReference({}));
 assert.deepEqual(calls.filter(c=>c.op==='sign').map(c=>c.bucket),['showcase-images','marketplace-photos','vehicle-images','request-images']);
 assert.ok(calls.filter(c=>c.op==='sign').every(c=>c.seconds===60));
 assert.ok(calls.filter(c=>c.op==='upload').every(c=>c.options.upsert===false&&c.options.cacheControl==='0'));
 const publicClient={storage:{getBucket:async()=>({data:{public:true}}),from:()=>assert.fail('Must reject public media bucket')}};
 for(const [scope,bucket,prefix] of [['showcase','showcase-images','posts/shop/'],['requests','request-images','requests/owner/car/'],['photos','vehicle-images','photos/owner/car/']]){
  const adapter=createMediaStorage({client:publicClient,scope,bucket});
  await assert.rejects(()=>adapter.upload(prefix+id,Buffer.from('x'),'image/png'));
  await assert.rejects(()=>adapter.signedUrl(prefix+id));
 }
});
