// Offline geometric proof for a straight, open-ended, faceted R4 channel.
// This is deliberately narrower than nominal LDCad R4 compatibility. A channel
// is removed only when every rendered source triangle avoids its OPEN prism,
// both ends reach exterior space, and real lateral walls surround its axis
// continuously over the full declared length. It neither models friction nor
// repairs rounded LDraw coordinates. In source-intersection mode, the prism is
// shrunk by actual wall halfspaces, never enlarged to fit the nominal male.
// Numeric epsilon is 1e-8 LDU, not a fit allowance: a source face entering the
// resulting prism by more than that is rejected. Nominal male compatibility
// and runtime collision tolerance are separate obligations for the caller.
//
// The output is a convex hull minus the certified prism, split into convex
// cells. All original faces (including separated studs) participate in the
// proof and remain covered. Unrelated holes remain conservatively filled.
import {parseLDraw} from './variant-proof.mjs';
import {createEnvelopeCompiler, conservativeHull, sha256} from './ldraw-envelope.mjs';

export const AXIAL_ENVELOPE_VERSION = 'exact-faceted-r4-through-channel-v1';
export const AXIAL_NUMERIC_EPSILON = 1e-8;
export const REVIEWED_R4_PRIMITIVE = Object.freeze({
  key: 'p/4-4cyli.dat',
  sha256: 'f832bd6e12c156e327b20dc954562942f62eda834effb114827a7664c27f82b9',
});
const EPS = AXIAL_NUMERIC_EPSILON;
const LIMITS = Object.freeze({triangles: 64_000, planes: 128, vertices: 128, directions: 128, solids: 129, coordinates: 100_000, fragments: 4096});
const IDENTITY = [1,0,0,0,1,0,0,0,1];
const R4_POLYGON = [[-4,0],[-3.6956,-1.5308],[-2.8284,-2.8284],[-1.5308,-3.6956],[0,-4],[1.5308,-3.6956],[2.8284,-2.8284],[3.6956,-1.5308],[4,0],[3.6956,1.5308],[2.8284,2.8284],[1.5308,3.6956],[0,4],[-1.5308,3.6956],[-2.8284,2.8284],[-3.6956,1.5308]];
const add = (a,b) => a.map((x,i)=>x+b[i]);
const sub = (a,b) => a.map((x,i)=>x-b[i]);
const mul = (v,k) => v.map(x=>x*k);
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = v => mul(v,1/Math.hypot(...v));
const clean = x => Object.is(x,-0)?0:x;
const center = points => points.reduce((sum,p)=>add(sum,mul(p,1/points.length)),[0,0,0]);
const distance = (p,plane) => dot(p,plane.normal)-plane.constant;
const finitePoint = p => Array.isArray(p)&&p.length===3&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=LIMITS.coordinates);
function fail(reason,details={}) { return {status:'indeterminate',reason,...details}; }
function error(reason) { const result = new Error(reason); result.code=reason; return result; }

function distinctPoints(points) {
  const result=[];
  for(const p of points){
    if(!finitePoint(p))throw error('invalid_geometry_coordinate');
    if(!result.some(q=>Math.hypot(...sub(p,q))<=EPS))result.push(p.map(clean));
    if(result.length>LIMITS.vertices)throw error('polyhedron_vertex_limit');
  }
  return result;
}
function canonicalDirections(vectors) {
  const result=[];
  for(const raw of vectors){
    const length=Math.hypot(...raw);if(length<=EPS)continue;
    let n=mul(raw,1/length);if(n.find(x=>Math.abs(x)>EPS)<0)n=mul(n,-1);
    if(!result.some(p=>Math.hypot(...sub(p,n))<=EPS))result.push(n.map(clean));
  }
  if(result.length>LIMITS.directions)throw error('polyhedron_direction_limit');
  return result;
}
function uniquePlanes(planes) {
  const out=[];
  for(const p of planes){
    if(!finitePoint(p.normal)||!Number.isFinite(p.constant))throw error('invalid_halfspace');
    const length=Math.hypot(...p.normal);if(length<EPS)throw error('invalid_halfspace');
    const next={normal:mul(p.normal,1/length),constant:p.constant/length};
    const duplicate=out.find(q=>Math.hypot(...sub(q.normal,next.normal))<=EPS);
    if(duplicate){
      // Only equal planes merge; parallel planes with different offsets are
      // not silently moved, since that could change the removed volume.
      if(Math.abs(duplicate.constant-next.constant)<=EPS)continue;
    }
    out.push(next);
  }
  if(out.length>LIMITS.planes)throw error('polyhedron_plane_limit');
  return out;
}
function polygonArea(points) {
  if(points.length<3)return 0;
  let sum=[0,0,0];
  for(let i=1;i+1<points.length;i++)sum=add(sum,cross(sub(points[i],points[0]),sub(points[i+1],points[0])));
  return Math.hypot(...sum)/2;
}
function orderedFace(points,normal) {
  points=distinctPoints(points);if(points.length<3)return [];
  const c=center(points),seed=Math.abs(normal[0])<.8?[1,0,0]:[0,1,0];
  const u=unit(cross(normal,seed)),v=cross(normal,u);
  points.sort((a,b)=>Math.atan2(dot(sub(a,c),v),dot(sub(a,c),u))-Math.atan2(dot(sub(b,c),v),dot(sub(b,c),u)));
  // Remove collinear corners before deriving SAT edge directions.
  let changed=true;
  while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++){
    const a=points[(i+points.length-1)%points.length],b=points[i],d=points[(i+1)%points.length];
    if(Math.hypot(...cross(sub(b,a),sub(d,b)))<=EPS*Math.max(1,Math.hypot(...sub(d,a)))){points.splice(i,1);changed=true;break;}
  }}
  return polygonArea(points)>EPS*EPS?points:[];
}

