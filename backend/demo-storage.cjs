const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
// Deterministic synthetic swatch, with valid PNG chunks (no personal media).
function chunk(name,data){const type=Buffer.from(name),payload=Buffer.concat([type,data]);let crc=0xffffffff;for(const byte of payload){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([head,payload,tail]);}
const header=Buffer.alloc(13);header.writeUInt32BE(16,0);header.writeUInt32BE(16,4);header[8]=8;header[9]=6;
const pixels=Buffer.alloc(16*65);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const at=y*65+1+x*4;pixels[at]=40;pixels[at+1]=(x+y)%2?120:180;pixels[at+2]=220;pixels[at+3]=255;}
const FIXTURE=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
function createDemoStorage({origin}){
 if(!/^http:\/\/(?:127\.0\.0\.1|10\.[\d.]+|192\.168\.[\d.]+|172\.(?:1[6-9]|2\d|3[01])\.[\d.]+):3000$/.test(origin))throw Error('Local storage origin required.');
 const secret=randomBytes(32),objects=new Map();
 const patterns={verification:/^verification\/[A-Za-z0-9_-]+\/(cipcCert|proofOfAddress|ownerId)\/[a-f0-9-]+$/,photos:/^photos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}$/,requests:/^requests\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}$/,posts:/^posts\/[A-Za-z0-9_-]+\/[a-f0-9-]{36}$/};
 const check=(scope,path)=>{if(!patterns[scope]?.test(path)||path.includes('..'))throw Error('Invalid synthetic object path.');};
 const mac=(scope,path,expires)=>createHmac('sha256',secret).update(scope+'\n'+path+'\n'+expires).digest('hex');
 const key=(scope,path)=>scope+':'+path;
 function adapter(scope){return {
  async upload(path,buffer,contentType){check(scope,path);if(contentType!=='image/png'||!Buffer.from(buffer).equals(FIXTURE))throw Error('Demo storage accepts only the synthetic fixture.');if(objects.has(key(scope,path)))throw Error('Immutable demo object already exists.');objects.set(key(scope,path),Buffer.from(buffer));},
  async inspect(path){check(scope,path);const buffer=objects.get(key(scope,path));if(!buffer)throw Error('Synthetic object not found.');return {size:buffer.length,contentType:'image/png'};},
  ...(scope==='posts'?{publicUrl(path){check(scope,path);return origin+'/__demo/media/posts?path='+encodeURIComponent(path);}}:{async signedUrl(path){check(scope,path);if(!objects.has(key(scope,path)))throw Error('Synthetic object not found.');const expires=Date.now()+60000;return origin+'/__demo/media/'+scope+'?path='+encodeURIComponent(path)+'&expires='+expires+'&signature='+mac(scope,path,expires);},async remove(path){check(scope,path);objects.delete(key(scope,path));}})
 };}
 function read(scope,path,expires,signature){check(scope,path);if(scope!=='posts'){if(!/^\d+$/.test(String(expires))||Number(expires)<Date.now()||Number(expires)>Date.now()+60000)throw Error('Expired synthetic link.');const expected=mac(scope,path,expires),given=String(signature||'');if(given.length!==expected.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(given)))throw Error('Invalid synthetic link.');}const value=objects.get(key(scope,path));if(!value)throw Error('Synthetic object not found.');return value;}
 return {storage:adapter('verification'),photoStorage:adapter('photos'),requestStorage:adapter('requests'),postStorage:adapter('posts'),read,fixture:FIXTURE};
}
module.exports={createDemoStorage,FIXTURE};
