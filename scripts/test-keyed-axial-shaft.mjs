import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {parseLDraw} from './lib/variant-proof.mjs';
import {createPackedGeometryRepository,createEnvelopeCompiler,pointInEnvelope} from './lib/ldraw-envelope.mjs';
import {A6_SECTION_COMPONENTS,REVIEWED_A6_SOURCES,centeredA6ShaftPort,certifyWholeA6Shaft} from './lib/keyed-axial-shaft.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository=createPackedGeometryRepository(root),compiler=createEnvelopeCompiler(repository);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'lib/shadow-catalog.json'),'utf8')),packs=new Map();
const clone=structuredClone,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const add=(a,b)=>a.map((n,i)=>n+b[i]),mul=(v,s)=>v.map(n=>n*s);
const transform=(p,m,o=[0,0,0])=>[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),p)+o[i]);
const matmul=(a,b)=>[0,1,2].flatMap(i=>[0,1,2].map(j=>[0,1,2].reduce((s,k)=>s+a[i*3+k]*b[k*3+j],0)));
const identity=[1,0,0,0,1,0,0,0,1],flipMatrix=[1,0,0,0,-1,0,0,0,1];
function connectorFor(id){
  const entry=manifest.parts[id];if(!packs.has(entry.pack))packs.set(entry.pack,JSON.parse(gunzipSync(fs.readFileSync(path.join(root,`public/catalog/shadow/${entry.pack}.bin`)))));
  return clone(packs.get(entry.pack)[id].connectors.find(c=>c.type==='cylinder'&&c.gender==='M'&&c.shape.sections.length===1&&c.shape.sections[0].shape==='A'));
}
const baseConnector=connectorFor('3704'),baseGeometry=clone(compiler.geometry('3704'));
const rootRecords=parseLDraw(repository.read('parts/3704.dat')).filter(r=>r.type===1);
const certify=(geometry=baseGeometry,connector=baseConnector,repo=repository)=>certifyWholeA6Shaft({geometry,connector,repository:repo});
let checks=0;const real=[];
function check(name,fn){fn();checks++;console.log(`PASS ${name}`);}
function assertRejected(result,reason){assert.equal(result.status,'unsupported',JSON.stringify(result));if(reason)assert.equal(result.reason,reason);}
function assertCertified(result){
  assert.equal(result.status,'certified',JSON.stringify(result));assert.equal(result.asset.solids.length,2);
  for(const solid of result.asset.solids){assert.equal(solid.vertices.length,12);assert.ok(solid.normals.length<=128);assert.ok(solid.edges.length<=128);assert.ok(solid.vertices.every(p=>pointInEnvelope(p,solid,1e-8)));}
  assert.equal(result.certificate.engagement,'sixteen-complete-source-keyed-flanks');
}
function assertWholeFacesCovered(geometry,result){
  for(const face of geometry.body){const triangles=face.length===3?[face]:[[face[0],face[1],face[2]],[face[0],face[2],face[3]]];
    for(const triangle of triangles)assert.ok(result.asset.solids.some(s=>triangle.every(p=>pointInEnvelope(p,s,1e-8))),'One complete triangle must fit one component');
  }
}
function memoryRepository(files){
  return {read:key=>files.has(key)?files.get(key):repository.read(key),resolve:name=>{
    name=name.replaceAll('\\','/').toLowerCase();return ['parts/'+name,'p/'+name,name].find(k=>files.has(k))??repository.resolve(name);
  }};
}
function fixture({change=()=>{},ldrawRotation=identity,ldrawOffset=[0,0,0],name='arbitrary-shaft-name',length=40}={}){
  const records=clone(rootRecords),connector=clone(baseConnector);
  if(length!==40){records[0].offset[0]=length/2;records[1].offset[0]=-length/2;records[2].offset[0]=length/2-2.5;records[2].matrix[1]=-(length-5);connector.shape.sections[0].length=length;}
  change(records);
  for(const r of records){r.offset=transform(r.offset,ldrawRotation,ldrawOffset);r.matrix=matmul(ldrawRotation,r.matrix);}
  const text='0 Synthetic source family with no part-ID allowlist\n'+records.map(r=>`1 16 ${r.offset.join(' ')} ${r.matrix.join(' ')} ${r.reference}`).join('\n')+'\n';
  const files=new Map([['parts/'+name+'.dat',text]]),repo=memoryRepository(files),geometry=createEnvelopeCompiler(repo).geometry(name);
  const worldRotation=matmul(flipMatrix,matmul(ldrawRotation,flipMatrix)),worldOffset=transform(ldrawOffset,flipMatrix);
  connector.pos=transform(connector.pos,worldRotation,worldOffset);connector.normal=transform(connector.normal,worldRotation);connector.frame=matmul(worldRotation,connector.frame);
  return {geometry,connector,repository:repo,files};
}
function coreFaceIndex(geometry){return geometry.body.findIndex(f=>f.length===4&&f.every(p=>Math.abs(Math.abs(p[0])-17.5)<1e-8)&&Math.max(...f.map(p=>p[0]))-Math.min(...f.map(p=>p[0]))===35);}

