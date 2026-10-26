// Source-preserving proof for a 20-LDU Technic hole: R8/2, R6/16, R8/2.
// All 48 faceted wall rectangles must be covered by original triangles. The
// three removed prisms must be empty against the full source, including studs.
// The two end prisms continue to exterior space; remote obstructions reject.
import {createEnvelopeCompiler,conservativeHull,sha256} from './ldraw-envelope.mjs';
import {reviewedR4Section,REVIEWED_R4_PRIMITIVE,certifyAxialChannel,clipSurfacePolygon,subtractConvexPrism} from './axial-envelope.mjs';
import {R4_SECTION} from './axial-shaft.mjs';
import {certifyFacetBand} from './faceted-wall-proof.mjs';
import {accessInteriorWitness} from './standard-access.mjs';
export const TECHNIC_PIN_CHANNEL_VERSION='source-stepped-technic-pin-hole-20-v1';
const EPS=1e-8,MAX=100000,LIMIT=32000;
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),add=(a,b)=>a.map((n,i)=>n+b[i]),mul=(a,k)=>a.map(n=>n*k),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX);
const axis=p=>point(p)&&p.every(n=>n===0||n===1||n===-1)&&p.filter(n=>n!==0).length===1;
const fail=(reason,details={})=>({status:'indeterminate',reason,...details});
const pinShape=()=>({contract:'technic-pin-20-fixed-v1',length:20,shaftRadius:6,collarRadius:8,shaftSpan:16});
function frameOf(m){if(!Array.isArray(m)||m.length!==9)return null;const columns=[0,1,2].map(i=>[m[i],m[i+3],m[i+6]]);return columns.every(axis)&&dot(columns[0],columns[1])===0&&dot(columns[0],columns[2])===0&&dot(columns[1],columns[2])===0?columns:null;}
export function centeredTechnicPinHoleRequest(c){
 const s=c?.shape,frame=frameOf(c?.frame);
 if(c?.type!=='cylinder'||c.gender!=='F'||!point(c.pos)||!axis(c.normal)||!frame||c.normal.some((n,i)=>n!==frame[1][i])||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length)return null;
 if(c.scale!=='none'||!['cor','none'].includes(c.mirror)||!s||s.group!==''||s.center!==true||s.caps!=='none'||typeof s.slide!=='boolean'||!Array.isArray(s.sections)||s.sections.length!==3)return null;
 if(s.sections.some((v,i)=>v?.shape!=='R'||v.radius!==(i===1?6:8)||v.length!==(i===1?16:2)))return null;
 const normal=c.normal.map(n=>n===0?0:1);
 return {pos:[...c.pos],frame:[...c.frame],port:{id:'pin-hole:'+c.pos.join(':')+':'+normal.join(':'),kind:'pin-hole',point:[...c.pos],normal,pin:pinShape()}};
}
const triangulate=p=>Array.from({length:Math.max(0,p.length-2)},(_,i)=>[p[0],p[i+1],p[i+2]]);
function clip(p,planes){for(const h of planes){p=clipSurfacePolygon(p,h);if(!p.length)break;}return p;}
function radialPlanes(polygon){
 return polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],d=[b[1]-a[1],0,a[0]-b[0]],length=Math.hypot(...d);if(length<=EPS)throw Object.assign(Error('degenerate_pin_section'),{code:'degenerate_pin_section'});let normal=mul(d,1/length),constant=normal[0]*a[0]+normal[2]*a[1];if(constant<0){normal=mul(normal,-1);constant=-constant;}return {normal,constant};});
}
function bandProof(triangles,lo,hi,radius,section){
 const support=certifyFacetBand(triangles,{polygon:section.polygon.map(p=>p.map(n=>n*radius/4)),lo,hi});if(support.status!=='certified')return support;
 const planes=[{normal:[0,1,0],constant:hi},{normal:[0,-1,0],constant:-lo}],center=(lo+hi)/2,factor=4/radius;
 // A shoulder at a band boundary is outside the band's OPEN void. Do not
 // project that shoulder through the whole band and shrink an R8 recess to
 // its neighbouring R6 radius. The full source is checked against the finite
 // central prism and outward end prisms below, so caps are never discarded.
 const faces=triangles.flatMap(t=>triangulate(clip(t,planes))).filter(t=>{const y=t.reduce((s,p)=>s+p[1]/3,0);return y>lo+EPS&&y<hi-EPS&&Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))>EPS*EPS;});
 const scaled=faces.map(t=>t.map(([x,y,z])=>[x*factor,(y-center)*factor,z*factor]));
 const proof=certifyAxialChannel({body:scaled,studs:[],sourceHash:sha256(JSON.stringify(scaled))},{section,length:(hi-lo)*factor});if(proof.status!=='certified')return proof;
 return {status:'certified',polygon:proof.certificate.section.polygon.map(p=>p.map(n=>n/factor)),surfaceSupport:support,interval:[lo,hi],radius};
}
export function certifyTechnicPinChannel(source,connector,section){
 try{
  const request=centeredTechnicPinHoleRequest(connector);if(!request)return fail('unsupported_technic_pin_hole_metadata');
  if(section?.sourceKey!==REVIEWED_R4_PRIMITIVE.key||section.sourceHash!==REVIEWED_R4_PRIMITIVE.sha256||!Array.isArray(section.polygon)||section.polygon.length!==16||new Set(section.polygon.map(p=>JSON.stringify(p))).size!==16||section.polygon.some(p=>!Array.isArray(p)||p.length!==2||!R4_SECTION.some(q=>p[0]===q[0]&&p[1]===q[1])))return fail('unreviewed_pin_section');
  if(!source||typeof source.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(source.sourceHash)||!Array.isArray(source.body)||!source.body.length||!Array.isArray(source.studs)||source.body.length>LIMIT||source.studs.length>LIMIT||source.studs.some(s=>!s||!Array.isArray(s.faces)||s.faces.length>LIMIT))return fail('invalid_pin_source');
  const faces=[...source.body,...source.studs.flatMap(s=>s.faces)];if(faces.length>LIMIT||faces.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(point)))return fail('invalid_pin_source_faces');
  const frame=frameOf(request.frame),local=p=>frame.map(a=>dot(sub(p,request.pos),a)),worldVector=p=>add(mul(frame[0],p[0]),add(mul(frame[1],p[1]),mul(frame[2],p[2]))),world=p=>add(request.pos,worldVector(p));
  const triangles=faces.flatMap(f=>triangulate(f.map(local)));if(triangles.some(t=>!t.every(point)))return fail('pin_local_coordinate_limit');
  const bands=[];
  for(const [lo,hi,radius] of [[-8,8,6],[8,10,8],[-10,-8,8]]){const proof=bandProof(triangles,lo,hi,radius,section);if(proof.status!=='certified')return fail(proof.reason,{interval:[lo,hi]});bands.push(proof);}
  const prisms=[ [...radialPlanes(bands[0].polygon),{normal:[0,1,0],constant:8},{normal:[0,-1,0],constant:8}], [...radialPlanes(bands[1].polygon),{normal:[0,-1,0],constant:-8}], [...radialPlanes(bands[2].polygon),{normal:[0,1,0],constant:-8}] ];
  for(let j=0;j<prisms.length;j++){
   const witness=[0,j===0?0:j===1?9:-9,0];if(!prisms[j].every(h=>dot(witness,h.normal)<h.constant-EPS))return fail('empty_pin_void');
   for(let i=0;i<triangles.length;i++)if(accessInteriorWitness(triangles[i],prisms[j]))return fail('source_in_pin_channel',{prism:j,triangle:i});
  }
  const hull=conservativeHull(triangles.flat()).solid;let solids=[hull];
  if(triangles.some(t=>t.some(p=>hull.planes.some(h=>dot(p,h.normal)>h.constant+EPS))))return fail('pin_source_outside_hull');
  for(const planes of prisms){
   const next=[];
   for(const solid of solids){
    // Keeping a boundary sliver is conservative. Only cells entirely inside
    // an already proved empty prism may be omitted without subtraction.
    if(planes.some(h=>solid.vertices.every(p=>dot(p,h.normal)-h.constant>=-EPS))){next.push(solid);continue;}
    // An inherited clipping plane also proves containment. Its exact normal
    // and bound avoid classifying a shared face from rounded intersection
    // vertices (which can lie one machine ULP beyond their defining plane).
    // No larger void or geometric tolerance is introduced here.
    if(planes.every(h=>solid.planes.some(p=>p.normal.every((n,i)=>n===h.normal[i])&&p.constant<=h.constant)||solid.vertices.every(p=>dot(p,h.normal)<=h.constant)))continue;
    const cut=subtractConvexPrism(solid,planes);if(cut.status!=='subtracted')return fail(cut.reason,{prism:prisms.indexOf(planes),bounds:[0,1,2].map(i=>[Math.min(...solid.vertices.map(p=>p[i])),Math.max(...solid.vertices.map(p=>p[i]))]),maximumOutside:Math.max(...solid.vertices.flatMap(p=>planes.map(h=>dot(p,h.normal)-h.constant)))});next.push(...cut.solids);
   }
   solids=next;if(!solids.length||solids.length>129)return fail('pin_solid_limit');
  }
  if(solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128||s.vertices.some(p=>!point(p)||hull.planes.some(h=>dot(p,h.normal)>h.constant+EPS))))return fail('pin_solid_complexity');
  const worldPlanes=planes=>planes.map(h=>{const normal=worldVector(h.normal);return {normal,constant:h.constant+dot(normal,request.pos)};});
  const transformed=solids.map(s=>({vertices:s.vertices.map(world),normals:s.normals.map(worldVector),edges:s.edges.map(worldVector),planes:worldPlanes(s.planes)}));
  if(transformed.some(s=>s.vertices.some(p=>!point(p))))return fail('pin_world_coordinate_limit');
  return {status:'certified',version:TECHNIC_PIN_CHANNEL_VERSION,sourceHash:source.sourceHash,geometryHash:sha256(JSON.stringify(faces)),port:request.port,
   certificate:{length:20,numericEpsilon:EPS,bands,prisms:prisms.map(worldPlanes),sourceFaces:faces.length,sourceTriangles:triangles.length,coverage:'source hull minus three source-proven empty prisms; all 48 source wall rectangles covered',reach:'R8 ends continue to exterior; full source checked'},asset:{solids:transformed}};
 }catch(e){if(e.code)return fail(e.code);throw e;}
}
export function createTechnicPinChannelCompiler(repository){
 const compiler=createEnvelopeCompiler(repository),section=reviewedR4Section(repository);
 return {compile(partId,connector){try{return certifyTechnicPinChannel(compiler.geometry(partId),connector,section);}catch(e){if(e.code)return fail(e.code);throw e;}}};
}
