const {test}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {Timestamp}=require('firebase-admin/firestore');
const {createApp}=require('../app.cjs');
const {createPosts}=require('../posts.cjs');

function fixture({privateMedia=false}={}){
 const rows=new Map([
  ['users/shop',{role:'shop',accountStatus:'active',verificationStatus:'approved',shop:{shopName:'North Garage',city:'Durban',province:'KZN'}}],
  ['users/other',{role:'shop',accountStatus:'active',verificationStatus:'approved',shop:{shopName:'South Garage'}}],
  ['users/customer',{role:'owner',accountStatus:'active'}]
 ]);let sequence=0;
 const clone=value=>value instanceof Timestamp?value:Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)])):value;
 const normalize=value=>value?.constructor?.name==='ServerTimestampTransform'?Timestamp.now():clone(value);
 const snapshot=path=>{const value=rows.get(path);return {id:path.split('/').at(-1),exists:rows.has(path),data:()=>clone(value),get:key=>value?.[key]};};
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path),update:async changes=>{rows.set(path,{...rows.get(path),...Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,normalize(value)]))});}});
 const db={rows,queryReads:[],doc:ref,collection(name){return {
  doc(id){return ref(`${name}/${id||`post-${++sequence}`}`);},
  where(field,operator,value){return query(name,[[field,operator,value]]);}
 };},async runTransaction(work){
  const writes=[];
  const tx={
   get:async document=>snapshot(document.path),
   create:(document,value)=>writes.push(()=>{
    if(rows.has(document.path))throw Error('already exists');
    rows.set(document.path,Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)])));
   }),
   update:(document,value)=>writes.push(()=>rows.set(document.path,{...rows.get(document.path),...Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]))}))
  };
  const result=await work(tx);
  if(db.beforeCommit){const beforeCommit=db.beforeCommit;db.beforeCommit=null;await beforeCommit();}
  writes.forEach(write=>write());
  if(db.afterCommit){const afterCommit=db.afterCommit;db.afterCommit=null;await afterCommit();}
  return result;
 }};
 function query(name,filters=[],sort=[],after=null,take=20){
  const q={
   where(field,operator,value){return query(name,[...filters,[field,operator,value]],sort,after,take);},
   orderBy(field,direction='asc'){return query(name,filters,[...sort,[field,direction]],after,take);},
   startAfter(...values){return query(name,filters,sort,values,take);},
   limit(value){return query(name,filters,sort,after,value);},
   async get(){
    let docs=[...rows.keys()].filter(path=>path.startsWith(`${name}/`)).map(snapshot);
    for(const [field,operator,value] of filters)docs=docs.filter(doc=>operator==='=='&&doc.get(field)===value);
    for(const [field,direction] of [...sort].reverse())docs.sort((a,b)=>{
     const left=field==='__name__'?a.id:a.get(field),right=field==='__name__'?b.id:b.get(field);
     const l=left?.toMillis?.()??left,r=right?.toMillis?.()??right;
     return (l<r?-1:l>r?1:0)*(direction==='desc'?-1:1);
    });
    if(after){
     const [time,id]=after;
     docs=docs.filter(doc=>{const created=doc.get('createdAt'),comparison=created.seconds-time.seconds||created.nanoseconds-time.nanoseconds;return comparison<0||comparison===0&&doc.id<id;});
    }
    const selected=docs.slice(0,take);db.queryReads.push({name,documents:selected.length});
    return {docs:selected,size:selected.length};
   }
  };return q;
 }
 const auth={verifyIdToken:async token=>({uid:token,email_verified:true,auth_time:Math.floor(Date.now()/1000)}),getUser:async uid=>({emailVerified:true,disabled:uid==='disabled'})};
 const files=new Map(),removals=[],storage={
  inspect:async path=>{if(storage.inspectFailure)throw storage.inspectFailure;if(storage.inspectHook)await storage.inspectHook(path);return files.get(path)||null;},
  publicUrl:path=>`https://images.example/${path}`,
  upload:async(path,buffer,contentType)=>files.set(path,{size:buffer.length,contentType}),
  remove:async path=>{removals.push(path);return files.delete(path);}
 };
 if(privateMedia){storage.bucket='showcase-images';delete storage.publicUrl;storage.signedUrl=async path=>'https://private.example/signed/'+encodeURIComponent(path);storage.forReference=record=>{if(record.bucket!=='showcase-images')throw Error('Wrong bucket');return storage;};}
 const actor=async({auth:identity})=>({uid:identity.uid,profile:(await db.doc(`users/${identity.uid}`).get()).data()});
 const api=createPosts({db,auth,actor,storage}),services={postsList:api.postsList,postDetail:api.postDetail,createShowcase:api.createShowcase,updateShowcase:api.updateShowcase,deleteShowcase:api.deleteShowcase,postsApi:api.postsApi,viewPostImage:api.viewPostImage};
 const app=createApp({auth,services}),token=uid=>`Bearer ${uid}`,image=(uid,name)=>{const path=`posts/${uid}/${name}`;files.set(path,{size:128,contentType:'image/png'});return path;};
 return {app,db,files,removals,storage,api,token,image};
}

