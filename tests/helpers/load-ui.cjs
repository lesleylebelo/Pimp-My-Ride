const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core'),React=require('react');
function loadUI(file,mocks={}) {
 const native=Object.fromEntries(['View','Text','Pressable','TextInput','ScrollView','ActivityIndicator','Image'].map(n=>[n,n]));
 native.StyleSheet={create:v=>v};native.Modal=({visible,children})=>visible?React.createElement('Modal',null,children):null;
 const cache={};
 function load(f){f=path.resolve(f);if(cache[f])return cache[f].exports;
 const mod={exports:{}};cache[f]=mod;
 const {code}=babel.transformSync(fs.readFileSync(f,'utf8'),{configFile:false,babelrc:false,plugins:[[require.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],require.resolve('@babel/plugin-transform-modules-commonjs')]});
 new Function('require','module','exports',code)(name=>{if(Object.hasOwn(mocks,name))return mocks[name];if(name==='react-native')return native;if(name==='@expo/vector-icons')return {Ionicons:'Icon',MaterialCommunityIcons:'Icon'};if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};if(name.startsWith('.'))return load(path.resolve(path.dirname(f),name+'.js'));return require(name);},mod,mod.exports);return mod.exports;}
 return load(file);
}
module.exports={loadUI};