// Closed clipping is used only to construct solids. Openness of the removed
// prism is checked separately; coplanar source faces are legal boundary contact.
export function clipSurfacePolygon(polygon,plane) {
  const out=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a,plane),db=distance(b,plane);
    const aIn=da<=0,bIn=db<=0;
    if(aIn)out.push(a);
    if(aIn!==bIn){const t=da/(da-db);out.push(add(a,mul(sub(b,a),t)));}
  }
  return out;
}
function solidFaces(solid) {
  if(!Array.isArray(solid.vertices)||solid.vertices.length>LIMITS.vertices)throw error('invalid_polyhedron');
  const vertices=distinctPoints(solid.vertices),planes=uniquePlanes(solid.planes??[]);
  if(vertices.length<4||planes.length<4)throw error('invalid_polyhedron');
  if(vertices.some(v=>planes.some(p=>distance(v,p)>EPS)))throw error('vertices_outside_halfspaces');
  const faces=planes.map(plane=>({plane,points:orderedFace(vertices.filter(v=>Math.abs(distance(v,plane))<=EPS),plane.normal)})).filter(f=>f.points.length>=3);
  if(faces.length<4)throw error('invalid_polyhedron_faces');
  return faces;
}
function facesSolid(faces) {
  faces=faces.filter(f=>f.points.length>=3&&polygonArea(f.points)>EPS*EPS);
  if(faces.length<4)return null;
  const vertices=distinctPoints(faces.flatMap(f=>f.points));if(vertices.length<4)return null;
  const planes=uniquePlanes(faces.map(f=>f.plane)),c=center(vertices);
  // A zero-volume remainder is not emitted as a collision solid. Reject a
  // numerically uncertain positive sliver rather than filling the cavity.
  const clearance=Math.min(...planes.map(p=>-distance(c,p)));
  if(clearance<=0)return null;
  if(clearance<=EPS)throw error('uncertain_polyhedron_sliver');
  if(vertices.some(v=>planes.some(p=>distance(v,p)>EPS)))throw error('clipping_left_invalid_vertices');
  const normals=canonicalDirections(planes.map(p=>p.normal));
  const edges=canonicalDirections(faces.flatMap(f=>f.points.map((p,i)=>sub(f.points[(i+1)%f.points.length],p))));
  return {vertices,normals,edges,planes};
}

export function clipConvexSolid(solid,plane) {
  plane=uniquePlanes([plane])[0];
  const values=solid.vertices.map(p=>distance(p,plane));
  if(Math.max(...values)<=0)return solid;
  if(Math.min(...values)>=0)return null;
  const faces=solidFaces(solid),clipped=[],cap=[];
  for(const f of faces){
    const points=clipSurfacePolygon(f.points,plane);
    if(points.length>=3&&polygonArea(points)>EPS*EPS)clipped.push({...f,points});
    for(const p of points)if(Math.abs(distance(p,plane))<=EPS)cap.push(p);
  }
  const points=orderedFace(cap,plane.normal);
  if(points.length>=3)clipped.push({plane,points});
  return facesSolid(clipped);
}

