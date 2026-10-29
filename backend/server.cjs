if(process.env.PMR_LOCAL_DEMO==='true')throw Error('Local demo must use node backend/local-demo.cjs; production startup is disabled for demo mode.');
const {initializeApp,cert,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore}=require('firebase-admin/firestore');
const {createServices}=require('./services.cjs');
const {createStorage,createMediaStorage}=require('./storage.cjs');
const {createApp}=require('./app.cjs');
const {createGoogleAuth}=require('./google-auth.cjs');
const {corsOrigins,storageConfig,validateEmulatorHost,listenHost}=require('./config.cjs');
const fs=require('node:fs');
const path=require('node:path');
let startupDb;
async function start(){try{
 await require('./ai-azure-provider.cjs').prepareAzureStartup(process.env);
 const {validateMockPaymentConfiguration}=require('./mock-payment-gate.cjs');
 validateMockPaymentConfiguration(process.env);
 const projectId=process.env.FIREBASE_PROJECT_ID?.trim();
 if(!projectId)throw Error('Set FIREBASE_PROJECT_ID.');
 if(process.env.NODE_ENV&&!['development','test','production'].includes(process.env.NODE_ENV))throw Error('NODE_ENV must be development, test or production.');
 validateEmulatorHost('FIRESTORE_EMULATOR_HOST',process.env.FIRESTORE_EMULATOR_HOST);
 validateEmulatorHost('FIREBASE_AUTH_EMULATOR_HOST',process.env.FIREBASE_AUTH_EMULATOR_HOST);
 if(process.env.NODE_ENV==='production'&&(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Emulator settings must not be used in production.');
 const portValue=process.env.PORT===undefined?3000:Number(process.env.PORT);
 if(!Number.isInteger(portValue)||portValue<1||portValue>65535)throw Error('PORT must be an integer from 1 to 65535.');
 let credential;
 if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON){const key=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);if(key.project_id!==projectId)throw Error('Credential project does not match FIREBASE_PROJECT_ID.');credential=cert(key);}
 else if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
  const credentialsPath=path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if(!fs.existsSync(credentialsPath)||!fs.statSync(credentialsPath).isFile())throw Error('GOOGLE_APPLICATION_CREDENTIALS must point to a readable credentials file.');
  const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
  if(!credentials||typeof credentials!=='object'||Array.isArray(credentials))throw Error('GOOGLE_APPLICATION_CREDENTIALS must contain a JSON object.');
  if(process.env.PMR_MOCK_PAYMENTS_ENABLED==='true'&&credentials.project_id!==projectId)throw Error('Credential project does not match FIREBASE_PROJECT_ID.');
  credential=applicationDefault();
 }
 else if(!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Configure a server-only Firebase service account credential.');
 const storage=storageConfig();
 const host=listenHost();
 initializeApp({projectId,...(credential?{credential}:{})});
 const auth=getAuth(),db=getFirestore(),storageClient=createStorage({url:storage.url,key:storage.key,bucket:storage.bucket});
 startupDb=db;
 validateMockPaymentConfiguration(process.env,db);
 const {emailConfig,createEmailDispatcher}=require('./transactional-email.cjs');
 const emailSettings=emailConfig(process.env);
 const emailDelivery={config:emailSettings,dispatcher:createEmailDispatcher({db,auth,config:emailSettings})};
 const photoStorage=createMediaStorage({url:storage.url,key:storage.key,bucket:storage.photoBucket,legacyBucket:storage.legacyPhotoBucket,scope:'photos'});
 const profileStorage=createStorage({url:storage.url,key:storage.key,bucket:storage.photoBucket,scope:'profiles'});
 const requestStorage=createMediaStorage({url:storage.url,key:storage.key,bucket:storage.requestBucket,scope:'requests'});
 const postStorage=createMediaStorage({url:storage.url,key:storage.key,bucket:storage.postsBucket,legacyBucket:storage.legacyPostsBucket,scope:'showcase'});
 const services=createServices({db,auth,storage:storageClient,photoStorage,profileStorage,requestStorage,postStorage});
 const cleanupTimer=setInterval(()=>{void services.accountCleanupTick().catch(()=>console.warn('Account cleanup worker needs attention.'));},60000);cleanupTimer.unref();
 const app=createApp({auth,emailDelivery,googleExchange:createGoogleAuth({auth,db}),services,trustProxy:process.env.RENDER?1:false,
  allowedOrigins:corsOrigins(process.env.CORS_ORIGINS,process.env.NODE_ENV==='production')});
 const server=app.listen(portValue,host,()=>console.log('PimpMyRide API ready.'));
 server.requestTimeout=90000;
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}catch(e){console.error('Startup failed:',e.message);if(startupDb)try{await startupDb.terminate();}catch{}process.exitCode=1;}}
void start();
