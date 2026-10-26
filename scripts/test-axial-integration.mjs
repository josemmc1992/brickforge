// Compile real, certified profiles into an isolated manifest. This exercises the
// production loader and assembly engine without publishing experimental parts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {createAxialEnvelopeCompiler} from './lib/axial-envelope.mjs';
import {buildGeneratedAxialProfile} from './lib/generated-axial-profile.mjs';

const root=resolve(import.meta.dirname,'..');
const ids=['30374','87994','3673','2780','4274'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await readFile(join(root,file),'utf8'));
const original=await readFile(join(root,'lib/generated-assembly.json'));
const manifest=JSON.parse(original);
const shadow=await json('lib/shadow-catalog.json');
const repository=createPackedGeometryRepository(root);
const compiler=createEnvelopeCompiler(repository);
const axialCompiler=createAxialEnvelopeCompiler(repository);
const packs=new Map();
const temp=await mkdtemp(join(tmpdir(),'brickforge-axial-integration-'));
try{
 const summaries=[];
 for(const partId of ids){
  const entry=shadow.parts[partId];assert.equal(entry?.coverage,'complete',partId);
  if(!packs.has(entry.pack)){
   const bytes=await readFile(join(root,'public/catalog/shadow',entry.pack+'.bin'));
   assert.equal(sha(bytes),shadow.packs[entry.pack].sha256,'Real metadata pack must pass its integrity check');
   packs.set(entry.pack,JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024})));
  }
  const result=buildGeneratedAxialProfile({partId,metadata:packs.get(entry.pack)[partId],envelope:compiler.compile(partId).asset,geometry:compiler.geometry(partId),axialCompiler,poseContract:'r4-through-centered-fixed-v1'});
  assert.equal(result.supported,true,JSON.stringify({partId,...result}));
  assert.equal(result.profile.version,2);assert.equal(result.profile.source,'ldraw-axial-envelope-v1');
  assert.ok(result.profile.connectors.every(connector=>connector.axial.contract==='r4-through-centered-fixed-v1'),'This regression fixture must preserve the original fixed contract');
  const expanded=Buffer.from(JSON.stringify(result.profile)+'\n');
  const bytes=gzipSync(expanded,{level:9});bytes[9]=255;
  const asset=sha(bytes);await writeFile(join(temp,asset+'.bin'),bytes);
  manifest.profiles[partId]={asset,bytes:bytes.length,expandedBytes:expanded.length,connectorCount:result.profile.connectors.length,family:'isolated-real-axial-fixture',connectionFamily:'axial-r4'};
  delete manifest.unavailable[partId];
  summaries.push({partId,solids:result.profile.solids.length,kind:result.profile.connectors[0].kind,length:result.profile.connectors[0].axial.length,sectionVertices:result.profile.connectors[0].axial.section.length});
 }
 manifest.summary.generatedPartCount=Object.keys(manifest.profiles).length;
 manifest.summary.totalSupported=manifest.summary.curatedPartCount+manifest.summary.generatedPartCount;
 const bundle=join(temp,'assembly-test.mjs');
 await build({entryPoints:[join(root,'scripts/test-axial-assembly.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',plugins:[{
  name:'isolated-axial-manifest',setup(build){
   build.onLoad({filter:/[\\/]lib[\\/]generated-assembly\.json$/},()=>({contents:JSON.stringify(manifest),loader:'json'}));
  },
 }]});
 const result=spawnSync(process.execPath,[bundle,temp,String(manifest.summary.totalSupported)],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
 assert.equal(result.status,0,result.error?.message||result.stderr+result.stdout);
 process.stdout.write(result.stdout);
 assert.deepEqual(await readFile(join(root,'lib/generated-assembly.json')),original,'The published manifest must remain untouched by this test');
 console.log('PASS: five real axial profiles compiled and loaded through a temporary manifest:',JSON.stringify(summaries));
}finally{
 if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith('brickforge-axial-integration-'))throw new Error('Refusing cleanup outside the isolated axial test directory');
 await rm(temp,{recursive:true,force:true});
}