test('showcase REST CRUD enforces role/ownership, validates fields and updates the public feed',async()=>{
 const f=fixture(),image=f.image('shop','one');
 const customer=await request(f.app).post('/api/posts').set('Authorization',f.token('customer')).send({title:'Rejected',serviceCategory:'Tuning',images:[image]}).expect(403);
 assert.equal(customer.body.error.code,'forbidden');
 const invalid=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'',serviceCategory:'Invalid',images:[]}).expect(400);
 assert.equal(invalid.body.error.code,'validation_error');assert.ok(invalid.body.error.fields.title);
 const created=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'Turbo tune',description:'A clean fit',serviceCategory:'Tuning',vehicle:{make:'Honda',model:'Civic',year:2022},images:[image]}).expect(201);
 const id=created.body.data.post.id;assert.equal(created.body.data.post.shop.name,'North Garage');assert.deepEqual(created.body.data.post.vehicle,{make:'Honda',model:'Civic',year:2022});assert.equal(created.body.data.post.images[0].url,`https://images.example/${image}`);
 const foreign=await request(f.app).patch(`/api/posts/${id}`).set('Authorization',f.token('other')).send({title:'Stolen'}).expect(403);
 assert.equal(foreign.body.error.code,'forbidden');
 const updated=await request(f.app).patch(`/api/posts/${id}`).set('Authorization',f.token('shop')).send({title:'Updated tune'}).expect(200);
 assert.equal(updated.body.data.post.title,'Updated tune');
 await request(f.app).get(`/api/posts/${id}`).set('Authorization',f.token('customer')).expect(200);
 const listed=await request(f.app).get('/api/posts?service=Tuning&q=garage&limit=1').set('Authorization',f.token('customer')).expect(200);
 assert.equal(listed.body.data.items[0].id,id);assert.equal(listed.body.data.items[0].shop.city,'Durban');
 await request(f.app).get(`/api/posts/missing-post`).set('Authorization',f.token('customer')).expect(404);
 const deleted=await request(f.app).delete(`/api/posts/${id}`).set('Authorization',f.token('shop')).expect(200);
 assert.equal(deleted.body.data.deleted,true);assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
 const feed=await request(f.app).get('/api/posts').set('Authorization',f.token('customer')).expect(200);
 assert.equal(feed.body.data.items.length,0);
});

async function createShowcase(f,images,title='Showcase'){
 return request(f.app).post('/api/posts').set('Authorization',f.token('shop'))
  .send({title,serviceCategory:'Tuning',images}).expect(201);
}