// H \ interior(P) = union_i (H intersect P_0 ... P_(i-1) intersect !P_i).
// The cells share boundaries only. Their halfspaces, vertices and edge vectors
// are emitted directly; no outward hull inflation is allowed after cutting.
export function subtractConvexPrism(hull,radialPlanes) {
  try{
    radialPlanes=uniquePlanes(radialPlanes);
    if(radialPlanes.length<3||radialPlanes.length>64)return fail('invalid_prism_plane_count');
    solidFaces(hull);let remainder=hull;const solids=[];
    for(let i=0;i<radialPlanes.length&&remainder;i++){
      const p=radialPlanes[i],outside={normal:mul(p.normal,-1),constant:-p.constant};
      const cell=clipConvexSolid(remainder,outside);
      if(cell){
        if(cell.vertices.some(v=>distance(v,outside)>EPS||hull.planes.some(h=>distance(v,h)>EPS)))return fail('invalid_difference_cell');
        solids.push(cell);
      }
      remainder=clipConvexSolid(remainder,p);
    }
    if(!solids.length)return fail('empty_difference_body');
    if(solids.length>LIMITS.solids)return fail('difference_solid_limit');
    return {status:'subtracted',solids,removed:remainder};
  }catch(e){if(e.code)return fail(e.code);throw e;}
}

