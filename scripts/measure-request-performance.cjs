// Local fixtures only. Baseline is the original app/header source in HEAD.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),Module=require('node:module');
const assert=require('node:assert/strict'),babel=require('@babel/core'),React=require('react'),{act,create}=require('react-test-renderer');
const request=require('../backend/node_modules/supertest'),{loadUI}=require('../tests/helpers/load-ui.cjs');
const root=path.resolve(__dirname,'..');process.chdir(root);global.IS_REACT_ACT_ENVIRONMENT=true;
const original=file=>execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8',windowsHide:true});
function baselineApp(){const file=path.join(root,'backend','baseline-fixture.cjs'),mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(original('backend/app.cjs'),file);return mod.exports.createApp;}
async function httpScenario(factory,scenario){
 const services={marketplace:async()=>({ok:true}),profilePhotos:async()=>({url:null})};
 const app=factory({auth:{verifyIdToken:async uid=>({uid})},services,metricsLogger:()=>{}}),latencies=[],statuses={};
 for(const [uid,route,op] of scenario){const start=performance.now();const response=await request(app).post('/api/'+route).set('Authorization','Bearer '+uid).send({op});latencies.push(performance.now()-start);statuses[response.status]=(statuses[response.status]||0)+1;}
 latencies.sort((a,b)=>a-b);return {requests:scenario.length,statuses,p50Ms:+latencies[Math.floor(latencies.length*.5)].toFixed(2),p95Ms:+latencies[Math.floor(latencies.length*.95)].toFixed(2)};
}
async function badges(before){
 let calls=0;const timers=[];
 const page=(cursor,kind)=>{calls++;const index=cursor?Number(cursor):0;return {items:Array.from({length:20},(_,i)=>({id:String(index+i),unreadCount:1,readAt:null})),cursor:index+20<100?String(index+20):null};};
 const mocks={react:React,'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}},
  '../../customer/components/CustomerUI':{CustomerPressable:'Pressable',useCustomerExperience:()=>false},'@expo/vector-icons':{Ionicons:'Icon'},'@react-navigation/native':{useIsFocused:()=>true},
  '../../auth/context/AuthContext':{useAuth:()=>({user:{uid:'owner'},offline:false})},'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:{}})},
  '../services/messageApi':{messageApi:async(op,data)=>{if(op==='summary'){calls++;return {unreadCount:100};}return page(data.cursor,'messages');}},
  '../services/marketApi':{marketApi:async(op,data)=>{if(op==='notificationSummary'){calls++;return {unreadCount:100};}return page(data.cursor,'notifications');}}};
 function component(file){const source=before?original(file):fs.readFileSync(file,'utf8'),mod={exports:{}};
  const {code}=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-react-jsx'),require.resolve('@babel/plugin-transform-modules-commonjs')]});
  new Function('require','module','exports',code)(name=>{assert.ok(mocks[name],name);return mocks[name];},mod,mod.exports);return mod.exports.default;}
 const interval=global.setInterval,clear=global.clearInterval;global.setInterval=(fn,ms)=>{const timer={fn,ms};timers.push(timer);return timer;};global.clearInterval=()=>{};
 let trees=[];
 try{
  for(const name of ['MessagesHeaderButton','NotificationsHeaderButton'])await act(async()=>{trees.push(create(React.createElement(component(`src/features/marketplace/components/${name}.js`),{navigation:{navigate(){}}})));});
  for(let elapsed=15000;elapsed<60000;elapsed+=15000)for(const timer of timers)if(elapsed%timer.ms===0)await act(async()=>timer.fn());
  return {historyRowsPerType:100,seconds:60,apiRequests:calls};
 }finally{for(const tree of trees)await act(async()=>tree.unmount());global.setInterval=interval;global.clearInterval=clear;}
}
async function navigation(){
 const {createReadCoordinator}=loadUI('src/shared/services/readCoordinator.js'),session={uid:'owner'},read=createReadCoordinator(()=>session);let after=0;
 for(let visit=0;visit<10;visit++)for(const page of ['vehicles','requests','bookings','shops','posts'])await read(page,async()=>{after++;return {items:[]};});
 let burst=0;await Promise.all(Array.from({length:20},()=>read('same-page',async()=>{burst++;await new Promise(resolve=>setImmediate(resolve));return {};})));
 return {rapidNavigation:{visits:10,distinctPages:5,before:50,after},simultaneousSamePage:{before:20,after:burst}};
}
async function main(){
 const before=baselineApp(),after=require('../backend/app.cjs').createApp;
 const mixed=[...Array.from({length:25},()=>['owner','marketplace','vehicles']),...Array.from({length:40},()=>['owner','profile/photos','view']),...Array.from({length:5},()=>['owner','marketplace','vehicleSave'])];
 const shared=Array.from({length:46},()=>[['owner','marketplace','vehicles'],['shop','marketplace','requests']]).flat();
 const result={fixtureOnly:true,baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),mixedJourney:{before:await httpScenario(before,mixed),after:await httpScenario(after,mixed)},twoUsersOneIP:{before:await httpScenario(before,shared),after:await httpScenario(after,shared)},badges:{before:await badges(true),after:await badges(false)},...await navigation()};
 assert.equal(result.mixedJourney.after.statuses[429]||0,0);assert.equal(result.twoUsersOneIP.after.statuses[429]||0,0);
 assert.equal(result.badges.before.apiRequests,40);assert.equal(result.badges.after.apiRequests,4);
 fs.mkdirSync('docs/performance',{recursive:true});fs.writeFileSync('docs/performance/local-measurements.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
