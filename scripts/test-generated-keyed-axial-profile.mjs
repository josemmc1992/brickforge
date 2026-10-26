import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {createKeyedAxialEnvelopeCompiler} from './lib/keyed-axial-channel.mjs';
import {buildGeneratedKeyedAxialProfile} from './lib/generated-keyed-axial-profile.mjs';
import {validKeyedAxialConnector,keyedEngagement,keyedOffsetRange,transformKeyedAxialConnector} from '../lib/keyed-axial-fit.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),repository=createPackedGeometryRepository(root),geometry=createEnvelopeCompiler(repository),keyedCompiler=createKeyedAxialEnvelopeCompiler(repository);
const shadow=JSON.parse(fs.readFileSync(root+'lib/shadow-catalog.json','utf8')),packs=new Map();
function metadata(id){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(root+'public/catalog/shadow/'+e.pack+'.bin'))));return packs.get(e.pack)[id];}
function compile(id,meta=metadata(id)){return buildGeneratedKeyedAxialProfile({partId:id,metadata:meta,geometry:geometry.geometry(id),repository,keyedCompiler});}
const shafts=['3704','3705','3706','3707','3708','3737','4519','23948','32073','44294','50450','50451','60485'];
const receivers=['3713','584','585','3647','4019','6536','32039'];
const profiles=new Map([...shafts,...receivers].map(id=>{
 const result=compile(id);assert.equal(result.supported,true,id);const p=result.profile;
 assert.equal(p.version,3);assert.equal(p.source,'ldraw-keyed-axial-envelope-v1');assert.equal(p.connectors.length,1);assert.ok(validKeyedAxialConnector(p.connectors[0]));
 assert.match(p.axialEvidence.sourceHash,/^[a-f0-9]{64}$/);assert.ok(p.solids.every(s=>s.vertices.length<=128&&s.normals.length<=128&&s.edges.length<=128));
 if(shafts.includes(id))assert.equal(p.solids.length,2,'The shaft must keep its concave cross, never its convex hull');
 assert.deepEqual(compile(id).profile,p,'deterministic compiler');return [id,p];
}));
for(const id of ['32062','32506','4698','6538b'])assert.equal(compile(id).supported,false,id+' cannot claim a simple through joint');
assert.equal(compile('3713',{...metadata('3713'),coverage:'partial'}).supported,false);
for(const slide of [undefined,null,'true',1]){const meta=structuredClone(metadata('3713'));for(const c of meta.connectors)c.shape.slide=slide;assert.equal(compile('3713',meta).supported,false);}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],rotations=[];
for(const x of axes)for(const y of axes){if(dot(x,y))continue;const z=cross(x,y);rotations.push(p=>[0,1,2].map(i=>x[i]*p[0]+y[i]*p[1]+z[i]*p[2]));}
let pairs=0,poses=0,endpoints=0;
for(const shaftId of shafts)for(const receiverId of receivers){
 const shaft=profiles.get(shaftId).connectors[0],receiver=profiles.get(receiverId).connectors[0];let matches=0;
 for(const rotate of rotations){
  const moved=transformKeyedAxialConnector(shaft,rotate,receiver.point.map((n,i)=>n-rotate(shaft.point)[i]));if(Math.abs(dot(moved.normal,receiver.normal))!==1)continue;
  assert.ok(keyedEngagement(moved,receiver),shaftId+'/'+receiverId);matches++;poses++;
  const range=keyedOffsetRange(moved,receiver);assert.ok(range);
  for(const offset of range){assert.ok(keyedEngagement(moved,{...receiver,point:receiver.point.map((n,i)=>n+moved.normal[i]*offset)}));endpoints++;}
  assert.equal(keyedEngagement(moved,{...receiver,point:receiver.point.map((n,i)=>n+moved.normal[i]*(range[1]+1e-4))}),null);
 }
 assert.equal(matches,8);pairs++;
}
console.log(JSON.stringify({keyedAdapter:true,profiles:profiles.size,pairs,poses,validEndpoints:endpoints,invalidBeyondEndsRejected:poses,allPassed:true}));
