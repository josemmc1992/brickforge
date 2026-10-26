import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {prepareProfileAssets} from '../server/profile-assets';
import {generatedEntries} from '../lib/generated-profiles';
import {validAxialConnector,type AxialConnector} from '../lib/axial-fit';
import {profile,isSupportedPart,partConnectionInfo,supportedPartCount,groundPlacement,placementOptions,resolveConnection,inspectAssembly,assertAssembly,rotate,worldConnections,type Vec} from '../lib/assembly';
import type {Piece} from '../lib/model';

const assetRoot=resolve(process.argv[2]);
const expectedCount=Number(process.argv[3]);
const bars=['30374','87994'],sockets=['3673','2780','4274'],ids=[...bars,...sockets];
const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,color:4,step:1,group:'isolated-axial-test',position,rotation});
const area=(points:[number,number][])=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
assert.equal(supportedPartCount,expectedCount,'Support counts must include the isolated, real axial references');
for(const id of ids){
 assert.equal(isSupportedPart(id),true);
 assert.throws(()=>profile(id),/no está preparado/,'Known but unloaded geometry cannot bypass preparation');
 const raw=JSON.parse(gunzipSync(await readFile(join(assetRoot,generatedEntries[id].asset+'.bin'))).toString('utf8'));
 assert.equal(raw.version,2);assert.equal(raw.source,'ldraw-axial-envelope-v1');
}
const release=await prepareProfileAssets(ids,assetRoot);
try{
 for(const id of ids){
  const info=partConnectionInfo(id);assert.equal(info.supported,true);assert.equal(info.profile,'ldraw-axial-envelope-v1');
  const def=profile(id)!;assert.equal(def.connectors.length,1);
  const c=def.connectors[0] as AxialConnector;
  assert.equal(c.axial.contract,'r4-through-centered-fixed-v1','This suite protects the original centred, exclusive contract');
  assert.equal(validAxialConnector(c),true);assert.ok(area(c.axial.section)>0,'Real section must be counterclockwise');
  assert.ok(c.axial.section.length<=64);
  const backwards=structuredClone(c);backwards.axial.section.reverse();assert.equal(validAxialConnector(backwards),false,'Clockwise cavities cannot pass the loader contract');
  const excessive=structuredClone(c);excessive.axial.section=Array.from({length:65},(_,i)=>[4*Math.cos(i*2*Math.PI/65),4*Math.sin(i*2*Math.PI/65)]);assert.equal(validAxialConnector(excessive),false);
  assertAssembly([piece('single',id,groundPlacement([],id))]);
 }
 assert.equal((profile('2780')!.connectors[0] as AxialConnector).axial.section.length,38,'The real friction-pin section exceeds an obsolete 32-vertex ceiling');
 const tested=[];
 for(const socketId of sockets)for(const barId of bars){
  const socket=piece('socket',socketId,groundPlacement([],socketId));
  const socketPort=profile(socketId)!.connectors[0] as AxialConnector;
  const barPort=profile(barId)!.connectors[0] as AxialConnector;
  assert.deepEqual(socketPort.normal,[1,0,0]);
  assert.equal(socketPort.axial.length,socketId==='4274'?24:40);
  assertAssembly([socket]);
  const choices=placementOptions([socket],barId,socket.id,undefined,0,24);
  assert.ok(choices.options.length,`${barId} must have a legal centred through-hole placement in ${socketId}`);
  const directions=new Set<number>();
  for(const option of choices.options){
   const candidate=resolveConnection([socket],piece('bar',barId),option.connection);
   const axis=rotate(barPort.normal,candidate.rotation);assert.equal(Math.abs(axis[0]),1);assert.equal(Math.abs(axis[1]),0);assert.equal(Math.abs(axis[2]),0);directions.add(axis[0]);
   assert.deepEqual(candidate.position,option.position);
   const report=assertAssembly([socket,candidate]);assert.equal(report.connections.length,1);
  }
  assert.deepEqual([...directions].sort(),[-1,1],'A through channel must support both axial directions');
  const bar=resolveConnection([socket],piece('bar',barId),choices.options[0].connection);
  assert.equal(worldConnections([socket,bar],socket.id)[0].occupied,true);
  assert.equal(worldConnections([socket,bar],bar.id)[0].occupied,true);
  assert.equal(placementOptions([socket,bar],barId,socket.id).options.length,0,'Occupied axial ports must not offer another bar');
  for(const [axis,delta] of [[1,.004],[1,.009],[0,1]] as const){
   const shifted=structuredClone(bar);shifted.position[axis]+=delta;
   const report=inspectAssembly([socket,shifted]);
   assert.equal(report.valid,false,`${barId}/${socketId}: off-centre displacement ${delta} along ${axis} is not this centred contract`);
   assert.equal(report.connections.length,0,'A sub-SAT-epsilon offset is not an exact centred connection');
   assert.ok(report.issues.some(issue=>issue.code==='disconnected'));
  }
  const penetrating=structuredClone(bar);penetrating.position[1]+=.05;
  const penetration=inspectAssembly([socket,penetrating]);assert.equal(penetration.valid,false);
  assert.ok(penetration.issues.some(issue=>issue.code==='collision'),'Radial penetration must fail actual compound-body collision checking');
  const duplicate=inspectAssembly([socket,bar,{...bar,id:'duplicate-bar'}]);
  assert.equal(duplicate.valid,false);assert.ok(duplicate.issues.some(issue=>issue.code==='occupied_connector'));assert.ok(duplicate.issues.some(issue=>issue.code==='collision'));
  const centre=worldConnections([socket,bar],bar.id)[0].point;
  const tip=centre[0]+barPort.axial.length/2;
  const blocker=piece('tip-blocker','3005',[tip+9.5,groundPlacement([],'3005')[1],centre[2]]);
  assertAssembly([socket,blocker]);
  const blocked=inspectAssembly([socket,bar,blocker]);assert.equal(blocked.valid,false);
  assert.ok(blocked.issues.some(issue=>issue.code==='collision'&&issue.pieces.includes('bar')&&issue.pieces.includes('tip-blocker')),'The portion of a bar outside its channel must remain a collision body');
  const tile=piece('standard-socket','3070b',groundPlacement([],'3070b'));
  const tilePort=profile(tile.part)!.connectors.find(c=>c.kind==='socket')!;
  assert.equal(placementOptions([tile],barId,tile.id).options.length,0,'R4 bars do not fit standard R6 stud sockets');
  assert.throws(()=>resolveConnection([tile],piece('bar',barId),{anchorId:tile.id,anchorConnector:tilePort.id,partConnector:barPort.id,rotation:[0,0,0]}),/Conectores incompatibles/);
  tested.push(`${barId}/${socketId}`);
 }
 console.log('PASS axial loader + assembly:',JSON.stringify({pairs:tested,checks:'real source-v2 assets, count/get, CCW sections, both through directions, centred-only matching, collision, occupancy, incompatibility and exposed-bar tip'}));
}finally{release();}
