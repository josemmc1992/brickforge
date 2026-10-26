import assert from 'node:assert/strict';
import {minifigNeckConnectorsMatch,validMinifigNeckConnector,type MinifigNeckConnector,type NeckVector} from '../lib/minifig-neck-fit';
const a:MinifigNeckConnector={id:'neck',kind:'neck',point:[10,20,30],normal:[0,1,0],neck:{contract:'minifig-neck-12-fixed-v1',radius:6,length:12,socketDepth:20}},b:MinifigNeckConnector={...a,id:'head',kind:'neck-socket',normal:[0,-1,0]};
let poses=0;
for(const normal of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as NeckVector[]){const x={...a,normal},y={...b,normal:normal.map(n=>-n) as NeckVector};assert.ok(minifigNeckConnectorsMatch(x,y));assert.ok(minifigNeckConnectorsMatch(y,x));assert.equal(minifigNeckConnectorsMatch(x,{...y,normal}),false);poses++;}
for(const x of [null,[],{...a,id:''},{...a,normal:[1,1e-9,0]},{...a,point:[Infinity,0,0]},{...a,kind:'stud'},{...a,neck:{...a.neck,length:11}},{...a,neck:{...a.neck,socketDepth:12}},{...a,neck:{...a.neck,contract:'unverified'}}])assert.equal(validMinifigNeckConnector(x),false);
for(let i=0;i<3;i++){const point=[...b.point] as NeckVector;point[i]+=.000001;assert.equal(minifigNeckConnectorsMatch(a,{...b,point}),false);}
assert.equal(minifigNeckConnectorsMatch(a,a),false);assert.equal(minifigNeckConnectorsMatch(b,b),false);
console.log(JSON.stringify({minifigNeckFixedContract:true,axisPoses:poses,malformedAndUnseatedRejected:true}));
