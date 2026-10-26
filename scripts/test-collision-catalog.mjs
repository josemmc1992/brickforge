import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler,pointInEnvelope,certifySocketClearance,certifySocketSupport,sha256,geometryBounds} from './lib/ldraw-envelope.mjs';
import {ProofError} from './lib/variant-proof.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const repository=createPackedGeometryRepository(root),compiler=createEnvelopeCompiler(repository);
function contained(part){
  const result=compiler.compile(part),source=compiler.geometry(part),asset=result.asset;
  assert.ok(source.body.flat().every(p=>pointInEnvelope(p,asset.bodyHull)),part+' body vertices are conservatively covered');
  assert.equal(source.studs.length,asset.removedStuds.length);
  source.studs.forEach((feature,index)=>assert.ok(feature.faces.flat().every(p=>pointInEnvelope(p,asset.removedStuds[index].solid)),part+' removed stud is entirely covered'));
  assert.deepEqual(asset.bounds,geometryBounds([...source.body.flat(),...source.studs.flatMap(s=>s.faces.flat())]));
  for(const solid of [asset.bodyHull,...asset.removedStuds.map(s=>s.solid)]){
    assert.ok(solid.vertices.every(p=>p.length===3&&p.every(Number.isFinite)));
    assert.ok(solid.normals.length<=128&&solid.edges.length<=128&&solid.vertices.length<=128);
    assert.ok(solid.vertices.every(p=>pointInEnvelope(p,solid)));
  }
  assert.deepEqual(result,compiler.compile(part),'compilation is deterministic across cache hits');
  return result;
}
const brick=contained('3001');
assert.equal(brick.asset.removedStuds.length,8);
assert.ok(Math.max(...brick.asset.bodyHull.vertices.map(p=>p[1]))<.001,'only proven top studs leave the body');
assert.equal(brick.asset.bounds.max[1],4);
const headlight=contained('4070');
assert.ok(headlight.asset.removedStuds.some(s=>s.pos.join(',')==='0,-10,-6'&&s.normal.join(',')==='0,0,-1'));
const corner=contained('2357');
assert.deepEqual(corner.asset.bounds.min,[-10,-24,-10]);
assert.deepEqual(corner.asset.bounds.max,[30,4,30]);
const arch=contained('3659');
assert.ok(pointInEnvelope([0,-20,0],arch.asset.bodyHull),'unreviewed general envelope deliberately fills the arch opening');
const slope=contained('3039');
assert.ok(!pointInEnvelope([0,-1,-25],slope.asset.bodyHull),'convex slope preserves its sloping outer face');
assert.equal(contained('2780').asset.removedStuds.length,0,'Technic pin is not mistaken for a stud');
contained('6141');

function boxFaces(){return [
  [[-10,0,-10],[10,0,-10],[10,0,10],[-10,0,10]],
  [[-10,24,-10],[10,24,-10],[10,24,10],[-10,24,10]],
  [[-10,0,-10],[-10,24,-10],[10,24,-10],[10,0,-10]],
  [[-10,0,10],[-10,24,10],[10,24,10],[10,0,10]],
  [[-10,0,-10],[-10,24,-10],[-10,24,10],[-10,0,10]],
  [[10,0,-10],[10,24,-10],[10,24,10],[10,0,10]],
].map(f=>'4 16 '+f.flat().join(' ')).join('\n');}
function fixtures(files){return {resolve(name){return ['parts/'+name,'p/'+name,name].find(key=>files.has(key))??repository.resolve(name);},read(key){return files.get(key)??repository.read(key);}};}
const dat=reference=>boxFaces()+'\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 '+reference+'\n';
let custom=createEnvelopeCompiler(fixtures(new Map([['parts/fixture.dat',dat('stud.dat')]])));
assert.equal(custom.compile('fixture').asset.removedStuds.length,1);
custom=createEnvelopeCompiler(fixtures(new Map([['parts/fixture.dat',dat('stud.dat')],['p/stud.dat',repository.read('p/stud.dat')+'\n3 16 20 -4 0 21 -4 0 20 -3 0\n']])));
const modified=custom.compile('fixture');
assert.equal(modified.asset.removedStuds.length,0,'changed reviewed primitive is retained in the body');
assert.ok(pointInEnvelope([21,4,0],modified.asset.bodyHull));
custom=createEnvelopeCompiler(fixtures(new Map([['parts/fixture.dat',dat('stud-other.dat')],['p/stud-other.dat',repository.read('p/stud.dat')]])));
assert.equal(custom.compile('fixture').asset.removedStuds.length,0,'similar stud name is never a removal rule');
custom=createEnvelopeCompiler(fixtures(new Map([['parts/fixture.dat',boxFaces()+'\n1 16 0 0 0 1 0 0 0 2 0 0 0 1 stud.dat\n']])));
const scaled=custom.compile('fixture');
assert.equal(scaled.asset.removedStuds.length,0,'nonstandard scaled stud remains in the body');
assert.ok(pointInEnvelope([0,8,0],scaled.asset.bodyHull));
for(const [text,code] of [
  ['0 !TEXMAP START PLANAR 0 0 0 0 1 0 1 0 0 texture.png\n'+boxFaces(),'unsupported_meta'],
  ['0 !UNIMPLEMENTED_GEOMETRY data\n'+boxFaces(),'unsupported_meta'],
  ['1 16 0 0 0 1 0 0 0 1 0 0 0 1 fixture.dat\n','cyclic_reference'],
  ['3 16 0 0 0 10 0 0 0 0 10\n','degenerate_body'],
  ['1 16 200001 0 0 1 0 0 0 1 0 0 0 1 stud.dat\n','coordinate_limit'],
]){
  custom=createEnvelopeCompiler(fixtures(new Map([['parts/fixture.dat',text]])));
  assert.throws(()=>custom.compile('fixture'),error=>error instanceof ProofError&&error.code===code,code);
}

