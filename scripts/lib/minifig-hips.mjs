// Source equivalence is deliberately narrow: complete paired waist posts and
// the reviewed lower torso interface. Leg pivots and arms are not inferred.
import {createEnvelopeCompiler,conservativeHull,sha256} from './ldraw-envelope.mjs';
import {clipSurfacePolygon,subtractConvexPrism} from './axial-envelope.mjs';
import {accessInteriorWitness} from './standard-access.mjs';

export const REVIEWED_HIPS=Object.freeze({part:'3815b',sourceHash:'635fa9abfba0f2bbc81964ccb321bab1767151a00c8aa4e327f63b5d9f471fde',upperGeometryHash:'d09bb920050a206995af9029ab771d0f0408f905791706ac6799da55ca85db86'});
export const REVIEWED_WAIST=Object.freeze({part:'973',sourceHash:'1c83b62cdf7c0d139eb40805717b67c31b6e0bb5ea8390cfd96a159a698b3427',innerGeometryHash:'260b3593bc2f64d6bd03f34ba6bfbe5d26eb39c6c82620070d367bafd35d9a6c'});
const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fail=reason=>({status:'indeterminate',reason});
const tri=f=>Array.from({length:Math.max(0,f.length-2)},(_,i)=>[f[0],f[i+1],f[i+2]]),nonzero=t=>Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))>1e-16;
const canonical=t=>sha256(JSON.stringify(t.map(t=>t.map(p=>JSON.stringify(p)).sort()).sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0)));
const clip=(p,planes)=>{for(const h of planes){p=clipSurfacePolygon(p,h);if(!p.length)break;}return p;};
const innerRegion=[{normal:[1,0,0],constant:16},{normal:[-1,0,0],constant:16},{normal:[0,1,0],constant:-21},{normal:[0,-1,0],constant:32},{normal:[0,0,1],constant:6},{normal:[0,0,-1],constant:6}];

