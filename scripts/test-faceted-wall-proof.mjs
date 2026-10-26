import assert from 'node:assert/strict';
import path from 'node:path';
import {certifyFacetBand} from './lib/faceted-wall-proof.mjs';
import {createPackedGeometryRepository} from './lib/ldraw-envelope.mjs';
import {reviewedR4Section} from './lib/axial-envelope.mjs';
const repo=createPackedGeometryRepository(path.resolve(import.meta.dirname,'..')),poly=reviewedR4Section(repo).polygon.map(p=>p.map(n=>n*1.5)),request={polygon:poly,lo:-8,hi:8};
const triangulate=f=>[[f[0],f[1],f[2]],[f[0],f[2],f[3]]],face=(i,lo=-8,hi=8)=>{const a=poly[i],b=poly[(i+1)%poly.length];return [[a[0],lo,a[1]],[b[0],lo,b[1]],[b[0],hi,b[1]],[a[0],hi,a[1]]];},base=poly.flatMap((_,i)=>triangulate(face(i)));
assert.equal(certifyFacetBand(base,request).status,'certified');assert.equal(certifyFacetBand(base.map(t=>[...t].reverse()),request).status,'certified');assert.equal(certifyFacetBand([...base,...base],request).status,'certified');
let rejects=0;
function reject(t){const r=certifyFacetBand(t,request);assert.equal(r.status,'indeterminate');assert.equal(r.reason,'pin_wall_surface_gap');rejects++;}
for(let missing=0;missing<16;missing++)reject(base.filter((_,i)=>Math.floor(i/2)!==missing));
for(const gap of [1,.01,1e-5,1e-7])reject(poly.flatMap((_,i)=>[...triangulate(face(i,-8,-gap/2)),...triangulate(face(i,gap/2,8))]));
// Each projected triangle reaches an end and together their Y projections
// cover the whole interval. Their actual surfaces leave a diagonal gap.
const f=face(0),lerp=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t),diagonal=[[f[0],f[1],lerp(f[1],f[2],.75)],[f[3],f[2],lerp(f[3],f[0],.75)]];
reject([...diagonal,...base.slice(2)]);
const a=poly[0],b=poly[1],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d),off=[d[1]/l*1e-7,0,-d[0]/l*1e-7];
reject(base.map((t,i)=>i<2?t.map(p=>p.map((n,k)=>n+off[k])):t));
console.log(JSON.stringify({fullFacetSurfaceCoverage:true,positiveCases:3,rejectedGapsAndOffPlaneFaces:rejects}));
