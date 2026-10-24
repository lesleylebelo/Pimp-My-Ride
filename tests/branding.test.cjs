const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PNG}=require('pngjs'),React=require('react'),{create,act}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.resolve(__dirname,'..'),directory=path.join(root,'assets/branding'),config=require('../app.json').expo;
test('branding derivatives have valid dimensions, opaque store icon and circular adaptive safe area',()=>{
 const manifest=require('../assets/branding/manifest.json');assert.equal(manifest.recreated,true);assert.equal(manifest.pixelIdenticalToReference,false);
 for(const asset of manifest.files){const buffer=fs.readFileSync(path.join(directory,asset.file)),png=PNG.sync.read(buffer);assert.equal(png.width,asset.width);assert.equal(png.height,asset.height);assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),asset.sha256);
  if(asset.file==='app-icon.png'){assert.equal(buffer[25],2);assert.ok(png.data.every((value,index)=>index%4!==3||value===255));}
  if(asset.file.startsWith('adaptive-')){let marked=0;for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){const index=(y*png.width+x)*4;if(png.data[index+3]){marked++;assert.ok(Math.hypot(x-511.5,y-511.5)<1024*33/108,asset.file+' outside safe circle');}}assert.ok(marked>20000);}
 }
});
test('Expo uses the branding assets with one installed native splash plugin and preserves project identity',()=>{
 assert.equal(config.name,'PimpMyRide');assert.equal(config.slug,'pimpmyride');assert.equal(config.version,'1.0.0');
 const plugins=config.plugins.filter(p=>(Array.isArray(p)?p[0]:p)==='expo-splash-screen');assert.equal(plugins.length,1);assert.equal(plugins[0][1].backgroundColor,'#0B0B0D');assert.equal(plugins[0][1].resizeMode,'contain');assert.equal(plugins[0][1].imageWidth,200);
 for(const file of [config.icon,config.ios.icon,config.android.adaptiveIcon.foregroundImage,config.android.adaptiveIcon.monochromeImage,config.web.favicon,plugins[0][1].image])assert.ok(fs.existsSync(path.resolve(root,file)),file);
 assert.equal(config.android.adaptiveIcon.backgroundColor,'#FFFFFF');assert.ok(require('../package.json').dependencies['expo-splash-screen']);
});
test('the PR image has accessible identity, full aspect ratio and a light plate in both theme contexts',async()=>{
 const Logo=loadUI('src/shared/components/LogoMark.js').default;
 for(const variant of ['onDark','onLight']){let tree;await act(async()=>{tree=create(React.createElement(Logo,{size:96,variant}));});try{const plate=tree.root.findByType('View'),image=tree.root.findByType('Image');assert.match(plate.props.accessibilityLabel,/PimpMyRide PR/);assert.equal(plate.props.style.backgroundColor,'#FFFFFF');assert.equal(image.props.resizeMode,'contain');assert.equal(image.props.style.width,image.props.style.height);assert.equal(tree.root.findAllByType('Icon').length,0);}finally{await act(async()=>tree.unmount());}}
});
test('login and customer/workshop registration show branding without losing fields or role controls',async()=>{
 const {palettes}=loadUI('src/shared/theme/colors.js');
 for(const mode of ['light','dark'])for(const role of ['owner','shop']){
  const mocks={'../../../shared/theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},'../context/AuthContext':{useAuth:()=>({run:async fn=>fn(),offline:false})},'../services/accounts':{login:async()=>{},register:async()=>{}},'../hooks/useLoginCooldown':{useLoginCooldown:()=>({seconds:0})},'@react-navigation/native':{useFocusEffect(){}}};
  for(const [file,signup] of [['SignInScreen',false],['SignUpScreen',true]]){const Screen=loadUI('src/features/auth/screens/'+file+'.js',mocks).default;let tree;await act(async()=>{tree=create(React.createElement(Screen,{route:{params:{role}},navigation:{navigate(){},replace(){},goBack(){}}}));});try{const text=tree.root.findAllByType('Text').map(n=>[n.props.children].flat().join('')).join(' ');assert.match(text,/PimpMyRide/);assert.ok(text.includes('Connect. Customize. Drive your style.'));assert.ok(!text.includes('Your Ride. Your Way.'));assert.ok(!text.includes('Vehicle customisation, mechanical services, maintenance and repairs.'));if(!signup)assert.ok(text.includes('Sign in to your space'));assert.ok(tree.root.findAllByType('TextInput').length>=(signup?5:2));assert.equal(tree.root.findByType('SafeAreaView').props.style.backgroundColor,palettes[mode].background);assert.equal(tree.root.findByType('ScrollView').props.keyboardShouldPersistTaps,'handled');if(signup){assert.match(text,/Vehicle owner/);assert.match(text,/Workshop/);}}finally{await act(async()=>tree.unmount());}}
 }
});
