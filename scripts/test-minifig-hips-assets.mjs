import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

const root=resolve(import.meta.dirname,'..'),original=await readFile(join(root,'lib/generated-assembly.json')),manifest=JSON.parse(original),entry=manifest.profiles['3815b'];
const bytes=await readFile(join(root,'public/catalog/assembly',entry.asset+'.bin')),profile=JSON.parse(gunzipSync(bytes)),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(profile.version,7);assert.equal(sha(bytes),entry.asset);
const temp=await mkdtemp(join(tmpdir(),'brickforge-hips-assets-'));
try{
 await writeFile(join(temp,entry.asset+'.bin'),bytes);
 const mutations=[
 p=>{p.connectors.find(c=>c.kind==='hip-stud').hip.length=12;},
 p=>{p.connectors.find(c=>c.kind==='hip-stud').hip.nominalRadius=5;},
 p=>{p.connectors.find(c=>c.kind==='hip-stud').normal=[0,1,1e-9];},
 p=>{p.connectors.find(c=>c.kind==='hip-stud').kind='pin';},
 p=>{p.connectors=p.connectors.map(c=>({...c,kind:'stud'}));},
 p=>{p.connectors.push(p.connectors.find(c=>c.kind==='hip-stud'));},
 p=>{p.connectors[0].heading=[0,1,0];},
 p=>{p.connectors[0].heading=p.connectors[1].heading;},
 p=>{p.connectors[0].point[0]+=.01;},
 p=>{p.connectors.pop();},
 p=>{p.connectors.find(c=>c.kind==='hip-stud').hip.contract='unchecked';},
 p=>{p.version=6;p.source='ldraw-minifig-neck-envelope-v1';},
 ];
 const ids=[];
 for(const [i,mutate] of mutations.entries()){
  const p=structuredClone(profile);mutate(p);const expanded=Buffer.from(JSON.stringify(p)),packed=gzipSync(expanded),asset=sha(packed),id='invalid-hips-fixture-'+i;
  await writeFile(join(temp,asset+'.bin'),packed);manifest.profiles[id]={...entry,asset,bytes:packed.length,expandedBytes:expanded.length};ids.push(id);
 }
 const source=`import assert from 'node:assert/strict';
import {prepareProfileAssets} from './server/profile-assets';
import {profile} from './lib/assembly';
const release=await prepareProfileAssets(['3815b'],process.argv[2]);
try{assert.equal(profile('3815b').connectors.filter(c=>c.kind==='hip-stud').length,2);for(const id of JSON.parse(process.argv[3]))await assert.rejects(prepareProfileAssets([id],process.argv[2]),/inválid|validada|validado/);console.log('PASS: twelve correctly hashed malformed v7 assets refused by the production loader.');}finally{release();}`;
 const outfile=join(temp,'loader-test.mjs');await build({stdin:{contents:source,resolveDir:root,loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'invalid-hips-fixtures',setup(b){b.onLoad({filter:/[\\/]lib[\\/]generated-assembly\.json$/},()=>({contents:JSON.stringify(manifest),loader:'json'}));}}]});
 const result=spawnSync(process.execPath,[outfile,temp,JSON.stringify(ids)],{cwd:root,encoding:'utf8',timeout:30000,windowsHide:true});assert.equal(result.status,0,result.error?.message||result.stderr+result.stdout);process.stdout.write(result.stdout);
 assert.deepEqual(await readFile(join(root,'lib/generated-assembly.json')),original);
}finally{
 if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith('brickforge-hips-assets-'))throw Error('Refusing cleanup outside the isolated pin-assets directory');
 await rm(temp,{recursive:true,force:true});
}