for(const id of ['3704','3705','3706','3707','3708','3737','4519','23948','32073','44294','50450','50451','60485'])check(`real ${id}: reviewed whole A6 shaft, two convex components and continuous flanks`,()=>{
  const geometry=compiler.geometry(id),result=certify(geometry,connectorFor(id));assertCertified(result);assertWholeFacesCovered(geometry,result);
  const length=result.nominalLength;assert.deepEqual(result.bodyInterval,[-length/2+.5,length/2-.5]);assert.deepEqual(result.engagementIntervals,[[-length/2+2.5,length/2-2.5]]);
  real.push({id,nominalLength:length,bodyLength:length-1,engagementLength:length-5});
});
check('section is a nonconvex cross, not a hull or a cylinder',()=>{
  assert.equal(A6_SECTION_COMPONENTS.length,2);const result=certify();assertCertified(result);
  const p=result.port,world=([x,y,z])=>add(p.point,add(mul(p.axial.radialU,x),add(mul(p.normal,y),mul(p.axial.radialV,z))));
  assert.ok(result.asset.solids.some(s=>pointInEnvelope(world([5,0,0]),s,1e-8)));
  assert.ok(result.asset.solids.some(s=>pointInEnvelope(world([0,0,5]),s,1e-8)));
  for(const [x,z] of [[3,3],[-3,3],[-3,-3],[3,-3]])assert.ok(!result.asset.solids.some(s=>pointInEnvelope(world([x,0,z]),s,1e-8)));
});
check('unknown part name with the reviewed source family is accepted',()=>{assertCertified(certifyWholeA6Shaft(fixture()));});
check('unlisted shaft length is proved from geometry rather than an ID/length allowlist',()=>{
  const result=certifyWholeA6Shaft(fixture({name:'new-cross-shaft-50',length:50}));assertCertified(result);assert.equal(result.nominalLength,50);assert.deepEqual(result.engagementIntervals,[[-22.5,22.5]]);
});
for(const [name,rotation,offset] of [
  ['quarter turn',[0,-1,0,1,0,0,0,0,1],[10,-4,9]],
  ['axis permutation',[0,0,1,1,0,0,0,1,0],[-20,7,11]],
  ['rigid reflection',[-1,0,0,0,1,0,0,0,1],[0,0,0]],
])check(`${name}: preserves reviewed geometry, port and full source coverage`,()=>{
  const f=fixture({ldrawRotation:rotation,ldrawOffset:offset}),result=certifyWholeA6Shaft(f);assertCertified(result);assertWholeFacesCovered(f.geometry,result);
});
check('source order is irrelevant but every face remains required',()=>{
  const geometry=clone(baseGeometry);geometry.body.reverse();assertCertified(certify(geometry));
});
check('real notched 32062 does not pass the whole continuous source family',()=>{
  assertRejected(certify(compiler.geometry('32062'),connectorFor('32062')),'a6_not_whole_reviewed_source_family');
});
check('real compound 32506 is excluded',()=>{assertRejected(certify(compiler.geometry('32506'),connectorFor('32506')));});
for(const key of Object.keys(REVIEWED_A6_SOURCES))check(`changed pinned source ${key} is rejected, including descendants`,()=>{
  const repo=memoryRepository(new Map([[key,repository.read(key)+'\n0 changed\n']]));assertRejected(certify(baseGeometry,baseConnector,repo),'a6_reviewed_source_hash_changed');
});
check('an unreviewed dependency cannot substitute for box2-9p',()=>{
  const repo={read:key=>repository.read(key),resolve:name=>name==='box2-9p.dat'?'p/unreviewed-box.dat':repository.resolve(name)};
  assertRejected(certify(baseGeometry,baseConnector,repo),'a6_unreviewed_source_dependency');
});
check('stale expanded source hash is rejected',()=>{
  const g=clone(baseGeometry);g.sourceHash='0'.repeat(64);assertRejected(certify(g),'a6_expanded_source_hash_mismatch');
});
check('a missing whole core side cannot be replaced by metadata',()=>{
  const g=clone(baseGeometry);g.body.splice(coreFaceIndex(g),1);assertRejected(certify(g),'a6_continuous_keyed_flanks_not_proven');
});
check('a missing bevel/cap face fails complete source equality',()=>{
  const g=clone(baseGeometry);g.body.splice(0,1);assertRejected(certify(g),'a6_source_faces_differ_from_reviewed_family');
});
check('duplicate cap faces cannot compensate for a missing face',()=>{
  const g=clone(baseGeometry);g.body[0]=clone(g.body[1]);assertRejected(certify(g),'a6_source_faces_differ_from_reviewed_family');
});
check('a bow-tie core quad with identical vertices is rejected',()=>{
  const g=clone(baseGeometry),i=coreFaceIndex(g),f=g.body[i];g.body[i]=[f[0],f[2],f[1],f[3]];assertRejected(certify(g),'a6_continuous_keyed_flanks_not_proven');
});
check('a narrowed mesh cannot fake the full-width source flanks',()=>{
  const g=clone(baseGeometry);g.body=g.body.map(f=>f.map(([x,y,z])=>[x,y*.9,z*.9]));assertRejected(certify(g),'a6_continuous_keyed_flanks_not_proven');
});
check('protruding rendered geometry is rejected',()=>{
  const g=clone(baseGeometry);g.body.push([[0,-6.1,0],[1,-6.1,0],[0,-6.1,1]]);assertRejected(certify(g),'a6_source_triangle_outside_cross_union');
});
check('per-vertex union containment cannot hide a face bridging a concave corner',()=>{
  const g=clone(baseGeometry);g.body.push([[0,-5,0],[0,0,5],[0,0,0]]);
  const solids=certify().asset.solids;assert.ok(g.body.at(-1).every(p=>solids.some(s=>pointInEnvelope(p,s,1e-8))));
  assertRejected(certify(g),'a6_source_triangle_outside_cross_union');
});
check('an extra face inside the cross also fails reviewed-source equality',()=>{
  const g=clone(baseGeometry);g.body.push([[0,0,0],[1,0,0],[0,1,0]]);assertRejected(certify(g),'a6_source_faces_differ_from_reviewed_family');
});
check('missing end primitive in the root source fails the family contract',()=>{
  const f=fixture({change:r=>r.pop()});assertRejected(certifyWholeA6Shaft(f),'a6_not_whole_reviewed_source_family');
});
check('duplicated end at the same nominal end is rejected',()=>{
  const f=fixture({change:r=>{r[1]=clone(r[0]);}});assertRejected(certifyWholeA6Shaft(f),'a6_duplicate_end_placement');
});
check('a cap moved away from the source core is rejected',()=>{
  const f=fixture({change:r=>{r[0].offset[0]+=1;}});assertRejected(certifyWholeA6Shaft(f),'a6_invalid_reviewed_end_placement');
});
check('a shorter actual perimeter fails the continuous interval proof',()=>{
  const f=fixture({change:r=>{r[2].matrix[1]=-34;}});assertRejected(certifyWholeA6Shaft(f),'a6_incomplete_continuous_core');
});
check('radially narrowed source matrices are rejected',()=>{
  const f=fixture({change:r=>{r[2].matrix[3]=.9;}});assertRejected(certifyWholeA6Shaft(f),'a6_nonrigid_radial_source_transform');
});
check('a sheared core axis is rejected',()=>{
  const f=fixture({change:r=>{r[2].matrix[4]=.1;}});assertRejected(certifyWholeA6Shaft(f),'a6_sheared_source_transform');
});
check('a displaced noncoaxial core is rejected',()=>{
  const f=fixture({change:r=>{r[2].offset[2]=.1;}});assertRejected(certifyWholeA6Shaft(f),'a6_noncoaxial_source_member');
});
check('unsupported physical metadata on the source is rejected',()=>{
  const f=fixture();f.files.set(f.geometry.key,f.files.get(f.geometry.key)+'0 !FOO PHYSICAL CHANGE\n');assertRejected(certifyWholeA6Shaft(f),'a6_unsupported_geometry_meta');
});
check('unknown root geometry is not authorized by the three known references',()=>{
  const f=fixture();f.files.set(f.geometry.key,f.files.get(f.geometry.key)+'3 16 0 0 0 1 0 0 0 1 0\n');assertRejected(certifyWholeA6Shaft(f),'a6_not_whole_reviewed_source_family');
});
for(const [name,change] of [
  ['female',c=>{c.gender='F';}],['R6 cylinder',c=>{c.shape.sections[0].shape='R';}],
  ['wrong radius',c=>{c.shape.sections[0].radius=5;}],['off-center section',c=>{c.shape.center=false;}],
  ['capped section',c=>{c.shape.caps='A';}],['non-sliding section',c=>{c.shape.slide=false;}],
  ['unknown group',c=>{c.shape.group='custom';}],['unsupported metadata',c=>{c.unsupportedFeatures=['unknown'];}],
  ['unknown scale semantics',c=>{c.scale='stretch';}],['unknown mirror semantics',c=>{c.mirror='invented';}],
  ['short malformed core',c=>{c.shape.sections[0].length=5;}],['NaN length',c=>{c.shape.sections[0].length=NaN;}],
  ['nonfinite position',c=>{c.pos[0]=Infinity;}],['missing frame',c=>{delete c.frame;}],
  ['scaled frame',c=>{c.frame=c.frame.map(n=>n*2);}],['mismatched normal',c=>{c.normal=c.normal.map(n=>-n);}],
  ['non-quarter frame',c=>{const a=Math.SQRT1_2,r=[a,0,-a,0,1,0,a,0,a];c.frame=matmul(r,c.frame);c.normal=transform(c.normal,r);}],
])check(`metadata ${name} cannot authorize an A6 shaft`,()=>{
  const c=clone(baseConnector);change(c);assert.equal(centeredA6ShaftPort(c),null);assertRejected(certify(baseGeometry,c),'not_centered_reviewed_a6_male');
});
check('changing nominal length without matching geometry fails placement proof',()=>{
  const c=clone(baseConnector);c.shape.sections[0].length=42;assertRejected(certify(baseGeometry,c),'a6_invalid_reviewed_end_placement');
});
check('invalid source coordinates and face count fail closed',()=>{
  const g=clone(baseGeometry);g.body[0][0][0]=NaN;assertRejected(certify(g),'a6_invalid_source_face');
  const large=clone(baseGeometry);large.body=Array(32001).fill(baseGeometry.body[0]);assertRejected(certify(large),'a6_invalid_source_geometry');
});
check('separate features cannot disappear from the whole-shaft proof',()=>{
  const g=clone(baseGeometry);g.studs=[{pos:[0,0,0]}];assertRejected(certify(g),'a6_whole_shaft_has_separate_features');
});
check('unsafe geometry source key is rejected',()=>{
  const g=clone(baseGeometry);g.key='../3704.dat';assertRejected(certify(g),'invalid_reference');
});
check('missing proof inputs do not produce a certificate',()=>{
  assertRejected(certifyWholeA6Shaft());assertRejected(certifyWholeA6Shaft({geometry:baseGeometry,connector:baseConnector}),'a6_missing_source_repository');
});
console.log(JSON.stringify({tests:checks,realCertified:real.length,real,limits:{solidsPerShaft:2,verticesPerSolid:12,nominalMinusBody:1,nominalMinusEngagement:5}},null,2));
