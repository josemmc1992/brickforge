import assert from 'node:assert/strict';
import {validAxialConnector,axialSectionsFit,axialConnectorsMatch,axialEngagement,axialOffsetRange,transformAxialConnector,type AxialConnector,type AxialVec,type SectionPoint} from '../lib/axial-fit';

// Exact rounded vertices of the shipped LDraw 4-4cyli, not an ideal circle.
const quadrant:SectionPoint[]=[[4,0],[3.6956,1.5308],[2.8284,2.8284],[1.5308,3.6956]];
const section:SectionPoint[]=[];
for(let q=0;q<4;q++)for(const [x,z] of quadrant)section.push(q===0?[x,z]:q===1?[-z,x]:q===2?[-x,-z]:[z,-x]);
const male:AxialConnector={id:'bar',kind:'bar',point:[0,-40,0],normal:[0,1,0],axial:{contract:'r4-through-centered-fixed-v1',radius:4,length:80,radialU:[1,0,0],radialV:[0,0,1],section}};
const female:AxialConnector={id:'bore',kind:'bar-socket',point:[0,0,0],normal:[1,0,0],axial:{...male.axial,length:40,radialU:[0,-1,0],radialV:[0,0,1]}};
const quarter=(p:AxialVec):AxialVec=>[p[1],-p[0],p[2]];
const placed=transformAxialConnector(male,quarter,[40,0,0]);
assert.ok(validAxialConnector(male));assert.ok(validAxialConnector(female));assert.ok(validAxialConnector(placed));
assert.deepEqual(placed.point,[0,0,0]);
assert.ok(axialConnectorsMatch(placed,female),'real 30374/3673 centred pose is compatible only after separate cavity certification');
assert.ok(!axialConnectorsMatch(male,female),'untransformed axes do not mate');
assert.ok(!axialConnectorsMatch({...placed,point:[1,0,0]},female),'sliding is not exposed by the centred-pose contract');
assert.ok(!axialConnectorsMatch({...placed,point:[0,1,0]},female),'radial displacement is not an axial joint');
assert.ok(!axialConnectorsMatch(placed,{...female,kind:'bar'}),'two male shafts never connect');
const reversed=transformAxialConnector(placed,p=>[-p[0],-p[1],p[2]],[0,0,0]);
assert.ok(axialConnectorsMatch(reversed,female),'a certified through bore has two open ends');
const narrow={...female,axial:{...female.axial,section:section.map(([x,z])=>[x*.99,z*.99] as SectionPoint)}};
assert.ok(!axialSectionsFit(placed,narrow),'a smaller 16-gon cannot accept the nominal bar');
const rounded={...female,axial:{...female.axial,section:section.map(([x,z])=>[x*.99998,z*.99998] as SectionPoint)}};
assert.ok(!axialSectionsFit(placed,rounded,0),'strict mesh contact exposes source rounding');
assert.ok(axialSectionsFit(placed,rounded),'existing SAT tolerance bounds source rounding; it does not certify the cavity');
assert.ok(!axialSectionsFit(placed,narrow,.1),'callers cannot increase the declared fitting tolerance');
const almostNarrow={...female,axial:{...female.axial,section:section.map(([x,z])=>[x*.999,z*.999] as SectionPoint)}};
const offCentre={...placed,point:[0,.009,0] as AxialVec};
assert.ok(!axialSectionsFit(offCentre,almostNarrow),'radial offset participates in the penetration allowance');
assert.ok(!axialConnectorsMatch(offCentre,almostNarrow),'the fixed contract does not spend penetration tolerance on centre mismatch');
const angle=.0001;
const tilted=transformAxialConnector({...placed,axial:{...placed.axial,length:100000}},([x,y,z])=>[Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y,z],[0,0,0]);
assert.ok(!validAxialConnector(tilted),'an angular epsilon must not admit large displacement at the end of a long bar');
assert.ok(!axialConnectorsMatch(tilted,{...female,axial:{...female.axial,length:100000}}));
for(const candidate of [
 {...male,normal:[0,2,0]},
 {...male,axial:{...male.axial,radialV:[0,0,-1]}},
 {...male,axial:{...male.axial,section:[...section].reverse()}},
 {...male,axial:{...male.axial,section:[[0,0],[1,0],[0,1]]}},
 {...male,axial:{...male.axial,section:section.map(([x,z],i)=>i===3?[0,0]:[x,z])}},
 {...male,axial:{...male.axial,length:NaN}},
 {...male,axial:{...male.axial,contract:'unknown'}},
])assert.ok(!validAxialConnector(candidate));

