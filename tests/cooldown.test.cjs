const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs'),babel=require('@babel/core');
function setup(store=new Map(),clock={now:100000}){
 const code=babel.transformSync(fs.readFileSync('src/features/auth/services/loginCooldown.js','utf8'),{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};new Function('require','module','exports','Date',code)(()=>({getItem:async k=>store.get(k)||null,setItem:async(k,v)=>store.set(k,v)}),mod,mod.exports,{now:()=>clock.now});return {...mod.exports,store,clock};
}
test('incorrect credentials block every attempt for 60 seconds including after reload',async()=>{
 const s=setup();let called=0;await assert.rejects(()=>s.guardedLogin(async()=>{throw Object.assign(new Error('bad'),{code:'auth/invalid-credential'});}));
 assert.equal(await s.cooldownRemaining(),60);
 const restarted=setup(s.store,s.clock);
 await assert.rejects(()=>restarted.guardedLogin(async()=>called++),/60 seconds/);assert.equal(called,0);
 s.clock.now+=59001;assert.equal(await restarted.cooldownRemaining(),1);
 s.clock.now+=999;await restarted.guardedLogin(async()=>called++);assert.equal(called,1);
});
test('network failure does not penalize a user and concurrent login is blocked',async()=>{
 const s=setup();await assert.rejects(()=>s.guardedLogin(async()=>{throw Object.assign(new Error('network'),{code:'auth/network-request-failed'});}));assert.equal(await s.cooldownRemaining(),0);
 let release;const first=s.guardedLogin(()=>new Promise(resolve=>{release=resolve;}));await new Promise(r=>setImmediate(r));await assert.rejects(()=>s.guardedLogin(async()=>{}),/already in progress/);release();await first;
});