// Load the exact faceted section used by the real 30374/87994 meshes. A file
// name or a nominal radius alone never authorizes removing geometry.
export function reviewedR4Section(repository) {
  const text=repository.read(REVIEWED_R4_PRIMITIVE.key);
  if(sha256(text)!==REVIEWED_R4_PRIMITIVE.sha256)throw error('unreviewed_r4_primitive');
  const records=parseLDraw(text,REVIEWED_R4_PRIMITIVE.key),faces=records.filter(r=>r.type===3||r.type===4);
  if(records.some(r=>r.type===1)||faces.length!==16||faces.some(f=>f.type!==4))throw error('invalid_r4_primitive');
  const entries=new Map();
  for(const f of faces)for(const p of f.vertices){
    if(p[1]!==0&&p[1]!==1)throw error('invalid_r4_primitive_height');
    entries.set(`${p[0]},${p[2]}`,[p[0]*4,p[2]*4]);
  }
  const polygon=[...entries.values()].sort((a,b)=>Math.atan2(a[1],a[0])-Math.atan2(b[1],b[0]));
  if(polygon.length!==16)throw error('invalid_r4_primitive_section');
  return {polygon,sourceKey:REVIEWED_R4_PRIMITIVE.key,sourceHash:REVIEWED_R4_PRIMITIVE.sha256,radius:4};
}
function channelFrame(request) {
  const {pos=[0,0,0],frame=IDENTITY,length}=request;
  if(!finitePoint(pos)||!Array.isArray(frame)||frame.length!==9||!frame.every(Number.isFinite)||!Number.isFinite(length)||length<=EPS||length>100_000)throw error('invalid_channel_request');
  const u=[frame[0],frame[3],frame[6]],axis=[frame[1],frame[4],frame[7]],v=[frame[2],frame[5],frame[8]];
  if([u,axis,v].some(a=>Math.abs(Math.hypot(...a)-1)>EPS)||Math.abs(dot(u,axis))>EPS||Math.abs(dot(u,v))>EPS||Math.abs(dot(v,axis))>EPS)throw error('nonrigid_channel_frame');
  // Reflections are allowed: the Brickforge Y flip produces det=-1 frames.
  return {pos,u,axis,v,length};
}
function channelPlanes(section,frame) {
  const polygon=section?.polygon;
  if(!Array.isArray(polygon)||polygon.length!==16||section.sourceHash!==REVIEWED_R4_PRIMITIVE.sha256||section.sourceKey!==REVIEWED_R4_PRIMITIVE.key)throw error('unreviewed_channel_section');
  if(polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))||new Set(polygon.map(p=>p.join(','))).size!==16)throw error('invalid_channel_section');
  if(polygon.some(p=>!R4_POLYGON.some(q=>p[0]===q[0]&&p[1]===q[1])))throw error('changed_reviewed_channel_section');
  const points=polygon.map(p=>{
    if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw error('invalid_channel_section');
    return add(frame.pos,add(mul(frame.u,p[0]),mul(frame.v,p[1])));
  });
  const planes=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],edge=sub(b,a);
    let normal=unit(cross(edge,frame.axis)),constant=dot(normal,a);
    if(dot(normal,frame.pos)>constant){normal=mul(normal,-1);constant=-constant;}
    if(points.some(p=>dot(normal,p)>constant+EPS))throw error('nonconvex_channel_section');
    planes.push({normal,constant});
  }
  return planes;
}
function lateralWalls(triangles,frame) {
  const walls=[];
  for(let index=0;index<triangles.length;index++){
    const triangle=triangles[index],raw=cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0]));
    if(Math.hypot(...raw)<=EPS*EPS)continue;
    let normal=unit(raw);
    if(Math.abs(dot(normal,frame.axis))>EPS)continue;
    // This band SELECTS possible nominal R4 walls only. It is never a clearance
    // allowance. All selected planes shrink the void, and every source face,
    // including unselected faces, is subsequently tested against that void.
    const radii=triangle.map(p=>{const d=sub(p,frame.pos);return Math.hypot(dot(d,frame.u),dot(d,frame.v));});
    if(radii.some(r=>r<3.7||r>4.01))continue;
    let constant=dot(normal,triangle[0]);
    if(dot(normal,frame.pos)>constant){normal=mul(normal,-1);constant=-constant;}
    if(constant-dot(normal,frame.pos)<3.7)continue;
    const times=triangle.map(p=>dot(sub(p,frame.pos),frame.axis));
    walls.push({normal,constant,lo:Math.min(...times),hi:Math.max(...times),triangle:index,radii});
  }
  return walls;
}
function projectedSurfaceSeparators(triangle,frame) {
    const points=triangle.map(p=>{const d=sub(p,frame.pos);return [dot(d,frame.u),dot(d,frame.v)];});
    const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0],delta=(a,b)=>[a[0]-b[0],a[1]-b[1]];
    const area=cross2(delta(points[1],points[0]),delta(points[2],points[0]));
    if(Math.abs(area)>EPS*EPS){
      const signs=points.map((a,i)=>cross2(delta(points[(i+1)%3],a),[-a[0],-a[1]]));
      if(signs.every(s=>s>=0)||signs.every(s=>s<=0))throw error('source_projection_covers_channel_axis');
    }
    let nearest=null,best=Infinity;
    for(let i=0;i<3;i++){
      const a=points[i],b=points[(i+1)%3],d=delta(b,a),length2=d[0]*d[0]+d[1]*d[1];
      const t=length2?Math.max(0,Math.min(1,-(a[0]*d[0]+a[1]*d[1])/length2)):0;
      const p=[a[0]+t*d[0],a[1]+t*d[1]],distance=Math.hypot(...p);
      if(distance<best){best=distance;nearest=p;}
    }
    if(best<=EPS)throw error('source_projection_covers_channel_axis');
    // Every point on this convex projected triangle lies beyond the tangent
    // support line at its nearest point. This also catches end rings with
    // manually rounded inner edges that disagree with the cylindrical walls.
    const n2=nearest.map(v=>v/best);
    if(points.some(p=>p[0]*n2[0]+p[1]*n2[1]<best-EPS))throw error('invalid_projected_surface_separator');
    const candidates=[{normal:add(mul(frame.u,n2[0]),mul(frame.v,n2[1])),offset:best}];
    // The nearest-point tangent can unnecessarily shave a neighbouring corner
    // when the closest feature is a single vertex. Also consider source edge
    // lines and choose the safe separator retaining the most current void.
    for(let i=0;i<3;i++){
      const a=points[i],d=delta(points[(i+1)%3],a),length=Math.hypot(...d);if(length<=EPS)continue;
      let n=[-d[1]/length,d[0]/length],offset=n[0]*a[0]+n[1]*a[1];
      if(offset<0){n=n.map(x=>-x);offset=-offset;}
      if(offset<=EPS||points.some(p=>p[0]*n[0]+p[1]*n[1]<offset-EPS))continue;
      candidates.push({normal:add(mul(frame.u,n[0]),mul(frame.v,n[1])),offset});
    }
    return candidates.map(p=>({normal:p.normal,constant:dot(p.normal,frame.pos)+p.offset}));
}
function polygonPlanes(polygon,frame) {
  const planes=[];
  for(let i=0;i<polygon.length;i++){
    let normal=unit(cross(sub(polygon[(i+1)%polygon.length],polygon[i]),frame.axis)),constant=dot(normal,polygon[i]);
    if(dot(normal,frame.pos)>constant){normal=mul(normal,-1);constant=-constant;}
    if(polygon.some(p=>distance(p,{normal,constant})>EPS))throw error('nonconvex_source_channel_section');
    planes.push({normal,constant});
  }
  return planes;
}
function sourcePrism(nominalPlanes,section,frame,walls,triangles) {
  let polygon=section.polygon.map(([a,b])=>add(frame.pos,add(mul(frame.u,a),mul(frame.v,b))));
  for(const wall of walls){polygon=clipSurfacePolygon(polygon,wall);if(polygon.length<3)throw error('empty_source_channel_section');}
  polygon=orderedFace(polygon,frame.axis);
  let planes=polygonPlanes(polygon,frame);
  for(const triangle of triangles){
    if(clearPrism([triangle],planes).status==='clear')continue;
    const candidates=projectedSurfaceSeparators(triangle,frame);let best=null,bestArea=0;
    for(const plane of candidates){const candidate=clipSurfacePolygon(polygon,plane),area=polygonArea(candidate);if(area>bestArea){best=candidate;bestArea=area;}}
    if(!best||best.length<3)throw error('empty_source_channel_section');
    polygon=orderedFace(best,frame.axis);planes=polygonPlanes(polygon,frame);
    if(polygon.length>64)throw error('source_channel_section_complexity');
  }
  if(polygon.length<3||polygon.length>64)throw error('source_channel_section_complexity');
  const nominalVertices=section.polygon.map(([a,b])=>add(frame.pos,add(mul(frame.u,a),mul(frame.v,b))));
  // The source void cannot be larger than the reviewed male section.
  if(polygon.some(p=>nominalPlanes.some(h=>distance(p,h)>EPS)))throw error('source_channel_was_enlarged');
  return {planes,polygon:polygon.map(p=>{const d=sub(p,frame.pos);return [dot(d,frame.u),dot(d,frame.v)];}),
    maximumNominalVertexExcess:Math.max(0,...nominalVertices.flatMap(p=>planes.map(h=>distance(p,h))))};
}
function trianglesOf(source) {
  const faces=[...(source.body??[]),...(source.studs??[]).flatMap(s=>s.faces??[])];
  const triangles=[];
  for(const f of faces){
    if(!Array.isArray(f)||(f.length!==3&&f.length!==4)||!f.every(finitePoint))throw error('invalid_source_face');
    triangles.push([f[0],f[1],f[2]]);if(f.length===4)triangles.push([f[0],f[2],f[3]]);
  }
  if(!triangles.length||triangles.length>LIMITS.triangles)throw error('source_triangle_limit');
  return triangles;
}

