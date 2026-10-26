import assert from 'node:assert/strict';
import {resolve,dirname,basename} from 'node:path';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {profile,inspectAssembly,assertAssembly,groundPlacement,resolveConnection,rotate,type Vec} from '../lib/assembly';
import {generatedEntries} from '../lib/generated-profiles';
import {prepareProfileAssets} from '../server/profile-assets';
import type {Piece} from '../lib/model';

const assetRoot=resolve(process.cwd(),'public/catalog/assembly');
const first=Object.entries(generatedEntries)[0];
assert.ok(first,'Generated catalogue must not be empty');
const corruptRoot=await mkdtemp(join(tmpdir(),'brickforge-profile-test-'));
try{
 const [id,entry]=first;
 await assert.rejects(prepareProfileAssets([id],corruptRoot));
 const bytes=await readFile(join(assetRoot,entry.asset+'.bin'));bytes[bytes.length-1]^=1;
 await writeFile(join(corruptRoot,entry.asset+'.bin'),bytes);
 await assert.rejects(prepareProfileAssets([id],corruptRoot),/dañado/,'tampered geometry must fail closed');
 const leases=await Promise.all(Array.from({length:12},()=>prepareProfileAssets([id],assetRoot)));
 assert.ok(profile(id));for(const release of leases)release();
}finally{if(dirname(resolve(corruptRoot))!==resolve(tmpdir())||!basename(corruptRoot).startsWith('brickforge-profile-test-'))throw new Error('Refusing cleanup outside the isolated test directory');await rm(corruptRoot,{recursive:true,force:true});}
const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,color:4,step:1,group:'generated-test',position,rotation});
const rotations:Vec[]=[];
for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270])rotations.push([x,y,z]);
function minimumY(p:Piece){
 const def=profile(p.part)!;let min=Infinity;
 for(const s of def.solids)for(const v of s.vertices)min=Math.min(min,rotate(v,p.rotation)[1]+p.position[1]);
 for(const c of def.connectors)if(c.kind==='stud'){
  const point=rotate(c.point,p.rotation),normal=rotate(c.normal,p.rotation);
  min=Math.min(min,point[1]+p.position[1]+(Math.abs(normal[1])>.9?Math.min(0,normal[1]*4):-6));
 }
 return min;
}
const seen=new Set<string>(),failures:{part:string;reason:string}[]=[],examples:string[]=[];
const releaseAxialCounterparts=await prepareProfileAssets(['30374','87994','3673','2780','4274','3705','50451','3713','32523','973','3626b','3815b'],assetRoot);
let tested=0;
try{
for(const [id,entry] of Object.entries(generatedEntries)){
 if(seen.has(entry.asset))continue;seen.add(entry.asset);
 const release=await prepareProfileAssets([id],assetRoot);
 try{
  const def=profile(id)!;
  assertAssembly([piece('ground',id,groundPlacement([],id))]);
  assert.throws(()=>assertAssembly([piece('a',id,groundPlacement([],id)),piece('b',id,groundPlacement([],id))]),/atraviesan|tetón|ocupado/,'two identical bodies may not overlap');
  let connected=false,lastReason='No ports tested';
  ports:for(const c of def.connectors.slice(0,64))for(const otherPart of c.kind==='hip-stud'?['973']:c.kind==='hip-socket'?['3815b']:c.kind==='neck'?['3626b']:c.kind==='neck-socket'?['973']:c.kind==='pin'?['32523']:c.kind==='pin-hole'?['3673']:c.kind==='stud'?['3070b','98138']:c.kind==='socket'?['3005','3062b','6141']:c.kind==='axle'?['3713']:c.kind==='axle-socket'?['3705','50451']:c.kind==='bar'?['3673','2780','4274']:['30374','87994']){
   const otherKind=c.kind==='hip-stud'?'hip-socket':c.kind==='hip-socket'?'hip-stud':c.kind==='neck'?'neck-socket':c.kind==='neck-socket'?'neck':c.kind==='pin'?'pin-hole':c.kind==='pin-hole'?'pin':c.kind==='stud'?'socket':c.kind==='socket'?'stud':c.kind==='axle'?'axle-socket':c.kind==='axle-socket'?'axle':c.kind==='bar'?'bar-socket':'bar',counterpart=profile(otherPart)!.connectors.find(p=>p.kind===otherKind)!;
   const options=c.kind!=='stud'&&c.kind!=='socket'?rotations:[rotations.find(r=>rotate(counterpart.normal,r).every((n,i)=>Math.abs(n+c.normal[i])<1e-6))!];
   for(const rotation of options){
   const anchor=piece('generated',id);let other:Piece;
   try{other=resolveConnection([anchor],piece('counterpart',otherPart),{anchorId:anchor.id,anchorConnector:c.id,partConnector:counterpart.id,rotation});}catch{continue;}
   const lift=-Math.min(minimumY(anchor),minimumY(other));anchor.position[1]+=lift;other.position[1]+=lift;
   const report=inspectAssembly([anchor,other]);
   if(report.valid){connected=true;break ports;}lastReason=report.issues.map(i=>i.code).join(',');
   }
  }
  if(!connected)failures.push({part:id,reason:lastReason});else if(examples.length<20)examples.push(id);
  tested++;
 }finally{release();}
 if(tested%500===0)console.log(JSON.stringify({tested,failures:failures.length}));
}
}finally{releaseAxialCounterparts();}
console.log(JSON.stringify({testedUniqueProfiles:tested,totalReferences:Object.keys(generatedEntries).length,failures,examples}));
assert.equal(failures.length,0,'Every generated profile must demonstrate at least one valid connection, not merely exist in an index.');
