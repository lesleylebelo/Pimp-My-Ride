const {initializeApp,applicationDefault,cert}=require('firebase-admin/app');
const {FieldPath,FieldValue,getFirestore}=require('firebase-admin/firestore');

async function main(){
 const [projectId]=process.argv.slice(2);
 if(!projectId||process.argv.length!==3)throw new Error('Usage: node scripts/backfill-quotation-counts.cjs PROJECT_ID');
 let credential=applicationDefault();
 if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
  let serviceAccount;
  try{serviceAccount=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}
  catch(_){throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');}
  if(serviceAccount.project_id!==projectId)throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON project does not match the requested project.');
  credential=cert(serviceAccount);
 }
 try{await credential.getAccessToken();}
 catch(_){throw new Error('Firebase credentials are unavailable. Run `gcloud auth application-default login` or set FIREBASE_SERVICE_ACCOUNT_JSON for this PowerShell session.');}
 initializeApp({credential,projectId});
 const db=getFirestore(),requests=db.collection('serviceRequests'),quotations=db.collection('quotations');
 let cursor=null,updated=0;
 while(true){
  let query=requests.orderBy(FieldPath.documentId()).limit(500);
  if(cursor)query=query.startAfter(cursor);
  const page=await query.get();
  if(!page.size)break;
  for(let offset=0;offset<page.docs.length;offset+=30){
   const group=page.docs.slice(offset,offset+30),ids=group.map(doc=>doc.id),counts=new Map(ids.map(id=>[id,0]));
   let quoteCursor=null;
   while(true){
    let quoteQuery=quotations.where('serviceRequestId','in',ids).orderBy(FieldPath.documentId()).limit(500);
    if(quoteCursor)quoteQuery=quoteQuery.startAfter(quoteCursor);
    const quotePage=await quoteQuery.get();
    for(const quote of quotePage.docs)if(quote.data().status!=='withdrawn'){
     const id=quote.data().serviceRequestId;
     counts.set(id,(counts.get(id)||0)+1);
    }
    if(quotePage.size<500)break;
    quoteCursor=quotePage.docs[quotePage.docs.length-1];
   }
   const batch=db.batch();
   for(const request of group)batch.update(request.ref,{quotationCount:counts.get(request.id)||0,updatedAt:FieldValue.serverTimestamp()});
   await batch.commit();
   updated+=group.length;
  }
  cursor=page.docs[page.docs.length-1];
 }
 console.log(`Backfilled quotation counts on ${updated} service requests in project ${projectId}.`);
}

main().catch(error=>{console.error(error.message||'Quotation count backfill could not be confirmed.');process.exitCode=1;});
