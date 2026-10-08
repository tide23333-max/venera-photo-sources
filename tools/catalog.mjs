// No dependencies. Default operation is read-only validation.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const remote='https://github.com/tide23333-max/venera-photo-sources.git';
export const rawBase='https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/';
export const definitions=[
 ['4khd.js','photo_deck_4khd'],['girlstop.js','photo_deck_girlstop'],['geinou_nude.js','photo_deck_geinou_nude'],
 ['DANRYOKU.js','photo_deck_danryoku'],['everia_club.js','photo_deck_everia_club'],['v2ph.js','photo_deck_v2ph'],
 ['aitoda.js','photo_deck_aitoda'],['gravurelab.js','photo_deck_gravurelab'],['idol_area.js','photo_deck_idol_area'],['gravia.js','photo_deck_gravia']
];
export const allowed=[...definitions.map(([file])=>'scripts/'+file),'index.json','README.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','.gitignore','docs/维护交接.md','docs/测试状态.md','tools/catalog.mjs','tools/publish.mjs','tools/catalog.test.mjs'];
export const fail=message=>{throw new Error(message)};
export const git=(args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trimEnd();
export function scan(text,label){
 const patterns=[/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)\b/,
  /[A-Za-z]:[\\/]Users[\\/][^\s"']+/i,/(?:password|authorization|cookie)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i];
 if(patterns.some(p=>p.test(text)))fail(label+': potential private data; review locally before publication (value not printed).');
}
export function metadata(text,file){
 scan(text,file);new vm.Script(text,{filename:file});
 const value=field=>{const matches=[...text.matchAll(new RegExp('^\\s*'+field+'\\s*=\\s*"([^"\\r\\n]*)"','gm'))];if(matches.length!==1)fail(file+': metadata '+field+' must be one explicit class field');return matches[0][1]};
 const m={name:value('name'),key:value('key'),version:value('version'),url:value('url'),minAppVersion:value('minAppVersion')};
 if(!m.name||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(m.key)||!/^\d+\.\d+\.\d+$/.test(m.version)||m.minAppVersion!=='1.17.0')fail(file+': invalid metadata');
 if(m.url!==rawBase+'scripts/'+file)fail(file+': invalid download URL');
 if(/this\.url\b/.test(text))fail(file+': website requests must not use source download URL');
 return m;
}
export function catalog(directory=path.join(root,'scripts')){
 const entries=definitions.map(([file,key])=>{
  const text=fs.readFileSync(path.join(directory,file),'utf8'),m=metadata(text,file);
  if(m.key!==key)fail(file+': source identity changed');
  return {name:m.name,key,version:m.version,fileName:'scripts/'+file,description:file==='v2ph.js'?'现用阅读实现；仅发布地址迁移，登录环境回归待确认':'个人写真源；解析测试与客户端实测状态详见仓库文档'};
 });
 if(new Set(entries.map(x=>x.key)).size!==definitions.length)fail('Duplicate source key');return entries;
}
export function compareVersion(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}return 0}
export function validateChanges(dir){
 for(const [file] of definitions){
  const incoming=fs.readFileSync(path.join(dir,file),'utf8'),m=metadata(incoming,file);let previous;
  try{previous=git(['show','HEAD:scripts/'+file])}catch{continue}
  if(incoming.replace(/\r\n/g,'\n').trimEnd()!==previous.replace(/\r\n/g,'\n').trimEnd()){
   const old=metadata(previous,file);if(compareVersion(m.version,old.version)<=0)fail(file+': changed script must increase version');
  }
 }
}
export function check(){
 const expected=catalog(),actual=JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8'));
 if(JSON.stringify(actual)!==JSON.stringify(expected))fail('index.json does not match scripts; explicitly run --prepare after review');
 for(const name of allowed){const text=fs.readFileSync(path.join(root,name),'utf8');scan(text,name)}
 // Staged/tracked publication files must also respect the allowlist.
 let tracked=[];try{tracked=git(['ls-files','-z']).split('\0').filter(Boolean)}catch{}
 for(const file of tracked)if(!allowed.includes(file))fail('Unapproved tracked file: '+file);
 console.log('PASS: 10 scripts, identities, versions, download URLs, manifest and privacy checks.');return expected;
}
export function prepare(dir){
 const entries=catalog(dir);validateChanges(dir);
 const incoming=definitions.map(([file])=>[file,fs.readFileSync(path.join(dir,file),'utf8')]);
 // Validate the complete batch before writing any generated publication copies.
 for(const [file,text] of incoming)fs.writeFileSync(path.join(root,'scripts',file),text,'utf8');
 fs.writeFileSync(path.join(root,'index.json'),JSON.stringify(entries,null,2)+'\n','utf8');
 console.log('Prepared explicit publication copies; nothing was committed or pushed.');check();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(!args.length||args[0]==='--check')check();
 else if(args[0]==='--prepare'){prepare(args[1]?path.resolve(args[1]):path.resolve(root,'..','网站解析源'))}
 else fail('Usage: node tools/catalog.mjs [--check | --prepare [source-directory]]');
 }catch(e){console.error(e.message);process.exitCode=1}
}
