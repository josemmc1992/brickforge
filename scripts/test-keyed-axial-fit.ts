import assert from 'node:assert/strict';
import {validKeyedAxialConnector,keyedSectionsFit,keyedEngagement,keyedOffsetRange,transformKeyedAxialConnector,type KeyedAxialConnector,type KeyedPoint,type KeyedVec} from '../lib/keyed-axial-fit';
const H:KeyedPoint[]=[[-6,0],[-5.6023,-2],[5.6023,-2],[6,0],[5.6023,2],[-5.6023,2]];
const components:[KeyedPoint[],KeyedPoint[]]=[H,H.map(([x,z])=>[-z,x])];
const shaft:KeyedAxialConnector={id:'axle',kind:'axle',point:[0,0,0],normal:[0,1,0],axial:{contract:'a6-through-keyed-sliding-v1',radius:6,length:40,slide:true,radialU:[1,0,0],radialV:[0,0,1],sectionComponents:components,engagementInterval:[-17.5,17.5]}};
const socket:KeyedAxialConnector={id:'receiver',kind:'axle-socket',point:[0,0,0],normal:[0,1,0],axial:{contract:'a6-through-keyed-sliding-v1',radius:6,length:20,slide:false,radialU:[1,0,0],radialV:[0,0,1],sectionComponents:components}};
const at=(c:KeyedAxialConnector,y:number):KeyedAxialConnector=>({...c,point:[0,y,0]});
assert.ok(validKeyedAxialConnector(shaft));assert.ok(validKeyedAxialConnector(socket));
assert.ok(keyedSectionsFit(shaft,socket,0));assert.deepEqual(keyedOffsetRange(shaft,socket),[-7.5,7.5]);
assert.deepEqual(keyedEngagement(shaft,socket),{mode:'sliding',interval:[-10,10],exclusive:false});
assert.ok(keyedEngagement(shaft,at(socket,7.5)));
assert.equal(keyedEngagement(shaft,at(socket,7.5001)),null);
assert.equal(keyedEngagement(shaft,at(socket,9)),null,'Nominal length would accept 9, but the reviewed full-section engagement does not');
assert.equal(keyedEngagement(shaft,{...socket,point:[.009,0,0]}),null,'No radial use of the SAT tolerance');
for(const m of [false,true])for(const f of [false,true]){
 const a={...shaft,axial:{...shaft.axial,slide:m}},b={...socket,axial:{...socket.axial,slide:f}};
 assert.deepEqual(keyedOffsetRange(a,b),m||f?[-7.5,7.5]:[0,0]);
 assert.equal(keyedEngagement(a,at(b,1))!==null,m||f);
 assert.equal(keyedEngagement(a,b)!.exclusive,!(m||f));
}
const tooLong={...socket,axial:{...socket.axial,length:36}};
assert.equal(keyedEngagement(shaft,tooLong),null);assert.equal(keyedOffsetRange(shaft,tooLong),null);
const equal={...socket,axial:{...socket.axial,length:35}};
assert.ok(keyedEngagement(shaft,equal));assert.deepEqual(keyedOffsetRange(shaft,equal),[0,0]);
const contracted={...socket,axial:{...socket.axial,sectionComponents:components.map(p=>p.map(([x,z])=>[x*.9998,z*.9998])) as [KeyedPoint[],KeyedPoint[]]}};
assert.equal(keyedSectionsFit(shaft,contracted,0),false);assert.ok(keyedSectionsFit(shaft,contracted,.01));
const narrow={...socket,axial:{...socket.axial,sectionComponents:components.map(p=>p.map(([x,z])=>[x*.99,z*.99])) as [KeyedPoint[],KeyedPoint[]]}};
assert.equal(keyedSectionsFit(shaft,narrow),false);assert.equal(keyedSectionsFit(shaft,narrow,.1),false);
// Every vertex of this diamond lies in the cross, but its edges cross the
// empty concave quadrants. It must NOT fit as an entire convex component.
const diamond:KeyedPoint[]=[[6,0],[0,6],[-6,0],[0,-6]];
const falseUnion={...shaft,axial:{...shaft.axial,sectionComponents:[diamond,diamond] as [KeyedPoint[],KeyedPoint[]]}};
assert.equal(keyedSectionsFit(falseUnion,socket),false);
const dot=(a:KeyedVec,b:KeyedVec)=>a.reduce((s,n,i)=>s+n*b[i],0),cross=(a:KeyedVec,b:KeyedVec):KeyedVec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const axes:KeyedVec[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
let count=0;
for(const x of axes)for(const y of axes){if(dot(x,y))continue;const z=cross(x,y),rotate=(p:KeyedVec):KeyedVec=>[0,1,2].map(i=>x[i]*p[0]+y[i]*p[1]+z[i]*p[2]) as KeyedVec;
 const a=transformKeyedAxialConnector(shaft,rotate,[99900,-99900,99900]),b=transformKeyedAxialConnector(at(socket,7.5),rotate,[99900,-99900,99900]);
 assert.deepEqual(keyedEngagement(a,b),{mode:'sliding',interval:[-2.5,17.5],exclusive:false});count++;
}
assert.equal(count,24);
const flip=(p:KeyedVec):KeyedVec=>[p[0],-p[1],-p[2]];
const reversed=transformKeyedAxialConnector(shaft,flip,[0,0,0]);
assert.deepEqual(keyedEngagement(reversed,at(socket,7.5))!.interval,[-17.5,2.5]);
for(const bad of [
 {...shaft,point:[NaN,0,0]},
 {...shaft,normal:[1e-9,1,0]},
 {...shaft,normal:[0,1+1e-9,0]},
 {...shaft,axial:{...shaft.axial,engagementInterval:[-20,20]}},
 {...shaft,axial:{...shaft.axial,engagementInterval:[-17.5,NaN]}},
 {...shaft,axial:{...shaft.axial,sectionComponents:[H]}},
 {...shaft,axial:{...shaft.axial,sectionComponents:[[...H].reverse(),H]}},
 {...shaft,axial:{...shaft.axial,radialV:[0,0,-1]}},
 {...shaft,axial:{...shaft.axial,slide:'true'}},
 {...shaft,axial:{...shaft.axial,length:5}},
 {...shaft,axial:{...shaft.axial,radius:4}},
])assert.equal(validKeyedAxialConnector(bad),false);
console.log('PASS keyed A6 isolated matcher: two convex components, concave-corner exclusion, L-5 engagement, slide flags, signed intervals, 24 exact orientations and malformed inputs. No catalogue registration.');
