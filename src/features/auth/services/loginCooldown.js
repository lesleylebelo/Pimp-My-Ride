import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='@pmr/login-cooldown/v2';
const LEGACY_KEY='@pmr/login-cooldown/v1';
const ATTEMPT_LIMIT=5,COOLDOWN_SECONDS=60;
let attempts=0,deadline=0,busy=false,loaded=false;
async function load(){
 if(loaded)return;
 const raw=await AsyncStorage.getItem(KEY);
 if(raw){
  try{const saved=JSON.parse(raw);attempts=Number.isInteger(saved.attempts)?Math.max(0,saved.attempts):0;deadline=Number.isFinite(saved.deadline)?saved.deadline:0;}
  catch{attempts=0;deadline=0;}
 }else if(await AsyncStorage.getItem(LEGACY_KEY)){
  const oldDeadline=Number(await AsyncStorage.getItem(LEGACY_KEY));deadline=Number.isFinite(oldDeadline)?oldDeadline:0;
  await AsyncStorage.removeItem(LEGACY_KEY);
 }
 loaded=true;
}
async function save(){await AsyncStorage.setItem(KEY,JSON.stringify({attempts,deadline}));}
export async function cooldownRemaining(){
 await load();
 if(deadline<=Date.now()&&deadline){attempts=0;deadline=0;await save();}
 return Math.max(0,Math.ceil((deadline-Date.now())/1000));
}
export async function guardedLogin(operation){
 if(busy)throw new Error('A sign-in attempt is already in progress.');
 busy=true;
 try{
  await load();
  const seconds=await cooldownRemaining();
  if(seconds)throw new Error(`Sign-in is paused after ${ATTEMPT_LIMIT} consecutive incorrect attempts. Please wait ${seconds} seconds before trying again.`);
  try{
   const result=await operation();
   attempts=0;deadline=0;await save();
   return result;
  }
  catch(error){
   if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(error.code)){
    attempts+=1;
    if(attempts>=ATTEMPT_LIMIT){
     deadline=Date.now()+COOLDOWN_SECONDS*1000;
     await save();
     throw new Error(`Email or password is incorrect. Sign-in is paused for ${COOLDOWN_SECONDS} seconds after ${ATTEMPT_LIMIT} consecutive failed attempts.`);
    }
    await save();
    throw new Error(`Email or password is incorrect. ${ATTEMPT_LIMIT-attempts} attempts remaining.`);
   }
   throw error;
  }
 }finally{busy=false;}
}
