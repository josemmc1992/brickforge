import assert from 'node:assert/strict';
import {robot,partMap,type Piece} from '../lib/model';
// For these rectangular bricks, stud centres and underside sockets share a grid.
function grid(p:Piece){
 const d=partMap.get(p.part)!.basic!;
 const yaw=p.rotation[1]*Math.PI/180,result=new Set<string>();
 for(let x=-d.width/2+10;x<d.width/2;x+=20)for(let z=-d.depth/2+10;z<d.depth/2;z+=20){
  result.add(`${Math.round(p.position[0]+x*Math.cos(yaw)+z*Math.sin(yaw))},${Math.round(p.position[2]-x*Math.sin(yaw)+z*Math.cos(yaw))}`);
 }
 return result;
}
function connections(lower:Piece,upper:Piece){
 assert.equal(upper.position[1]-partMap.get(upper.part)!.basic!.height,lower.position[1]);
 const sockets=grid(upper);return [...grid(lower)].filter(s=>sockets.has(s)).length;
}
const pieces=robot(),torso=pieces.find(p=>p.group==='Torso'&&p.step===4)!;
for(const sign of [-1,1]){
 const foot=pieces.find(p=>p.group==='Pies'&&Math.sign(p.position[0])===sign)!;
 const legs=pieces.filter(p=>p.group==='Piernas'&&Math.sign(p.position[0])===sign).sort((a,b)=>a.step-b.step);
 assert.equal(connections(foot,legs[0]),2,'Foot must attach to both leg sockets');
 assert.equal(connections(legs[0],legs[1]),2);
 assert.equal(connections(legs[1],torso),2,'Foot correction must preserve torso alignment');
 const oldFoot={...foot,position:[legs[0].position[0],foot.position[1],foot.position[2]] as [number,number,number]};
 assert.equal(connections(oldFoot,legs[0]),0,'Regression must detect the old half-stud error');
}
console.log('PASS: both feet, leg stacks and torso share stud centres; old layout rejected.');
