// Source-certified, uniform, open A6 keyed receiver.
// A6 means a UNION of two reviewed hexagonal sections, never a cylinder or the
// convex hull of the cross. Each component is contracted by source separating
// planes, then checked against EVERY complete rendered triangle. Contraction
// has no clearance allowance; the numerical epsilon is only 1e-8 LDU.
//
// Eight complete rectangular source-wall patches prove continuous keyed flank
// support. Merely projecting a triangle to an axial interval is NOT sufficient.
// Full source-face coverage follows independently from inclusion in the source
// hull and H \ (P0 union P1) = (H \ P0) \ P1. No unrelated cavity is opened.
// The receiver interval is local. Matching must fit it inside a shaft's
// proven engagement interval (reviewed beveled shafts: nominal length minus 5),
// not its nominal length or its larger occupied-body interval.
import {createEnvelopeCompiler,conservativeHull,sha256} from './ldraw-envelope.mjs';
import {clipSurfacePolygon,subtractConvexPrism} from './axial-envelope.mjs';
import {A6_SECTION_COMPONENTS,REVIEWED_A6_SOURCES} from './keyed-axial-shaft.mjs';

export const A6_CHANNEL_PROOF_VERSION='source-keyed-a6-through-union-v1';
export const A6_CHANNEL_EPSILON=1e-8;
export const A6_CHANNEL_LIMITS=Object.freeze({faces:65_000,triangles:130_000,vertices:128,directions:128,planes:128,solids:129,fragments:4096,coordinates:100_000});
const EPS=A6_CHANNEL_EPSILON,LIMITS=A6_CHANNEL_LIMITS;
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(v,k)=>v.map(n=>n*k);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const distance=(p,h)=>dot(p,h.normal)-h.constant;
const point=p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=LIMITS.coordinates);
const fail=(reason,details={})=>({status:'indeterminate',reason,...details});
function reject(reason,details={}){const e=new Error(reason);e.proofReason=reason;e.details=details;throw e;}
function area(polygon){if(polygon.length<3)return 0;let v=[0,0,0];for(let i=1;i+1<polygon.length;i++)v=add(v,cross(sub(polygon[i],polygon[0]),sub(polygon[i+1],polygon[0])));return Math.hypot(...v)/2;}
function centroid(polygon){return polygon.reduce((p,v)=>add(p,mul(v,1/polygon.length)),[0,0,0]);}
function nontrivialPlanarFragment(polygon){
 if(polygon.length<3||area(polygon)<=EPS*EPS)return false;
 // Clipping coplanar triangle seams can leave roundoff-width polygons. Apply
 // the SAME 1e-8 coordinate epsilon to their minimum width, not a larger area
 // or fit tolerance. A positive-width gap above EPS always survives.
 for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],d=sub(q,p),length=Math.hypot(d[0],d[1]);if(length<=EPS)continue;const n=[-d[1]/length,d[0]/length,0],values=polygon.map(v=>dot(n,v));if(Math.max(...values)-Math.min(...values)<=EPS)return false;}
 return true;
}
function axis(v){return point(v)&&v.every(n=>n===0||n===1||n===-1)&&v.filter(n=>n!==0).length===1;}
function frameOf(request){
 if(!request||typeof request!=='object'||Array.isArray(request))reject('invalid_a6_channel_request');
 const {pos,frame,length}=request;
 if(!point(pos)||!Array.isArray(frame)||frame.length!==9||!frame.every(Number.isFinite)||!Number.isFinite(length)||length<=EPS||length>LIMITS.coordinates)reject('invalid_a6_channel_request');
 const [u,n,v]=[0,1,2].map(i=>[frame[i],frame[i+3],frame[i+6]]);
 if(![u,n,v].every(axis)||dot(u,n)!==0||dot(u,v)!==0||dot(n,v)!==0)reject('nonrigid_or_nonquarter_a6_frame');
 return {pos,u,n,v,length,world:([x,y,z])=>add(pos,add(mul(u,x),add(mul(n,y),mul(v,z)))),local:p=>{const q=sub(p,pos);return [dot(q,u),dot(q,n),dot(q,v)];}};
}
export function a6ReceiverRequest(connector){
 const c=connector,s=c?.shape,section=s?.sections?.[0];
 if(c?.type!=='cylinder'||c.gender!=='F'||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length||!['none','YOnly'].includes(c.scale)||!['cor','none'].includes(c.mirror)||s?.caps!=='none'||s.group!==''||typeof s.center!=='boolean'||typeof s.slide!=='boolean'||!Array.isArray(s.sections)||s.sections.length!==1||section?.shape!=='A'||section.radius!==6||!axis(c.normal))return null;
 try{
  const f=frameOf({pos:c.pos,frame:c.frame,length:section.length});
  if(f.n.some((n,i)=>n!==c.normal[i]))return null;
  return {pos:s.center?[...c.pos]:sub(c.pos,mul(c.normal,section.length/2)),frame:[...c.frame],length:section.length};
 }catch{return null;}
}
function sourceTriangles(source){
 if(typeof source?.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(source.sourceHash))reject('invalid_a6_source_hash');
 if(!Array.isArray(source?.body)||!Array.isArray(source?.studs)||source.studs.some(s=>!s||!Array.isArray(s.faces)))reject('invalid_a6_source_geometry');
 const faces=[...source.body,...source.studs.flatMap(s=>s.faces)];
 if(!faces.length||faces.length>LIMITS.faces)reject('a6_source_face_limit');
 const triangles=[];
 for(let i=0;i<faces.length;i++){
  const f=faces[i];if(!Array.isArray(f)||![3,4].includes(f.length)||!f.every(point))reject('invalid_a6_source_face',{face:i});
  // Match the renderer's fixed LDraw quad triangulation, including twisted or
  // crossed quads: its two actual triangles both participate in every proof.
  triangles.push({face:i,points:[f[0],f[1],f[2]]});if(f.length===4)triangles.push({face:i,points:[f[0],f[2],f[3]]});
 }
 if(triangles.length>LIMITS.triangles)reject('a6_source_triangle_limit');
 return {faces,triangles};
}
function planesFor(polygon){return polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),normal=[dz/length,0,-dx/length];return {normal,constant:normal[0]*a[0]+normal[2]*a[1]};});}
function clip(polygon,planes){for(const h of planes){polygon=clipSurfacePolygon(polygon,h);if(!polygon.length)break;}return polygon;}
function interiorWitness(triangle,planes){
 const polygon=clip(triangle,planes);if(polygon.length<3||area(polygon)<=EPS*EPS)return null;
 const witness=centroid(polygon),margin=Math.min(...planes.map(h=>-distance(witness,h)));
 return margin>EPS?{witness,margin}:null;
}
function intersectSix(planes){
 const polygon=[];
 for(let i=0;i<planes.length;i++){
  const a=planes[(i+planes.length-1)%planes.length],b=planes[i],det=a.normal[0]*b.normal[2]-b.normal[0]*a.normal[2];
  if(Math.abs(det)<=EPS)reject('degenerate_a6_component');
  const p=[(a.constant*b.normal[2]-b.constant*a.normal[2])/det,0,(a.normal[0]*b.constant-b.normal[0]*a.constant)/det];
  if(!point(p)||planes.some(h=>distance(p,h)>EPS))reject('nonhexagonal_a6_component');
  polygon.push(p);
 }
 if(area(polygon)<=EPS||planes.some(h=>h.constant<=EPS))reject('empty_a6_component');
 return polygon;
}
function deriveComponent(nominal,triangles){
 const planes=planesFor(nominal),adjustments=[];
 for(let index=0;index<triangles.length;index++){
  const triangle=triangles[index].points;if(!interiorWitness(triangle,planes))continue;
  let best=null;
  // Keeping the six reviewed edge directions produces a hexagon. An inward
  // plane is placed exactly at min(source triangle projection), proving the
  // ENTIRE triangle is beyond it. It is not a rounded coordinate tolerance.
  for(let i=0;i<planes.length;i++){
   const constant=Math.min(...triangle.map(p=>dot(p,planes[i].normal)));
   if(constant<=EPS||constant>=planes[i].constant)continue;
   const candidate=planes.map((h,j)=>j===i?{...h,constant}:h);
   try{const polygon=intersectSix(candidate),retainedArea=area(polygon);if(!best||retainedArea>best.retainedArea)best={i,constant,retainedArea};}catch(e){if(!e.proofReason)throw e;}
  }
  if(!best)reject('source_surface_blocks_a6_axis',{triangle:index,face:triangles[index].face});
  const before=planes[best.i].constant;planes[best.i]={...planes[best.i],constant:best.constant};
  adjustments.push({triangle:index,face:triangles[index].face,plane:best.i,before,after:best.constant});
 }
 const polygon=intersectSix(planes),nominalPlanes=planesFor(nominal);
 if(polygon.some(p=>nominalPlanes.some(h=>distance(p,h)>EPS)))reject('a6_void_was_enlarged');
 for(let i=0;i<triangles.length;i++){const witness=interiorWitness(triangles[i].points,planes);if(witness)reject('source_surface_inside_derived_a6_component',{triangle:i,...witness});}
 return {planes,polygon:polygon.map(([x,,z])=>[x,z]),adjustments,maximumNominalVertexExcess:Math.max(0,...nominal.flatMap(([x,z])=>planes.map(h=>distance([x,0,z],h))))};
}

