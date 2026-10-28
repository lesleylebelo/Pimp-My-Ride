const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core'),React=require('react');
function loadUI(file,mocks={}) {
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image'].map(n=>[n,n]));
 native.StyleSheet={create:v=>v};native.Modal=({visible,children})=>visible?React.createElement('Modal',null,children):null;
 // Exercise section render callbacks; native virtualization is verified on device.
 native.SectionList=({sections,renderItem,renderSectionHeader,ListHeaderComponent,ListEmptyComponent,ListFooterComponent,...props})=>React.createElement('SectionList',props,
  ListHeaderComponent,sections.length?sections.map(section=>React.createElement(React.Fragment,{key:section.key},renderSectionHeader({section}),section.data.map((item,index)=>React.createElement(React.Fragment,{key:item.id},renderItem({item,index,section}))))):ListEmptyComponent,ListFooterComponent);
 native.KeyboardAvoidingView='KeyboardAvoidingView';native.Platform={OS:'ios'};
 native.RefreshControl='RefreshControl';native.useWindowDimensions=()=>({width:390,height:844,fontScale:1,scale:1});
 native.Keyboard={dismiss(){}};
 native.FlatList=React.forwardRef(({data,renderItem,ListHeaderComponent,ListEmptyComponent,ListFooterComponent,...props},ref)=>{
  React.useImperativeHandle(ref,()=>({scrollToOffset(){},scrollToEnd(){}}));
  return React.createElement('FlatList',props,ListHeaderComponent,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id},renderItem({item,index}))):ListEmptyComponent,ListFooterComponent);
 });
 native.AppState={currentState:'active',addEventListener:()=>({remove(){}})};
 native.AccessibilityInfo={isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})};
 // Complete the timing calls synchronously; UI tests do not run a native driver.
 class AnimatedValue {
  constructor(value){this.value=value;}
  setValue(value){this.value=value;}
  interpolate(config){return {value:this,config};}
 }
 native.Animated={Value:AnimatedValue,View:'AnimatedView',timing:(value,config)=>({
  start(callback){value.setValue(config.toValue);callback?.({finished:true});},
  stop(){},
 })};
 // Screen-specific mocks override exports without losing the shared defaults.
 const defaultAppState=native.AppState;
 Object.assign(native,mocks['react-native']);
 if(!native.AppState.addEventListener)native.AppState.addEventListener=defaultAppState.addEventListener;
 const cache={};
 const resolvedMocks=Object.fromEntries(Object.entries(mocks).filter(([name])=>name.startsWith('.')).map(([name,value])=>[path.resolve(path.dirname(path.resolve(file)),name+'.js'),value]));
 const expoStubs={
   '@react-navigation/native': { useIsFocused: () => true, usePreventRemove: () => {} },
   '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
   '@react-native-community/netinfo': { addEventListener: () => () => {}, fetch: async () => ({isConnected: true}) },
   'expo-image-manipulator': { manipulateAsync: async (...args) => ({uri: args[0], width: 1200, height: 900, fileSize: 1024}), SaveFormat: {JPEG: 'jpeg'} },
   'expo-image-picker': { launchImageLibraryAsync: async () => ({canceled: true, assets: []}), MediaTypeOptions: {Images: 'Images'} },
   'expo-document-picker': { getDocumentAsync: async () => ({canceled: true}) },
   'expo-font': { useFonts: () => [true], loadAsync: async () => true },
   '@react-native-community/datetimepicker': {default: 'NativeDateTimePicker', __esModule: true, DateTimePickerAndroid: {open(){}, dismiss: async () => true}},
   'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined },
   'expo-status-bar': { StatusBar: () => null },
   'expo-splash-screen': {preventAutoHideAsync:async()=>true,hideAsync:async()=>{}},
   'expo-web-browser': { openBrowserAsync: async () => ({type: 'success'}), warmUpAsync: async () => undefined, coolDownAsync: async () => undefined },
 };
 function load(f){f=path.resolve(f);if(!fs.existsSync(f)&&f.endsWith('.js')){const base=f.slice(0,-3);f=[`${base}.${native.Platform.OS}.js`,...(native.Platform.OS==='web'?[]:[`${base}.native.js`]),f].find(fs.existsSync)||f;}if(/\.(png|jpg|jpeg|webp)$/.test(f)){if(!fs.existsSync(f))throw Error('Missing image asset: '+f);return f;}if(cache[f])return cache[f].exports;
 const mod={exports:{}};cache[f]=mod;
 const {code}=babel.transformSync(fs.readFileSync(f,'utf8'),{configFile:false,babelrc:false,plugins:[[require.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require.resolve('@babel/plugin-transform-modules-commonjs')]});
 new Function('require','module','exports',code)(name=>{if(name==='react-native')return native;if(Object.hasOwn(mocks,name))return mocks[name];const matched=Object.keys(expoStubs).find(prefix=>name===prefix||name.startsWith(prefix+'/'));if(matched)return expoStubs[matched];if(name==='@expo/vector-icons')return {Ionicons:'Icon',MaterialCommunityIcons:'Icon'};if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};if(name.startsWith('.')&&Object.hasOwn(resolvedMocks,path.resolve(path.dirname(f),name+'.js')))return resolvedMocks[path.resolve(path.dirname(f),name+'.js')];if(name.startsWith('.'))return load(path.resolve(path.dirname(f),/\.(png|jpg|jpeg|webp)$/.test(name)?name:name+'.js'));return require(name);},mod,mod.exports);return mod.exports;}
 return load(file);
}
module.exports={loadUI};