// Empty connected prism + exterior ends prove accessibility. Coplanar faces
// are retained on the difference boundary. Any actual positive-area face in
// the open prism blocks it; this includes caps at any axial coordinate.
function clearPrism(triangles,planes) {
  for(let i=0;i<triangles.length;i++){
    let polygon=triangles[i];
    for(const p of planes){polygon=clipSurfacePolygon(polygon,p);if(!polygon.length)break;}
    if(polygon.length<3||polygonArea(polygon)<=EPS*EPS)continue;
    const witness=center(polygon),margin=Math.min(...planes.map(p=>-distance(witness,p)));
    if(margin>EPS)return {status:'blocked',reason:'source_surface_inside_channel',triangle:i,witness,interiorMargin:margin};
  }
  return {status:'clear'};
}
function surrounds(normals,frame) {
  if(normals.length<3)return false;
  const angles=normals.map(n=>Math.atan2(dot(n,frame.v),dot(n,frame.u))).sort((a,b)=>a-b);
  return angles.every((a,i)=>(i+1<angles.length?angles[i+1]:angles[0]+2*Math.PI)-a<Math.PI-EPS);
}
function continuousSupport(walls,frame) {
  const planes=[],intervals=[],lo=-frame.length/2,hi=frame.length/2;
  for(const wall of walls){
    let i=planes.findIndex(p=>Math.hypot(...sub(p.normal,wall.normal))<=EPS);
    if(i===-1){i=planes.length;planes.push(wall);intervals.push([]);}
    const a=Math.max(lo,wall.lo),b=Math.min(hi,wall.hi);
    if(b-a>EPS)intervals[i].push([a,b]);
  }
  const merged=intervals.map(list=>{
    list.sort((a,b)=>a[0]-b[0]);const result=[];
    for(const item of list){const last=result.at(-1);if(last&&item[0]<=last[1]+EPS)last[1]=Math.max(last[1],item[1]);else result.push([...item]);}
    return result;
  });
  const events=[...new Set([lo,hi,...merged.flat(2)])].sort((a,b)=>a-b);
  for(let j=0;j+1<events.length;j++){
    if(events[j+1]-events[j]<=EPS)continue;
    const t=(events[j]+events[j+1])/2;
    const active=planes.filter((p,i)=>merged[i].some(([a,b])=>a<=t&&b>=t));
    if(!surrounds(active.map(p=>p.normal),frame))return fail('channel_support_not_continuous',{interval:[events[j],events[j+1]],supportingDirections:active.length});
  }
  return {status:'supported',proof:'source-wall-interval-surround-v1',interval:[lo,hi],directions:merged.filter(x=>x.length).length,
    sourceWallRadiusRange:[Math.min(...walls.flatMap(w=>w.radii)),Math.max(...walls.flatMap(w=>w.radii))]};
}

