const {initializeApp,applicationDefault,cert}=require('firebase-admin/app');
const {FieldPath,FieldValue,getFirestore}=require('firebase-admin/firestore');

async function main(){
 const args=process.argv.slice(2),apply=args.includes('--apply'),projectId=args.find(value=>!value.startsWith('--'));
 if(!projectId||args.some(value=>value!=='--apply'&&value!==projectId))throw Error('Usage: node scripts/migrate-showcase-posts.cjs PROJECT_ID [--apply]');
 let credential=applicationDefault();
 if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
  let serviceAccount;
  try{serviceAccount=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}
  catch{throw Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');}
  if(serviceAccount.project_id!==projectId)throw Error('FIREBASE_SERVICE_ACCOUNT_JSON project does not match the requested project.');
  credential=cert(serviceAccount);
 }
 await credential.getAccessToken();
 initializeApp({credential,projectId});
 const db=getFirestore(),posts=db.collection('posts');
 let cursor=null,scanned=0,updated=0;
 while(true){
  let query=posts.where('authorRole','==','shop').orderBy(FieldPath.documentId()).limit(300);
  if(cursor)query=query.startAfter(cursor);
  const page=await query.get();
  if(!page.size)break;
  const batch=db.batch();let pageUpdated=0;
  for(const doc of page.docs){
   const data=doc.data(),changes={};
   if(!data.shopId&&data.authorId)changes.shopId=data.authorId;
   if(data.category&&!data.serviceCategory)changes.serviceCategory=data.category;
   if(typeof data.vehicle==='string'){
    const match=data.vehicle.match(/^\s*(?:(\d{4})\s+)?(.*)$/);
    changes.vehicle={make:match?.[2]||data.vehicle,model:'',year:match?.[1]?Number(match[1]):null};
   }
   if(Object.keys(changes).length){
    scanned++;
    if(apply){batch.update(doc.ref,{...changes,updatedAt:FieldValue.serverTimestamp()});updated++;pageUpdated++;}
   }
  }
  if(pageUpdated)await batch.commit();
  cursor=page.docs.at(-1);
  if(page.size<300)break;
 }
 console.log(apply?`Updated ${updated} showcase posts in project ${projectId}.`:`Dry run found ${scanned} showcase posts to update in project ${projectId}. Re-run with --apply to write changes.`);
}

main().catch(error=>{console.error('Showcase migration failed:',error.message||error,error.stack||'');process.exitCode=1;});
