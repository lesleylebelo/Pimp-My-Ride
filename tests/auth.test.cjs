const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const babel=require('@babel/core');
const path=require('node:path');
// Load the same dependency-free helpers used in the React Native screens.
function load(file){const src=fs.readFileSync(file,'utf8');const {code}=babel.transformSync(src,{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]});const mod={exports:{}};new Function('require','module','exports',code)(name=>load(path.resolve(path.dirname(file),name+'.js')),mod,mod.exports);return mod.exports;}
const {registrationErrors,fileError,accountStage}=load(path.resolve(__dirname,'../src/features/auth/utils/registration.js'));
const valid={fullName:'Demo Owner',email:'owner@example.com',phone:'0821234567',password:'Password1234',confirmPassword:'Password1234',agreed:true};
test('valid owner registration and international SA phone accepted',()=>{assert.deepEqual(registrationErrors(valid,'owner',1),{});assert.deepEqual(registrationErrors({...valid,phone:'+27 82 123 4567'},'owner',1),{});});
test('registration rejects blank fields, bad email/phone, weak or mismatched password and missing consent',()=>{const e=registrationErrors({fullName:' ',email:'bad',phone:'123',password:'a',confirmPassword:'b'},'owner',1);for(const key of ['fullName','email','phone','password','confirmPassword','agreed'])assert.ok(e[key]);});
test('shop details cannot skip required fields',()=>assert.equal(Object.keys(registrationErrors({},'shop',2)).length,6));
test('shop requires all three documents',()=>assert.equal(Object.keys(registrationErrors({},'shop',3)).length,3));
test('file validation blocks invalid MIME, unknown size, empty and oversized documents',()=>{const f={uri:'file:///demo.pdf',mimeType:'application/pdf',size:1};assert.equal(fileError(f),null);for(const change of [{mimeType:'application/javascript'},{size:undefined},{size:0},{size:5242881}])assert.ok(fileError({...f,...change}));});
test('all roles require verification',()=>{for(const role of ['owner','shop','admin'])assert.equal(accountStage({emailVerified:false},{role,verificationStatus:'approved'}),'verify');});
test('owner and admin verified sessions are ready',()=>{for(const role of ['owner','admin'])assert.equal(accountStage({emailVerified:true},{role}),'ready');});
test('shop approval gating fails closed for unknown state',()=>{for(const status of ['pending',undefined,'unexpected'])assert.equal(accountStage({emailVerified:true},{role:'shop',verificationStatus:status}),'pending');assert.equal(accountStage({emailVerified:true},{role:'shop',verificationStatus:'approved'}),'ready');assert.equal(accountStage({emailVerified:true},{role:'shop',verificationStatus:'rejected'}),'rejected');});
test('missing/unknown profiles cannot reach welcome state',()=>{assert.equal(accountStage({emailVerified:true},null),'incomplete');assert.equal(accountStage({emailVerified:true},{role:'root'}),'invalid');});