export function minifigHipRequest(c){
 const s=c?.shape;
 if(c?.type!=='cylinder'||!finite(c.pos)||![-10,10].includes(c.pos[0])||c.pos[2]!==0||c.scale!=='none'||!['cor','none'].includes(c.mirror)||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length||!s||s.group!==''||s.center!==false||s.slide!==false||!Array.isArray(s.sections)||s.sections.length!==1||s.sections[0]?.shape!=='R'||s.sections[0].radius!==6||s.sections[0].length!==11)return null;
 const sign=Math.sign(c.pos[0]);
 const male=c.gender==='M'&&s.caps==='A'&&c.pos[1]===0&&same(c.normal,[0,1,0])&&same(c.frame,[sign,0,0,0,-1,0,0,0,sign]);
 const female=c.gender==='F'&&s.caps==='B'&&c.pos[1]===-32&&same(c.normal,[0,-1,0])&&same(c.frame,[1,0,0,0,-1,0,0,0,1]);
 if(!male&&!female)return null;
 const kind=male?'hip-stud':'hip-socket';
 return {male,port:{id:kind+':'+c.pos.join(':'),kind,point:[...c.pos],normal:[...c.normal],heading:[sign,0,0],hip:{contract:'minifig-hipstud-11-fixed-v1',length:11,nominalRadius:6}}};
}
function pairedRequests(connectors){
 if(!Array.isArray(connectors))return null;
 const requests=connectors.map(minifigHipRequest).filter(Boolean);
 if(requests.length!==2||requests[0].male!==requests[1].male||requests[0].port.point[0]===requests[1].port.point[0])return null;
 return requests.sort((a,b)=>a.port.point[0]-b.port.point[0]);
}
// This conservative prism follows the source flats, corner posts and taper.
// It is open to the exterior below the mouth, capped 11 LDU inside the torso.
function waistPrisms(){
 return [-1,1].map(sign=>[
  {normal:[-sign,0,0],constant:-4},{normal:[sign,0,0],constant:16},
  {normal:[0,0,1],constant:6},{normal:[0,0,-1],constant:6},
  {normal:[-sign,0,1],constant:-.536},{normal:[-sign,0,-1],constant:-.536},
  {normal:[sign,1/14,0],constant:14},{normal:[0,1,0],constant:-21},
 ].map(h=>{const length=Math.hypot(...h.normal);return {normal:h.normal.map(n=>n/length),constant:h.constant/length};}));
}
export function certifyMinifigHips(source,connectors){
 try{
  const requests=pairedRequests(connectors);if(!requests)return fail('unsupported_paired_hip_metadata');
  if(!source||!/^[a-f0-9]{64}$/.test(source.sourceHash||'')||!Array.isArray(source.body)||!source.body.length||!Array.isArray(source.studs)||source.studs.some(s=>!s||!Array.isArray(s.faces)))return fail('invalid_hip_source');
  const faces=[...source.body,...source.studs.flatMap(s=>s.faces)];
  if(faces.length>32000||faces.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(finite)))return fail('invalid_hip_faces');
  const triangles=faces.flatMap(tri),male=requests[0].male;let solids,certificate;
  if(male){
   const upper=triangles.flatMap(t=>tri(clip(t,[{normal:[0,-1,0],constant:0}]))).filter(t=>t.some(p=>p[1]>EPS)&&nonzero(t));
   if(canonical(upper)!==REVIEWED_HIPS.upperGeometryHash)return fail('hip_upper_geometry_differs');
   const lower=triangles.flatMap(t=>tri(clip(t,[{normal:[0,1,0],constant:0}]))).filter(nonzero);
   solids=[conservativeHull(lower.flat()).solid,...[-1,1].map(sign=>conservativeHull(upper.filter(t=>t.every(p=>p[0]*sign>0)).flat()).solid)];
   if(triangles.some(t=>!solids.some(s=>t.every(p=>s.planes.every(h=>dot(p,h.normal)<=h.constant+EPS)))))return fail('hip_source_face_crosses_partition');
   certificate={reviewedUpperGeometryHash:REVIEWED_HIPS.upperGeometryHash,partitionY:0,coverage:'every original triangle belongs to one retained convex solid'};
  }else{
   const inner=triangles.flatMap(t=>tri(clip(t,innerRegion))).filter(nonzero);
   if(canonical(inner)!==REVIEWED_WAIST.innerGeometryHash)return fail('waist_inner_geometry_differs');
   const prisms=waistPrisms();
   if(prisms.some(planes=>triangles.some(t=>accessInteriorWitness(t,planes))))return fail('source_in_waist_socket');
   // A decoration can project below the seating plane on the outside wall.
   // Its hull must not fill the empty space under the torso. Prove that the
   // entire outward prism is empty, and retain the wall on its boundary.
   let exteriorClearance=false;
   if(triangles.some(t=>t.some(p=>p[1]<-32))){
    const exterior=[{normal:[1,0,0],constant:19},{normal:[-1,0,0],constant:19},{normal:[0,0,1],constant:10},{normal:[0,0,-1],constant:10},{normal:[0,1,0],constant:-32}];
    if(triangles.some(t=>accessInteriorWitness(t,exterior)))return fail('source_below_waist_seating_plane');
    prisms.push(exterior);exteriorClearance=true;
   }
   solids=[conservativeHull(triangles.flat()).solid];
   for(const planes of prisms){const cut=subtractHipPrism(solids,planes);if(cut.status!=='subtracted')return cut;solids=cut.solids;}
   certificate={reviewedInnerGeometryHash:REVIEWED_WAIST.innerGeometryHash,innerRegion,prisms,exteriorClearance,coverage:'source hull minus full-source proven empty outward prisms',reach:'mouths open to exterior, inward depth 11; optional empty exterior clearance below seating plane'};
  }
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128||s.vertices.some(p=>!finite(p))))return fail('hip_profile_complexity');
  return {status:'certified',version:male?'reviewed-paired-hipstud-11-v1':'reviewed-waist-interface-11-v1',male,sourceHash:source.sourceHash,geometryHash:sha256(JSON.stringify(faces)),ports:requests.map(r=>r.port),certificate:{...certificate,numericEpsilon:EPS,sourceTriangles:triangles.length},asset:{solids}};
 }catch(e){if(e.code)return fail(e.code);throw e;}
}
export function subtractHipPrism(solids,planes){
 const result=[];
 for(const s of solids){
  if(planes.some(h=>s.vertices.every(p=>dot(p,h.normal)-h.constant>=-EPS))){result.push(s);continue;}
  if(planes.every(h=>s.vertices.every(p=>dot(p,h.normal)<=h.constant)))continue;
  const cut=subtractConvexPrism(s,planes);if(cut.status!=='subtracted')return cut;result.push(...cut.solids);
 }
 return {status:'subtracted',solids:result};
}
export function createMinifigHipCompiler(repository){
 const compiler=createEnvelopeCompiler(repository);
 for(const reviewed of [REVIEWED_HIPS,REVIEWED_WAIST])if(compiler.geometry(reviewed.part).sourceHash!==reviewed.sourceHash)throw Error('Reviewed minifig hip/waist source changed');
 return {compile(part,connectors){try{return certifyMinifigHips(compiler.geometry(part),connectors);}catch(e){if(e.code)return fail(e.code);throw e;}}};
}