test('REST showcase retry after a lost commit acknowledgement replays one post and retains media',async()=>{
 const f=fixture(),path=f.image('shop','retry-fixture'),data={requestId:'synthetic-create-retry',title:'Retry once',serviceCategory:'Other',images:[path]},call=()=>f.api.createShowcase({auth:{uid:'shop'},data});
 f.db.afterCommit=async()=>{throw Error('Synthetic lost acknowledgement');};
 await assert.rejects(call,/lost acknowledgement/);
 const created=[...f.db.rows.keys()].filter(key=>key.startsWith('posts/'));assert.equal(created.length,1);
 const result=await call();assert.equal(result.post.id,created[0].split('/')[1]);
 assert.equal([...f.db.rows.keys()].filter(key=>key.startsWith('posts/')).length,1);
 assert.equal([...f.db.rows.keys()].filter(key=>key.startsWith('mutationReceipts/')).length,1);
 assert.equal([...f.db.rows.keys()].filter(key=>key.startsWith('auditLogs/')).length,1);
 assert.equal(f.files.has(path),true);assert.deepEqual(f.removals,[]);
 await assert.rejects(()=>f.api.createShowcase({auth:{uid:'shop'},data:{...data,title:'Reused key with other data'}}),{code:'already-exists'});
 await f.api.deleteShowcase({auth:{uid:'shop'},id:result.post.id});
 await assert.rejects(call);assert.equal([...f.db.rows.keys()].filter(key=>key.startsWith('posts/')).length,1);assert.deepEqual(f.removals,[]);
});

test('shop-filtered Discover and My Posts include historical records without shopId',async()=>{
 const f=fixture(),image=f.image('shop','legacy');
 const created=await createShowcase(f,[image],'Historical showcase'),id=created.body.data.post.id;
 const ref=f.db.doc(`posts/${id}`),value=(await ref.get()).data();
 // The fixture stores fields directly; an absent alias matches historical data.
 await ref.update({shopId:undefined});
 for(const query of ['shop_id=shop','shop_id=shop&service=Tuning']){
  const result=await request(f.app).get('/api/posts?'+query).set('Authorization',f.token('shop')).expect(200);
  assert.equal(result.body.data.items[0].id,id);assert.equal(result.body.data.items[0].images[0].url,value.images[0].url);
 }
 const foreign=await request(f.app).get('/api/posts?shop_id=other').set('Authorization',f.token('other')).expect(200);
 assert.equal(foreign.body.data.items.length,0);assert.deepEqual(f.removals,[]);
});

