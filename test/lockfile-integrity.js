'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
assert.strictEqual(lock.version,pkg.version);
assert.strictEqual(lock.packages[''].version,pkg.version);
const mismatch=[];
for(const [name,item] of Object.entries(lock.packages)){
 if(!name||!item.resolved||!item.version)continue;
 const found=item.resolved.match(/-([0-9]+\.[0-9]+\.[0-9]+(?:-[^/]+)?)\.tgz(?:\?|$)/);
 if(found&&found[1]!==item.version)mismatch.push({name,actual:item.version,expected:found[1]});
}
assert.deepStrictEqual(mismatch,[]);
console.log('Package lock dependency tarball versions and application metadata match');
