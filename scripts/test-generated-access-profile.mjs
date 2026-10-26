import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler} from './lib/ldraw-envelope.mjs';
import {buildGeneratedAccessProfile} from './lib/generated-access-profile.mjs';
import {standardPort} from './lib/generated-profile.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),compiler=createEnvelopeCompiler(createPackedGeometryRepository(root));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'lib/collision-manifest.json'))),shadow=JSON.parse(fs.readFileSync(path.join(root,'lib/shadow-catalog.json'))),packs=new Map();
function args(id){
 const entry=manifest.parts[id],e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/shadow/'+e.pack+'.bin')))));
 return {metadata:packs.get(e.pack)[id],envelope:JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/catalog/collision/'+entry.asset+'.bin')))),geometry:compiler.geometry(id),expectedSourceHash:entry.sourceHash,socketClearance:request=>compiler.socketClearance(id,request)};
}
let tested=0;
for(const id of ['276','512','1566','1874','2443','2490','3573','4022','6120','20308','30350b']){
 const input=args(id),result=buildGeneratedAccessProfile(input);assert.equal(result.supported,true,id+': '+JSON.stringify(result));
 assert.equal(result.profile.version,4);assert.equal(result.profile.source,'ldraw-standard-access-envelope-v1');assert.equal(result.profile.connectors.length,1);assert.ok(result.profile.solids.length<=129);
 assert.equal(result.profile.accessEvidence.certificate.connectorCertified,false,'The void proof alone is not the connector proof');assert.equal(result.profile.accessEvidence.sourceHash,input.expectedSourceHash);
 assert.deepEqual(buildGeneratedAccessProfile(input),result,'deterministic adapter');
 assert.equal(buildGeneratedAccessProfile({...input,expectedSourceHash:'0'.repeat(64)}).supported,false);
 assert.equal(buildGeneratedAccessProfile({...input,metadata:{...input.metadata,coverage:'partial'}}).supported,false);
 const selected=result.profile.connectors[0],one={...input,metadata:{...input.metadata,connectors:input.metadata.connectors.filter(c=>{const p=standardPort(c);return p&&p.kind===selected.kind&&JSON.stringify(p.point)===JSON.stringify(selected.point)&&JSON.stringify(p.normal)===JSON.stringify(selected.normal);})}};
 assert.ok(one.metadata.connectors.length);assert.equal(buildGeneratedAccessProfile(one).supported,true);
 if(selected.kind==='socket')assert.equal(buildGeneratedAccessProfile({...one,socketClearance:()=>({status:'blocked',reason:'blocked_fixture'})}).supported,false);
 const radial=[0,1,2].filter(i=>selected.normal[i]===0),at=(u,v)=>selected.point.map((n,i)=>n+selected.normal[i]*1+(i===radial[0]?u:i===radial[1]?v:0));
 const obstructed={...one.geometry,body:[...one.geometry.body,[at(-1,-1),at(1,-1),at(1,1),at(-1,1)]]};
 assert.equal(buildGeneratedAccessProfile({...one,geometry:obstructed}).supported,false,'A real cap in the access column cannot be removed');
 if(input.geometry.studs.length){
  const changed=structuredClone(input.geometry);changed.studs[0].sourceKey='p/unknown-stud.dat';assert.equal(buildGeneratedAccessProfile({...input,geometry:changed}).supported,false);
  const malformed=structuredClone(input.geometry);malformed.studs[0].faces=[null];assert.equal(buildGeneratedAccessProfile({...input,geometry:malformed}).supported,false);
  const altered=structuredClone(input.envelope);for(const s of altered.removedStuds)s.solid={vertices:[],normals:[],edges:[],planes:[]};
  assert.deepEqual(buildGeneratedAccessProfile({...input,envelope:altered}),result,'Stud collision solids are rebuilt from verified source features, never copied from a changed cache');
 }
 tested++;
}
assert.equal(buildGeneratedAccessProfile(args('54873')).supported,false,'A socket outside the body hull cannot use the access fallback');
console.log(JSON.stringify({standardAccessAdapter:true,realReferences:tested,hashBinding:true,sourceObstacles:true,partialMetadataRejected:true,studBodiesRebuilt:true,allPassed:true}));
