import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {profile,inspectAssembly,assertAssembly,groundPlacement,resolveConnection,placementOptions,worldConnections,rotate,type Vec} from '../lib/assembly';
import {prepareProfileAssets} from '../server/profile-assets';
import type {Piece} from '../lib/model';
const shafts=['3704','3705','3706','3707','3708','3737','4519','23948','32073','44294','50450','50451','60485'];
const receivers=['3713','584','585','3647','4019','6536','32039'];
const release=await prepareProfileAssets([...shafts,...receivers,'30374','3673'],resolve('public/catalog/assembly'));
const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,color:4,step:1,group:'keyed integration',position,rotation});
const minY=(p:Piece)=>Math.min(...profile(p.part)!.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])));
const rotations:Vec[]=[],seen=new Set<string>();
for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){const r:Vec=[x,y,z],key=JSON.stringify([[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v as Vec,r)));if(!seen.has(key)){seen.add(key);rotations.push(r);}}
let pairs=0,poses=0;
try{
 for(const axleId of shafts)for(const socketId of receivers){
  let count=0;
  for(const rotation of rotations){
   const anchor=piece('receiver',socketId),request={anchorId:anchor.id,anchorConnector:profile(socketId)!.connectors[0].id,partConnector:profile(axleId)!.connectors[0].id,rotation};
   let axle:Piece;try{axle=resolveConnection([anchor],piece('axle',axleId),request);}catch{continue;}
   const lift=-Math.min(minY(anchor),minY(axle));anchor.position[1]+=lift;axle.position[1]+=lift;
   const report=inspectAssembly([anchor,axle]);assert.equal(report.valid,true,axleId+'/'+socketId+': '+JSON.stringify(report.issues));assert.equal(report.connections.length,1);poses++;count++;
  }
  assert.equal(count,8,axleId+'/'+socketId);pairs++;
 }
 const anchor=piece('middle','3713',groundPlacement([],'3713'));
 const first=placementOptions([anchor],'3705','middle',undefined,0,24).options.find(o=>o.connection.axialOffset===0);assert.ok(first);
 const axle=resolveConnection([anchor],piece('shaft','3705'),first.connection);
 let model=[anchor,axle];assertAssembly(model);
 const base={anchorId:'shaft',anchorConnector:profile('3705')!.connectors[0].id,partConnector:profile('3713')!.connectors[0].id,rotation:anchor.rotation};
 for(const [id,offset] of [['lower',-25],['upper',25]] as const){const receiver=resolveConnection(model,piece(id,'3713'),{...base,axialOffset:offset});model=[...model,receiver];assertAssembly(model);}
 const world=worldConnections(model,'shaft')[0];assert.equal(world.shareable,true);assert.equal(world.occupied,false);assert.equal(world.reservations.length,3);
 assert.deepEqual(world.reservations.map(r=>r.interval).sort((a,b)=>a[0]-b[0]),[[-35,-15],[-10,10],[15,35]]);
 assert.throws(()=>assertAssembly([...model,resolveConnection(model,piece('occupied','3713'),{...base,axialOffset:1})]),/atraviesan|ocupado|solapan/);
 for(const offset of [-27.5001,27.5001,29,-29])assert.throws(()=>resolveConnection(model,piece('bevel','3713'),{...base,axialOffset:offset}),/axial/);
 for(const offset of [null,undefined,'25',NaN,Infinity])assert.throws(()=>resolveConnection(model,piece('bad','3713'),{...base,axialOffset:offset as number}),/finito/);
 const free=[anchor,axle],continuous=resolveConnection(free,piece('continuous','3713'),{...base,axialOffset:25.125});assertAssembly([...free,continuous]);
 const query=placementOptions(free,'3713','shaft',undefined,0,24);assert.equal(query.sampling.exhaustive,false);assert.ok(query.options.length);for(const option of query.options)assertAssembly([...free,resolveConnection(free,piece('option','3713'),option.connection)]);
 const reverse={anchorId:'middle',anchorConnector:profile('3713')!.connectors[0].id,partConnector:profile('3705')!.connectors[0].id,rotation:axle.rotation,axialOffset:25.125};
 assertAssembly([anchor,resolveConnection([anchor],piece('reverse','3705'),reverse)]);
 assert.throws(()=>resolveConnection(model,piece('round','30374'),{...base,partConnector:profile('30374')!.connectors[0].id}),/incompatibles/);
 assert.throws(()=>resolveConnection(model,piece('round-socket','3673'),{...base,partConnector:profile('3673')!.connectors[0].id}),/incompatibles/);
 for(const id of [...shafts,...receivers]){const a=piece('one',id,groundPlacement([],id));assertAssembly([a]);assert.throws(()=>assertAssembly([a,{...a,id:'duplicate'}]),/atraviesan|ocupado/);}
 console.log(JSON.stringify({keyedRuntime:true,realPairs:pairs,realPoses:poses,multipleReceivers:3,continuousOffsets:true,bevelRejection:true,crossFamilyRejection:true,allPassed:true}));
}finally{release();}
