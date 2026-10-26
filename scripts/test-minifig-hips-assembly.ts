import assert from 'node:assert/strict';import {resolve} from 'node:path';import {writeFileSync} from 'node:fs';
import {generatedEntries} from '../lib/generated-profiles';import {prepareProfileAssets} from '../server/profile-assets';
import {profile,rotate,resolveConnection,inspectAssembly,assertAssembly,worldConnections,placementOptions,groundPlacement,type Vec} from '../lib/assembly';import type {Piece} from '../lib/model';
const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,position,rotation,color:4,group:'hips-test',step:1});
const root=resolve('public/catalog/assembly'),entries=Object.entries(generatedEntries).filter(([,e])=>e.connectionFamilies?.includes('minifig-hips')),seen=new Set(),results:unknown[]=[],failures:unknown[]=[];assert.ok(entries.length>100);
const releaseOthers=await prepareProfileAssets(['973','3815b','41879a','3626c'],root);let ports=0,poses=0,globalPoses=0;
const minY=(p:Piece)=>Math.min(...profile(p.part)!.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])),...profile(p.part)!.connectors.filter(c=>c.kind==='stud').map(c=>{const n=rotate(c.normal,p.rotation),q=rotate(c.point,p.rotation);return q[1]+p.position[1]+(Math.abs(n[1])>.9?Math.min(0,4*n[1]):-6);}));
function lift(...pieces:Piece[]){const amount=-Math.min(...pieces.map(minY));for(const p of pieces)p.position[1]+=amount;}
try{
 for(const [part,entry] of entries){if(seen.has(entry.asset))continue;seen.add(entry.asset);const release=await prepareProfileAssets([part],root);
  try{for(const c of profile(part)!.connectors.filter(c=>c.kind==='hip-stud'||c.kind==='hip-socket')){
   const otherPart=c.kind==='hip-stud'?'973':'3815b',otherKind=c.kind==='hip-stud'?'hip-socket':'hip-stud';ports++;let legal=0;
   for(const y of [0,180]){
    const otherPort=profile(otherPart)!.connectors.find(b=>b.kind===otherKind&&b.point[0]===(y===0?c.point[0]:-c.point[0]))!;
    const anchor=piece('anchor',part),request={anchorId:'anchor',anchorConnector:c.id,partConnector:otherPort.id,rotation:[0,y,0] as Vec},other=resolveConnection([anchor],piece('other',otherPart),request);lift(anchor,other);
    const report=inspectAssembly([anchor,other]);if(!report.valid){const failure={part,port:c.id,y,issues:report.issues};failures.push(failure);console.log(JSON.stringify({hipFailure:failure}));continue;}legal++;poses++;
    assert.equal(report.connections.length,2);assert.throws(()=>assertAssembly([anchor,other,{...other,id:'duplicate'}]));assert.equal(worldConnections([anchor,other],anchor.id).filter(x=>(x.kind==='hip-stud'||x.kind==='hip-socket')&&x.occupied).length,2);
    for(const delta of [[.3,0,0],[0,1,0],[0,-1,0],[0,0,.3]] as Vec[]){const shifted={...other,position:other.position.map((n,i)=>n+delta[i]) as Vec};assert.equal(inspectAssembly([anchor,shifted]).valid,false,part+' displaced '+delta);}
    for(const turn of [90,270])assert.throws(()=>resolveConnection([anchor],piece('invalid',otherPart),{...request,rotation:[0,turn,0]}),/giro/);
    assert.throws(()=>resolveConnection([anchor],piece('invalid',otherPart),{...request,axialOffset:1}),/desplazamiento axial/);
   }results.push({part,port:c.id,legalPoses:legal});
  }}finally{release();}if(seen.size%100===0)console.log(JSON.stringify({hipProfiles:seen.size,poses,failures:failures.length}));
 }
 const frames=new Set<string>();
 for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){
  const rotation:Vec=[x,y,z],key=([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).flatMap(v=>rotate(v,rotation)).join(',');if(frames.has(key))continue;frames.add(key);
  const anchor=piece('hips','3815b',[0,0,0],rotation),torso=resolveConnection([anchor],piece('torso','973'),{anchorId:anchor.id,anchorConnector:'hip-stud:10:0:0',partConnector:'hip-socket:10:-32:0',rotation});lift(anchor,torso);assert.equal(assertAssembly([anchor,torso]).connections.length,2);globalPoses++;
 }
 assert.equal(globalPoses,24);
 // Feet, paired waist, neck and head top stud must coexist in one assembly.
 const base=piece('base','3020',groundPlacement([],'3020')),stack=[base];
 for(const [id,part,anchor,port] of [['legs','41879a','base',undefined],['torso','973','legs','hip-stud:10:0:0'],['head','3626c','torso','neck:0:0:0'],['cap','3070b','head','stud:0:0:0:0:1:0']] as [string,string,string,string|undefined][]){
  const choices=placementOptions(stack,part,anchor,port,0,24);assert.ok(choices.options.length,id+' has a legal connection');stack.push(resolveConnection(stack,piece(id,part),choices.options[0].connection));assertAssembly(stack);
 }
 assert.ok(assertAssembly(stack).connections.length>=5);
 // Finder cache must distinguish the two opposing bevel headings.
 const hips=piece('finder','3815b',groundPlacement([],'3815b'));
 for(const port of ['hip-stud:-10:0:0','hip-stud:10:0:0']){const choices=placementOptions([hips],'973',hips.id,port,0,24);assert.ok(choices.options.length);for(const option of choices.options)assertAssembly([hips,resolveConnection([hips],piece('t','973'),option.connection)]);}
}finally{releaseOthers();}
const report={hipReferences:entries.length,uniqueHipProfiles:seen.size,ports,seatedPoses:poses,globalPoses,feetWaistNeckAndHeadStudChain:true,failures,results};writeFileSync('.desktop-tests/minifig-hips-assembly.json',JSON.stringify(report,null,2)+'\n');const {results:_,...summary}=report;console.log(JSON.stringify(summary));assert.deepEqual(failures,[],'Every advertised hip port must fit its counterpart in both waist orientations');
