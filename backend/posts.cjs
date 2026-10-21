const {randomUUID}=require('node:crypto');
const {FieldPath,FieldValue,Timestamp}=require('firebase-admin/firestore');
const D=require('./domain.cjs'),M=require('./marketplace-domain.cjs'),P=require('./photo-domain.cjs');
const {ApiError}=require('./errors.cjs');
const {mutation}=require('./mutations.cjs');
const PAGE_SIZE=20,MAX_SHOWCASE_IMAGES=10,stamp=()=>FieldValue.serverTimestamp();
const serialize=value=>value instanceof Timestamp?value.toMillis():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,serialize(v)])):value;
const row=doc=>({id:doc.id,...serialize(doc.data())});
const categories=['Tuning','Performance','Exhaust','Lighting','Body Kit','Wheels','Interior','Wrap & Paint','Other'];
function eligible(profile,role){return P.eligible(profile,role);}
function validation(fields){
 const error=new ApiError('validation_error','Please correct the highlighted fields.');
 error.fields=fields;throw error;
}
function validPostId(value){
 if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(value))validation({id:'Enter a valid post id.'});
 return value;
}
function cursorValue(value){
 if(value===undefined||value===null||value==='')return null;
 try{
  const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(!parsed||!Number.isFinite(parsed.createdAt)||parsed.createdAt<1||parsed.createdAt>253402300799999||typeof parsed.id!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(parsed.id))throw Error();
  if(Object.hasOwn(parsed,'seconds')||Object.hasOwn(parsed,'nanoseconds')){
   if(!Number.isSafeInteger(parsed.seconds)||parsed.seconds<0||parsed.seconds>253402300799||!Number.isInteger(parsed.nanoseconds)||parsed.nanoseconds<0||parsed.nanoseconds>=1000000000)throw Error();
  }
  return parsed;
 }catch{validation({cursor:'The feed cursor is invalid. Refresh the feed.'});}
}
function encodeCursor(doc){
 const createdAt=doc.get('createdAt')?.toMillis?.();
 return Number.isSafeInteger(createdAt)?Buffer.from(JSON.stringify({createdAt,id:doc.id})).toString('base64url'):null;
}
function shopSnapshot(id,profile,post){
 return {id,name:profile?.shop?.shopName||post.authorName||'Workshop',avatar:profile?.shop?.avatarUrl||profile?.avatarUrl||profile?.photoURL||post.authorAvatar||null,
  city:profile?.shop?.city||post.city||'',province:profile?.shop?.province||post.province||''};
}
function postVehicle(value){
 if(value&&typeof value==='object'&&!Array.isArray(value))return {make:value.make||'',model:value.model||'',year:value.year||null};
 if(typeof value==='string'){
  const match=value.match(/^\s*(?:(\d{4})\s+)?(.*)$/);
  return {make:match?.[2]||value,model:'',year:match?.[1]?Number(match[1]):null};
 }
 return {make:'',model:'',year:null};
}
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
 async function image(path,uid,existing=[]){
  if(typeof path!=='string'||!path.startsWith(`posts/${uid}/`))D.fail('Choose an uploaded post photo.');
  const original=existing.find(item=>item?.path===path),store=original&&storage.forReference?storage.forReference(original):storage;
  const details=await store.inspect(path);
  if(!details||!['image/jpeg','image/png','image/webp'].includes(details.contentType)||details.size<=0||details.size>5*1024*1024)D.fail('An uploaded photo is unavailable. Upload it again.');
  return {path,...(original?.bucket?{bucket:original.bucket}:original?{}:storage.bucket?{bucket:storage.bucket}:{}),...(store.publicUrl?{url:store.publicUrl(path)}:{}),contentType:details.contentType,size:details.size};
 }
 async function requireShop(request){
  const a=await actor(request);
  if(a.profile.role!=='shop')D.fail('Only shops can manage showcase posts.','forbidden');
  if(!eligible(a.profile,'shop')||a.profile.verificationStatus!=='approved')D.fail('An active, approved shop account is required.','forbidden');
  const user=await auth.getUser(a.uid);
  if(!user.emailVerified||user.disabled)D.fail('An active, verified shop is required.','forbidden');
  return a;
 }
 function validateShowcase(input,{partial=false}={}){
  const fields={};
  if(!partial||Object.hasOwn(input,'title')){
   if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>100)fields.title='Enter a title of 1 to 100 characters.';
  }
  if(!partial||Object.hasOwn(input,'description')){
   if(input.description!==undefined&&typeof input.description!=='string')fields.description='Enter a valid description.';
   else if((input.description||'').length>2000)fields.description='Description must be at most 2000 characters.';
  }
  const category=input.serviceCategory??input.category;
  if(!partial||Object.hasOwn(input,'serviceCategory')||Object.hasOwn(input,'category')){
   if(!categories.includes(category))fields.serviceCategory='Choose a valid service category.';
  }
  if(Object.hasOwn(input,'vehicle')){
   if(!input.vehicle||typeof input.vehicle!=='object'||Array.isArray(input.vehicle))fields.vehicle='Enter valid vehicle details.';
   else{
    for(const key of ['make','model'])if(input.vehicle[key]!==undefined&&(typeof input.vehicle[key]!=='string'||input.vehicle[key].trim().length>80))fields[`vehicle.${key}`]=`${key==='make'?'Make':'Model'} must be at most 80 characters.`;
    if(input.vehicle.year!==undefined&&input.vehicle.year!==null&&input.vehicle.year!==''&&(!Number.isInteger(Number(input.vehicle.year))||Number(input.vehicle.year)<1886||Number(input.vehicle.year)>new Date().getFullYear()+1))fields['vehicle.year']='Enter a valid vehicle year.';
   }
  }
  if(Object.hasOwn(input,'images')&&(!Array.isArray(input.images)||input.images.length<1||input.images.length>MAX_SHOWCASE_IMAGES))fields.images='Choose between 1 and 10 photos.';
  if(Object.keys(fields).length)validation(fields);
  return {
   ...(Object.hasOwn(input,'title')?{title:input.title.trim()}:{}),
   ...(Object.hasOwn(input,'description')?{description:input.description.trim()}:{}),
   ...(Object.hasOwn(input,'serviceCategory')||Object.hasOwn(input,'category')?{category,serviceCategory:category}:{}),
   ...(Object.hasOwn(input,'vehicle')?{vehicle:{make:(input.vehicle.make||'').trim(),model:(input.vehicle.model||'').trim(),year:input.vehicle.year?Number(input.vehicle.year):null}}:{})
  };
 }
 async function restImages(paths,uid,existing=[]){
  if(!Array.isArray(paths)||paths.length<1||paths.length>MAX_SHOWCASE_IMAGES)validation({images:'Choose between 1 and 10 photos.'});
  if(paths.some(path=>typeof path!=='string')||new Set(paths).size!==paths.length)validation({images:'Choose each uploaded photo once.'});
  return Promise.all(paths.map(path=>image(path,uid,existing)));
 }
 function publicPost(id,data,profile){
  const shop=shopSnapshot(data.shopId||data.authorId,profile,data);
  const serialized=serialize(data);delete serialized.cleanupImages;
  return {id,...serialized,shopId:shop.id,shop,serviceCategory:data.serviceCategory||data.category,
   vehicle:postVehicle(data.vehicle),authorName:shop.name,authorAvatar:shop.avatar,city:shop.city,province:shop.province};
 }
 async function postsList(request){
  const a=await actor(request);
  if(!['owner','shop'].includes(a.profile.role))D.fail('Only customers and shops can view showcase posts.','forbidden');
  const query=request.query||{},allowed=new Set(['service','q','cursor','page','limit','shop_id']);
  if(Object.keys(query).some(key=>!allowed.has(key)))validation({query:'Only service, q, cursor, page, limit and shop_id are supported.'});
  const limit=query.limit===undefined?20:Number(query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>50)validation({limit:'Limit must be an integer from 1 to 50.'});
  if(query.page!==undefined&&(!/^[1-9]\d*$/.test(String(query.page))||Number(query.page)>1000))validation({page:'Page must be an integer from 1 to 1000.'});
  if(query.page!==undefined&&query.cursor)validation({page:'Use either page or cursor pagination, not both.'});
  const service=query.service||'All';
  if(service!=='All'&&!categories.includes(service))validation({service:'Choose a valid service category.'});
  const q=query.q===undefined?'':typeof query.q==='string'?query.q.trim().toLocaleLowerCase():null;
  if(q===null||q.length>120)validation({q:'Search must be at most 120 characters.'});
  const shopId=query.shop_id?validPostId(query.shop_id):null;
  const cursor=cursorValue(query.cursor),collection=db.collection('posts');
  let base=collection.where('status','==','published').where('authorRole','==','shop');
  if(service!=='All')base=base.where('category','==',service);
  // Historical shop posts have authorId but may predate the shopId alias.
  if(shopId)base=base.where('authorId','==',shopId);
  let current=cursor,skip=query.page===undefined?0:(Number(query.page)-1)*limit,matched=0;
  const items=[],scanSize=Math.min(100,Math.max(limit*2,40));
  let hasMore=false;
  while(items.length<limit){
   let queryRef=base.orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc');
   if(current)queryRef=queryRef.startAfter(current.seconds===undefined?Timestamp.fromMillis(current.createdAt):new Timestamp(current.seconds,current.nanoseconds),current.id);
   const snapshot=await queryRef.limit(scanSize).get();
   if(!snapshot.docs.length)break;
   const profiles=new Map();
   await Promise.all([...new Set(snapshot.docs.map(doc=>doc.data().shopId||doc.data().authorId))].map(async id=>{
    const profile=(await db.doc(`users/${id}`).get()).data();if(profile)profiles.set(id,profile);
   }));
   for(let index=0;index<snapshot.docs.length;index++){
    const doc=snapshot.docs[index],data=doc.data(),id=data.shopId||data.authorId,shop=shopSnapshot(id,profiles.get(id),data),vehicle=postVehicle(data.vehicle);
    const created=doc.get('createdAt');
    current={createdAt:created.toMillis(),seconds:created.seconds,nanoseconds:created.nanoseconds,id:doc.id};
    if(q&&!`${data.title||''} ${data.description||''} ${shop.name} ${vehicle.make} ${vehicle.model}`.toLocaleLowerCase().includes(q))continue;
    if(matched++<skip)continue;
    items.push(publicPost(doc.id,data,profiles.get(id)));
    if(items.length===limit){hasMore=index<snapshot.docs.length-1||snapshot.docs.length===scanSize;break;}
   }
   if(items.length===limit)break;
   if(snapshot.docs.length<scanSize){hasMore=false;break;}
  }
  return {items,cursor:hasMore&&current?Buffer.from(JSON.stringify(current)).toString('base64url'):null};
 }
 async function postDetail(request){
  const a=await actor(request);
  if(!['owner','shop'].includes(a.profile.role))D.fail('Only customers and shops can view showcase posts.','forbidden');
  const id=validPostId(request.id),snapshot=await db.doc(`posts/${id}`).get(),data=snapshot.data();
  if(!data||data.status!=='published'||data.authorRole!=='shop')D.fail('Post not found.','not_found');
  const shopId=data.shopId||data.authorId,profile=(await db.doc(`users/${shopId}`).get()).data();
  return {post:publicPost(id,data,profile)};
 }
 async function createShowcase(request){
  const a=await requireShop(request),input=request.data||{};
  if(Object.keys(input).some(key=>!['title','description','serviceCategory','category','vehicle','images','requestId'].includes(key)))validation({post:'Remove unsupported post fields.'});
  const fields=validateShowcase(input);
  const images=await restImages(input.images,a.uid),ref=db.collection('posts').doc(),profile=a.profile,now=stamp();
  const shop=shopSnapshot(a.uid,profile,{});
  const data={authorId:a.uid,shopId:a.uid,authorRole:'shop',type:'showcase',...fields,images,
   authorName:shop.name,authorAvatar:shop.avatar,city:shop.city,province:shop.province,
   status:'published',createdAt:now,updatedAt:now};
  const result=await mutation(db,a.uid,'posts:showcaseCreate',input).atomic(async tx=>{
   tx.create(ref,data);audit(tx,a.uid,'create',ref.id);return {id:ref.id};
  });
  // A lost acknowledgement must replay the same post, including when the
  // response read failed after commit. Never resurrect a subsequently removed post.
  const saved=(await db.doc(`posts/${result.id}`).get()).data();
  if(!saved||saved.status!=='published'||saved.authorId!==a.uid)D.fail('The original post is no longer available. Refresh My Posts.','failed-precondition');
  return {post:publicPost(result.id,saved,profile)};
 }
 async function updateShowcase(request){
  const a=await requireShop(request),id=validPostId(request.id),ref=db.doc(`posts/${id}`),snapshot=await ref.get(),current=snapshot.data();
  if(!current||current.status!=='published'||current.authorRole!=='shop')D.fail('Post not found.','not_found');
  if((current.shopId||current.authorId)!==a.uid)D.fail('You can only edit your own showcase posts.','forbidden');
  const input=request.data||{},editable=['title','description','serviceCategory','category','vehicle','images'];
  if(Object.keys(input).some(key=>!editable.includes(key)))validation({post:'Remove unsupported post fields.'});
  if(!Object.keys(input).length)validation({post:'Provide at least one field to update.'});
  const fields=validateShowcase(input,{partial:true});
  const images=Object.hasOwn(input,'images')?await restImages(input.images,a.uid,current.images||[]):current.images||[];
  const changes={...fields,...(Object.hasOwn(input,'images')?{images}:{}),updatedAt:stamp()};
  await db.runTransaction(async tx=>{
   const latest=(await tx.get(ref)).data();
   if(!latest||latest.status!=='published')D.fail('Post not found.','not_found');
   if((latest.shopId||latest.authorId)!==a.uid)D.fail('You can only edit your own showcase posts.','forbidden');
   tx.update(ref,changes);audit(tx,a.uid,'update',id);
  });
  return {post:publicPost(id,{...current,...changes,updatedAt:Timestamp.now()},a.profile)};
 }
 async function deleteShowcase(request){
  const a=await requireShop(request),id=validPostId(request.id),ref=db.doc(`posts/${id}`);
  const snapshot=await ref.get(),current=snapshot.data();
  if(!current||current.authorRole!=='shop')D.fail('Post not found.','not_found');
  if((current.shopId||current.authorId)!==a.uid)D.fail('You can only delete your own showcase posts.','forbidden');
  if(current.status!=='removed')await db.runTransaction(async tx=>{
   const latest=(await tx.get(ref)).data();
   if(!latest||latest.status!=='published')D.fail('Post not found.','not_found');
   if((latest.shopId||latest.authorId)!==a.uid)D.fail('You can only delete your own showcase posts.','forbidden');
   tx.update(ref,{status:'removed',updatedAt:stamp()});audit(tx,a.uid,'remove',id);
  });
  return {id,deleted:true};
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
   D.fail('Showcase photos are retained to protect post data; automatic deletion is unavailable.','failed-precondition');
  }
  D.id(input.requestId);
  const receipt=mutation(db,a.uid,`posts:${op}`,input);
  if(op==='create'||op==='update'){
   if(a.profile.role!=='shop')D.fail('Only shops can manage showcase posts.','forbidden');
   const profile=await author(a),type=op==='create'?input.type:null;
   const current=op==='update'?(await db.doc(`posts/${D.id(input.id)}`).get()).data():null;
   if(op==='update'&&(!current||current.authorId!==a.uid||current.status!=='published'))D.fail('Post not found.','not-found');
   const authorRole=a.profile.role==='shop'?'shop':'customer';
   if(op==='create'&&((authorRole==='shop'&&type!=='showcase')||(authorRole==='customer'&&type!=='build')))D.fail('This account cannot publish that post type.','permission-denied');
   const title=D.text(input.title,'Title',100),description=input.description===undefined?'':D.text(input.description,'Description',2000);
   const category=input.category===undefined?(current?.category||'Other'):input.category;
   if(!categories.includes(category))D.fail('Choose a service category.');
   const projectStatus=input.projectStatus===undefined?current?.projectStatus:input.projectStatus;
   if(authorRole==='shop'&&!['In progress','Completed'].includes(projectStatus))D.fail('Choose In progress or Completed.');
   if(authorRole==='customer'&&projectStatus!==undefined)D.fail('Customer build posts cannot set a project status.');
   const vehicle=input.vehicle===undefined?(current?.vehicle||''):typeof input.vehicle==='string'?input.vehicle.trim():D.fail('Enter a valid vehicle.', 'invalid-argument');
   if(vehicle.length>120)D.fail('Vehicle must be at most 120 characters.');
   if(!Array.isArray(input.images)||input.images.length<1||input.images.length>MAX_SHOWCASE_IMAGES)D.fail('Choose between one and ten post photos.');
   const images=await Promise.all(input.images.map(path=>image(path,a.uid,current?.images||[])));
   const id=op==='create'?posts.doc().id:D.id(input.id),ref=posts.doc(id);
   const fields={authorId:a.uid,authorRole,type:authorRole==='shop'?'showcase':'build',title,description,images,category,...(authorRole==='shop'?{projectStatus}:{}),vehicle,
    authorName:authorName(profile,authorRole),authorAvatar:null,city:authorRole==='shop'?(profile.shop?.city||''):(profile.city||''),province:authorRole==='shop'?(profile.shop?.province||''):(profile.province||''),status:'published',updatedAt:stamp()};
   return receipt.atomic(async tx=>{
    if(op==='update'){
     const snapshot=await tx.get(ref),saved=snapshot.data();
     if(!saved||saved.status!=='published')D.fail('Post not found.','not-found');
     if((saved.shopId||saved.authorId)!==a.uid)D.fail('You can only edit your own showcase posts.','forbidden');
     tx.update(ref,{...fields,createdAt:saved.createdAt});
    }else tx.create(ref,{...fields,createdAt:stamp()});
    audit(tx,a.uid,op,id);return {id};
   });
  }
  if(op==='remove'){
   const id=D.id(input.id),ref=posts.doc(id);
   return receipt.atomic(async tx=>{
    const saved=(await tx.get(ref)).data();
    if(!saved||saved.status!=='published')D.fail('Post not found.','not-found');
    if((saved.shopId||saved.authorId)!==a.uid)D.fail('You can only delete your own showcase posts.','forbidden');
    tx.update(ref,{status:'removed',updatedAt:stamp()});audit(tx,a.uid,op,id);return {id};
   });
  }
 }
 async function uploadPostImage(request){
  const a=await requireShop(request),profile=a.profile;
  const file=P.validatePhoto(request.file);
  if(a.profile.role==='shop'&&profile.verificationStatus!=='approved')D.fail('Shop verification is required to publish showcases.','permission-denied');
  const path=`posts/${a.uid}/${randomUUID()}`;
  await storage.upload(path,file.buffer,file.contentType);
  const details=await storage.inspect(path);
  if(!details||details.size!==file.size||details.contentType!==file.contentType)D.fail('The uploaded photo could not be verified. Choose it again.','failed-precondition');
  return {path,...(storage.bucket?{bucket:storage.bucket}:{}),...(storage.publicUrl?{url:storage.publicUrl(path)}:{}),size:file.size,contentType:file.contentType};
 }
 async function viewPostImage(request){
  const a=await actor(request);
  if(!['owner','shop'].includes(a.profile.role))D.fail('Only customers and shops can view showcase photos.','forbidden');
  const id=validPostId(request.id),input=request.data||{};
  if(Object.keys(input).some(key=>key!=='path'))validation({image:'Only the saved photo path is accepted.'});
  const post=(await db.doc('posts/'+id).get()).data();
  if(!post||post.status!=='published'||post.authorRole!=='shop')D.fail('Post not found.','not_found');
  const asset=Array.isArray(post.images)&&post.images.find(item=>item?.path===input.path);
  if(!asset||typeof asset.path!=='string'||!asset.path.startsWith('posts/'+(post.shopId||post.authorId)+'/'))D.fail('Photo not found.','not_found');
  const store=storage.forReference?storage.forReference(asset):storage,issuedAt=Date.now();
  const url=store.signedUrl?await store.signedUrl(asset.path):store.publicUrl(asset.path);
  return {url,expiresAt:issuedAt+60000};
 }
 return {postsApi,postsList,postDetail,createShowcase,updateShowcase,deleteShowcase,uploadPostImage,viewPostImage};
}
module.exports={createPosts,categories,authorName,PAGE_SIZE};