test('creating a showcase with uploaded photos leaves the objects intact',async()=>{
 const f=fixture(),image=f.image('shop','created');
 const response=await createShowcase(f,[image]);
 assert.equal(response.body.data.post.images[0].path,image);
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('editing a showcase while retaining its photo does not delete the object',async()=>{
 const f=fixture(),image=f.image('shop','retained'),created=await createShowcase(f,[image]);
 await request(f.app).patch(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).send({title:'Updated'}).expect(200);
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('removing a photo from a showcase retains the object for shared or stale references',async()=>{
 const f=fixture(),removed=f.image('shop','removed'),replacement=f.image('shop','replacement');
 const created=await createShowcase(f,[removed]);
 await request(f.app).patch(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).send({images:[replacement]}).expect(200);
 assert.equal(f.files.has(removed),true);assert.equal(f.files.has(replacement),true);assert.deepEqual(f.removals,[]);
});

test('soft-deleting a showcase leaves its photos in storage',async()=>{
 const f=fixture(),image=f.image('shop','soft-delete'),created=await createShowcase(f,[image]);
 await request(f.app).delete(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).expect(200);
 assert.equal(f.db.rows.get(`posts/${created.body.data.post.id}`).status,'removed');
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('deleting one of two showcases sharing a photo preserves the shared object',async()=>{
 const f=fixture(),image=f.image('shop','shared'),first=await createShowcase(f,[image],'First');
 const second=await createShowcase(f,[image],'Second');
 await request(f.app).delete(`/api/posts/${first.body.data.post.id}`).set('Authorization',f.token('shop')).expect(200);
 assert.equal(f.db.rows.get(`posts/${second.body.data.post.id}`).images[0].path,image);
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('a network failure before the Firestore commit preserves uploaded media',async()=>{
 const f=fixture(),image=f.image('shop','pre-commit');
 f.db.beforeCommit=async()=>{throw Object.assign(new Error('Firestore unavailable'),{code:'unavailable'});};
 const original=console.error;console.error=()=>{};
 try{
  await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'Retry later',serviceCategory:'Tuning',images:[image]}).expect(500);
 }finally{console.error=original;}
 assert.equal([...f.db.rows.keys()].filter(path=>path.startsWith('posts/')).length,0);
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('a committed showcase survives a lost HTTP acknowledgement without deleting its photo',async()=>{
 const f=fixture(),image=f.image('shop','lost-ack');
 f.db.afterCommit=async()=>{throw Object.assign(new Error('Acknowledgement lost'),{code:'ECONNRESET'});};
 const original=console.error;console.error=()=>{};
 try{
  await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'Committed post',serviceCategory:'Tuning',images:[image]}).expect(500);
 }finally{console.error=original;}
 const post=[...f.db.rows.entries()].find(([path,value])=>path.startsWith('posts/')&&value.title==='Committed post');
 assert.ok(post,'the Firestore transaction committed before the simulated acknowledgement loss');
 assert.equal(post[1].images[0].path,image);assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('a concurrent reattachment after an update snapshot cannot be deleted as stale cleanup',async()=>{
 const f=fixture(),oldImage=f.image('shop','stale-old'),newImage=f.image('shop','stale-new');
 const first=await createShowcase(f,[oldImage],'First'),inspectionStarted=new Promise(resolve=>{f.storage.onBlockedInspection=resolve;});
 let releaseInspection;const inspectionGate=new Promise(resolve=>{releaseInspection=resolve;});
 f.storage.inspectHook=async path=>{if(path===newImage){f.storage.onBlockedInspection();await inspectionGate;}};
 const update=request(f.app).patch(`/api/posts/${first.body.data.post.id}`).set('Authorization',f.token('shop')).send({images:[newImage]}).then(response=>response);
 await inspectionStarted;
 const second=await createShowcase(f,[oldImage],'Concurrent reattachment');
 releaseInspection();
 const response=await update;assert.equal(response.status,200);
 assert.equal(f.db.rows.get(`posts/${second.body.data.post.id}`).images[0].path,oldImage);
 assert.equal(f.files.has(oldImage),true);assert.deepEqual(f.removals,[]);
});

test('two concurrent edits with stale image snapshots never delete the retained photo',async()=>{
 const f=fixture(),existing=f.image('shop','concurrent-existing'),replacement=f.image('shop','concurrent-replacement');
 const created=await createShowcase(f,[existing],'Before edits'),inspectionStarted=new Promise(resolve=>{f.storage.onBlockedInspection=resolve;});
 let releaseInspection;const inspectionGate=new Promise(resolve=>{releaseInspection=resolve;});
 f.storage.inspectHook=async path=>{if(path===replacement){f.storage.onBlockedInspection();await inspectionGate;}};
 const imageEdit=request(f.app).patch(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).send({images:[replacement]}).then(response=>response);
 await inspectionStarted;
 await request(f.app).patch(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).send({title:'Concurrent title edit'}).expect(200);
 releaseInspection();
 const response=await imageEdit;assert.equal(response.status,200);
 assert.equal(f.db.rows.get(`posts/${created.body.data.post.id}`).title,'Concurrent title edit');
 assert.equal(f.files.has(existing),true);assert.equal(f.files.has(replacement),true);assert.deepEqual(f.removals,[]);
});

test('reattaching a photo during a legacy cleanup attempt never deletes it',async()=>{
 const f=fixture(),image=f.image('shop','reattached-during-cleanup');
 const removal=request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({op:'removeImage',path:image});
 const [cleanup,created]=await Promise.all([
  removal.then(response=>response),
  createShowcase(f,[image],'Reattached')
 ]);
 assert.equal(cleanup.status,409);assert.equal(created.body.data.post.images[0].path,image);
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('shops cannot use the legacy endpoint to delete another shop photo',async()=>{
 const f=fixture(),image=f.image('other','not-owned');
 const response=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({op:'removeImage',path:image}).expect(404);
 assert.equal(response.body.error.code,'not_found');assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('repeated legacy cleanup requests are rejected without repeated deletion',async()=>{
 const f=fixture(),image=f.image('shop','repeat');
 for(let attempt=0;attempt<2;attempt++){
  await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({op:'removeImage',path:image}).expect(409);
 }
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('storage inspection failure during an edit preserves existing and replacement photos',async()=>{
 const f=fixture(),existing=f.image('shop','storage-existing'),replacement=f.image('shop','storage-replacement');
 const created=await createShowcase(f,[existing]);
 f.storage.inspectFailure=Object.assign(new Error('Storage unavailable'),{code:'unavailable'});
 const original=console.error;console.error=()=>{};
 try{
  await request(f.app).patch(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).send({images:[replacement]}).expect(500);
 }finally{console.error=original;}
 assert.equal(f.db.rows.get(`posts/${created.body.data.post.id}`).images[0].path,existing);
 assert.equal(f.files.has(existing),true);assert.equal(f.files.has(replacement),true);assert.deepEqual(f.removals,[]);
});

test('Firestore unavailability during post deletion preserves its photo and published record',async()=>{
 const f=fixture(),image=f.image('shop','firestore-delete-failure'),created=await createShowcase(f,[image]);
 f.db.beforeCommit=async()=>{throw Object.assign(new Error('Firestore unavailable'),{code:'unavailable'});};
 const original=console.error;console.error=()=>{};
 try{
  await request(f.app).delete(`/api/posts/${created.body.data.post.id}`).set('Authorization',f.token('shop')).expect(500);
 }finally{console.error=original;}
 assert.equal(f.db.rows.get(`posts/${created.body.data.post.id}`).status,'published');
 assert.equal(f.files.has(image),true);assert.deepEqual(f.removals,[]);
});

test('an uploaded object is retained when storage verification is unavailable',async()=>{
 const f=fixture();let uploadedPath;
 const upload=f.storage.upload;
 f.storage.upload=async(path,buffer,contentType)=>{uploadedPath=path;return upload(path,buffer,contentType);};
 f.storage.inspectFailure=Object.assign(new Error('Storage unavailable'),{code:'unavailable'});
 const png=Buffer.alloc(58);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
 png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
 png[24]=8;png[25]=6;png.writeUInt32BE(1,33);png.write('IDAT',37);png[41]=0;png.write('IEND',50);
 await assert.rejects(f.api.uploadPostImage({auth:{uid:'shop'},file:{buffer:png,mimetype:'image/png',originalname:'test.png'}}),/Storage unavailable/);
 assert.ok(uploadedPath);assert.equal(f.files.has(uploadedPath),true);assert.deepEqual(f.removals,[]);
});

test('feed cursor pagination returns newest items in stable order and filters by shop',async()=>{
 const f=fixture();
 for(const [uid,postId,time,title] of [['shop','older',1000,'older'],['shop','newer',3000,'newer'],['other','other',2000,'other shop']]){
  const ref=f.db.doc(`posts/${postId}`);await ref.update({authorId:uid,shopId:uid,authorRole:'shop',type:'showcase',status:'published',title,description:'',category:'Other',serviceCategory:'Other',vehicle:{},images:[],createdAt:Timestamp.fromMillis(time),updatedAt:Timestamp.fromMillis(time)});
 }
 const first=await request(f.app).get('/api/posts?limit=1&shop_id=shop').set('Authorization',f.token('customer')).expect(200);
 assert.equal(first.body.data.items[0].id,'newer');assert.ok(first.body.data.cursor);
 const next=await request(f.app).get(`/api/posts?limit=1&shop_id=shop&cursor=${encodeURIComponent(first.body.data.cursor)}`).set('Authorization',f.token('customer')).expect(200);
 assert.equal(next.body.data.items[0].id,'older');assert.equal(next.body.data.cursor,null);
});

test('Discover cursors preserve Firestore sub-millisecond timestamps across pages',async()=>{
 const f=fixture();
 for(const [id,nanoseconds] of [['newest',123456789],['older',123456000],['oldest',123455000]])await f.db.doc('posts/'+id).update({authorId:'shop',authorRole:'shop',status:'published',category:'Other',createdAt:new Timestamp(1000,nanoseconds),images:[]});
 const ids=[];let cursor;
 do{const result=await request(f.app).get('/api/posts').query({limit:1,...(cursor?{cursor}:{})}).set('Authorization',f.token('customer')).expect(200);ids.push(...result.body.data.items.map(x=>x.id));cursor=result.body.data.cursor;}while(cursor);
 assert.deepEqual(ids,['newest','older','oldest']);
 const legacy=Buffer.from(JSON.stringify({createdAt:1000123.456789,id:'newest'})).toString('base64url');
 await request(f.app).get('/api/posts').query({limit:1,cursor:legacy}).set('Authorization',f.token('customer')).expect(200);
 const invalid=Buffer.from(JSON.stringify({createdAt:1000123,id:'newest',seconds:1000,nanoseconds:1000000000})).toString('base64url');
 await request(f.app).get('/api/posts').query({cursor:invalid}).set('Authorization',f.token('customer')).expect(400);
});

test('private showcases persist bucket/path only and sign only a published post member',async()=>{
 const f=fixture({privateMedia:true}),path=f.image('shop','private-one');
 const response=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'Private showcase',serviceCategory:'Other',images:[path]}).expect(201);
 const id=response.body.data.post.id,saved=f.db.rows.get('posts/'+id);
 assert.equal(saved.images[0].bucket,'showcase-images');assert.equal(saved.images[0].url,undefined);
 await request(f.app).post(`/api/posts/${id}/images/view`).send({path}).expect(401);
 const access=await request(f.app).post(`/api/posts/${id}/images/view`).set('Authorization',f.token('customer')).send({path}).expect(200);
 assert.match(access.body.data.url,/private.example/);assert.ok(access.body.data.expiresAt>Date.now());
 await request(f.app).post(`/api/posts/${id}/images/view`).set('Authorization',f.token('customer')).send({path:f.image('other','foreign')}).expect(404);
 await request(f.app).post(`/api/posts/${id}/images/view`).set('Authorization',f.token('customer')).send({path,bucket:'verification'}).expect(400);
 await request(f.app).patch(`/api/posts/${id}`).set('Authorization',f.token('shop')).send({images:[path],title:'Still private'}).expect(200);
 assert.equal(f.db.rows.get('posts/'+id).images[0].url,undefined);
 await request(f.app).delete(`/api/posts/${id}`).set('Authorization',f.token('shop')).expect(200);
 await request(f.app).post(`/api/posts/${id}/images/view`).set('Authorization',f.token('customer')).send({path}).expect(404);
 assert.deepEqual(f.removals,[]);assert.equal(f.files.has(path),true);
});


test('sparse search bounds each request to 200 documents and continues without skipping a later match',async()=>{
 const f=fixture();
 for(let i=0;i<250;i++)f.db.rows.set('posts/scan-'+String(i).padStart(3,'0'),{authorId:'shop',shopId:'shop',authorRole:'shop',type:'showcase',status:'published',title:i===220?'Rare needle':'Ordinary work',description:'',category:'Tuning',images:[],createdAt:Timestamp.fromMillis(1800000000000-i*1000)});
 const first=await request(f.app).get('/api/posts').query({q:'needle',limit:20}).set('Authorization',f.token('customer')).expect(200);
 assert.deepEqual(first.body.data.items,[]);assert.ok(first.body.data.cursor);assert.equal(f.db.queryReads.reduce((sum,r)=>sum+r.documents,0),200);
 f.db.queryReads.length=0;
 const next=await request(f.app).get('/api/posts').query({q:'needle',limit:20,cursor:first.body.data.cursor}).set('Authorization',f.token('customer')).expect(200);
 assert.deepEqual(next.body.data.items.map(item=>item.id),['scan-220']);assert.equal(next.body.data.cursor,null);assert.equal(f.db.queryReads.reduce((sum,r)=>sum+r.documents,0),50);
});
