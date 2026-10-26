import assert from 'node:assert/strict';
import fs from 'node:fs';
import {certifySourceAccess} from './lib/standard-access.mjs';
const box=(x0,x1,y0,y1,z0,z1)=>[
 [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],
 [[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],
 [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
];
const base={body:[...box(-20,20,-20,0,-10,10),...box(10,20,0,20,-10,10)],sourceHash:'a'.repeat(64),pos:[0,0,0],normal:[0,1,0]};
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const triangles=body=>body.flatMap(f=>f.length===3?[f]:[[f[0],f[1],f[2]],[f[0],f[2],f[3]]]);
const inside=(p,s)=>s.planes.every(h=>dot(p,h.normal)-h.constant<=1e-8);
function clip2(polygon,a,b,d){const out=[];for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=a*p[0]+b*p[1]-d,dq=a*q[0]+b*q[1]-d;if(dp<=0)out.push(p);if((dp<=0)!==(dq<=0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return out;}
function area2(p){return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;}
function outsideSolid(polygon,planes){const outside=[];let pending=polygon;for(const [a,b,d] of planes){const part=clip2(pending,-a,-b,-d);if(part.length>=3&&area2(part)>1e-15)outside.push(part);pending=clip2(pending,a,b,d);if(pending.length<3||area2(pending)<=1e-15)break;}return outside;}
function covered(body,result){for(const triangle of triangles(body)){
 if(result.solids.some(s=>triangle.every(p=>inside(p,s))))continue;
 const [origin,b,c]=triangle,u=sub(b,origin),v=sub(c,origin);let uncovered=[[[0,0],[1,0],[0,1]]];
 for(const s of result.solids){const planes=s.planes.map(h=>[dot(h.normal,u),dot(h.normal,v),h.constant-dot(h.normal,origin)+1e-8]);uncovered=uncovered.flatMap(p=>outsideSolid(p,planes));assert.ok(uncovered.length<4096);if(!uncovered.length)break;}
 assert.equal(uncovered.length,0,'whole source triangle must remain represented');
}}
let checks=0;function check(label,run){run();checks++;console.log('PASS '+label);}
const certified=input=>{const result=certifySourceAccess(input);assert.equal(result.status,'certified',JSON.stringify(result));covered(input.body,result);return result;};
check('L-shaped body clears its phantom convex shoulder while preserving material',()=>{const r=certified(base);assert.ok(!r.solids.some(s=>inside([0,5,0],s)));assert.ok(r.solids.some(s=>inside([15,5,0],s)));assert.ok(r.solids.some(s=>inside([0,-5,0],s)));assert.equal(r.certificate.connectorCertified,false);});
for(const [name,face] of [
 ['cap',[[-5,5,-5],[5,5,-5],[5,5,5],[-5,5,5]]],
 ['remote cap',[[-5,50,-5],[5,50,-5],[5,50,5],[-5,50,5]]],
 ['crossing triangle, vertices outside',[[-12,5,-12],[12,5,-12],[0,5,12]]],
 ['crossed quad',[[-12,5,-1],[12,5,1],[12,5,-1],[-12,5,1]]],
 ['tiny floor protrusion',[[-1,1e-7,-1],[1,1e-7,-1],[0,1e-7,1]]],
 ['tiny side protrusion',[[9.9999999,2,-1],[9.9999999,4,-1],[9.9999999,2,1]]],
])check(name+' rejects cutting actual material',()=>assert.equal(certifySourceAccess({...base,body:[...base.body,face]}).status,'indeterminate'));
for(const bad of [null,undefined,[],{}, {...base,normal:[1e-9,1,0]}, {...base,normal:[0,1+1e-9,0]}, {...base,sourceHash:'x'}, {...base,pos:[Infinity,0,0]}, {...base,body:[]}, {...base,body:[[[0,0,NaN],[1,0,0],[0,1,0]]]}, {...base,body:Array(32001).fill(base.body[0])}])check('malformed input rejects',()=>assert.equal(certifySourceAccess(bad).status,'indeterminate'));
check('floating connector outside the body hull rejects',()=>assert.equal(certifySourceAccess({...base,pos:[0,100,0]}).reason,'connection_outside_body_hull'));
const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
for(const x of axes)for(const y of axes){if(dot(x,y))continue;const z=cross(x,y),rotate=p=>[0,1,2].map(i=>x[i]*p[0]+y[i]*p[1]+z[i]*p[2]),offset=[123,41,-53],transform=p=>rotate(p).map((n,i)=>n+offset[i]);check('rigid rotation '+x+'/'+y,()=>certified({...base,body:base.body.map(f=>f.map(transform)),pos:offset,normal:rotate(base.normal)}));}
fs.mkdirSync(new URL('../.desktop-tests/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../.desktop-tests/standard-access-proof-tests.json',import.meta.url),JSON.stringify({proofSuite:true,checks,allPassed:true,sourceTriangleCoverage:'independent barycentric polygon subtraction'},null,2)+'\n');
