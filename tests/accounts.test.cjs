const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),babel=require('@babel/core');
function setup(profile,claims={}) {
 const calls=[];const user={uid:'u1',email:'demo@example.com'};const instance={auth:{currentUser:user},db:{},storage:{}};
 const mocks={
 'firebase/auth':{
  signInWithEmailAndPassword:async(_,email)=>{calls.push(['login',email]);return {user};},
  signOut:async()=>calls.push(['logout']),getIdTokenResult:async()=>({claims}),
  createUserWithEmailAndPassword:async()=>calls.push(['create']),sendEmailVerification:async()=>calls.push(['verify'])},
 'firebase/firestore':{doc:(...args)=>args,getDoc:async()=>({exists:()=>!!profile,data:()=>profile}),setDoc:async(_,data)=>calls.push(['profile',data]),serverTimestamp:()=> 'SERVER_TIMESTAMP'},
 'firebase/storage':{ref:()=>{},uploadBytes:async()=>calls.push(['upload'])},
 './firebase':{firebase:()=>instance},'../utils/registration':{DOCUMENT_KEYS:['cipcCert','proofOfAddress','ownerId'],fileError:()=> 'Choose a document.'}
 };
 const code=babel.transformSync(fs.readFileSync(path.resolve(__dirname,'../src/services/accounts.js'),'utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports',code)(name=>{if(!mocks[name])throw Error(name);return mocks[name];},mod,mod.exports);
 return {...mod.exports,calls};
}
test('owner and shop use the matching stored role',async()=>{for(const role of ['owner','shop']){const s=setup({role});assert.equal((await s.login(' demo@example.com ','password',role)).uid,'u1');assert.equal(s.calls[0][1],'demo@example.com');}});
test('wrong role signs back out before returning an error',async()=>{const s=setup({role:'shop'});await assert.rejects(()=>s.login('demo@example.com','password','owner'),/different role/);assert.ok(s.calls.some(c=>c[0]==='logout'));});
test('admin requires both profile role and trusted claim',async()=>{const denied=setup({role:'admin'});await assert.rejects(()=>denied.login('demo@example.com','password','admin'),/administrator access/);assert.ok(denied.calls.some(c=>c[0]==='logout'));const allowed=setup({role:'admin'},{admin:true});assert.equal((await allowed.login('demo@example.com','password','admin')).uid,'u1');});
test('admin self-registration is rejected before account creation',async()=>{const s=setup(null);await assert.rejects(()=>s.register({},'admin'),/cannot register/);assert.equal(s.calls.length,0);});
test('new owner profile excludes passwords and records consent timestamps',async()=>{const s=setup(null);await s.register({fullName:' Demo ',phone:'0821234567',email:'demo@example.com',password:'secret'},'owner');const data=s.calls.find(c=>c[0]==='profile')[1];assert.equal(data.fullName,'Demo');assert.equal(data.role,'owner');assert.equal(data.termsAcceptedAt,'SERVER_TIMESTAMP');assert.equal(data.password,undefined);assert.ok(s.calls.some(c=>c[0]==='verify'));});
test('incomplete ordinary accounts can finish profile; missing admin profiles rejected',async()=>{const s=setup(null);assert.equal((await s.login('demo@example.com','password','owner')).uid,'u1');await assert.rejects(()=>s.login('demo@example.com','password','admin'),/profile is missing/);});
test('invalid document set cannot trigger uploads',async()=>{const s=setup({role:'shop'});await assert.rejects(()=>s.uploadDocuments({}),/Choose a document/);assert.ok(!s.calls.some(c=>c[0]==='upload'));});
