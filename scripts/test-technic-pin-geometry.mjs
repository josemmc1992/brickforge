import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {createTechnicPinChannelCompiler,centeredTechnicPinHoleRequest} from './lib/technic-pin-channel.mjs';
import {certifyReviewedTechnicPin} from './lib/technic-pin-shaft.mjs';
const root=path.resolve(import.meta.dirname,'..'),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),channels=createTechnicPinChannelCompiler(repo),shadow=JSON.parse(fs.readFileSync(path.join(root,'lib/shadow-catalog.json'))),generated=JSON.parse(fs.readFileSync(path.join(root,'lib/generated-assembly.json'))),packs=new Map();
function meta(id){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow/'+e.pack+'.bin')))));return packs.get(e.pack)[id];}
const source=gc.geometry('3673'),male=meta('3673').connectors.find(c=>c.gender==='M'),pin=certifyReviewedTechnicPin(source,male,repo);assert.equal(pin.status,'certified',JSON.stringify(pin));assert.equal(pin.connectors.length,2);assert.equal(pin.asset.solids.length,80);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],inside=(p,s)=>s.planes.every(h=>dot(p,h.normal)-h.constant<=1e-8),triangulate=f=>f.length===3?[f]:[[f[0],f[1],f[2]],[f[0],f[2],f[3]]];
function clip2(p,a,b,d){const out=[];for(let i=0;i<p.length;i++){const v=p[i],w=p[(i+1)%p.length],dv=a*v[0]+b*v[1]-d,dw=a*w[0]+b*w[1]-d;if(dv<=0)out.push(v);if((dv<=0)!==(dw<=0)){const t=dv/(dv-dw);out.push([v[0]+t*(w[0]-v[0]),v[1]+t*(w[1]-v[1])]);}}return out;}
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function outside(polygon,planes){const out=[];let pending=polygon;for(const [a,b,d] of planes){const p=clip2(pending,-a,-b,-d);if(p.length>=3&&area(p)>1e-15)out.push(p);pending=clip2(pending,a,b,d);if(pending.length<3||area(pending)<=1e-15)break;}return out;}
function covered(geometry,solids){let split=0;for(const triangle of [...geometry.body,...geometry.studs.flatMap(s=>s.faces)].flatMap(triangulate)){if(solids.some(s=>triangle.every(p=>inside(p,s))))continue;split++;const [o,b,c]=triangle,u=sub(b,o),v=sub(c,o);let left=[[[0,0],[1,0],[0,1]]];for(const solid of solids){left=left.flatMap(p=>outside(p,solid.planes.map(h=>[dot(h.normal,u),dot(h.normal,v),h.constant-dot(h.normal,o)+1e-8])));assert.ok(left.length<4096);if(!left.length)break;}assert.equal(left.length,0,'A whole original face must remain covered');}return split;}
const pinSplitFaces=covered(source,pin.asset.solids),bounds=s=>[0,1,2].map(i=>[Math.min(...s.vertices.map(p=>p[i])),Math.max(...s.vertices.map(p=>p[i]))]),prepare=s=>({...s,bounds:bounds(s)});
function overlaps(a,b){if(a.bounds.some((aa,i)=>Math.min(aa[1],b.bounds[i][1])-Math.max(aa[0],b.bounds[i][0])<=.01))return false;const axes=[...a.normals,...b.normals];for(const x of a.edges)for(const y of b.edges)axes.push(cross(x,y));for(const axis of axes){const len=Math.hypot(...axis);if(len<1e-8)continue;const aa=a.vertices.map(v=>dot(v,axis)/len),bb=b.vertices.map(v=>dot(v,axis)/len);if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=.01)return false;}return true;}
const transform=(s,vector,offset=[0,0,0])=>({vertices:s.vertices.map(p=>vector(p).map((n,i)=>n+offset[i])),normals:s.normals.map(vector),edges:s.edges.map(vector)}),local=([x,y,z])=>[y,x,-z],pinLocal=pin.asset.solids.map(s=>transform(s,local));
function pose(solids,q,offset=0,radial=0){const turn=([x,y,z])=>q===0?[x,y,z]:q===1?[-z,y,x]:q===2?[-x,y,-z]:[z,y,-x];return solids.map(s=>prepare(transform(s,turn,[radial,offset,0])));}
const collides=(a,b)=>a.some(x=>b.some(y=>overlaps(x,y)));let valid=0,rejected=0;const cases=[];
for(const id of ['3700','3701','32523','43857','32000','32524','32316','32034','41239']){
 const c=meta(id).connectors.find(centeredTechnicPinHoleRequest),hole=channels.compile(id,c);assert.equal(hole.status,'certified',id+': '+JSON.stringify(hole));const split=covered(gc.geometry(id),hole.asset.solids),m=c.frame,axes=[0,1,2].map(i=>[m[i],m[i+3],m[i+6]]),vector=p=>axes.map(a=>dot(p,a)),offset=vector(c.pos).map(n=>-n),receiver=hole.asset.solids.map(s=>prepare(transform(s,vector,offset)));
 for(const end of [-1,1])for(let q=0;q<4;q++){
  assert.equal(collides(pose(pinLocal,q,end*10),receiver),false,id+' valid fixed pin end');valid++;
  for(const [axial,radial] of [[end*9,0],[end*10,.3]]){assert.ok(collides(pose(pinLocal,q,axial,radial),receiver));rejected++;}
 }
 cases.push({id,splitSourceFaces:split});
}
assert.equal(valid,72);assert.equal(rejected,144);
let r4=0;for(const id of ['30374','87994']){const p=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/assembly/'+generated.profiles[id].asset+'.bin')))),center=p.connectors[0].point,centered=p.solids.map(s=>transform(s,v=>v,center.map(n=>-n)));for(let q=0;q<4;q++){assert.equal(collides(pose(centered,q),pinLocal.map(prepare)),false,'Existing R4 passage must stay usable');r4++;}}
const bad=structuredClone(source);bad.body[0][0][0]+=.0000001;assert.equal(certifyReviewedTechnicPin(bad,male,repo).status,'indeterminate');assert.equal(certifyReviewedTechnicPin({...source,sourceHash:'0'.repeat(64)},male,repo).status,'indeterminate');assert.equal(certifyReviewedTechnicPin(source,{...male,pos:[1,0,0]},repo).status,'indeterminate');assert.equal(certifyReviewedTechnicPin(source,male,null).status,'indeterminate');
let calls=0;const changing={resolve:name=>repo.resolve(name),read:key=>{const text=repo.read(key);if(key==='p/connect.dat'&&++calls>1)return text+'\n0 changed while proving\n';return text;}};
assert.equal(certifyReviewedTechnicPin(source,male,changing).reason,'technic_pin_source_changed_during_proof');
console.log(JSON.stringify({reviewedWholePin:true,pinSplitFaces,validPinPoses:valid,rejectedDisplacements:rejected,retainedR4Poses:r4,sourceMutationRejected:true,cases}));
