// Independently cover every original face by the runtime solids (plus active
// stud boxes). This checks the compiled result, not the void proof's own claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
const root=path.resolve(import.meta.dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'lib/generated-assembly.json'))),compiler=createEnvelopeCompiler(createPackedGeometryRepository(root));
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]);
function planes(s){const out=[];for(const n of s.normals){const len=Math.hypot(...n);assert.ok(len>0);for(const sign of [-1,1]){const normal=n.map(v=>v*sign/len);out.push({normal,constant:Math.max(...s.vertices.map(p=>dot(p,normal)))});}}return out;}
function clip(p,a,b,d){const out=[];for(let i=0;i<p.length;i++){const v=p[i],w=p[(i+1)%p.length],dv=a*v[0]+b*v[1]-d,dw=a*w[0]+b*w[1]-d;if(dv<=0)out.push(v);if((dv<=0)!==(dw<=0)){const t=dv/(dv-dw);out.push([v[0]+t*(w[0]-v[0]),v[1]+t*(w[1]-v[1])]);}}return out;}
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function subtract(polygon,planes){
 if(polygon.every(p=>planes.every(([a,b,d])=>a*p[0]+b*p[1]<=d)))return [];
 // A disjoint cell removes nothing. Avoid repeatedly tessellating a distant
 // face with its side planes before finally reaching a separating end plane.
 let intersection=polygon;
 for(const [a,b,d] of planes){intersection=clip(intersection,a,b,d);if(intersection.length<3)return [polygon];}
 const out=[];let pending=polygon;for(const [a,b,d] of planes){const p=clip(pending,-a,-b,-d);if(p.length>=3&&area(p)>1e-15)out.push(p);pending=clip(pending,a,b,d);if(pending.length<3||area(pending)<=1e-15)break;}return out;
}
const triangleProbe=[[0,0],[1,0],[0,1]];
assert.deepEqual(subtract(triangleProbe,[[1,0,.5],[0,-1,-2]]),[triangleProbe],'A remote cell must not fragment an untouched face');
assert.deepEqual(subtract(triangleProbe,[[-1,0,0],[0,-1,0],[1,1,1]]),[]);
assert.deepEqual(subtract(triangleProbe.map(p=>p.map(n=>n*1e-9)),[[-1,0,0],[0,-1,0],[1,1,1]]),[],'A fully contained tiny fragment is covered regardless of its area');
assert.ok(Math.abs(subtract(triangleProbe,[[1,0,.5]]).reduce((n,p)=>n+area(p),0)-.125)<1e-15);
const family=process.argv.includes('--family=minifig-hips')?'minifig-hips':process.argv.includes('--family=minifig-neck')?'minifig-neck':'technic-pin';
const seen=new Set(),results=[];let faces=0,splitFaces=0,references=0;
for(const [id,entry] of Object.entries(manifest.profiles)){
 if(!entry.connectionFamilies?.includes(family))continue;references++;
 const geometry=compiler.geometry(id),sourceFaces=[...geometry.body,...geometry.studs.flatMap(s=>s.faces)],geometryHash=createHash('sha256').update(JSON.stringify(sourceFaces)).digest('hex'),key=entry.asset+'/'+geometryHash;
 if(seen.has(key))continue;seen.add(key);
 const profile=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/assembly/'+entry.asset+'.bin')))),solids=profile.solids.map(planes);
 for(const c of profile.connectors.filter(c=>c.kind==='stud')){
  const k=c.normal.findIndex(n=>Math.abs(n)===1),min=c.point.map((v,i)=>i===k?v+Math.min(0,c.normal[i]*4):v-6),max=c.point.map((v,i)=>i===k?v+Math.max(0,c.normal[i]*4):v+6);
  solids.push([0,1,2].flatMap(i=>[-1,1].map(sign=>({normal:[0,1,2].map(j=>j===i?sign:0),constant:sign===1?max[i]:-min[i]}))));
 }
 for(const evidence of (family==='minifig-hips'?profile.hipEvidence:family==='minifig-neck'?profile.neckEvidence:profile.pinEvidence)){assert.equal(evidence.sourceHash,geometry.sourceHash);assert.equal(evidence.geometryHash,evidence.proof.startsWith('reviewed-whole')?createHash('sha256').update(JSON.stringify(geometry.body)).digest('hex'):geometryHash);}
 let split=0;
 for(const triangle of sourceFaces.flatMap(f=>f.length===3?[f]:[[f[0],f[1],f[2]],[f[0],f[2],f[3]]])){
  faces++;if(solids.some(s=>triangle.every(p=>s.every(h=>dot(p,h.normal)-h.constant<=1e-8))))continue;
  split++;const [o,b,c]=triangle,u=sub(b,o),v=sub(c,o);let left=[[[0,0],[1,0],[0,1]]];
  for(const solid of solids){left=left.flatMap(p=>subtract(p,solid.map(h=>[dot(h.normal,u),dot(h.normal,v),h.constant-dot(h.normal,o)+1e-8])));assert.ok(left.length<4096,id+' face fragmentation limit');if(!left.length)break;}
  assert.equal(left.length,0,id+': a complete original face must remain covered');
 }
 splitFaces+=split;results.push({id,sourceTriangles:sourceFaces.reduce((n,f)=>n+f.length-2,0),splitFaces:split});
 if(results.length%50===0)console.log(JSON.stringify({family,sourceProfiles:results.length,faces,splitFaces}));
}
assert.ok(references>10);const report={allSourceFacesCovered:true,family,references,uniqueGeometryAssetPairs:seen.size,faces,splitFaces,results};fs.writeFileSync(path.join(root,'.desktop-tests/'+family+'-source-coverage.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
