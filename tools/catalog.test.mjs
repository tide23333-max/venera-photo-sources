import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {catalog,root,definitions,metadata,scan,compareVersion} from './catalog.mjs';
const entries=catalog();assert.equal(entries.length,10);assert.equal(new Set(entries.map(e=>e.key)).size,10);
for(const [file]of definitions){const text=fs.readFileSync(path.join(root,'scripts',file),'utf8');assert.equal(metadata(text,file).key,entries.find(e=>e.fileName==='scripts/'+file).key);assert.throws(()=>metadata(text.replace(/\bkey\s*=\s*"[^"]+"/,'key = ""'),file));}
assert.throws(()=>scan('ghp_'+'x'.repeat(30),'synthetic'));assert.throws(()=>scan(['192','168','1','1'].join('.'),'synthetic'));
assert.equal(compareVersion('0.3.29','0.3.27'),1);assert.equal(compareVersion('0.1.1','0.1.1'),0);assert.equal(compareVersion('0.1.0','0.1.1'),-1);
console.log('PASS: metadata and privacy rejection tests. No network requests or file mutations.');