const v2=(c:AxialConnector,slide:boolean):AxialConnector=>({...structuredClone(c),axial:{...structuredClone(c.axial),contract:'r4-through-sliding-v2',slide}});
const at=(c:AxialConnector,point:AxialVec):AxialConnector=>({...c,point});
const slidingBar=v2(placed,true),slidingSocket=v2(female,true);
assert.deepEqual(axialEngagement(placed,female),{mode:'fixed',interval:[-20,20],exclusive:true});
assert.deepEqual(axialOffsetRange(placed,female),[0,0]);
for(const [a,b] of [[placed,slidingSocket],[slidingBar,female]]){
 assert.deepEqual(axialEngagement(a,b),{mode:'fixed',interval:[-20,20],exclusive:true},'A mixed-version joint must preserve the fixed v1 contract');
 assert.equal(axialEngagement(a,at(b,[1,0,0])),null,'A v2 slide flag must not upgrade a v1 port');
 assert.deepEqual(axialOffsetRange(a,at(b,[35,30,20])),[0,0],'Placement ranges ignore current translation, not the contract');
}
const oldLongSocket={...female,axial:{...female.axial,length:100}};
assert.ok(axialConnectorsMatch(placed,oldLongSocket),'Length containment is a new v2 restriction; existing v1 semantics remain unchanged');
assert.ok(axialConnectorsMatch(slidingBar,oldLongSocket),'Mixed versions retain legacy centred matching');

for(const maleSlide of [false,true])for(const femaleSlide of [false,true]){
 const bar=v2(placed,maleSlide),socket=v2(female,femaleSlide),enabled=maleSlide||femaleSlide;
 assert.ok(validAxialConnector(bar));assert.ok(validAxialConnector(socket));
 assert.deepEqual(axialEngagement(bar,socket),{mode:enabled?'sliding':'fixed',interval:[-20,20],exclusive:!enabled},'LDCad slide flags combine with OR');
 assert.deepEqual(axialOffsetRange(bar,socket),enabled?[-20,20]:[0,0]);
 const moved=at(socket,[12,0,0]);
 assert.deepEqual(axialEngagement(bar,moved),enabled?{mode:'sliding',interval:[-8,32],exclusive:false}:null);
 assert.equal(axialConnectorsMatch(bar,moved),enabled);
 assert.deepEqual(axialEngagement(moved,bar),axialEngagement(bar,moved),'Argument order must not reverse the male-local interval');
}
for(const sign of [-1,1]){
 const limit=at(slidingSocket,[sign*20,0,0]);
 assert.deepEqual(axialEngagement(slidingBar,limit),{mode:'sliding',interval:sign===1?[0,40]:[-40,0],exclusive:false});
 assert.ok(axialEngagement(slidingBar,at(slidingSocket,[sign*(20+5e-9),0,0])),'Containment tolerates numerical noise bounded by 1e-8 LDU');
 assert.equal(axialEngagement(slidingBar,at(slidingSocket,[sign*(20+1e-7),0,0])),null,'Socket endpoints outside the finite shaft are rejected');
}
assert.equal(axialEngagement(slidingBar,at(slidingSocket,[12,.009,0])),null,'Sliding never spends SAT tolerance on radial displacement');
assert.equal(axialEngagement(slidingBar,at(slidingSocket,[0,1e-8,0])),null,'Radial alignment is strictly below the declared position epsilon');
assert.ok(axialEngagement(slidingBar,at(slidingSocket,[12,5e-9,0])));
assert.equal(axialEngagement(slidingBar,v2(narrow,true)),null,'Sliding preserves polygon containment checks');
assert.equal(axialOffsetRange(slidingBar,v2(narrow,true)),null);
assert.deepEqual(axialOffsetRange(slidingBar,at(slidingSocket,[999,54,-32])),[-20,20],'The range uses the oriented cross-sections at a common centre');
assert.equal(axialOffsetRange(v2(male,true),slidingSocket),null,'The placement helper requires already aligned axes');

