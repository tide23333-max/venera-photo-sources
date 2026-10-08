// Default: check and preview. A human-authorized release uses --publish --message TEXT.
import fs from 'node:fs';
import path from 'node:path';
import { check,git,allowed,root,remote,fail,validateChanges } from './catalog.mjs';
try{
 check();validateChanges(path.join(root,'scripts'));
 if(git(['branch','--show-current'])!=='main')fail('Stop: expected main branch');
 if(git(['remote','get-url','origin'])!==remote||git(['remote','get-url','--push','origin'])!==remote)fail('Stop: unexpected fetch/push destination');
 const changes=git(['status','--porcelain=v1','-z','--untracked-files=all']).split('\0').filter(Boolean);
 for(const record of changes){const file=record.slice(3);if(!allowed.includes(file)||/R|C|D/.test(record.slice(0,2)))fail('Stop: unapproved change or removal: '+file)}
 let hasHead=true;try{git(['rev-parse','--verify','HEAD'])}catch{hasHead=false}
 console.log(hasHead?(git(['diff','--stat','HEAD'])||'No tracked content changes.'):'Initial publication: '+allowed.length+' explicitly allowed files.');
 const args=process.argv.slice(2);
 if(args.includes('--retry-push')){
  if(changes.length)fail('Retry requires a clean working tree');
  const approved=fs.readFileSync(path.join(root,'.git','venera-approved-release'),'utf8'),head=git(['rev-parse','HEAD']);
  if(approved!==head)fail('No locally recorded approved release at HEAD');
  const remoteTip=git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0];
  if(remoteTip===head)console.log('Already published '+head);
  else {let parent='';try{parent=git(['rev-parse','HEAD^'])}catch{}if(remoteTip&&remoteTip!==parent)fail('Remote changed; do not retry blindly');git(['push','-u','origin','main']);console.log('Published '+head)}
 }
 else if(!args.includes('--publish'))console.log('Preview only. No network writes, commit or push. Obtain human approval before --publish.');
 else{
  const i=args.indexOf('--message'),message=i<0?'':args[i+1];if(!message)fail('Provide --message with the approved release summary');
  const remoteTip=git(['ls-remote','origin','refs/heads/main']).split(/\s/)[0];
  let head='';try{head=git(['rev-parse','HEAD'])}catch{}
  if(remoteTip&&remoteTip!==head)fail('Remote main changed; stop and reconcile without force-push');
  if(!changes.length)fail('No local changes; do not repeat a possibly completed release');
  git(['add','--',...allowed]);git(['commit','-m',message]);
  fs.writeFileSync(path.join(root,'.git','venera-approved-release'),git(['rev-parse','HEAD']),'utf8');
  git(['push','-u','origin','main']);console.log('Published '+git(['rev-parse','HEAD']));
 }
}catch(e){console.error(e.message);process.exitCode=1}
