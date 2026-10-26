import assert from 'node:assert/strict';
import {validTechnicPinConnector,technicPinConnectorsMatch,type TechnicPinConnector,type PinVector} from '../lib/technic-pin-fit.ts';
const male:TechnicPinConnector={id:'left',kind:'pin',point:[10,20,30],normal:[1,0,0],pin:{contract:'technic-pin-20-fixed-v1',length:20,shaftRadius:6,collarRadius:8,shaftSpan:16}},female:TechnicPinConnector={...male,id:'hole',kind:'pin-hole'};
assert.ok(validTechnicPinConnector(male));assert.ok(validTechnicPinConnector(female));
let poses=0;
for(const normal of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as PinVector[])for(const direction of [-1,1]){
 const a={...male,normal},b={...female,normal:normal.map(n=>n*direction) as PinVector};assert.ok(technicPinConnectorsMatch(a,b));assert.ok(technicPinConnectorsMatch(b,a));poses++;
}
assert.equal(technicPinConnectorsMatch(male,male),false);assert.equal(technicPinConnectorsMatch(female,female),false);
assert.equal(technicPinConnectorsMatch(male,{...female,normal:[0,1,0]}),false);
for(let i=0;i<3;i++){const point=[...female.point] as PinVector;point[i]+=.000001;assert.equal(technicPinConnectorsMatch(male,{...female,point}),false);}
for(const value of [null,[],{}, {...male,id:''},{...male,id:'x'.repeat(201)},{...male,kind:'stud'},{...male,normal:[1,.000000001,0]},{...male,normal:[0,0,0]},{...male,normal:[2,0,0]},{...male,normal:[NaN,0,0]},{...male,point:[Infinity,0,0]},{...male,point:[100001,0,0]},{...male,point:['10',20,30]},{...male,pin:null},{...male,pin:{...male.pin,contract:'r4-through-sliding-v2'}},{...male,pin:{...male.pin,length:40}},{...male,pin:{...male.pin,shaftRadius:4}},{...male,pin:{...male.pin,collarRadius:6}},{...male,pin:{...male.pin,shaftSpan:20}}]){
 assert.equal(validTechnicPinConnector(value),false);assert.equal(technicPinConnectorsMatch(value as TechnicPinConnector,female),false);
}
console.log(JSON.stringify({technicPinFixedContract:true,axisAndSidePoses:poses,malformedRejected:true,displacementsRejected:true}));
