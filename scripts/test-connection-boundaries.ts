import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {inspectAssembly,placementOptions,profile,resolveConnection,rotate,worldConnections,type ConnectionRequest,type Vec} from '../lib/assembly';
import {minifigHipConnectorsMatch,type MinifigHipConnector} from '../lib/minifig-hips-fit';
import {minifigNeckConnectorsMatch,type MinifigNeckConnector} from '../lib/minifig-neck-fit';
import {technicPinConnectorsMatch,type TechnicPinConnector} from '../lib/technic-pin-fit';
import {prepareProfileAssets} from '../server/profile-assets';
import type {Piece} from '../lib/model';

const piece=(id:string,part:string,position:Vec=[0,0,0],rotation:Vec=[0,0,0]):Piece=>({id,part,position,rotation,color:4,group:'connection-boundaries',step:1});
const shifted=(p:Piece,delta:Vec):Piece=>({...p,position:p.position.map((n,i)=>n+delta[i]) as Vec});
const key=(point:Vec)=>point.map(n=>Math.round(n*100)).join(',');
const minY=(p:Piece)=>Math.min(...profile(p.part)!.solids.flatMap(s=>s.vertices.map(v=>rotate(v,p.rotation)[1]+p.position[1])),...profile(p.part)!.connectors.filter(c=>c.kind==='stud').map(c=>{const normal=rotate(c.normal,p.rotation),point=rotate(c.point,p.rotation);return point[1]+p.position[1]+(Math.abs(normal[1])>.9?Math.min(0,4*normal[1]):-6);}));
const frames:Vec[]=[],seenFrames=new Set<string>();
for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){
 const rotation:Vec=[x,y,z],matrix=([[1,0,0],[0,1,0],[0,0,1]] as Vec[]).flatMap(v=>rotate(v,rotation)).join(',');
 if(!seenFrames.has(matrix)){seenFrames.add(matrix);frames.push(rotation);}
}
assert.equal(frames.length,24);
let checks=0,crossCellPairs=0;
function checkPair(a:Piece,b:Piece,expected:number,valid:boolean|null=true){
 const report=inspectAssembly([a,b]);
 assert.equal(report.connections.length,expected,JSON.stringify({a,b,report}));
 if(valid!==null)assert.equal(report.valid,valid,JSON.stringify({a,b,report}));
 const reverse=inspectAssembly([b,a]);
 assert.equal(reverse.connections.length,expected,'Changing piece order must not lose or duplicate a pair');
 assert.equal(reverse.valid,report.valid);
 assert.deepEqual(inspectAssembly([a,b]),report,'Traversal must be deterministic');
 checks++;
 return report;
}
const release=await prepareProfileAssets(['3815b','973','3626b','32523','3673'],resolve('public/catalog/assembly'));
try{
 // The original failure: resolveConnection creates a valid pair on opposite
 // sides of a rounding boundary, with only ~7e-15 LDU between their points.
 const hips=piece('hips','3815b',[0,20.755,0]);
 const waistRequest:ConnectionRequest={anchorId:hips.id,anchorConnector:'hip-stud:10:0:0',partConnector:'hip-socket:10:-32:0',rotation:[0,0,0]};
 const torso=resolveConnection([hips],piece('torso','973'),waistRequest);
 assert.equal(torso.position[1],52.754999999999995);
 const hipPort=worldConnections([hips],hips.id).find(c=>c.id===waistRequest.anchorConnector) as MinifigHipConnector;
 const torsoPort=worldConnections([torso],torso.id).find(c=>c.id===waistRequest.partConnector) as MinifigHipConnector;
 assert.ok(minifigHipConnectorsMatch(hipPort,torsoPort));
 assert.notEqual(key(hipPort.point),key(torsoPort.point),'Fixture must actually cross cells');
 checkPair(hips,torso,2);
 assert.ok(placementOptions([hips],'973',hips.id,waistRequest.anchorConnector).options.length,'Finder must expose the valid fractional placement');
 assert.equal(worldConnections([hips,torso],hips.id).filter(c=>c.kind==='hip-stud'&&c.occupied).length,2);
 assert.equal(placementOptions([hips,torso],'973',hips.id,waistRequest.anchorConnector).options.length,0,'Occupied waist must not be proposed again');
 checkPair(hips,shifted(torso,[0,0,1e-8]),2);
 checkPair(hips,shifted(torso,[0,0,1.0000001e-8]),0,false);
 const duplicate=inspectAssembly([hips,torso,{...torso,id:'duplicate'}]);
 assert.equal(duplicate.connections.length,2,'Occupied ports must not gain duplicate connections');
 assert.ok(duplicate.issues.some(issue=>issue.code==='occupied_connector'));

 // Real minifig assets in every orthogonal frame, at both positive and
 // negative horizontal boundaries. A .005-LDU lift remains within ground EPS.
 for(const rotation of frames)for(const sign of [-1,1]){
  let anchor=piece('hips','3815b',[sign*.005,0,-sign*.005],rotation);
  const request={...waistRequest,rotation};
  let other=resolveConnection([anchor],piece('torso','973'),request);
  anchor=shifted(anchor,[0,-Math.min(minY(anchor),minY(other))+.005,0]);
  other=resolveConnection([anchor],other,request);
  checkPair(anchor,other,2);
 }

 // Each fixed family uses a per-axis inclusive tolerance, unlike studs.
 // Move the fixture to a cell corner and straddle all three axes at once.
 const fixedFixtures=[
  {anchor:hips,other:torso,request:waistRequest,count:2,kind:'hip-stud'},
  {anchor:piece('neck','973',[0,32,0]),other:piece('head','3626b'),request:{anchorId:'neck',anchorConnector:'neck:0:0:0',partConnector:'neck-socket:0:-24:0',rotation:[0,0,0] as Vec},count:1,kind:'neck'},
 ];
 const beam=piece('beam','32523',[0,10,0]);
 // Select a legal complete pin pose from the real asset, not a synthetic port.
 const beamLift=shifted(beam,[0,-minY(beam),0]);
 const pinChoices=placementOptions([beamLift],'3673',beamLift.id,undefined,0,24);
 assert.ok(pinChoices.options.length);
 fixedFixtures.push({anchor:beamLift,other:piece('pin','3673'),request:pinChoices.options[0].connection,count:1,kind:'pin-hole'});
 for(const fixture of fixedFixtures)for(const sign of [-1,1]){
  let anchor=fixture.anchor;
  const port=worldConnections([anchor],anchor.id).find(c=>c.id===fixture.request.anchorConnector)!;
  const target:Vec=[sign*.005-sign*4e-9,port.point[1]+.005-sign*4e-9,-sign*.005-sign*4e-9];
  anchor=shifted(anchor,target.map((n,i)=>n-port.point[i]) as Vec);
  const other=resolveConnection([anchor],fixture.other,fixture.request);
  const crossed=shifted(other,[sign*8e-9,sign*8e-9,sign*8e-9]);
  const a=worldConnections([anchor],anchor.id).find(c=>c.id===fixture.request.anchorConnector)!;
  const b=worldConnections([crossed],crossed.id).find(c=>c.id===fixture.request.partConnector)!;
  assert.notEqual(key(a.point),key(b.point),fixture.kind+' must cross a cell boundary');
  const exact=fixture.kind==='hip-stud'?minifigHipConnectorsMatch(a as MinifigHipConnector,b as MinifigHipConnector):fixture.kind==='neck'?minifigNeckConnectorsMatch(a as MinifigNeckConnector,b as MinifigNeckConnector):technicPinConnectorsMatch(a as TechnicPinConnector,b as TechnicPinConnector);
  assert.equal(exact,true,'Diagonal fixed tolerance is per-coordinate, not Euclidean');
  checkPair(anchor,crossed,fixture.count);
  crossCellPairs++;
  for(const delta of [[sign*1.1e-8,0,0],[0,sign*1.1e-8,0],[0,0,sign*1.1e-8],[sign*.009,0,0]] as Vec[]){
   // A horizontal pin may independently rest on the floor; losing its
   // connection need not make the two grounded pieces globally invalid.
   checkPair(anchor,shifted(other,delta),0,fixture.kind==='pin-hole'?null:false);
  }
 }

 // Standard connections may span neighboring cells almost .01 LDU apart,
 // but the spherical, strictly-less-than tolerance must remain unchanged.
 for(const sign of [-1,1])for(const delta of [[sign*.009,0,0],[0,sign*.009,0],[0,0,sign*.009],[sign*.005,sign*.005,sign*.005]] as Vec[]){
  const base=piece('base','3005',[sign*.004,24,sign*.004]);
  const tile=shifted(piece('tile','3070b',[sign*.004,32,sign*.004]),delta);
  checkPair(base,tile,1);
 }
 for(const delta of [[.01,0,0],[0,0,-.01],[.010000001,0,0],[.008,0,.008]] as Vec[]){
  checkPair(piece('base','3005',[0,24,0]),shifted(piece('tile','3070b',[0,32,0]),delta),0,false);
 }
 // Floating multiplication can put a valid standard pair two keys apart.
 // A hard-coded +/-1-cell neighborhood would still lose this connection.
 const farBase=piece('far-base','3005',[1310.715,24,0]),farTile=piece('far-tile','3070b',[1310.725,32,0]);
 assert.ok(farTile.position[0]-farBase.position[0]<.01);
 assert.equal(Math.round(farTile.position[0]*100)-Math.round(farBase.position[0]*100),2);
 checkPair(farBase,farTile,1);
 const base=piece('base','3005',[.004,24,0]),first=piece('first','3070b',[-.004,32,0]),second=piece('second','3070b',[.008,32,0]);
 const crowded=inspectAssembly([first,second,base]);
 assert.equal(crowded.connections.length,1,'Neighboring cells must share the same occupancy map');
 assert.ok([crowded.connections[0].a,crowded.connections[0].b].includes(first.id),'Earlier candidate retains occupancy precedence');
 assert.ok(crowded.issues.some(issue=>issue.code==='occupied_connector'));
 assert.deepEqual(inspectAssembly([first,second,base]),crowded);
 console.log(JSON.stringify({ok:true,checks,crossCellPairs,globalFrames:frames.length,realAssetFamilies:['minifig-hips','minifig-neck','technic-pin'],standardTolerance:'distance < .01',fixedTolerance:'each axis <= 1e-8',occupancy:true,finder:true}));
}finally{release();}
