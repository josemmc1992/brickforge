// Exercise sliding with isolated copies of real, certified profile geometry.
// The published catalogue and its assets are never rewritten by this fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

const root=resolve(import.meta.dirname,'..');
const original=await readFile(join(root,'lib/generated-assembly.json'));
const manifest=JSON.parse(original),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=await mkdtemp(join(tmpdir(),'brickforge-axial-sliding-'));
try{
 for(const id of ['30374','4274','87994','3673']){
  const entry=manifest.profiles[id];assert.ok(entry,'The real certified profile must exist: '+id);
  const shipped=await readFile(join(root,'public/catalog/assembly',entry.asset+'.bin'));
  assert.equal(sha(shipped),entry.asset);
  const profile=JSON.parse(gunzipSync(shipped));
  assert.equal(profile.version,id==='3673'?5:2);assert.equal(profile.source,id==='3673'?'ldraw-technic-pin-envelope-v1':'ldraw-axial-envelope-v1');
  for(const c of profile.connectors.filter(c=>c.kind==='bar'||c.kind==='bar-socket')){
   c.axial.contract=['30374','4274'].includes(id)?'r4-through-sliding-v2':'r4-through-centered-fixed-v1';
   if(c.axial.contract==='r4-through-sliding-v2')c.axial.slide=true;else delete c.axial.slide;
  }
  const expanded=Buffer.from(JSON.stringify(profile)+'\n'),bytes=gzipSync(expanded,{level:9});bytes[9]=255;
  const asset=sha(bytes);await writeFile(join(temp,asset+'.bin'),bytes);
  manifest.profiles[id]={...entry,asset,bytes:bytes.length,expandedBytes:expanded.length};
 }
 const source=String.raw`
import assert from 'node:assert/strict';
import {profile,groundPlacement,placementOptions,resolveConnection,assertAssembly,inspectAssembly,worldConnections,rotate} from './lib/assembly';
import {prepareProfileAssets} from './server/profile-assets';
const release=await prepareProfileAssets(['30374','4274','87994','3673'],process.argv[2]);
const piece=(id,part,position=[0,0,0],rotation=[0,0,0])=>({id,part,color:4,step:1,group:'isolated sliding test',position,rotation});
const normalised=report=>report.connections.map(c=>JSON.stringify(c)).sort();
const permutations=xs=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(tail=>[x,...tail])):[[]];
try{
 const bar=piece('bar','30374',groundPlacement([],'30374'));
 assertAssembly([bar]);
 const initial=placementOptions([bar],'4274','bar',undefined,0,24);
 assert.ok(initial.options.length);
 assert.equal(initial.sampling.exhaustive,false);
 const base=initial.options.find(o=>o.connection.axialOffset===0).connection;
 let model=[bar];
 for(const [id,axialOffset] of [['lower',-28],['middle',0],['upper',28]]){
  const receiver=resolveConnection(model,piece(id,'4274'),{...base,axialOffset});
  model=[...model,receiver];assertAssembly(model);
 }
 const report=assertAssembly(model);assert.equal(report.connections.length,3);
 const port=worldConnections(model,'bar')[0];assert.equal(port.occupied,false);assert.equal(port.shareable,true);assert.equal(port.reservations.length,3);
 assert.deepEqual(port.reservations.map(r=>r.interval).sort((a,b)=>a[0]-b[0]),[[-40,-16],[-12,12],[16,40]]);
 for(const id of ['lower','middle','upper']){const receiver=worldConnections(model,id)[0];assert.equal(receiver.occupied,true);assert.equal(receiver.shareable,false);assert.equal(receiver.reservations.length,1);}
 for(const permutation of permutations(model))assert.deepEqual(normalised(assertAssembly(permutation)),normalised(report),'Matching and reservations must be independent of piece order');
 assert.equal(placementOptions(model,'4274','bar').options.length,0,'No complete receiver fits the remaining gaps');
 const centre=resolveConnection([bar],piece('centre','4274'),{...base,axialOffset:0});
 const almostTouching=resolveConnection([bar,centre],piece('tiny-overlap','4274'),{...base,axialOffset:24-1e-7});
 const overlap=inspectAssembly([bar,centre,almostTouching]);
 assert.equal(overlap.valid,false);assert.ok(overlap.issues.some(i=>i.code==='occupied_connector'),'Reservations reject tiny overlap even below SAT penetration tolerance');
 const touching=resolveConnection([bar,centre],piece('touching','4274'),{...base,axialOffset:24});
 assertAssembly([bar,centre,touching]);
 for(const axialOffset of [-28-1e-7,28+1e-7])assert.throws(()=>resolveConnection([bar],piece('outside','4274'),{...base,axialOffset}),/contrato|desplazamiento/);
 for(const axialOffset of [null,'0',undefined,NaN,Infinity])assert.throws(()=>resolveConnection([bar],piece('invalid','4274'),{...base,axialOffset}),/número finito/);
 const continuous=resolveConnection([bar],piece('continuous','4274'),{...base,axialOffset:7.125});
 assertAssembly([bar,continuous]);
 assert.equal(worldConnections([bar,continuous],'bar')[0].reservations[0].interval[0],7.125-12);
 let offset=0,pages=0,foundGapBoundary=false,foundEnd=false,previous=-1;
 const sampled=new Set();
 do{
  const page=placementOptions([bar,continuous],'4274','bar',undefined,offset,5);
  assert.ok(page.examined<=128);assert.ok(page.options.length<=5);
  for(const option of page.options){
   const placed=resolveConnection([bar,continuous],piece('candidate','4274'),option.connection);assertAssembly([bar,continuous,placed]);
   foundGapBoundary ||= Math.abs(option.connection.axialOffset-(-16.875))<1e-9;
   foundEnd ||= option.connection.axialOffset===-28;
   const key=JSON.stringify([option.position,option.rotation]);assert.ok(!sampled.has(key),'Pagination must not replay candidates');sampled.add(key);
  }
  if(page.nextOffset!==null){assert.ok(page.nextOffset>offset);previous=offset;offset=page.nextOffset;}else offset=null;
  assert.ok(++pages<100,'Sampling must be finite');
 }while(offset!==null);
 assert.ok(foundGapBoundary,'Sampling must include a non-grid boundary created by an existing reservation');assert.ok(foundEnd);
 const expired=placementOptions([bar],'4274','bar',undefined,Number.MAX_SAFE_INTEGER,24);assert.equal(expired.nextOffset,null);assert.equal(expired.options.length,0);

 // Use the receiver as anchor: the offset still follows that anchor's normal,
 // regardless of the sign of the newly placed male's local axis.
 const anchor=piece('anchor-receiver','4274',groundPlacement([],'4274'));
 const barChoices=placementOptions([anchor],'30374',anchor.id,undefined,0,24);
 for(const sign of [-1,1]){
  let choice=barChoices.options.find(o=>rotate(profile('30374').connectors[0].normal,o.rotation)[0]===sign);
  if(!choice){let cursor=barChoices.nextOffset;while(cursor!==null&&!choice){const page=placementOptions([anchor],'30374',anchor.id,undefined,cursor,24);choice=page.options.find(o=>rotate(profile('30374').connectors[0].normal,o.rotation)[0]===sign);cursor=page.nextOffset;}}
  assert.ok(choice,'Both axial signs must be offered');
  const candidate=resolveConnection([anchor],piece('reverse-anchor-bar','30374'),{...choice.connection,axialOffset:7.125});assertAssembly([anchor,candidate]);
  const barPort=worldConnections([anchor,candidate],candidate.id)[0],anchorPort=worldConnections([anchor,candidate],anchor.id)[0];
  assert.ok(Math.abs(barPort.point[0]-anchorPort.point[0]-7.125)<1e-9);
  const reservation=barPort.reservations[0];assert.ok(Math.abs((reservation.interval[0]+reservation.interval[1])/2+7.125*sign)<1e-9);
 }
 // A fixed v1 connection remains exclusive and disallows even tiny offsets.
 const fixedAnchor=piece('fixed-socket','3673',groundPlacement([],'3673'));
 const legacy=placementOptions([fixedAnchor],'87994',fixedAnchor.id).options[0];assert.ok(legacy);
 const fixedBar=resolveConnection([fixedAnchor],piece('fixed-bar','87994'),legacy.connection);assertAssembly([fixedAnchor,fixedBar]);
 assert.equal(worldConnections([fixedAnchor,fixedBar],fixedBar.id)[0].occupied,true);
 assert.equal(worldConnections([fixedAnchor,fixedBar],fixedBar.id)[0].shareable,false);
 assert.throws(()=>resolveConnection([fixedAnchor],piece('legacy-offset','87994'),{...legacy.connection,axialOffset:1e-9}),/contrato/);
 const standard=piece('standard','3005',groundPlacement([],'3005'));
 const standardChoice=placementOptions([standard],'3070b',standard.id).options[0];assert.ok(standardChoice);
 assert.throws(()=>resolveConnection([standard],piece('standard-offset','3070b'),{...standardChoice.connection,axialOffset:1}),/no admite/);
 console.log('PASS sliding assembly: triple 4274/30374 at -28,0,28; 24 model permutations; continuous offsets; male-local reservations; tiny overlap; either anchor and anti-axis; lazy sampling/gap boundaries; unchanged v1.');
}finally{release();}
`;
 const outfile=join(temp,'sliding-test.mjs');
 await build({stdin:{contents:source,resolveDir:root,loader:'ts',sourcefile:'isolated-sliding-test.ts'},outfile,bundle:true,platform:'node',format:'esm',target:'node22',plugins:[{name:'isolated-sliding-manifest',setup(build){build.onLoad({filter:/[\\/]lib[\\/]generated-assembly\.json$/},()=>({contents:JSON.stringify(manifest),loader:'json'}));}}]});
 const result=spawnSync(process.execPath,[outfile,temp],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
 assert.equal(result.status,0,result.error?.message||result.stderr+result.stdout);process.stdout.write(result.stdout);
 // Independently use the unmodified published profiles, including each v2
 // slide flag. A common translation to the floor never alters a relative pose.
 const published=JSON.parse(original),axialIds=Object.entries(published.profiles).filter(([,entry])=>entry.connectionFamily==='axial-r4').map(([id])=>id);
 const centredSource=String.raw`
import assert from 'node:assert/strict';
import {profile,groundPlacement,resolveConnection,inspectAssembly,worldConnections,rotate} from './lib/assembly';
import {prepareProfileAssets} from './server/profile-assets';
const ids=JSON.parse(process.argv[3]),release=await prepareProfileAssets(ids,process.argv[2]);
const piece=(id,part,position=[0,0,0],rotation=[0,0,0])=>({id,part,color:4,step:1,group:'published centred regression',position,rotation});
const rotations=[],matrices=new Set();
for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){const r=[x,y,z],key=JSON.stringify([[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,r)));if(!matrices.has(key)){matrices.add(key);rotations.push(r);}}
const minimumY=p=>Math.min(...profile(p.part).solids.flatMap(s=>s.vertices).map(v=>rotate(v,p.rotation)[1]+p.position[1]));
try{
 const bars=ids.filter(id=>profile(id).connectors.some(c=>c.kind==='bar')),receivers=ids.filter(id=>profile(id).connectors.some(c=>c.kind==='bar-socket'));
 assert.ok(bars.length>=3&&receivers.length>=14,'Cover all currently published axial families');
 const failures=[];let pairs=0,poses=0;
 for(const barId of bars)for(const receiverId of receivers){
  const b=profile(barId).connectors.find(c=>c.kind==='bar'),f=profile(receiverId).connectors.find(c=>c.kind==='bar-socket');
  const matched=new Set();let lastReason='No compatible orientation';
  for(const rotation of rotations){
   const axis=rotate(b.normal,rotation),sign=axis.reduce((n,v,i)=>n+v*f.normal[i],0);if(Math.abs(sign)!==1||matched.has(sign))continue;
   const receiver=piece('receiver',receiverId,groundPlacement([],receiverId));let bar;
   try{bar=resolveConnection([receiver],piece('bar',barId),{anchorId:receiver.id,anchorConnector:f.id,partConnector:b.id,rotation,axialOffset:0});}catch(error){lastReason=String(error);continue;}
   const lift=-Math.min(minimumY(receiver),minimumY(bar));receiver.position[1]+=lift;bar.position[1]+=lift;
   const report=inspectAssembly([receiver,bar]);if(!report.valid){lastReason=report.issues.map(i=>i.code).join(',');continue;}
   assert.equal(report.connections.length,1);
   const pa=worldConnections([receiver,bar],receiver.id)[0].point,pb=worldConnections([receiver,bar],bar.id)[0].point;
   assert.ok(Math.hypot(...pa.map((n,i)=>n-pb[i]))<1e-8,'The original centred relative pose must be retained');
   matched.add(sign);poses++;if(matched.size===2)break;
  }
  if(matched.size!==2)failures.push({barId,receiverId,signs:[...matched],reason:lastReason});pairs++;
 }
 assert.deepEqual(failures,[],'Published sliding profiles must preserve their centred fixed poses in both axial directions');
 console.log('PASS published centred regression:',JSON.stringify({bars:bars.length,receivers:receivers.length,pairs,poses,failures}));
}finally{release();}
`;
 const centredFile=join(temp,'published-centred-test.mjs');
 await build({stdin:{contents:centredSource,resolveDir:root,loader:'ts',sourcefile:'published-centred-test.ts'},outfile:centredFile,bundle:true,platform:'node',format:'esm',target:'node22',plugins:[{name:'published-manifest-snapshot',setup(build){build.onLoad({filter:/[\\/]lib[\\/]generated-assembly\.json$/},()=>({contents:original.toString('utf8'),loader:'json'}));}}]});
 const centred=spawnSync(process.execPath,[centredFile,join(root,'public/catalog/assembly'),JSON.stringify(axialIds)],{cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
 assert.equal(centred.status,0,centred.error?.message||centred.stderr+centred.stdout);process.stdout.write(centred.stdout);
 assert.deepEqual(await readFile(join(root,'lib/generated-assembly.json')),original);
}finally{
 if(dirname(resolve(temp))!==resolve(tmpdir())||!basename(temp).startsWith('brickforge-axial-sliding-'))throw new Error('Refusing cleanup outside the isolated axial sliding test directory');
 await rm(temp,{recursive:true,force:true});
}
