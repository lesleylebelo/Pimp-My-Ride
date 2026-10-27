const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('transactional email transport and its server secrets stay outside the frontend source and Expo configuration',()=>{
 const root=path.resolve(__dirname,'..');
 const files=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.[cm]?[jt]sx?$/.test(p))files.push(p);}}
 walk(path.join(root,'src'));files.push(path.join(root,'app.json'),path.join(root,'App.js'));
 for(const file of files.filter(fs.existsSync))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/RESEND_API_KEY|PMR_EMAIL_DISPATCH_TOKEN|api\.resend\.com|transactional-email\.cjs/,file);
});
