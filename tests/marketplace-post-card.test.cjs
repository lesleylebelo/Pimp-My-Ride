const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const Renderer=require('react-test-renderer');
const {loadUI}=require('./helpers/load-ui.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const {act}=Renderer;
const {PostCard}=loadUI('src/features/marketplace/components/PostCard.js',{
 '../../../shared/components/landing/LandingUI':{LandingText:'Text'},
 './MarketplaceUI':{Card:({children,...props})=>React.createElement('View',props,children),Button:'Button'},
 '../services/postsApi':{postsApi:async()=>{}},
 '../../auth/context/AuthContext':{useAuth:()=>({user:null,offline:false})},
});

async function renderVehicle(vehicle,includeVehicle=true){
 const post={id:'showcase-1',type:'showcase',category:'Tuning',title:'Corolla build',description:'Custom wheels',images:[],...(includeVehicle?{vehicle}:{})};
 let tree;
 await act(async()=>{tree=Renderer.create(React.createElement(PostCard,{post}));});
 const vehicleText=tree.root.findAllByType('Text').find(node=>node.props.style?.fontSize===13&&!node.props.style?.fontWeight)?.props.children;
 await act(async()=>tree.unmount());
 return vehicleText;
}

test('showcase card formats the object vehicle returned by the API as readable text',async()=>{
 assert.equal(await renderVehicle({make:'Toyota',model:'Corolla',year:2020}),'2020 Toyota Corolla');
});

test('showcase card keeps historical string vehicle values readable',async()=>{
 assert.equal(await renderVehicle('2020 Toyota Corolla'),'2020 Toyota Corolla');
});

test('showcase card safely omits absent, empty, and malformed vehicle values',async()=>{
 for(const vehicle of [null,undefined,'','   ',[],42,{},{year:{value:2020},make:false,model:['Corolla']} ]){
  assert.equal(await renderVehicle(vehicle),undefined);
 }
 assert.equal(await renderVehicle({year:'2021',make:' Honda ',model:'Civic'}),'2021 Honda Civic');
 assert.equal(await renderVehicle(undefined,false),undefined);
});
