import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createPackedGeometryRepository,createEnvelopeCompiler,sha256} from './lib/ldraw-envelope.mjs';
import {A6_CROSS_OUTLINE,A6_SECTION_COMPONENTS,certifyWholeA6Shaft} from './lib/keyed-axial-shaft.mjs';
import {certifyA6ThroughChannel,createKeyedAxialEnvelopeCompiler,a6ReceiverRequest,assessNominalA6SectionFit,A6_CHANNEL_LIMITS} from './lib/keyed-axial-channel.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),repo=createPackedGeometryRepository(root),gc=createEnvelopeCompiler(repo),compiler=createKeyedAxialEnvelopeCompiler(repo);
const shadow=JSON.parse(fs.readFileSync(root+'lib/shadow-catalog.json','utf8')),packs=new Map();
const identity=[1,0,0,0,1,0,0,0,1],request={pos:[0,0,0],frame:identity,length:20};
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]);
const transform=(p,m,o=[0,0,0])=>[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),p)+o[i]);
const triangles=s=>[...s.body,...s.studs.flatMap(s=>s.faces)].flatMap(f=>f.length===3?[f]:[[f[0],f[1],f[2]],[f[0],f[2],f[3]]]);
const inside=(p,s,eps=1e-8)=>s.planes.every(h=>dot(h.normal,p)-h.constant<=eps);
const clone=structuredClone;let checks=0,rejectedProofCases=0;const real=[],negatives=[];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function check(name,fn){fn();checks++;console.log('PASS '+name);}
function connector(id,gender='F'){const e=shadow.parts[id];if(!packs.has(e.pack))packs.set(e.pack,JSON.parse(gunzipSync(fs.readFileSync(root+'public/catalog/shadow/'+e.pack+'.bin'))));return clone(packs.get(e.pack)[id].connectors.find(c=>c.gender===gender&&c.shape?.sections?.some(s=>s.shape==='A')));}
function synthetic({length=20,outline=A6_CROSS_OUTLINE,omitInner=-1,splitGap=0}={}){
 const body=[],lo=-length/2,hi=length/2;
 for(let i=0;i<outline.length;i++){
  const a=outline[i],b=outline[(i+1)%outline.length],wall=(lower,upper)=>[[a[0],lower,a[1]],[b[0],lower,b[1]],[b[0],upper,b[1]],[a[0],upper,a[1]]];
  if(i!==omitInner){if(splitGap){body.push(wall(lo,-splitGap/2),wall(splitGap/2,hi));}else body.push(wall(lo,hi));}
  const u=a.map(n=>n*1.6),v=b.map(n=>n*1.6);
  body.push([[u[0],lo,u[1]],[v[0],lo,v[1]],[v[0],hi,v[1]],[u[0],hi,u[1]]]);
  for(const y of [lo,hi])body.push([[a[0],y,a[1]],[b[0],y,b[1]],[v[0],y,v[1]],[u[0],y,u[1]]]);
 }
 return {key:'parts/unlisted-synthetic-cross.dat',body,studs:[],sourceHash:sha256(JSON.stringify(body))};
}
function reject(result,reason){assert.equal(result.status,'indeterminate',JSON.stringify(result));if(reason)assert.equal(result.reason,reason);rejectedProofCases++;return result;}
function certified(result){
 assert.equal(result.status,'certified',JSON.stringify(result));assert.equal(result.certificate.components.length,2);assert.equal(result.certificate.support.patches.length,8);
 assert.equal(result.certificate.numericEpsilon,1e-8);assert.equal(result.certificate.stageCounts.length,2);
 assert.ok(result.asset.solids.length<=129);
 for(const c of result.certificate.components){assert.equal(c.polygon.length,6);assert.equal(c.planes.length,6);assert.ok(c.polygon.every(([x,z])=>A6_SECTION_COMPONENTS.some(poly=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-8;}))));}
 for(const s of result.asset.solids){assert.ok(s.vertices.length<=128&&s.normals.length<=128&&s.edges.length<=128&&s.planes.length<=128);assert.ok(s.vertices.every(p=>inside(p,s)));for(const component of result.certificate.components)assert.ok(component.worldPlanes.some(h=>s.vertices.every(p=>dot(p,h.normal)-h.constant>=-1e-8)),'every emitted solid is wholly outside each open component');}
 return result;
}
// Independent 2D clipping in each source triangle's barycentric coordinates.
// Subtract all emitted solids from that triangle: every positive-area residue
// would witness material lost. This checks whole faces, not sampled vertices.
function clip2(polygon,a,b,d){const out=[];for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=a*p[0]+b*p[1]-d,dq=a*q[0]+b*q[1]-d;if(dp<=0)out.push(p);if((dp<=0)!==(dq<=0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return out;}
function area2(p){return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;}
function outsideSolid(polygon,planes){const outside=[];let pending=polygon;for(const [a,b,d] of planes){const part=clip2(pending,-a,-b,-d);if(part.length>=3&&area2(part)>1e-15)outside.push(part);pending=clip2(pending,a,b,d);if(pending.length<3||area2(pending)<=1e-15)break;}return outside;}
function assertWholeSourceCovered(source,result){
 let splitTriangles=0;
 for(const triangle of triangles(source)){
  if(result.asset.solids.some(s=>triangle.every(p=>inside(p,s))))continue;
  splitTriangles++;const [origin,b,c]=triangle,u=sub(b,origin),v=sub(c,origin);let uncovered=[[[0,0],[1,0],[0,1]]];
  for(const solid of result.asset.solids){const planes=solid.planes.map(h=>[dot(h.normal,u),dot(h.normal,v),h.constant-dot(h.normal,origin)+1e-8]);uncovered=uncovered.flatMap(p=>outsideSolid(p,planes));assert.ok(uncovered.length<4096);if(!uncovered.length)break;}
  assert.equal(uncovered.length,0,'some complete source triangle is not covered by emitted cells');
 }
 return splitTriangles;
}

const base=synthetic(),baseResult=certifyA6ThroughChannel(base,request);
check('unlisted synthetic cross has two hexagonal voids and preserves all source faces',()=>{certified(baseResult);assertWholeSourceCovered(base,baseResult);});
check('concave corners stay solid instead of being swallowed by a cylinder or cross hull',()=>{for(const x of [-3,3])for(const z of [-3,3])assert.ok(baseResult.asset.solids.some(s=>inside([x,0,z],s)));for(const p of [[5,0,0],[0,0,5],[0,0,0]])assert.ok(!baseResult.asset.solids.some(s=>inside(p,s)));});
check('extra material in a concavity survives both subtraction stages',()=>{const g=clone(base);g.body.push([[3,0,3],[3.5,0,3],[3,1,3.5]]);const r=certified(certifyA6ThroughChannel(g,request));assertWholeSourceCovered(g,r);});
check('tip obstruction may leave a proved empty void but fails separate nominal A6 fit',()=>{const g=clone(base);g.body.push([[5.8,0,-.1],[6.1,0,-.1],[5.8,0,.1]]);const r=certified(certifyA6ThroughChannel(g,request));assertWholeSourceCovered(g,r);assert.equal(r.nominalSectionFit.compatible,false);assert.ok(r.nominalSectionFit.maximumPlaneExcess>.01);assert.equal(r.certificate.numericEpsilon,1e-8);assert.ok(r.asset.solids.some(s=>inside([5.8,0,0],s)));negatives.push({name:'tip-obstructed A6 nominal fit',geometryStatus:r.status,nominalSectionFit:r.nominalSectionFit});});
for(const [name,face] of [
 ['middle cap',[[-7,0,-7],[7,0,-7],[7,0,7],[-7,0,7]]],
 ['cap beyond nominal receiver interval',[[-7,15,-7],[7,15,-7],[7,15,7],[-7,15,7]]],
 ['material in cross intersection',[[-1,0,-1],[1,0,-1],[0,0,1]]],
 ['material in horizontal arm',[[3,0,-1],[5,0,-1],[4,0,1]]],
 ['material in vertical arm',[[-1,0,3],[1,0,3],[0,0,5]]],
 ['triangle crossing void with all vertices outside',[[-9,0,0],[9,0,0],[0,0,9]]],
 ['crossed quad crossing the void',[[-9,0,-1],[9,0,1],[9,0,-1],[-9,0,1]]]
])check(name+' cannot be certified',()=>{const g=clone(base);g.body.push(face);const r=reject(certifyA6ThroughChannel(g,request));negatives.push({name,reason:r.reason});});
check('a blocker hidden in a separately classified stud participates in the proof',()=>{const g=clone(base);g.studs=[{faces:[[[-1,0,-1],[1,0,-1],[0,0,1]]]}];reject(certifyA6ThroughChannel(g,request));});
check('missing flat key side is rejected',()=>{reject(certifyA6ThroughChannel(synthetic({omitInner:1}),request),'a6_keyed_flank_not_continuous');});
for(const gap of [.5,1e-5,1e-7])check('discontinuous keyed walls with gap '+gap+' LDU are rejected',()=>{reject(certifyA6ThroughChannel(synthetic({splitGap:gap}),request),'a6_keyed_flank_not_continuous');});
check('diagonal holes cannot masquerade as continuous projected axial intervals',()=>{const g=synthetic(),f=g.body[4],a=f[0],b=f[1],c=f[2],d=f[3],at=(p,q,t)=>p.map((n,i)=>n+(q[i]-n)*t);g.body.splice(4,1,[a,b,at(b,c,.45)],[d,c,at(d,a,.45)]);reject(certifyA6ThroughChannel(g,request),'a6_keyed_flank_not_continuous');});
check('round bore cannot impersonate cross flanks',()=>{const outline=Array.from({length:16},(_,i)=>[6*Math.cos(i*Math.PI/8),6*Math.sin(i*Math.PI/8)]);reject(certifyA6ThroughChannel(synthetic({outline}),request),'a6_keyed_flank_not_continuous');});
check('narrow crossed bore cannot impersonate nominal key planes',()=>{reject(certifyA6ThroughChannel(synthetic({outline:A6_CROSS_OUTLINE.map(p=>p.map(n=>n*.95))}),request),'a6_keyed_flank_not_continuous');});
for(const matrix of [[0,0,-1,0,1,0,1,0,0],[-1,0,0,0,1,0,0,0,1],[0,1,0,0,0,1,1,0,0]])check('exact quarter-turn or reflection '+matrix.join(',')+' preserves proof',()=>{
 const offset=[123,-40,61],g=clone(base);g.body=g.body.map(f=>f.map(p=>transform(p,matrix,offset)));const r=certified(certifyA6ThroughChannel(g,{pos:offset,frame:matrix,length:20}));assertWholeSourceCovered(g,r);
});
for(const frame of [[1,1e-9,0,0,1,0,0,0,1],[1+1e-9,0,0,0,1,0,0,0,1],[1,0,0,0,1+1e-9,0,0,0,1],[1,0,0,0,1,0,0,0,.999999999]])check('tiny nonrigid frame rejected even for 100000 LDU',()=>{reject(certifyA6ThroughChannel(base,{pos:[0,0,0],frame,length:100000}),'nonrigid_or_nonquarter_a6_frame');});
for(const length of [undefined,null,NaN,Infinity,0,-1,'20'])check('invalid request length '+String(length),()=>{reject(certifyA6ThroughChannel(base,{...request,length}),'invalid_a6_channel_request');});
for(const sourceHash of [undefined,null,'fixture','0'.repeat(63),'G'.repeat(64)])check('malformed source hash rejected',()=>{reject(certifyA6ThroughChannel({...base,sourceHash},request),'invalid_a6_source_hash');});
check('more than 65000 faces rejects before geometric work',()=>{const g={...base,body:Array(A6_CHANNEL_LIMITS.faces+1).fill(base.body[0])};reject(certifyA6ThroughChannel(g,request),'a6_source_face_limit');});
check('invalid vertex coordinates rejected',()=>{const g=clone(base);g.body[0][0][0]=NaN;reject(certifyA6ThroughChannel(g,request),'invalid_a6_source_face');});
check('null request and malformed stud collections fail closed',()=>{reject(certifyA6ThroughChannel(base,null),'invalid_a6_channel_request');reject(certifyA6ThroughChannel({...base,studs:[null]},request),'invalid_a6_source_geometry');});
check('nominal fit screen fails closed on malformed planes',()=>{for(const components of [null,[],[null,null],[{planes:Array(6).fill(null)},{planes:Array(6).fill(null)}]])assert.equal(assessNominalA6SectionFit(components).compatible,false);const components=clone(baseResult.certificate.components);components[0].planes[0].normal=[1,0,0];assert.equal(assessNominalA6SectionFit(components).compatible,false);});
check('local bore length need not equal global piece extent',()=>{const g=clone(base);g.body.push([[20,40,20],[25,40,20],[20,50,25]]);const r=certified(certifyA6ThroughChannel(g,request));assertWholeSourceCovered(g,r);assert.deepEqual(r.certificate.receiverInterval,[-10,10]);});

for(const id of ['3713','584','585','3647','4019','6536','32039'])check('real '+id+': source-certified A6 receiver',()=>{
 const g=gc.geometry(id),c=connector(id),r=certified(compiler.compile(id,c)),splitTriangles=assertWholeSourceCovered(g,r);
 assert.equal(r.nominalSectionFit.compatible,true);
 assert.equal(r.certificate.sourceSnapshot.verifiedUnchangedAfterProof,true);
 assert.ok(r.certificate.sourceSnapshot.files.some(f=>f.key===g.key));
 real.push({id,sourceKey:g.key,sourceHash:g.sourceHash,geometryHash:r.geometryHash,sourceSnapshot:r.certificate.sourceSnapshot,sourceFaces:r.certificate.sourceFaceCount,sourceTriangles:r.certificate.sourceTriangleCount,splitTrianglesCovered:splitTriangles,
  receiverInterval:r.certificate.receiverInterval,sectionVertexCounts:r.certificate.components.map(c=>c.polygon.length),maximumNominalVertexExcess:Math.max(...r.certificate.components.map(c=>c.maximumNominalVertexExcess)),
  solids:r.asset.solids.length,stageCounts:r.certificate.stageCounts,maxVertices:Math.max(...r.asset.solids.map(s=>s.vertices.length)),maxNormals:Math.max(...r.asset.solids.map(s=>s.normals.length)),maxEdges:Math.max(...r.asset.solids.map(s=>s.edges.length)),
  supportPatches:r.certificate.support.patches.length,supportTriangles:new Set(r.certificate.support.patches.flatMap(p=>p.sourceTriangles)).size});
});
check('real 4698 metadata is insufficient for a cross receiver',()=>{const r=reject(compiler.compile('4698',connector('4698')),'a6_keyed_flank_not_continuous');negatives.push({id:'4698',reason:r.reason,uncoveredArea:r.uncoveredArea});});
check('real 6538b has capped sections and cannot claim a through bore',()=>{const r=reject(compiler.compile('6538b',connector('6538b')),'not_simple_open_a6_receiver');negatives.push({id:'6538b',reason:r.reason});});
check('forging a whole open 6538b receiver still fails geometry',()=>{const r=reject(certifyA6ThroughChannel(gc.geometry('6538b'),{pos:[0,0,0],frame:[1,0,0,0,0,1,0,1,0],length:40}),'a6_keyed_flank_not_continuous');negatives.push({id:'6538b-forced-whole',reason:r.reason});});
check('center=false receiver is centered using finite length and its signed normal',()=>{assert.deepEqual(a6ReceiverRequest(connector('3713')).pos,[0,0,0]);});
for(const sections of [undefined,null,[],[{shape:'A',radius:6,length:NaN}],[{shape:'A',radius:6,length:'20'}]])check('malformed uncentered metadata never leaks TypeError',()=>{const c=connector('3713');c.shape.sections=sections;assert.equal(a6ReceiverRequest(c),null);});
check('metadata axial normal must agree exactly with its rigid frame',()=>{const c=connector('584');c.normal[2]=1-1e-9;assert.equal(a6ReceiverRequest(c),null);});
check('a changed reviewed primitive hash blocks the compiler',()=>{const changed={...repo,read:key=>repo.read(key)+(key==='p/axlehol8.dat'?'\n0 Changed\n':'')};reject(createKeyedAxialEnvelopeCompiler(changed).compile('3713',connector('3713')),'unreviewed_a6_section_source');});
for(const changedKey of ['parts/3713.dat','p/axlehol5.dat'])check('source changing during certification rejected: '+changedKey,()=>{const reads=new Map(),changed={...repo,read(key){const n=(reads.get(key)??0)+1;reads.set(key,n);return repo.read(key)+(key===changedKey&&n>1?'\n0 Changed during certification\n':'');}};reject(createKeyedAxialEnvelopeCompiler(changed).compile('3713',connector('3713')),'a6_source_changed_during_certification');});
check('source reference rebinding during certification rejected',()=>{let calls=0;const changed={...repo,resolve(name){if(name==='3713.dat'&&++calls>1)return 'parts/584.dat';return repo.resolve(name);}};reject(createKeyedAxialEnvelopeCompiler(changed).compile('3713',connector('3713')),'a6_source_resolution_changed');});
check('missing repository functions reject instead of exposing a TypeError',()=>{reject(createKeyedAxialEnvelopeCompiler(null).compile('3713',connector('3713')),'invalid_a6_source_repository');});
check('same geometry and metadata under a different part name still certifies',()=>{const g=gc.geometry('3713'),c=connector('3713'),r=certified(certifyA6ThroughChannel({...g,key:'parts/not-an-id.dat'},a6ReceiverRequest(c)));assert.equal(r.sourceHash,g.sourceHash);});
check('a receiver fitting nominal shaft length may exceed its proven engagement',()=>{const c=connector('3704','M');const shaft=certifyWholeA6Shaft({geometry:gc.geometry('3704'),connector:c,repository:repo});assert.equal(shaft.status,'certified');const engagement=shaft.engagementIntervals[0][1]-shaft.engagementIntervals[0][0];assert.equal(engagement,shaft.nominalLength-5);const receiverLength=36;assert.ok(receiverLength<=shaft.nominalLength);assert.ok(receiverLength>engagement);});
function penetration(a,b){
 const axes=[...a.normals,...b.normals,...a.edges.flatMap(x=>b.edges.map(y=>cross(x,y)))];let result=Infinity;
 for(const raw of axes){const length=Math.hypot(...raw);if(length<1e-10)continue;const n=raw.map(v=>v/length),p=a.vertices.map(v=>dot(v,n)),q=b.vertices.map(v=>dot(v,n));const overlap=Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q));if(overlap<=0)return overlap;result=Math.min(result,overlap);}
 return result;
}
const fitChecks=[];
check('13 reviewed whole shafts against all seven receiver bodies: real SAT and engagement',()=>{
 for(const shaftId of ['3704','3705','3706','3707','3708','3737','4519','23948','32073','44294','50450','50451','60485']){
  const shaft=certifyWholeA6Shaft({geometry:gc.geometry(shaftId),connector:connector(shaftId,'M'),repository:repo});assert.equal(shaft.status,'certified');
  const {port}=shaft,localVector=p=>[dot(p,port.axial.radialU),dot(p,port.normal),dot(p,port.axial.radialV)];
  for(const {id} of real){
   const receiver=compiler.compile(id,connector(id)),req=a6ReceiverRequest(connector(id));
   assert.ok(receiver.certificate.receiverInterval[0]>=shaft.engagementIntervals[0][0]&&receiver.certificate.receiverInterval[1]<=shaft.engagementIntervals[0][1]);
   const bodies=shaft.asset.solids.map(s=>({vertices:s.vertices.map(p=>transform(localVector(sub(p,port.point)),req.frame,req.pos)),normals:s.normals.map(n=>transform(localVector(n),req.frame)),edges:s.edges.map(n=>transform(localVector(n),req.frame))}));
   const maximumOverlap=Math.max(0,...bodies.flatMap(s=>receiver.asset.solids.map(cell=>penetration(s,cell))));
   assert.ok(maximumOverlap<=.01,shaftId+'/'+id+' SAT overlap '+maximumOverlap);fitChecks.push({shaft:shaftId,receiver:id,nominalLength:shaft.nominalLength,engagementLength:shaft.nominalLength-5,maximumOverlap});
  }
 }
});
const report={proofSuite:true,version:baseResult.version,checks,rejectedProofCases,sourceSection:baseResult.certificate.components.map(c=>c.nominalPolygon),limits:A6_CHANNEL_LIMITS,real,negatives,fitChecks,
 maxima:{solids:Math.max(...real.map(r=>r.solids)),vertices:Math.max(...real.map(r=>r.maxVertices)),normals:Math.max(...real.map(r=>r.maxNormals)),edges:Math.max(...real.map(r=>r.maxEdges)),nominalSectionExcess:Math.max(...real.map(r=>r.maximumNominalVertexExcess)),realShaftBodySatOverlap:Math.max(...fitChecks.map(f=>f.maximumOverlap))},
 limitations:['Only exact signed quarter-turn frames; no part-ID allowlist.','Source-face enclosure, strict empty corridors and eight keyed support patches; not watertight-volume, physical clutch or strength certification.','Derived source void may be smaller than nominal male section. Nominal compatibility and actual shaft collision remain separate obligations.','The finite receiver interval must lie in a separately certified shaft engagement interval; reviewed beveled shafts engage over nominal length minus 5.','Complexity limits fail closed. Local bore certification can reject additional blockers outside its interval because the removed prisms are infinite.','This helper accepts up to 65000 faces, but the imported repository geometry loader currently has its own lower 32000-face limit.','This suite checks source geometry; profile adapter, matching, loader, assembly and MCP have separate integration suites.','The 91 real-pair tests use centred complete engagement and quarter-aligned sections. Arbitrary offsets, compound receivers, notched shafts, caps and other families remain outside this study.']};
fs.mkdirSync(root+'.desktop-tests',{recursive:true});fs.writeFileSync(root+'.desktop-tests/keyed-axial-channel-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks,real:real.map(({sourceSnapshot,...r})=>({...r,sourceSnapshotFiles:sourceSnapshot.files.length})),maxima:report.maxima},null,2));
