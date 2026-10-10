const {test}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {Timestamp}=require('firebase-admin/firestore');
const {createApp}=require('../app.cjs');
const {createPosts}=require('../posts.cjs');

function fixture(){
 const rows=new Map([
  ['users/shop',{role:'shop',accountStatus:'active',verificationStatus:'approved',shop:{shopName:'North Garage',city:'Durban',province:'KZN'}}],
  ['users/other',{role:'shop',accountStatus:'active',verificationStatus:'approved',shop:{shopName:'South Garage'}}],
  ['users/customer',{role:'owner',accountStatus:'active'}]
 ]);let sequence=0;
 const clone=value=>value instanceof Timestamp?value:Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)])):value;
 const normalize=value=>value?.constructor?.name==='ServerTimestampTransform'?Timestamp.now():clone(value);
 const snapshot=path=>{const value=rows.get(path);return {id:path.split('/').at(-1),exists:rows.has(path),data:()=>clone(value),get:key=>value?.[key]};};
 const ref=path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path),update:async changes=>{rows.set(path,{...rows.get(path),...Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,normalize(value)]))});}});
 const db={rows,doc:ref,collection(name){return {
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
  const result=await work(tx);writes.forEach(write=>write());return result;
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
     docs=docs.filter(doc=>{const created=doc.get('createdAt')?.toMillis?.()||0;return created<time.toMillis()||created===time.toMillis()&&doc.id<id;});
    }
    const selected=docs.slice(0,take);
    return {docs:selected,size:selected.length};
   }
  };return q;
 }
 const auth={verifyIdToken:async token=>({uid:token,email_verified:true,auth_time:Math.floor(Date.now()/1000)}),getUser:async uid=>({emailVerified:true,disabled:uid==='disabled'})};
 const files=new Map(),storage={inspect:async path=>files.get(path)||null,publicUrl:path=>`https://images.example/${path}`,remove:async path=>files.delete(path)};
 const actor=async({auth:identity})=>({uid:identity.uid,profile:(await db.doc(`users/${identity.uid}`).get()).data()});
 const api=createPosts({db,auth,actor,storage}),services={postsList:api.postsList,postDetail:api.postDetail,createShowcase:api.createShowcase,updateShowcase:api.updateShowcase,deleteShowcase:api.deleteShowcase,postsApi:async()=>({})};
 const app=createApp({auth,services}),token=uid=>`Bearer ${uid}`,image=(uid,name)=>{const path=`posts/${uid}/${name}`;files.set(path,{size:128,contentType:'image/png'});return path;};
 return {app,db,files,token,image};
}

test('showcase REST CRUD enforces role/ownership, validates fields and updates the public feed',async()=>{
 const f=fixture(),image=f.image('shop','one');
 const customer=await request(f.app).post('/api/posts').set('Authorization',f.token('customer')).send({title:'Rejected',serviceCategory:'Tuning',images:[image]}).expect(403);
 assert.equal(customer.body.error.code,'forbidden');
 const invalid=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'',serviceCategory:'Invalid',images:[]}).expect(400);
 assert.equal(invalid.body.error.code,'validation_error');assert.ok(invalid.body.error.fields.title);
 const created=await request(f.app).post('/api/posts').set('Authorization',f.token('shop')).send({title:'Turbo tune',description:'A clean fit',serviceCategory:'Tuning',vehicle:{make:'Honda',model:'Civic',year:2022},images:[image]}).expect(201);
 const id=created.body.data.post.id;assert.equal(created.body.data.post.shop.name,'North Garage');assert.equal(created.body.data.post.images[0].url,`https://images.example/${image}`);
 const foreign=await request(f.app).patch(`/api/posts/${id}`).set('Authorization',f.token('other')).send({title:'Stolen'}).expect(403);
 assert.equal(foreign.body.error.code,'forbidden');
 const updated=await request(f.app).patch(`/api/posts/${id}`).set('Authorization',f.token('shop')).send({title:'Updated tune'}).expect(200);
 assert.equal(updated.body.data.post.title,'Updated tune');
 await request(f.app).get(`/api/posts/${id}`).set('Authorization',f.token('customer')).expect(200);
 const listed=await request(f.app).get('/api/posts?service=Tuning&q=garage&limit=1').set('Authorization',f.token('customer')).expect(200);
 assert.equal(listed.body.data.items[0].id,id);assert.equal(listed.body.data.items[0].shop.city,'Durban');
 await request(f.app).get(`/api/posts/missing-post`).set('Authorization',f.token('customer')).expect(404);
 const deleted=await request(f.app).delete(`/api/posts/${id}`).set('Authorization',f.token('shop')).expect(200);
 assert.equal(deleted.body.data.deleted,true);assert.equal(f.files.has(image),false);
 const feed=await request(f.app).get('/api/posts').set('Authorization',f.token('customer')).expect(200);
 assert.equal(feed.body.data.items.length,0);
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