// Difference of a planar polygon and a convex triangle. Unlike a bounding-box
// or axial-interval union, this retains diagonal and interior surface gaps.
function subtractSurfaceTriangle(polygon,triangle){
 const c=centroid(triangle),planes=triangle.map((p,i)=>{const q=triangle[(i+1)%3],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);if(length<=EPS)return null;let normal=[dy/length,-dx/length,0],constant=dot(normal,p);if(distance(c,{normal,constant})>0){normal=mul(normal,-1);constant=-constant;}return {normal,constant};}).filter(Boolean);
 if(planes.length<3)return [polygon];
 const outside=[];let inside=polygon;
 for(const h of planes){const piece=clipSurfacePolygon(inside,{normal:mul(h.normal,-1),constant:-h.constant});if(nontrivialPlanarFragment(piece))outside.push(piece);inside=clipSurfacePolygon(inside,h);if(!nontrivialPlanarFragment(inside))break;}
 return outside;
}
function keyedSupport(triangles,length){
 const patches=[],half=length/2;
 // These eight 1-LDU-wide patches sit on the flat key faces, away from both
 // concave transitions and beveled tips. A circle cannot satisfy them. Real
 // source walls may extend beyond the patch; no physical clutch is claimed.
 for(const normalAxis of [0,2])for(const sign of [-1,1])for(const arm of [-1,1]){
  const radialAxis=normalAxis===0?2:0,lo=arm<0?-5.25:4.25,hi=arm<0?-4.25:5.25;
  let remaining=[[[lo,-half,0],[hi,-half,0],[hi,half,0],[lo,half,0]]],used=[];
  for(let index=0;index<triangles.length&&remaining.length;index++){
   const points=triangles[index].points;if(points.some(p=>Math.abs(p[normalAxis]-2*sign)>EPS))continue;
   const triangle=points.map(p=>[p[radialAxis],p[1],0]);if(area(triangle)<=EPS*EPS)continue;
   const before=remaining.reduce((sum,p)=>sum+area(p),0);
   remaining=remaining.flatMap(p=>subtractSurfaceTriangle(p,triangle));
   if(remaining.length>LIMITS.fragments)reject('a6_support_fragment_limit');
   if(remaining.reduce((sum,p)=>sum+area(p),0)<before-EPS*EPS)used.push(index);
  }
  if(remaining.length)reject('a6_keyed_flank_not_continuous',{normalAxis,sign,arm,uncoveredArea:remaining.reduce((s,p)=>s+area(p),0),uncoveredWitness:centroid(remaining[0])});
  patches.push({normalAxis,constant:2*sign,radialAxis,span:[lo,hi],interval:[-half,half],sourceTriangles:used});
 }
 return {proof:'complete-source-surface-cover-of-eight-keyed-rectangles',interval:[-half,half],patches};
}
function worldPlanes(planes,frame){return planes.map(h=>{const normal=add(mul(frame.u,h.normal[0]),mul(frame.v,h.normal[2]));return {normal,constant:h.constant+dot(normal,frame.pos)};});}
function validateSolids(solids,hull){
 if(!solids.length||solids.length>LIMITS.solids)reject('a6_difference_solid_limit');
 for(const s of solids){
  if(s.vertices.length>LIMITS.vertices||s.normals.length>LIMITS.directions||s.edges.length>LIMITS.directions||s.planes.length>LIMITS.planes)reject('a6_difference_complexity');
  if(s.vertices.some(p=>!point(p)||hull.planes.some(h=>distance(p,h)>EPS)||s.planes.some(h=>distance(p,h)>EPS)))reject('a6_difference_invalid_vertex');
 }
}
// Separate nominal compatibility screen; NEVER used to cut a larger void or
// to change the source proof's EPS. Passing it is insufficient for placement:
// complete conservative bodies still need SAT and the shaft's full-profile
// engagement interval must contain the receiver interval.
export function assessNominalA6SectionFit(components){
 if(!Array.isArray(components)||components.length!==2||components.some(c=>!c||!Array.isArray(c.planes)||c.planes.length!==6))return {compatible:false,reason:'invalid_a6_section_components',allowanceLdu:0.01};
 let maximumPlaneExcess=0;
 for(let i=0;i<2;i++){
  const nominal=planesFor(A6_SECTION_COMPONENTS[i]);
  if(components[i].planes.some((h,j)=>!h||!point(h.normal)||!Number.isFinite(h.constant)||h.normal.some((n,k)=>n!==nominal[j].normal[k])||h.constant>nominal[j].constant+EPS))return {compatible:false,reason:'invalid_a6_section_plane',allowanceLdu:0.01};
  try{intersectSix(components[i].planes);}catch{return {compatible:false,reason:'invalid_a6_section_components',allowanceLdu:0.01};}
  for(const [x,z] of A6_SECTION_COMPONENTS[i])for(const h of components[i].planes)maximumPlaneExcess=Math.max(maximumPlaneExcess,distance([x,0,z],h));
 }
 return {compatible:maximumPlaneExcess<=0.01,maximumPlaneExcess,allowanceLdu:0.01,completeBodyCollisionChecked:false,engagementChecked:false};
}
export function certifyA6ThroughChannel(source,request){
 try{
  const frame=frameOf(request),{faces,triangles}=sourceTriangles(source),local=triangles.map(t=>({...t,points:t.points.map(frame.local)}));
  const support=keyedSupport(local,frame.length);
  const components=A6_SECTION_COMPONENTS.map(section=>deriveComponent(section,local));
  for(const patch of support.patches){const component=patch.normalAxis===2?components[0]:components[1];for(const radial of patch.span){const p=[0,0,0];p[patch.normalAxis]=patch.constant;p[patch.radialAxis]=radial;if(component.planes.some(h=>distance(p,h)>EPS))reject('a6_contracted_void_loses_keyed_flank',{patch});}}
  // An infinite clear prism has both ends in exterior space. This intentionally
  // rejects blockers even beyond the declared local bore, while allowing the
  // rest of the part to extend outside its local axial interval.
  const worldComponents=components.map(c=>worldPlanes(c.planes,frame));
  for(let component=0;component<2;component++)for(let i=0;i<triangles.length;i++){const witness=interiorWitness(triangles[i].points,worldComponents[component]);if(witness)reject('source_surface_inside_world_a6_component',{component,triangle:i,...witness});}
  const {solid:hull,approximation}=conservativeHull(faces.flat());
  if(triangles.some(t=>t.points.some(p=>hull.planes.some(h=>distance(p,h)>EPS))))reject('a6_source_face_outside_hull');
  let solids=[hull];const stageCounts=[];
  for(const planes of worldComponents){
   const next=[];
   for(const s of solids){const result=subtractConvexPrism(s,planes);if(result.status!=='subtracted')reject(result.reason);next.push(...result.solids);}
   solids=next;validateSolids(solids,hull);stageCounts.push(solids.length);
  }
  return {status:'certified',version:A6_CHANNEL_PROOF_VERSION,sourceHash:source.sourceHash,geometryHash:sha256(JSON.stringify(faces)),nominalSectionFit:assessNominalA6SectionFit(components),
   certificate:{numericEpsilon:EPS,pos:[...request.pos],frame:[...request.frame],receiverInterval:[-frame.length/2,frame.length/2],
    components:components.map((c,i)=>({...c,nominalPolygon:A6_SECTION_COMPONENTS[i],worldPlanes:worldComponents[i]})),
    support,clearance:'all-source-triangles-outside-both-open-infinite-components',ends:'both-exterior-by-clear-infinite-corridor',
    coverage:'all-source-triangles-in-hull-and-outside-union; two-stage-convex-partition',sourceFaceCount:faces.length,sourceTriangleCount:triangles.length,stageCounts,
    matchingObligation:'receiver interval must be contained in the separately certified shaft engagement interval; nominal shaft length is insufficient'},
   asset:{version:1,kind:'convex-hull-minus-two-certified-a6-prisms',solids},approximation};
 }catch(e){if(e.proofReason)return fail(e.proofReason,e.details);if(e.code)return fail(e.code);throw e;}
}
export function createKeyedAxialEnvelopeCompiler(repository){
 const reviewedKeys=['p/axlehol8.dat','p/box2-9p.dat'];
 return {compile(partId,connector){try{
  if(!repository||typeof repository.read!=='function'||typeof repository.resolve!=='function')return fail('invalid_a6_source_repository');
  const files=new Map(),bindings=new Map();
  // A fresh immutable read snapshot per proof binds the actual expanded mesh
  // to every source file. Re-read all files/resolutions after certification;
  // changing a dependency during the proof must not produce a certificate.
  const snapshot={read(key){if(!files.has(key)){const text=repository.read(key);if(typeof text!=='string')reject('invalid_a6_source_text');files.set(key,text);}return files.get(key);},resolve(name){const key=repository.resolve(name);if(bindings.has(name)&&bindings.get(name)!==key)reject('a6_source_resolution_changed');bindings.set(name,key);return key;}};
  for(const key of reviewedKeys)if(sha256(snapshot.read(key))!==REVIEWED_A6_SOURCES[key])reject('unreviewed_a6_section_source',{key});
  const request=a6ReceiverRequest(connector);if(!request)return fail('not_simple_open_a6_receiver');
  const source=createEnvelopeCompiler(snapshot).geometry(partId),result=certifyA6ThroughChannel(source,request);
  for(const [key,text] of files)if(repository.read(key)!==text)reject('a6_source_changed_during_certification',{key});
  for(const [name,key] of bindings)if(repository.resolve(name)!==key)reject('a6_source_resolution_changed',{name});
  if(result.status==='certified'){
   result.certificate.reviewedSectionSources=Object.fromEntries(reviewedKeys.map(key=>[key,REVIEWED_A6_SOURCES[key]]));
   result.certificate.sourceSnapshot={sourceKey:source.key,files:[...files].map(([key,text])=>({key,sha256:sha256(text)})).sort((a,b)=>a.key.localeCompare(b.key)),resolutions:[...bindings].sort(([a],[b])=>a.localeCompare(b)),verifiedUnchangedAfterProof:true};
  }
  return result;
 }catch(e){if(e.proofReason)return fail(e.proofReason,e.details);if(e.code)return fail(e.code);throw e;}}};
}
