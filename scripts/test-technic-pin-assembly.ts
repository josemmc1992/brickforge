import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
import {generatedEntries} from '../lib/generated-profiles';
import {profile,rotate,resolveConnection,inspectAssembly,assertAssembly,groundPlacement,placementOptions,worldConnections,type Vec} from '../lib/assembly';
import {prepareProfileAssets} from '../server/profile-assets';
import type {Piece} from '../lib/model';

const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,color:4,step:1,group:'pin-regression',position,rotation});
const rotations:Vec[]=[],matrices=new Set<string>();
for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){const r:Vec=[x,y,z],key=([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).flatMap(v=>rotate(v,r)).join(',');if(!matrices.has(key)){matrices.add(key);rotations.push(r);}}
function minY(p:Piece){const def=profile(p.part)!;return Math.min(...def.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])),...def.connectors.filter(c=>c.kind==='stud').map(c=>{const n=rotate(c.normal,p.rotation),q=rotate(c.point,p.rotation);return q[1]+p.position[1]+(Math.abs(n[1])>.9?Math.min(0,4*n[1]):-6);}));}
const assetRoot=resolve('public/catalog/assembly'),entries=Object.entries(generatedEntries).filter(([,e])=>e.connectionFamilies?.includes('technic-pin')),seen=new Set<string>(),failures:unknown[]=[],results:unknown[]=[];
assert.ok(entries.length>10,'The integrated catalogue must contain the new family');
const releaseCounterparts=await prepareProfileAssets(['3673','32523','30374'],assetRoot);let portsTested=0;
try{
 for(const [part,entry] of entries){
  if(seen.has(entry.asset))continue;seen.add(entry.asset);const release=await prepareProfileAssets([part],assetRoot);
  try{
   const ports=profile(part)!.connectors.filter(c=>c.kind==='pin'||c.kind==='pin-hole');assert.ok(ports.length);
   for(const c of ports){
    const otherPart=c.kind==='pin'?'32523':'3673',others=profile(otherPart)!.connectors.filter(p=>p.kind===(c.kind==='pin'?'pin-hole':'pin'));let accepted:Piece[]|undefined;
    outer:for(const b of others)for(const rotation of rotations){
     const anchor=piece('anchor',part);let other:Piece;
     try{other=resolveConnection([anchor],piece('other',otherPart),{anchorId:anchor.id,anchorConnector:c.id,partConnector:b.id,rotation});}catch{continue;}
     const lift=-Math.min(minY(anchor),minY(other));anchor.position[1]+=lift;other.position[1]+=lift;
     if(inspectAssembly([anchor,other]).valid){accepted=[anchor,other];break outer;}
    }
    portsTested++;
    if(!accepted){failures.push({part,connector:c.id,reason:'No full-body placement'});continue;}
    const [anchor,other]=accepted,report=assertAssembly(accepted);assert.ok(report.connections.some(r=>[r.connectorA,r.connectorB].includes(c.id)));
    assert.throws(()=>assertAssembly([...accepted,{...other,id:'duplicate'}]));
    const displaced={...other,position:other.position.map((n,i)=>n+c.normal[i]) as Vec};assert.equal(inspectAssembly([anchor,displaced]).valid,false,'A 1-LDU unseated pin must not validate');
   }
   results.push({part,ports:ports.length});
  }finally{release();}
  if(seen.size%50===0)console.log(JSON.stringify({pinProfiles:seen.size,portsTested,failures:failures.length}));
 }
 // Occupancy, both ends and the legacy inner R4 port exercise the full engine.
 for(const id of ['3700','3701','32523','43857','32000','32524','32316','32034','41239']){
  const release=await prepareProfileAssets([id],assetRoot);
  try{
   const anchor=piece('anchor',id,groundPlacement([],id)),hole=profile(id)!.connectors.find(c=>c.kind==='pin-hole')!,choices=placementOptions([anchor],'3673',anchor.id,hole.id,0,24);assert.ok(choices.options.length,id);
   const pin=resolveConnection([anchor],piece('pin','3673'),choices.options[0].connection),model=[anchor,pin],ends=worldConnections(model,pin.id).filter(c=>c.kind==='pin');assert.equal(ends.filter(c=>c.occupied).length,1);
   const free=ends.find(c=>!c.occupied)!;assert.ok(free);const more=placementOptions(model,'32523',pin.id,free.id,0,24);assert.ok(more.options.length,id+' second beam');
   model.push(resolveConnection(model,piece('second-beam','32523'),more.options[0].connection));assert.equal(assertAssembly(model).connections.length,2);assert.equal(worldConnections(model,pin.id).filter(c=>c.kind==='pin'&&c.occupied).length,2);
   assert.throws(()=>resolveConnection([anchor],piece('invalid','3673'),{...choices.options[0].connection,axialOffset:1}));
  }finally{release();}
 }
 const pin=piece('r4-pin','3673',groundPlacement([],'3673')),bar=placementOptions([pin],'30374',pin.id,'bar-socket:0:0:0:1:0:0',0,24);assert.ok(bar.options.length);assertAssembly([pin,resolveConnection([pin],piece('bar','30374'),bar.options[0].connection)]);
}finally{releaseCounterparts();}
const report={pinReferences:entries.length,uniquePinProfiles:seen.size,portsTested,twoEndedAssemblies:9,oldR4Retained:true,failures,results};writeFileSync('.desktop-tests/technic-pin-assembly.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.deepEqual(failures,[],'Every advertised new pin port must demonstrate a legal full-body connection');
