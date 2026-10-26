import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPackedGeometryRepository,createEnvelopeCompiler,conservativeHull,boxSolid,pointInEnvelope} from './lib/ldraw-envelope.mjs';
import {AXIAL_NUMERIC_EPSILON,reviewedR4Section,certifyAxialChannel,createAxialEnvelopeCompiler,clipConvexSolid,subtractConvexPrism} from './lib/axial-envelope.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository=createPackedGeometryRepository(root),section=reviewedR4Section(repository);
const EPS=AXIAL_NUMERIC_EPSILON,identity=[1,0,0,0,1,0,0,0,1];
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const transform=(p,m,o=[0,0,0])=>[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),p)+o[i]);
let passed=0;
function check(name,fn){fn();passed++;console.log(`PASS ${name}`);}
const ring=(scale,y)=>section.polygon.map(([x,z])=>[x*scale,y,z*scale]);
function tube({segments=[[-20,20]],sideFilter=()=>true,caps=true}={}){
  const body=[];
  for(const [lo,hi] of segments){
    const a=ring(1,lo),b=ring(1,hi),c=ring(2,lo),d=ring(2,hi);
    for(let i=0;i<16;i++){const j=(i+1)%16;
      if(sideFilter(i,lo,hi)){body.push([a[i],a[j],b[j],b[i]],[c[j],c[i],d[i],d[j]]);}
      if(caps)body.push([a[j],a[i],c[i],c[j]],[b[i],b[j],d[j],d[i]]);
    }
  }
  return {body,studs:[],sourceHash:'synthetic-tube'};
}
const request={pos:[0,0,0],frame:identity,length:40,section};
const source=tube();
function assertCertified(result){assert.equal(result.status,'certified',JSON.stringify(result));assert.ok(result.asset.solids.length<=129);for(const s of result.asset.solids){assert.ok(s.vertices.length<=128);assert.ok(s.normals.length<=128);assert.ok(s.edges.length<=128);}}
function sourceFaces(g){return [...g.body,...g.studs.flatMap(s=>s.faces)];}
function assertCovered(g,result){
  // The implementation proves full-face coverage through the hull/partition
  // identity. These independent barycentric points detect implementation
  // regressions in clipping, vertex merging and cap construction.
  for(const face of sourceFaces(g))for(let i=1;i+1<face.length;i++){
    const [a,b,c]=[face[0],face[i],face[i+1]];
    for(let j=0;j<=4;j++)for(let k=0;k<=4-j;k++){
      const p=add(add(mul(a,j/4),mul(b,k/4)),mul(c,1-(j+k)/4));
      assert.ok(result.asset.solids.some(s=>pointInEnvelope(p,s,EPS)),`Uncovered source point ${JSON.stringify(p)}`);
    }
  }
}
function assertVoid(result){
  const {pos,frame,length,section:{polygon}}=result.certificate;
  const center=polygon.reduce((a,p)=>[a[0]+p[0]/polygon.length,a[1]+p[1]/polygon.length],[0,0]);
  for(const t of [-length*.6,-length*.4,0,length*.4,length*.6])for(const [x,z] of [[...center],...polygon.map(p=>[(p[0]+center[0])*.5,(p[1]+center[1])*.5])]){
    const p=transform([x,t,z],frame,pos);
    assert.ok(!result.asset.solids.some(s=>pointInEnvelope(p,s,-EPS)),`Void refilled at ${JSON.stringify(p)}`);
  }
}
function overlapDepth(a,b){
  const axes=[...a.normals,...b.normals,...a.edges.flatMap(x=>b.edges.map(y=>cross(x,y)))];
  let minimum=Infinity;
  for(const axis of axes){const length=Math.hypot(...axis);if(length<1e-8)continue;const n=mul(axis,1/length),pa=a.vertices.map(v=>dot(v,n)),pb=b.vertices.map(v=>dot(v,n));
    minimum=Math.min(minimum,Math.max(...pa)-Math.min(...pb),Math.max(...pb)-Math.min(...pa));
  }
  return minimum;
}

