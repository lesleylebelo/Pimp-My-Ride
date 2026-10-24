// Deterministic derivatives of the editable vector; no generative image service.
// Tooling setup: npm install --prefix .local-checks/branding-tools @resvg/resvg-js
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Resvg}=require('../.local-checks/branding-tools/node_modules/@resvg/resvg-js');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'assets/branding');
const source=fs.readFileSync(path.join(directory,'pimpmyride-logo.svg'),'utf8');
const shapes=source.slice(source.indexOf('  <path'),source.lastIndexOf('</svg>'));
function render(name,size,{scale=1,background=false,monochrome=false,plate=false}={}){
 const art=monochrome?shapes.replace(/fill="#FFFFFF"/g,'fill="#FFFFFF"').replace(/fill="#(?:1C1C1F|C4E052)"/g,'fill="#000000"'):shapes;
 // White negative space in the roofline becomes a hole in the monochrome mask.
 const mask=monochrome?`<mask id="silhouette"><rect width="1024" height="1024" fill="black"/>${shapes.replace(/fill="#(?:1C1C1F|C4E052)"/g,'fill="white"').replace(/fill="#FFFFFF"/g,'fill="black"')}</mask><rect width="1024" height="1024" fill="black" mask="url(#silhouette)"/>`:art;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${background?'<rect width="1024" height="1024" fill="white"/>':''}${plate?'<rect x="72" y="72" width="880" height="880" rx="180" fill="white"/>':''}<g transform="translate(${512*(1-scale)} ${512*(1-scale)}) scale(${scale})">${mask}</g></svg>`;
 const rendered=new Resvg(svg).render().asPng();
 const buffer=background?PNG.sync.write(PNG.sync.read(rendered),{colorType:2,inputColorType:6}):rendered;fs.writeFileSync(path.join(directory,name),buffer);
 return {file:name,width:size,height:size,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};
}
const files=[
 render('pimpmyride-logo.png',1024),
 render('app-icon.png',1024,{background:true}),
 // All artwork lies within a centred 66/108 circular adaptive safe zone.
 render('adaptive-foreground.png',1024,{scale:0.58}),
 render('adaptive-monochrome.png',1024,{scale:0.58,monochrome:true}),
 render('splash-logo.png',1024,{scale:0.9,plate:true}),
 render('favicon.png',64,{background:true}),
];
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({recreated:true,pixelIdenticalToReference:false,palette:{lime:'#C4E052',charcoal:'#1C1C1F'},source:'pimpmyride-logo.svg',files},null,2)+'\n');
console.log('Rendered '+files.length+' branding assets.');