export function certifyAxialChannel(source,request={}) {
  try{
    const frame=channelFrame(request),nominalPlanes=channelPlanes(request.section,frame),triangles=trianglesOf(source);
    const walls=lateralWalls(triangles,frame),sectionPolicy=request.sectionPolicy??'source-intersection';
    if(!['source-intersection','exact-standard'].includes(sectionPolicy))return fail('unknown_channel_section_policy');
    const derived=sectionPolicy==='source-intersection'?sourcePrism(nominalPlanes,request.section,frame,walls,triangles):{planes:nominalPlanes,polygon:request.section.polygon,maximumNominalVertexExcess:0};
    const planes=derived.planes;
    // Include hollow studs in the bound; otherwise 4274 would lose its last
    // four LDU and a capped or detached opening could be falsely certified.
    const extents=[Infinity,-Infinity];
    for(const triangle of triangles)for(const point of triangle){const t=dot(sub(point,frame.pos),frame.axis);extents[0]=Math.min(extents[0],t);extents[1]=Math.max(extents[1],t);}
    if(Math.abs(extents[0]+frame.length/2)>EPS||Math.abs(extents[1]-frame.length/2)>EPS)return fail('channel_ends_do_not_match_body_extents',{extents,declared:[-frame.length/2,frame.length/2]});
    const clear=clearPrism(triangles,planes);if(clear.status!=='clear')return clear;
    const support=continuousSupport(walls,frame);if(support.status!=='supported')return support;
    const {solid:hull,approximation}=conservativeHull(triangles.flat());
    const difference=subtractConvexPrism(hull,planes);if(difference.status!=='subtracted')return difference;
    // A face lies in the original conservative hull and outside the open
    // prism iff it belongs to the closed union emitted by the partition.
    // Check the source-hull side independently, not only sampled vertices of
    // the output; each triangle is convex so all of it then lies in the hull.
    if(triangles.some(t=>t.some(v=>hull.planes.some(p=>distance(v,p)>EPS))))return fail('source_face_outside_hull');
    return {status:'certified',version:AXIAL_ENVELOPE_VERSION,sourceHash:source.sourceHash,
      certificate:{section:{sourceKey:request.section.sourceKey,sourceHash:request.section.sourceHash,nominalPolygon:request.section.polygon,polygon:derived.polygon,policy:sectionPolicy,maximumNominalVertexExcess:derived.maximumNominalVertexExcess},pos:frame.pos,frame:request.frame??IDENTITY,length:frame.length,
        numericEpsilon:EPS,clearance:'exact-open-faceted-prism',ends:'both-exterior',support,sourceTriangleCount:triangles.length,coverage:'source-hull-and-empty-prism-partition'},
      asset:{version:1,kind:'convex-hull-minus-certified-axial-channel',solids:difference.solids},approximation};
  }catch(e){if(e.code)return fail(e.code);throw e;}
}

export function createAxialEnvelopeCompiler(repository) {
  const geometryCompiler=createEnvelopeCompiler(repository),section=reviewedR4Section(repository);
  return {section,compile(partId,request){
    try{return certifyAxialChannel(geometryCompiler.geometry(partId),{...request,section});}
    catch(e){if(e.code)return fail(e.code);throw e;}
  }};
}