const socket={pos:[0,0,0],normal:[0,-1,0],radius:6,depth:4,tolerance:0};
const wall=[[[10,-10,-10],[10,10,-10],[10,0,10]]];
assert.equal(certifySocketClearance(wall,socket).status,'indeterminate','an empty corridor with distant material is not a receiver');
const cap=y=>[[-10,y,-10],[10,y,-10],[0,y,10]];
assert.equal(certifySocketClearance([...wall,cap(2)],socket).status,'blocked','interior obstruction blocks insertion');
assert.equal(certifySocketClearance([...wall,cap(-2)],socket).status,'blocked','closed mouth is not an accessible hollow');
assert.equal(certifySocketClearance(wall,{...socket,normal:[1,1,0]}).status,'indeterminate');

function sideWall(axis,coordinate,lo=.5,hi=3.5){
  const point=(side,y)=>axis===0?[coordinate,y,side]:[side,y,coordinate];
  const a=point(-8,lo),b=point(8,lo),c=point(8,hi),d=point(-8,hi);return [[a,b,c],[a,c,d]];
}
const squareWalls=[...sideWall(0,6),...sideWall(0,-6),...sideWall(2,6),...sideWall(2,-6)];
assert.equal(certifySocketClearance(squareWalls,socket).status,'clear','four actual walls form a supported open receiver');
// Nominal R6/S6 compatibility comes from explicit metadata. LDraw's sampled
// surfaces may have a small representation gap, so support means nearby
// material within the documented 0.25-LDU band, not exact physical contact.
for(const [distance,expected] of [[6.25,'supported'],[6.2501,'indeterminate'],[6.3,'indeterminate']]){
  const walls=[...sideWall(0,distance),...sideWall(0,-distance),...sideWall(2,distance),...sideWall(2,-distance)];
  assert.equal(certifySocketSupport(walls,socket).status,expected,'receiver support respects the fixed 0.25-LDU representation bound at '+distance);
}
assert.equal(certifySocketSupport([...sideWall(0,6),...sideWall(0,-6)],socket).status,'indeterminate','oblique rays cannot turn two parallel walls into full lateral support');
assert.equal(certifySocketSupport([...sideWall(0,6,.5,2),...sideWall(0,-6,.5,2),...sideWall(2,6,2,3.5),...sideWall(2,-6,2,3.5)],socket).status,'indeterminate','opposing surfaces at different depths do not provide common continuous support');
assert.equal(certifySocketSupport(squareWalls.map(t=>t.map(([x,y,z])=>[x,y===3.5?1.5:y,z])),socket).status,'indeterminate','support must span the whole axial proof interval');
const splitWalls=[];for(const axis of [0,2])for(const coordinate of [-6,6])splitWalls.push(...sideWall(axis,coordinate,.5,1.5),...sideWall(axis,coordinate,1.5,3.5));
assert.equal(certifySocketSupport(splitWalls,socket).status,'supported','coplanar subdivisions retain continuous support without requiring the same triangle at both ends');
for(const x of [-30,-10,10,30])for(const z of [-10,10])assert.equal(compiler.socketClearance('3001',{pos:[x,-24,z],normal:[0,-1,0],radius:6,depth:4,tolerance:0}).status,'clear','all real brick 2x4 receivers retain support');
for(const x of [-30,-10,10,30])for(const z of [-30,-10,10,30])assert.equal(compiler.socketClearance('3031',{pos:[x,-8,z],normal:[0,-1,0],radius:6,depth:4,tolerance:0}).status,'clear','plate 4x4 includes genuinely supported central receivers');
for(const x of [-10,10])assert.equal(compiler.socketClearance('47990',{pos:[x,-8,0],normal:[0,-1,0],radius:6,depth:4,tolerance:0}).status,'indeterminate','obsolete socket below the physical part has no supporting material');
assert.equal(compiler.socketClearance('43719',{pos:[-30,-8,30],normal:[0,-1,0],radius:6,depth:4,tolerance:0}).status,'indeterminate','point inside a filled hull still needs real receiver walls');

const manifestPath=path.join(root,'lib/collision-manifest.json');
if(fs.existsSync(manifestPath)){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(root,'lib/catalog-data.json'),'utf8'));
  assert.equal(Object.keys(manifest.parts).length,catalog.length);
  const rows=Object.values(manifest.parts),compiled=rows.filter(p=>p.status==='compiled'),rejected=rows.filter(p=>p.status==='unsupported');
  assert.equal(manifest.counts.compiled,compiled.length);assert.equal(manifest.counts.rejected,rejected.length);
  assert.ok(rejected.every(p=>typeof p.reason==='string'&&p.reason));
  const hashes=new Set(compiled.map(p=>p.asset));assert.equal(hashes.size,manifest.counts.uniqueAssets);
  for(const hash of hashes){const bytes=gunzipSync(fs.readFileSync(path.join(root,'public/catalog/collision',hash+'.bin')),{maxOutputLength:8*1024*1024});assert.equal(sha256(bytes),hash);}
}
console.log('PASS: conservative source coverage, exact stud separation, asymmetric origins, side studs, slopes, filled arch limitation, Technic retention, strict parser, exterior corridor, continuous receiver support, phantom socket rejection and catalogue integrity.');
