// Narrow, source-proven minifig neck/head seating. Arms, hips and headgear
// are separate mechanisms and cannot be inferred from this certificate.
import {createEnvelopeCompiler,conservativeHull,sha256} from './ldraw-envelope.mjs';
import {clipSurfacePolygon,reviewedR4Section,REVIEWED_R4_PRIMITIVE,subtractConvexPrism} from './axial-envelope.mjs';
import {R4_SECTION} from './axial-shaft.mjs';
import {certifyFacetBand} from './faceted-wall-proof.mjs';
import {accessInteriorWitness} from './standard-access.mjs';
export const REVIEWED_NECK=Object.freeze({part:'973',sourceHash:'1c83b62cdf7c0d139eb40805717b67c31b6e0bb5ea8390cfd96a159a698b3427',upperGeometryHash:'6e6a42e4bcca4c6c57267b0c6d9b38617e7bd479aca276e7651b650724225d0a'});
const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fail=reason=>({status:'indeterminate',reason});
const triangulate=f=>Array.from({length:Math.max(0,f.length-2)},(_,i)=>[f[0],f[i+1],f[i+2]]),nonzero=t=>Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))>1e-16;
const canonical=t=>sha256(JSON.stringify(t.map(t=>t.map(p=>JSON.stringify(p)).sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))));
export function minifigNeckRequest(c){
 const s=c?.shape;
 if(c?.type!=='cylinder'||!finite(c.pos)||!same(c.frame,[1,0,0,0,-1,0,0,0,1])||c.scale!=='none'||!['cor','none'].includes(c.mirror)||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length||!s||s.group!==''||s.center!==false||typeof s.slide!=='boolean'||!Array.isArray(s.sections)||s.sections.length!==1||s.sections[0]?.shape!=='R'||s.sections[0].radius!==6)return null;
 const male=c.gender==='M'&&s.sections[0].length===12&&s.caps==='A'&&same(c.pos,[0,0,0])&&same(c.normal,[0,1,0]),female=c.gender==='F'&&s.sections[0].length===20&&s.caps==='B'&&same(c.normal,[0,-1,0]);
 if(!male&&!female)return null;
 const kind=male?'neck':'neck-socket';return {male,port:{id:kind+':'+c.pos.join(':'),kind,point:[...c.pos],normal:[...c.normal],neck:{contract:'minifig-neck-12-fixed-v1',radius:6,length:12,socketDepth:20}}};
}
export function certifyMinifigNeck(source,connector,section){
 try{
  const request=minifigNeckRequest(connector);if(!request)return fail('unsupported_neck_metadata');
  if(!source||!/^[a-f0-9]{64}$/.test(source.sourceHash||'')||!Array.isArray(source.body)||!source.body.length||!Array.isArray(source.studs)||source.studs.some(s=>!s||!Array.isArray(s.faces)))return fail('invalid_neck_source');
  const faces=[...source.body,...source.studs.flatMap(s=>s.faces)];if(faces.length>32000||faces.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(finite)))return fail('invalid_neck_faces');
  const triangles=faces.flatMap(triangulate);let solids,certificate;
  if(request.male){
   const lower=triangles.flatMap(t=>triangulate(clipSurfacePolygon(t,{normal:[0,1,0],constant:0}))).filter(nonzero);
   // Coplanar shoulder faces belong to the lower hull. Including them in the
   // neck hull would fill the empty space around the neck with a false cone.
   const upper=triangles.flatMap(t=>triangulate(clipSurfacePolygon(t,{normal:[0,-1,0],constant:0}))).filter(t=>t.some(p=>p[1]>EPS)&&nonzero(t));
   if(canonical(upper)!==REVIEWED_NECK.upperGeometryHash)return fail('neck_geometry_differs');
   solids=[conservativeHull(lower.flat()).solid,conservativeHull(upper.flat()).solid];
   if(triangles.some(t=>!solids.some(s=>t.every(p=>s.planes.every(h=>dot(p,h.normal)<=h.constant+EPS)))))return fail('neck_source_face_crosses_partition');
   certificate={reviewedUpperGeometryHash:REVIEWED_NECK.upperGeometryHash,coverage:'every original triangle belongs to one retained convex solid',partitionY:0};
  }else{
   if(section?.sourceKey!==REVIEWED_R4_PRIMITIVE.key||section.sourceHash!==REVIEWED_R4_PRIMITIVE.sha256||!Array.isArray(section.polygon)||section.polygon.length!==16||new Set(section.polygon.map(p=>JSON.stringify(p))).size!==16||section.polygon.some(p=>!Array.isArray(p)||p.length!==2||!R4_SECTION.some(q=>p[0]===q[0]&&p[1]===q[1])))return fail('unreviewed_neck_section');
   const polygon=section.polygon.map(p=>p.map(n=>n*1.5)),pos=request.port.point,local=triangles.map(t=>t.map(p=>sub(p,pos))),walls=certifyFacetBand(local,{polygon,lo:0,hi:20});if(walls.status!=='certified')return fail('neck_'+walls.reason);
   const radial=polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length],n=[b[1]-a[1],0,a[0]-b[0]],length=Math.hypot(...n);let normal=n.map(v=>v/length),constant=normal[0]*a[0]+normal[2]*a[1];if(constant<0){normal=normal.map(n=>-n);constant=-constant;}return {normal,constant:constant+dot(normal,pos)};});
   const planes=[...radial,{normal:[0,1,0],constant:pos[1]+20}];
   if(triangles.some(t=>accessInteriorWitness(t,planes)))return fail('source_in_neck_socket');
   const hull=conservativeHull(triangles.flat()).solid,cut=subtractConvexPrism(hull,planes);if(cut.status!=='subtracted')return fail(cut.reason);solids=cut.solids;
   certificate={walls,prism:planes,coverage:'source hull minus one full-source proven empty prism',reach:'mouth open to exterior, inward depth 20'};
  }
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128||s.vertices.some(p=>!finite(p))))return fail('neck_profile_complexity');
  return {status:'certified',version:request.male?'reviewed-neck-upper-12-v1':'source-head-socket-20-v1',sourceHash:source.sourceHash,geometryHash:sha256(JSON.stringify(faces)),port:request.port,certificate:{...certificate,numericEpsilon:EPS,sourceTriangles:triangles.length},asset:{solids}};
 }catch(e){if(e.code)return fail(e.code);throw e;}
}
export function createMinifigNeckCompiler(repository){
 const compiler=createEnvelopeCompiler(repository),reviewed=compiler.geometry(REVIEWED_NECK.part),section=reviewedR4Section(repository);
 if(reviewed.sourceHash!==REVIEWED_NECK.sourceHash)throw Error('Reviewed minifig neck source changed');
 return {compile(part,connector){try{return certifyMinifigNeck(compiler.geometry(part),connector,section);}catch(e){if(e.code)return fail(e.code);throw e;}}};
}
