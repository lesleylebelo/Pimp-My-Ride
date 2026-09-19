import AsyncStorage from '@react-native-async-storage/async-storage';
const KEY='@pmr/login-cooldown/v1';
let deadline=0,busy=false;
export async function cooldownRemaining(){
 const raw=await AsyncStorage.getItem(KEY);
 const saved=Number(raw);if(Number.isFinite(saved))deadline=Math.max(deadline,saved);
 return Math.max(0,Math.ceil((deadline-Date.now())/1000));
}
export async function guardedLogin(operation){
 if(busy)throw new Error('A sign-in attempt is already in progress.');
 busy=true;
 try{
  const seconds=await cooldownRemaining();
  if(seconds)throw new Error(`Please wait ${seconds} seconds before trying again.`);
  try{return await operation();}
  catch(error){
   if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/too-many-requests'].includes(error.code)){
    deadline=Date.now()+60000;
    await AsyncStorage.setItem(KEY,String(deadline));
   }
   throw error;
  }
 }finally{busy=false;}
}
