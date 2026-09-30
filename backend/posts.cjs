const {randomUUID}=require('node:crypto');
const {FieldPath,FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),P=require('./photo-domain.cjs');
const {mutation}=require('./mutations.cjs');
const PAGE_SIZE=20,stamp=()=>FieldValue.serverTimestamp();
const serialize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,serialize(v)])):value;
const row=doc=>({id:doc.id,...serialize(doc.data())});
const categories=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
function eligible(profile,role){return P.eligible(profile,role);}
function authorName(profile,role){
 const name=(role==='shop'?profile.shop?.shopName:profile.fullName)||'';
 const safe=name.trim().replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'').replace(/(?:\+?\d[\d\s().-]{7,}\d)/g,'').replace(/\s+/g,' ').trim();
 if(!safe)return role==='shop'?'Workshop':'Customer';
 if(role==='shop')return safe;
 const [first,...rest]=safe.split(' ');
 return rest.length?`${first} ${rest[0][0]}.`:first;
}
function createPosts({db,auth,actor,storage}){
 const audit=(tx,uid,op,id)=>tx.create(db.collection('auditLogs').doc(),{actor:uid,action:`posts.${op}`,target:id,details:{},createdAt:stamp()});
 async function author(a){
  const profile=(await db.doc(`users/${a.uid}`).get()).data();
  if(!eligible(profile,a.profile.role))D.fail('An active account is required to manage posts.','permission-denied');
  if(a.profile.role==='shop'&&(!await auth.getUser(a.uid).then(user=>user.emailVerified&&!user.disabled).catch(error=>{if(error.code==='auth/user-not-found')return false;throw error;})))D.fail('An active, verified shop is required.','permission-denied');
  return profile;
 }
 async function image(path,uid){
  if(typeof path!=='string'||!path.startsWith(`posts/${uid}/`))D.fail('Choose an uploaded post photo.');
  const details=await storage.inspect(path);
  if(!details||!['image/jpeg','image/png'].includes(details.contentType)||details.size<=0||details.size>5*1024*1024)D.fail('An uploaded photo is unavailable. Upload it again.');
  return {path,url:storage.publicUrl(path),contentType:details.contentType,size:details.size};
 }
 async function postsApi(request){
  const a=await actor(request),input=request.data||{},op=input.op;
  if(!['feed','mine','saved','get','save','create','update','remove','removeImage'].includes(op))D.fail('Unknown posts operation.');
  const allowed={
   feed:['cursor','source','category'],mine:['cursor'],saved:['cursor'],get:['id'],save:['id','saved'],create:['type','title','description','images','category','projectStatus','vehicle','requestId'],
   update:['id','title','description','images','category','projectStatus','vehicle','requestId'],remove:['id','requestId'],removeImage:['path']
  };
  M.fields(input,['op',...allowed[op],...(['save'].includes(op)?[]:['feed','mine','saved'].includes(op)?[]:['requestId'])]);
  const posts=db.collection('posts');
  if(op==='get'){
   const id=D.id(input.id),post=(await posts.doc(id).get()).data();
   if(!post||post.status!=='published')D.fail('Post not found.','not-found');
   const saved=(await db.doc(`users/${a.uid}/savedPosts/${id}`).get()).exists;
   return {post:{id,...serialize(post),saved}};
  }
  if(op==='feed'||op==='mine'){
   let query=posts.where('status','==','published');
   if(op==='mine')query=query.where('authorId','==',a.uid);
   else if(input.source==='shops')query=query.where('authorRole','==','shop');
   else if(input.source==='customers')query=query.where('authorRole','==','customer');
   else if(input.source!==undefined&&input.source!=='all')D.fail('Choose a valid post source.');
   if(input.category&&input.category!=='All')query=query.where('category','==',categories.includes(input.category)?input.category:'');
   query=query.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
   if(input.cursor){
    const cursor=await db.doc(`posts/${D.id(input.cursor)}`).get();
    if(!cursor.exists)D.fail('Post feed changed. Refresh the feed.','failed-precondition');
    query=query.startAfter(cursor);
   }
   const snapshot=await query.limit(PAGE_SIZE+1).get(),docs=snapshot.docs.slice(0,PAGE_SIZE);
   const savedSnapshot=docs.length?await db.collection(`users/${a.uid}/savedPosts`).where(FieldPath.documentId(),'in',docs.map(doc=>doc.id)).get():{docs:[]};
   const saved=new Set(savedSnapshot.docs.map(doc=>doc.id));
   return {items:docs.map(doc=>({...row(doc),saved:saved.has(doc.id)})),cursor:snapshot.docs.length>PAGE_SIZE?docs[PAGE_SIZE-1].id:null};
  }
  if(op==='saved'){
   const savedRef=db.collection(`users/${a.uid}/savedPosts`);
   let savedQuery=savedRef.orderBy(FieldPath.documentId());
   if(input.cursor){const cursor=await savedRef.doc(D.id(input.cursor)).get();if(!cursor.exists)D.fail('Saved posts changed. Refresh the list.','failed-precondition');savedQuery=savedQuery.startAfter(cursor);}
   const savedPage=await savedQuery.limit(PAGE_SIZE+1).get(),ids=savedPage.docs.slice(0,PAGE_SIZE).map(doc=>doc.id);
   const docs=await Promise.all(ids.map(id=>posts.doc(id).get()));
   return {items:docs.filter(doc=>doc.exists&&doc.data().status==='published').map(doc=>({...row(doc),saved:true})),cursor:savedPage.docs.length>PAGE_SIZE?ids.at(-1):null};
  }
  if(op==='save'){
   const id=D.id(input.id),saved=input.saved===true;
   if(typeof input.saved!=='boolean')D.fail('Choose whether to save this post.');
   const postRef=posts.doc(id),savedRef=db.doc(`users/${a.uid}/savedPosts/${id}`);
   return db.runTransaction(async tx=>{
    const post=(await tx.get(postRef)).data();
    if(!post||post.status!=='published')D.fail('Post not found.','not-found');
    const previous=await tx.get(savedRef);
    if(saved&&!previous.exists)tx.create(savedRef,{postId:id,createdAt:stamp()});
    if(!saved&&previous.exists)tx.delete(savedRef);
    return {id,saved};
   });
  }
  if(op==='removeImage'){
   await author(a);const path=input.path;
   if(typeof path!=='string'||!path.startsWith(`posts/${a.uid}/`))D.fail('Photo not found.','not-found');
   await storage.remove(path);
   return {ok:true};
  }
  D.id(input.requestId);
  const receipt=mutation(db,a.uid,`posts:${op}`,input);
  if(op==='create'||op==='update'){
   const profile=await author(a),type=op==='create'?input.type:null;
   const current=op==='update'?(await db.doc(`posts/${D.id(input.id)}`).get()).data():null;
   if(op==='update'&&(!current||current.authorId!==a.uid||current.status!=='published'))D.fail('Post not found.','not-found');
   const authorRole=a.profile.role==='shop'?'shop':'customer';
   if(op==='create'&&((authorRole==='shop'&&type!=='showcase')||(authorRole==='customer'&&type!=='build')))D.fail('This account cannot publish that post type.','permission-denied');
   const title=D.text(input.title,'Title',80),description=D.text(input.description,'Description',1000);
   const category=input.category===undefined?(current?.category||'Other'):input.category;
   if(!categories.includes(category))D.fail('Choose a service category.');
   const projectStatus=input.projectStatus===undefined?current?.projectStatus:input.projectStatus;
   if(authorRole==='shop'&&!['In progress','Completed'].includes(projectStatus))D.fail('Choose In progress or Completed.');
   if(authorRole==='customer'&&projectStatus!==undefined)D.fail('Customer build posts cannot set a project status.');
   const vehicle=input.vehicle===undefined?(current?.vehicle||''):typeof input.vehicle==='string'?input.vehicle.trim():D.fail('Enter a valid vehicle.', 'invalid-argument');
   if(vehicle.length>120)D.fail('Vehicle must be at most 120 characters.');
   if(!Array.isArray(input.images)||input.images.length>6)D.fail('Choose up to six post photos.');
   const images=await Promise.all(input.images.map(path=>image(path,a.uid)));
   const id=op==='create'?posts.doc().id:D.id(input.id),ref=posts.doc(id);
   const fields={authorId:a.uid,authorRole,type:authorRole==='shop'?'showcase':'build',title,description,images,category,...(authorRole==='shop'?{projectStatus}:{}),vehicle,
    authorName:authorName(profile,authorRole),authorAvatar:null,city:authorRole==='shop'?(profile.shop?.city||''):(profile.city||''),province:authorRole==='shop'?(profile.shop?.province||''):(profile.province||''),status:'published',updatedAt:stamp()};
   return receipt.atomic(async tx=>{
    if(op==='update'){
     const snapshot=await tx.get(ref),saved=snapshot.data();
     if(!saved||saved.authorId!==a.uid||saved.status!=='published')D.fail('Post not found.','not-found');
     tx.update(ref,{...fields,createdAt:saved.createdAt});
    }else tx.create(ref,{...fields,createdAt:stamp()});
    audit(tx,a.uid,op,id);return {id};
   });
  }
  if(op==='remove'){
   const id=D.id(input.id),ref=posts.doc(id);
   return receipt.atomic(async tx=>{
    const saved=(await tx.get(ref)).data();
    if(!saved||saved.authorId!==a.uid||saved.status!=='published')D.fail('Post not found.','not-found');
    tx.update(ref,{status:'removed',updatedAt:stamp()});audit(tx,a.uid,op,id);return {id};
   });
  }
 }
 async function uploadPostImage(request){
  const a=await actor(request),profile=await author(a);
  const file=P.validatePhoto(request.file);
  if(a.profile.role==='shop'&&profile.verificationStatus!=='approved')D.fail('Shop verification is required to publish showcases.','permission-denied');
  const path=`posts/${a.uid}/${randomUUID()}`;
  await storage.upload(path,file.buffer,file.contentType);
  const details=await storage.inspect(path);
  if(details.size!==file.size||details.contentType!==file.contentType){await storage.remove(path);D.fail('The uploaded photo could not be verified. Choose it again.','failed-precondition');}
  return {path,url:storage.publicUrl(path),size:file.size,contentType:file.contentType};
 }
 return {postsApi,uploadPostImage};
}
module.exports={createPosts,categories,authorName,PAGE_SIZE};