check('reviewed primitive has the exact real 16-facet R4 section',()=>{
  assert.equal(section.polygon.length,16);assert.ok(section.polygon.some(p=>p[0]===3.6956&&p[1]===1.5308));
});
check('changed primitive is rejected by its content hash',()=>{
  assert.throws(()=>reviewedR4Section({read:k=>repository.read(k)+'\n0 changed\n'}),/unreviewed_r4_primitive/);
});
check('spoofed polygon cannot reuse the reviewed source hash',()=>{
  const altered=structuredClone(section);altered.polygon[0][0]*=.5;
  assert.equal(certifyAxialChannel(source,{...request,section:altered}).reason,'changed_reviewed_channel_section');
});
check('duplicate nominal vertices fail closed',()=>{
  const altered=structuredClone(section);altered.polygon[0]=altered.polygon[1];
  assert.equal(certifyAxialChannel(source,{...request,section:altered}).reason,'invalid_channel_section');
});
check('true through tube is certified against the exact standard section',()=>{
  const result=certifyAxialChannel(source,{...request,sectionPolicy:'exact-standard'});assertCertified(result);assert.equal(result.certificate.section.maximumNominalVertexExcess,0);assertCovered(source,result);assertVoid(result);
});
check('source-derived section never enlarges the nominal void',()=>{
  const result=certifyAxialChannel(source,request);assertCertified(result);assert.ok(result.certificate.section.maximumNominalVertexExcess<EPS);assertCovered(source,result);assertVoid(result);
});
check('one capped end is not a through channel',()=>{
  const g=tube();g.body.push([[0,20,0],...ring(1,20).slice(0,2)]);
  assert.notEqual(certifyAxialChannel(g,request).status,'certified');
});
check('a membrane midway through an otherwise open channel blocks it',()=>{
  const g=tube();g.body.push([[-1,0,-1],[1,0,-1],[0,0,1]]);
  assert.notEqual(certifyAxialChannel(g,request).status,'certified');
});
check('solid cylinder cannot be mistaken for its hollow envelope',()=>{
  const body=[],a=ring(1,-20),b=ring(1,20);for(let i=0;i<16;i++){const j=(i+1)%16;body.push([a[i],a[j],b[j],b[i]],[[0,-20,0],a[i],a[j]],[[0,20,0],b[i],b[j]]);}
  assert.notEqual(certifyAxialChannel({body,studs:[]},request).status,'certified');
});
check('disconnected axial wall segments do not prove continuous support',()=>{
  const g=tube({segments:[[-20,-1],[1,20]]});
  assert.equal(certifyAxialChannel(g,request).reason,'channel_support_not_continuous');
});
check('two opposite walls do not surround a channel',()=>{
  const g=tube({sideFilter:i=>i===0||i===8,caps:false});
  assert.equal(certifyAxialChannel(g,request).reason,'channel_support_not_continuous');
});
check('four walls at disjoint heights cannot masquerade as a socket',()=>{
  const g=tube({segments:[[-20,0],[0,20]],sideFilter:(i,lo)=>lo<0?(i===0||i===8):(i===4||i===12),caps:false});
  assert.equal(certifyAxialChannel(g,request).reason,'channel_support_not_continuous');
});
check('wrong declared length and phantom center are rejected',()=>{
  assert.equal(certifyAxialChannel(source,{...request,length:39}).reason,'channel_ends_do_not_match_body_extents');
  assert.notEqual(certifyAxialChannel(source,{...request,pos:[0,1,0]}).status,'certified');
});
check('scale and shear are rejected rather than treated as rigid frames',()=>{
  assert.equal(certifyAxialChannel(source,{...request,frame:[2,0,0,0,1,0,0,0,1]}).reason,'nonrigid_channel_frame');
  assert.equal(certifyAxialChannel(source,{...request,frame:[1,.1,0,0,1,0,0,0,1]}).reason,'nonrigid_channel_frame');
});
check('empty and invalid geometry fail closed',()=>{
  assert.equal(certifyAxialChannel({body:[],studs:[]},request).reason,'source_triangle_limit');
  assert.equal(certifyAxialChannel({body:[[[0,0,0],[Infinity,0,0],[0,1,0]]],studs:[]},request).reason,'invalid_source_face');
});
check('triangle complexity limit is enforced before hull construction',()=>{
  const face=[[8,-20,0],[8,20,0],[8,0,1]];
  assert.equal(certifyAxialChannel({body:Array(64001).fill(face),studs:[]},request).reason,'source_triangle_limit');
});
for(const [name,matrix,offset] of [
  ['quarter rotation',[0,-1,0,1,0,0,0,0,1],[13,-7,31]],
  ['Y-reflected metadata frame',[0,-1,0,-1,0,0,0,0,1],[-12,10,9]],
  ['three-axis permutation',[0,0,1,1,0,0,0,1,0],[17,9,-23]],
])check(`${name} preserves the certificate and coverage`,()=>{
  const g={body:source.body.map(f=>f.map(p=>transform(p,matrix,offset))),studs:[]};
  const result=certifyAxialChannel(g,{...request,pos:offset,frame:matrix});assertCertified(result);assertCovered(g,result);assertVoid(result);
});

