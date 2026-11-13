import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [artifactDir,inventoryFile]=process.argv.slice(2);
assert(artifactDir&&inventoryFile,'Usage: node verify-pages-artifact.mjs <artifact-root> <reviewed-inventory>');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inventoryBytes=fs.readFileSync(inventoryFile);
const expectedInventory='a77626d3f5353b268b7e583783f707ac3bcf85c4941064b7509f87919a10e9f2';
assert.equal(sha(inventoryBytes),expectedInventory,'Approved inventory SHA-256');
const inventory=JSON.parse(inventoryBytes);
const root=path.resolve(artifactDir);
assert(fs.lstatSync(root).isDirectory(),'Artifact root must be a regular directory');
assert.equal(inventory.repository,'jiashiang-dev/mori-space-v2');
assert.equal(inventory.origin,'https://jiashiang-dev.github.io');
assert.equal(inventory.basePath,'/mori-space-v2/');
assert.equal(inventory.entry,'index.html');
const expectedTree='d300e34ff6fd9668a2b5ce6a3e6d5e4bf453929c0e3b942b174661901f093113';
function scan(dir){
  const files=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    const relative=path.relative(root,full).split(path.sep).join('/');
    assert(!entry.name.startsWith('.'),'Hidden path outside publish inventory '+relative);
    if(entry.isDirectory()){
      const children=scan(full);
      assert(children.length>0,'Unexpected empty directory '+relative);
      files.push(...children);
      continue;
    }
    assert(entry.isFile(),'Nonregular artifact entry '+relative);
    const st=fs.lstatSync(full);
    assert.equal(st.nlink,1,'Unexpected hard link '+relative);
    const bytes=fs.readFileSync(full);
    files.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
  }
  return files;
}
const actual=scan(root).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
assert.equal(actual.length,36,'Artifact file count');
assert.deepEqual(actual,inventory.files,'Exact relative paths, sizes and SHA-256');
assert.equal(actual.reduce((n,f)=>n+f.bytes,0),34658049,'Artifact total bytes');
const digest=sha(actual.map(f=>f.path+'\t'+f.bytes+'\t'+f.sha256+'\n').join(''));
assert.equal(digest,expectedTree,'Artifact tree SHA-256');
assert.equal(digest,inventory.treeSha256);
console.log(JSON.stringify({status:'PASS',files:actual.length,treeSha256:digest,inventorySha256:expectedInventory}));

