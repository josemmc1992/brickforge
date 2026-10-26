import assert from 'node:assert/strict';
import {collectAxialConnections,type AxialEndpoint} from '../lib/axial-connections';
import {transformAxialConnector,type AxialConnector,type AxialVec,type SectionPoint} from '../lib/axial-fit';
const section:SectionPoint[]=[];
for(let q=0;q<4;q++)for(const [x,z] of [[4,0],[3.6956,1.5308],[2.8284,2.8284],[1.5308,3.6956]])section.push(q===0?[x,z]:q===1?[-z,x]:q===2?[-x,-z]:[z,-x]);
function port(id:string,kind:'bar'|'bar-socket',y=0,length=kind==='bar'?80:24,slide=true):AxialEndpoint{
 return {pieceId:id,connector:{id:'port',kind,point:[0,y,0],normal:[0,1,0],axial:{contract:'r4-through-sliding-v2',slide,radius:4,length,radialU:[1,0,0],radialV:[0,0,1],section}}};
}
function permutations<T>(xs:T[]):T[][]{return xs.length?xs.flatMap((x,i)=>permutations([...xs.slice(0,i),...xs.slice(i+1)]).map(t=>[x,...t])):[[]];}
const parts=[port('bar','bar'),port('a','bar-socket',-28),port('b','bar-socket'),port('c','bar-socket',28)];
for(const ps of permutations(parts)){
 const r=collectAxialConnections(ps);assert.deepEqual(r.issues,[]);assert.equal(r.connections.length,3);
 assert.deepEqual(r.connections.map(c=>c.axial!.interval).sort((a,b)=>a[0]-b[0]),[[-40,-16],[-12,12],[16,40]]);
}
for(const y of [24,24+1e-7])assert.equal(collectAxialConnections([port('bar','bar'),port('a','bar-socket',-12),port('b','bar-socket',y-12)]).issues.length,0,'Reservations may touch exactly');
for(const y of [24-1e-4,24-1e-7,0]){
 const ps=[port('bar','bar'),port('a','bar-socket',-12),port('b','bar-socket',y-12)];
 for(const order of permutations(ps))assert.ok(collectAxialConnections(order).issues.some(i=>i.code==='occupied_connector'),'Reservation overlap is not allowed to spend the SAT .01 tolerance');
}
const legacy=port('old','bar-socket',0,4);legacy.connector.axial={...legacy.connector.axial,contract:'r4-through-centered-fixed-v1'};
for(const order of permutations([port('bar','bar'),legacy,port('a','bar-socket',24,4)]))assert.ok(collectAxialConnections(order).issues.length,'Any legacy mate makes a bar exclusive');
for(const order of permutations([port('bar','bar',0,80,false),port('fixed','bar-socket',0,4,false),port('sliding','bar-socket',24,4,true)]))assert.ok(collectAxialConnections(order).issues.length,'Fixed v2 makes the whole bar exclusive independent of order');
assert.equal(collectAxialConnections([port('bar','bar',0,80,false),port('a','bar-socket',-12,4,true),port('b','bar-socket',12,4,true)]).connections.length,2,'The receiver can enable sliding on a false-slide bar');
assert.ok(collectAxialConnections([port('bar','bar'),port('other','bar'),port('a','bar-socket')]).issues.length,'A receiver is never shared by two bars');
const reverse=(p:AxialEndpoint)=>({...p,connector:transformAxialConnector(p.connector,([x,y,z])=>[x,-y,-z],[0,0,0])});
const anti=collectAxialConnections([reverse(port('bar','bar')),port('a','bar-socket',28)]);
assert.deepEqual(anti.issues,[]);assert.deepEqual(anti.connections[0].axial!.interval,[-40,-16]);
assert.equal(collectAxialConnections([port('bar','bar'),reverse(port('a','bar-socket',28))]).connections.length,1);
for(const y of [-28.0001,28.0001])assert.equal(collectAxialConnections([port('bar','bar'),port('a','bar-socket',y)]).connections.length,0,'The entire receiver must lie inside the bar');
const radial=port('a','bar-socket');radial.connector.point[0]=.009;
assert.equal(collectAxialConnections([port('bar','bar'),radial]).connections.length,0);
// Across a grid-cell boundary, sub-epsilon alignment still finds the pair.
const edgeBar=port('bar','bar'),edgeSocket=port('a','bar-socket');edgeBar.connector.point[0]=-.5e-9;edgeSocket.connector.point[0]=.5e-9;
assert.equal(collectAxialConnections([edgeBar,edgeSocket]).connections.length,1);
const bad=port('bad','bar');bad.connector.point[0]=NaN;
assert.ok(collectAxialConnections([bad]).issues.length,'Malformed ports fail closed');
const legacyBar=port('bar','bar');legacyBar.connector.axial={...legacyBar.connector.axial,contract:'r4-through-centered-fixed-v1'};
const long=port('long','bar-socket',0,100);long.connector.axial={...long.connector.axial,contract:'r4-through-centered-fixed-v1'};
assert.equal(collectAxialConnections([legacyBar,long]).connections.length,1,'Legacy centred semantics stay intact even for longer receivers');
// Same connector IDs in different pieces, including slashes, cannot alias.
const names=[port('a/b','bar'),port('a','bar-socket',28)];names[0].connector.id='c';names[1].connector.id='b/c';
assert.equal(collectAxialConnections(names).connections.length,1);
// 1,000 separated pairs on one axis should require 1,000, not a million,
// polygon candidate checks. 10,000 same-kind ports need no candidate scans.
const many:AxialEndpoint[]=[];
for(let i=0;i<1000;i++)many.push(port('m'+i,'bar',i*90),port('f'+i,'bar-socket',i*90));
const scaled=collectAxialConnections(many);assert.equal(scaled.connections.length,1000);assert.equal(scaled.comparisons,1000);assert.deepEqual(scaled.issues,[]);
const same=collectAxialConnections(Array.from({length:10000},(_,i)=>port('m'+i,'bar')));assert.equal(same.comparisons,0);assert.deepEqual(same.issues,[]);
const dense=collectAxialConnections([...Array.from({length:100},(_,i)=>port('m'+i,'bar')),...Array.from({length:100},(_,i)=>port('f'+i,'bar-socket'))]);assert.equal(dense.truncated,true);assert.equal(dense.issues.length,80);
console.log('PASS axial collection: reservations, permutations, exclusivity, legacy, anti-axis, tiny overlaps, radial grid boundaries, malformed ports, bounded dense scenes and interval-sweep scaling.');