check('halfspace clipping creates a real cap and preserves the retained half',()=>{
  const box=boxSolid({min:[-8,-20,-8],max:[8,20,8]}),clipped=clipConvexSolid(box,{normal:[1,0,0],constant:0});
  assert.ok(clipped);assert.ok(clipped.vertices.every(p=>p[0]<=EPS));assert.ok(pointInEnvelope([-7,19,7],clipped,EPS));assert.ok(!pointInEnvelope([1,0,0],clipped,EPS));
  assert.equal(clipConvexSolid(box,{normal:[1,0,0],constant:-9}),null);
});
check('difference cells preserve all four sides and leave the interior empty',()=>{
  const box=boxSolid({min:[-8,-20,-8],max:[8,20,8]}),planes=[{normal:[1,0,0],constant:4},{normal:[-1,0,0],constant:4},{normal:[0,0,1],constant:4},{normal:[0,0,-1],constant:4}];
  const result=subtractConvexPrism(box,planes);assert.equal(result.status,'subtracted');assert.equal(result.solids.length,4);
  for(const p of [[7,0,0],[-7,0,0],[0,0,7],[0,0,-7],[7,0,7]])assert.ok(result.solids.some(s=>pointInEnvelope(p,s,EPS)));
  assert.ok(!result.solids.some(s=>pointInEnvelope([0,0,0],s,EPS)));
});

const realGeometry=createEnvelopeCompiler(repository),compiler=createAxialEnvelopeCompiler(repository);
const realResults=[];
for(const [id,pos,length] of [['3673',[0,0,0],40],['2780',[0,0,0],40],['4274',[-8,0,0],24]]){
  const frame=[0,-1,0,-1,0,0,0,0,1],request={pos,frame,length};
  check(`real ${id}: exact nominal 16-gon detects actual rounded-face intrusions`,()=>{
    const result=compiler.compile(id,{...request,sectionPolicy:'exact-standard'});assert.equal(result.status,'blocked');assert.equal(result.reason,'source_surface_inside_channel');assert.ok(result.interiorMargin>EPS);
  });
  check(`real ${id}: source-derived empty channel is certified without tolerance expansion`,()=>{
    const result=compiler.compile(id,request);assertCertified(result);assert.equal(result.certificate.numericEpsilon,1e-8);
    assert.ok(result.certificate.section.maximumNominalVertexExcess>0);assert.ok(result.certificate.section.maximumNominalVertexExcess<.002);
    assertCovered(realGeometry.geometry(id),result);assertVoid(result);realResults.push({id,pos,length,result});
  });
}
for(const barId of ['30374','87994'])check(`real bar ${barId}: actual mesh fits the existing .01-LDU collision budget, not the strict empty prism`,()=>{
  const bar=realGeometry.geometry(barId),vertices=sourceFaces(bar).flat(),centerY=(Math.min(...vertices.map(v=>v[1]))+Math.max(...vertices.map(v=>v[1])))/2;
  for(const {id,pos,result} of realResults){
    const aligned=vertices.map(p=>[pos[0]-(p[1]-centerY),pos[1]-p[0],pos[2]+p[2]]),solid=conservativeHull(aligned).solid;
    const maximumOverlap=Math.max(...result.asset.solids.map(cell=>overlapDepth(cell,solid)));
    assert.ok(maximumOverlap>EPS,`${id}/${barId} must expose mesh rounding, not pretend exact zero penetration`);
    assert.ok(maximumOverlap<.01,`${id}/${barId} exceeded existing runtime tolerance: ${maximumOverlap}`);
  }
});
console.log(JSON.stringify({tests:passed,real:realResults.map(({id,result})=>({id,solids:result.asset.solids.length,sourceVoidReduction:result.certificate.section.maximumNominalVertexExcess,maxVertices:Math.max(...result.asset.solids.map(s=>s.vertices.length))}))},null,2));
