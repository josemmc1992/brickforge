import assert from 'node:assert/strict';
import {minifigHipConnectorsMatch,validMinifigHipConnector,validMinifigHipPair,type MinifigHipConnector,type HipVector} from '../lib/minifig-hips-fit';
const a:MinifigHipConnector={id:'hip',kind:'hip-stud',point:[10,20,30],normal:[0,1,0],heading:[1,0,0],hip:{contract:'minifig-hipstud-11-fixed-v1',length:11,nominalRadius:6}},b:MinifigHipConnector={...a,id:'socket',kind:'hip-socket',normal:[0,-1,0]};
const axes:HipVector[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];let poses=0;
for(const normal of axes)for(const heading of axes){if(normal.some((n,i)=>n*heading[i]))continue;const x={...a,normal,heading},y={...b,normal:normal.map(n=>-n) as HipVector,heading};assert.ok(minifigHipConnectorsMatch(x,y));assert.ok(minifigHipConnectorsMatch(y,x));assert.equal(minifigHipConnectorsMatch(x,{...y,heading:heading.map(n=>-n) as HipVector}),false);assert.equal(minifigHipConnectorsMatch(x,{...y,normal}),false);poses++;}
assert.equal(poses,24);
for(const x of [null,[],{...a,id:''},{...a,normal:[1,1e-9,0]},{...a,heading:[0,1,0]},{...a,heading:[1,0,1e-9]},{...a,point:[Infinity,0,0]},{...a,kind:'stud'},{...a,hip:{...a.hip,length:12}},{...a,hip:{...a.hip,contract:'unverified'}}])assert.equal(validMinifigHipConnector(x),false);
for(let i=0;i<3;i++){const point=[...b.point] as HipVector;point[i]+=.000001;assert.equal(minifigHipConnectorsMatch(a,{...b,point}),false);}
const left={...a,id:'left',point:[-10,20,30] as HipVector,heading:[-1,0,0] as HipVector};assert.ok(validMinifigHipPair([a,left]));assert.ok(validMinifigHipPair([left,a]));for(const pair of [[a],[a,a],[a,b],[a,left,left],[a,{...left,point:[-9,20,30]}]])assert.equal(validMinifigHipPair(pair),false);
assert.equal(minifigHipConnectorsMatch(a,a),false);console.log(JSON.stringify({minifigHipFixedKeyedContract:true,axisPoses:poses,malformedUnseatedAndIncompletePairsRejected:true}));
