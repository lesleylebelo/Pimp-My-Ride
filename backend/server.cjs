const {initializeApp,cert,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createServices}=require('./services.cjs');
const {createStorage}=require('./storage.cjs');
const {createApp}=require('./app.cjs');
try{
 const projectId=process.env.FIREBASE_PROJECT_ID;
 if(!projectId)throw Error('Set FIREBASE_PROJECT_ID.');
 if(process.env.NODE_ENV==='production'&&(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Emulator settings must not be used in production.');
 let credential;
 if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){const key=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(key.project_id!==projectId)throw Error('Credential project does not match FIREBASE_PROJECT_ID.');credential=cert(key);}
 else if(process.env.GOOGLE_APPLICATION_CREDENTIALS)credential=applicationDefault();
 else if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Configure a server-only Firebase service account credential.');
 initializeApp({projectId,...(credential?{credential}:{})});
 const auth=getAuth(),db=getFirestore(),storage=createStorage({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,bucket:process.env.SUPABASE_BUCKET||'verification'});
 const app=createApp({auth,services:createServices({db,auth,storage}),trustProxy:process.env.RENDER?1:false});
 const server=app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('PimpMyRide API ready.'));
 server.requestTimeout=90000;
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}catch(e){console.error('Startup failed. Check project ID, service-account configuration and environment variables.');process.exitCode=1;}
