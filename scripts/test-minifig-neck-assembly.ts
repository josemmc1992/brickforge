import assert from 'node:assert/strict';import {resolve} from 'node:path';import {writeFileSync} from 'node:fs';
import {generatedEntries} from '../lib/generated-profiles';import {prepareProfileAssets} from '../server/profile-assets';
import {profile,rotate,resolveConnection,inspectAssembly,assertAssembly,worldConnections,placementOptions,groundPlacement,type Vec} from '../lib/assembly';import type {Piece} from '../lib/model';
const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,position,rotation,color:4,group:'neck-test',step:1});
const root=resolve('public/catalog/assembly'),entries=Object.entries(generatedEntries).filter(([,e])=>e.connectionFamilies?.includes('minifig-neck')),seen=new Set(),results:unknown[]=[],failures:unknown[]=[];assert.ok(entries.length>100);
const releaseOthers=await prepareProfileAssets(['973','3626b','3626c'],root);let ports=0,poses=0,globalPoses=0;
try{
 for(const [part,entry] of entries){if(seen.has(entry.asset))continue;seen.add(entry.asset);const release=await prepareProfileAssets([part],root);
  try{for(const c of profile(part)!.connectors.filter(c=>c.kind==='neck'||c.kind==='neck-socket')){
   const otherPart=c.kind==='neck'?'3626b':'973',otherPort=profile(otherPart)!.connectors.find(x=>x.kind===(c.kind==='neck'?'neck-socket':'neck'))!;ports++;let legal=0;
   for(const y of [0,90,180,270]){
    const anchor=piece('anchor',part),request={anchorId:'anchor',anchorConnector:c.id,partConnector:otherPort.id,rotation:[0,y,0] as Vec},other=resolveConnection([anchor],piece('other',otherPart),request);
    const minY=(p:Piece)=>Math.min(...profile(p.part)!.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])));const lift=-Math.min(minY(anchor),minY(other));anchor.position[1]+=lift;other.position[1]+=lift;
    const report=inspectAssembly([anchor,other]);if(!report.valid){failures.push({part,port:c.id,y,issues:report.issues});continue;}legal++;poses++;
    assert.equal(report.connections.length,1);assert.throws(()=>assertAssembly([anchor,other,{...other,id:'duplicate'}]));assert.equal(worldConnections([anchor,other],anchor.id).find(x=>x.id===c.id)!.occupied,true);
    for(const delta of [[.3,0,0],[0,1,0],[0,-1,0],[0,0,.3]] as Vec[]){const shifted={...other,position:other.position.map((n,i)=>n+delta[i]) as Vec};assert.equal(inspectAssembly([anchor,shifted]).valid,false,part+' displaced '+delta);}
    assert.throws(()=>resolveConnection([anchor],piece('invalid',otherPart),{...request,axialOffset:1}),/desplazamiento axial/);
   }results.push({part,port:c.id,legalPoses:legal});
  }}finally{release();}if(seen.size%100===0)console.log(JSON.stringify({neckProfiles:seen.size,poses,failures:failures.length}));
 }
 // Both parts can be rotated together through all 24 orthogonal frames.
 const frames=new Set<string>();
 for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){
  const rotation:Vec=[x,y,z],key=([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).flatMap(v=>rotate(v,rotation)).join(',');if(frames.has(key))continue;frames.add(key);
  const anchor=piece('rotated-torso','973',[0,0,0],rotation),head=resolveConnection([anchor],piece('rotated-head','3626b'),{anchorId:anchor.id,anchorConnector:'neck:0:0:0',partConnector:'neck-socket:0:-24:0',rotation});
  const minY=(p:Piece)=>Math.min(...profile(p.part)!.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])),...profile(p.part)!.connectors.filter(c=>c.kind==='stud').map(c=>{const n=rotate(c.normal,p.rotation),q=rotate(c.point,p.rotation);return q[1]+p.position[1]+(Math.abs(n[1])>.9?Math.min(0,4*n[1]):-6);}));
  const lift=-Math.min(minY(anchor),minY(head));anchor.position[1]+=lift;head.position[1]+=lift;assertAssembly([anchor,head]);globalPoses++;
 }
 assert.equal(globalPoses,24);
 // Finder and pre-existing head top stud both use the real assembly engine.
 const torso=piece('torso','973',groundPlacement([],'973')),choices=placementOptions([torso],'3626c','torso','neck:0:0:0',0,24);assert.ok(choices.options.length);
 const head=resolveConnection([torso],piece('head','3626c'),choices.options[0].connection),stack=[torso,head];assertAssembly(stack);
 const cap=placementOptions(stack,'3070b','head','stud:0:0:0:0:1:0',0,24);assert.ok(cap.options.length);stack.push(resolveConnection(stack,piece('cap','3070b'),cap.options[0].connection));assert.equal(assertAssembly(stack).connections.length,2);
}finally{releaseOthers();}
const report={neckReferences:entries.length,uniqueNeckProfiles:seen.size,ports,quarterTurnPoses:poses,globalPoses,oldHeadStudRetained:true,failures,results};writeFileSync('.desktop-tests/minifig-neck-assembly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.deepEqual(failures,[],'Every advertised neck port must fit its counterpart in all quarter turns');
