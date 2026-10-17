const {randomBytes}=require('node:crypto');
async function seedDemo({auth,db}){
 if(db.projectId!=='demo-pmr-security'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Synthetic loopback emulators required for seeding.');
 const password='Demo-'+randomBytes(12).toString('hex');
 for(const [uid,role]of [['demo-owner','owner'],['demo-shop','shop']]){
  let created=false;try{await auth.getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;created=true;await auth.createUser({uid,email:uid+'@example.invalid',password,emailVerified:true});}
  if(created){await db.doc('users/'+uid).create({role,accountStatus:'active',fullName:'Synthetic '+role,email:uid+'@example.invalid',phone:'0000000000',...(role==='shop'?{verificationStatus:'approved',shop:{shopName:'Synthetic Demo Garage',city:'Johannesburg',province:'Gauteng',services:'Body kit'}}:{city:'Johannesburg'})});console.log('Synthetic emulator account: '+uid+'@example.invalid password: '+password);}
 }
 const category=db.doc('serviceCategories/demo-body');if(!(await category.get()).exists)await category.create({name:'Body kit',description:'Synthetic local demo',archived:false});
}
module.exports={seedDemo};
