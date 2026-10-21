// Expo requires statically named EXPO_PUBLIC_* accesses for bundle substitution.
export function demoConfiguration(env, development) {
 if(env.enabled&&!['true','false'].includes(env.enabled))throw Error('Local demo flag must be true or false; implicit fallback is forbidden.');
 const enabled=env.enabled==='true';
 if(!enabled){if(env.project==='demo-pmr-security')throw Error('Explicit local demo mode is required for the demo project.');return null;}
 if(!development)throw Error('Local demo mode is forbidden in production builds.');
 const host=env.host||'127.0.0.1';
 const privateHost=/^(127\.0\.0\.1|10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(host)&&host.split('.').every(n=>Number(n)<=255);
 if(!privateHost||env.project!=='demo-pmr-security'||env.api!==`http://${host}:3000`)throw Error('Local demo requires the synthetic project and an explicit private HTTP backend on port 3000.');
 const firebase={apiKey:'demo-only-key',authDomain:'demo-pmr-security.invalid',projectId:'demo-pmr-security',messagingSenderId:'1234567890',appId:'demo-local-app'};
 for(const [key,value]of Object.entries(env.firebase||{}))if(value&&value!==firebase[key])throw Error('Production Firebase configuration is forbidden in local demo mode.');
 return {host,apiURL:env.api,authURL:`http://${host}:19099`,firestorePort:18080,firebase};
}
export const localDemo=demoConfiguration({enabled:process.env.EXPO_PUBLIC_PMR_LOCAL_DEMO,host:process.env.EXPO_PUBLIC_PMR_DEMO_HOST,project:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,api:process.env.EXPO_PUBLIC_API_URL,firebase:{apiKey:process.env.EXPO_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,messagingSenderId:process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.EXPO_PUBLIC_FIREBASE_APP_ID}},typeof __DEV__!=='undefined'&&__DEV__);
let prepared=false;
export function assertLocalDemoPrepared(){if(localDemo&&!prepared)throw Error('Local demo readiness must succeed before Firebase initialization.');}
export async function prepareLocalDemo(){
 if(!localDemo)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch(`${localDemo.apiURL}/__demo/ready`,{signal:controller.signal,redirect:'error'});const value=await response.json();if(!response.ok||value.projectId!=='demo-pmr-security'||value.storage!=='memory-fixtures'||value.mockPayments!==true||value.authPort!==19099||value.firestorePort!==18080)throw Error('Invalid local demo backend.');prepared=true;}
 catch{prepared=false;throw Error('Local demo is unavailable. Start the isolated emulators and demo backend; production fallback is disabled.');}
 finally{clearTimeout(timer);}
}
