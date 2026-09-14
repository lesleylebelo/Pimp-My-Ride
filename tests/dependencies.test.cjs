const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
test('patched query decoder preserves URL parameters and handles malformed input promptly',()=>{
 const query=require('query-string');
 assert.equal(query.parse('q=body+kit').q,'body kit');
 assert.equal(query.parse('q=%E8%BB%8A').q,'車');
 assert.equal(query.stringify({role:'shop',city:'Cape Town'}),'city=Cape%20Town&role=shop');
 const input='%C2%41'.repeat(5000);const start=performance.now();
 assert.equal(typeof query.parse('q='+input).q,'string');assert.ok(performance.now()-start<2000);
});
test('patched xcode UUID dependency still produces native project identifiers',()=>{const project=require('xcode').project('unused.pbxproj');project.hash={project:{objects:{}}};assert.match(project.generateUuid(),/^[A-F0-9]{24}$/);});
