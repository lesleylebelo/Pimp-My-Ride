const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core'),React=require('react');
function loadUI(file,mocks={}) {
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image'].map(n=>[n,n]));
 native.StyleSheet={create:v=>v};native.Modal=({visible,children})=>visible?React.createElement('Modal',null,children):null;
 native.AppState={currentState:'active',addEventListener:()=>({remove(){}})};
 const cache={};
 const expoStubs={
   '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
   '@react-native-community/netinfo': { addEventListener: () => () => {}, fetch: async () => ({isConnected: true}) },
   'expo-image-manipulator': { manipulateAsync: async (...args) => ({uri: args[0], width: 1200, height: 900, fileSize: 1024}), SaveFormat: {JPEG: 'jpeg'} },
   'expo-image-picker': { launchImageLibraryAsync: async () => ({canceled: true, assets: []}), MediaTypeOptions: {Images: 'Images'} },
   'expo-document-picker': { getDocumentAsync: async () => ({canceled: true}) },
   'expo-font': { useFonts: () => [true], loadAsync: async () => true },
   'expo-secure-store': { getItemAsync: async () => null, setItemAsync: async () => undefined, deleteItemAsync: async () => undefined },
   'expo-status-bar': { StatusBar: () => null },
   'expo-web-browser': { openBrowserAsync: async () => ({type: 'success'}), warmUpAsync: async () => undefined, coolDownAsync: async () => undefined },
 };
 function load(f){f=path.resolve(f);if(cache[f])return cache[f].exports;
 const mod={exports:{}};cache[f]=mod;
 const {code}=babel.transformSync(fs.readFileSync(f,'utf8'),{configFile:false,babelrc:false,plugins:[[require.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require.resolve('@babel/plugin-transform-modules-commonjs')]});
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];const matched=Object.keys(expoStubs).find(prefix=>name===prefix||name.startsWith(prefix+'/'));if(matched)return expoStubs[matched];if(name==='react-native')return native;if(name==='@expo/vector-icons')return {Ionicons:'Icon',MaterialCommunityIcons:'Icon'};if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};if(name.startsWith('.'))return load(path.resolve(path.dirname(f),name+'.js'));return require(name);},mod,mod.exports);return mod.exports;}
 return load(file);
}
module.exports={loadUI};