for(const enabled of [false,true]){
 const longSocket={...v2(female,enabled),axial:{...v2(female,enabled).axial,length:100}};
 assert.equal(axialEngagement(slidingBar,longSocket),null,'v2 requires the complete receiver length to lie inside the male, even when centred');
 assert.equal(axialOffsetRange(slidingBar,longSocket),null);
 const equalSocket={...slidingSocket,axial:{...slidingSocket.axial,length:80}};
 assert.deepEqual(axialOffsetRange(v2(placed,enabled),equalSocket),[0,0]);
 assert.ok(axialEngagement(v2(placed,enabled),equalSocket));
 assert.equal(axialEngagement(v2(placed,enabled),at(equalSocket,[1e-7,0,0])),null);
}
const antiBar=transformAxialConnector(slidingBar,p=>[-p[0],-p[1],p[2]],[0,0,0]);
assert.deepEqual(axialEngagement(antiBar,at(slidingSocket,[15,0,0])),{mode:'sliding',interval:[-35,5],exclusive:false},'Intervals follow the male axis even when the socket points the other way');
const antiSocket=transformAxialConnector(slidingSocket,p=>[-p[0],-p[1],p[2]],[0,0,0]);
assert.deepEqual(axialEngagement(slidingBar,at(antiSocket,[15,0,0])),{mode:'sliding',interval:[-5,35],exclusive:false});
assert.deepEqual(axialOffsetRange(antiBar,antiSocket),[-20,20]);

// All 24 proper signed-axis orientations; use exact matrices, not trigonometric
// epsilons that would silently admit an unsupported tilted shaft.
const axes:AxialVec[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const dot=(a:AxialVec,b:AxialVec)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross=(a:AxialVec,b:AxialVec):AxialVec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
let orientations=0;
for(const x of axes)for(const y of axes){
 if(dot(x,y)!==0)continue;
 const z=cross(x,y),rotate=(v:AxialVec):AxialVec=>[0,1,2].map(i=>x[i]*v[0]+y[i]*v[1]+z[i]*v[2]) as AxialVec;
 const bar=transformAxialConnector(slidingBar,rotate,[123,45,-8]);
 const socket=transformAxialConnector(at(slidingSocket,[15,0,0]),rotate,[123,45,-8]);
 assert.ok(validAxialConnector(bar));assert.ok(validAxialConnector(socket));
 assert.deepEqual(axialEngagement(bar,socket),{mode:'sliding',interval:[-5,35],exclusive:false});
 assert.deepEqual(axialOffsetRange(bar,socket),[-20,20]);
 const radial=socket.point.map((n,i)=>n+bar.axial.radialU[i]*.009) as AxialVec;
 assert.equal(axialEngagement(bar,at(socket,radial)),null);
 orientations++;
}
assert.equal(orientations,24);
for(const candidate of [
 {...slidingBar,point:[NaN,0,0]},
 {...slidingBar,point:[Infinity,0,0]},
 {...slidingBar,axial:{...slidingBar.axial,slide:undefined}},
 {...slidingBar,axial:{...slidingBar.axial,slide:1}},
 {...slidingBar,axial:{...slidingBar.axial,slide:'true'}},
 {...slidingBar,axial:{...slidingBar.axial,length:NaN}},
 {...slidingBar,axial:{...slidingBar.axial,length:100001}},
 {...slidingBar,axial:{...slidingBar.axial,section:[...section].reverse()}},
 {...slidingBar,axial:{...slidingBar.axial,section:Array.from({length:65},(_,i)=>[4*Math.cos(i*2*Math.PI/65),4*Math.sin(i*2*Math.PI/65)])}},
]){
 assert.equal(validAxialConnector(candidate),false);
 assert.equal(axialEngagement(candidate as AxialConnector,slidingSocket),null);
 assert.equal(axialOffsetRange(candidate as AxialConnector,slidingSocket),null,'Ignoring position does not permit non-finite metadata');
}
console.log('PASS axial contracts: unchanged v1/mixed centred poses; v2 slide OR, signed male-local intervals, full receiver containment, 24 orientations, radial alignment, limits and malformed metadata. Geometry certification remains a separate prerequisite.');
