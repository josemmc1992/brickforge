// Offline-only conservative envelopes. This is not a watertight/physics proof.
// Every rendered face belongs either to the body hull or a separately bounded,
// explicitly reviewed standard stud. Holes in the body hull remain filled.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {Vector3} from 'three';
import {parseLDraw, normalizeReference, ProofError} from './variant-proof.mjs';

export const ENVELOPE_VERSION = 'ldraw-conservative-hull-v1';
export const ENVELOPE_EPSILON = 1e-6;
const IDENTITY = [1,0,0,0,1,0,0,0,1];
const LIMITS = {depth:48, faces:32_000, instances:100_000, coordinates:100_000, cacheFaces:160_000, hullVertices:128, directions:128};
// Exact reviewed files; names/regexes never authorize geometry removal.
export const REVIEWED_STUDS = Object.freeze({
  'p/stud.dat':'67c0b504502e97e2f61879ca0f740d101264474b4b95702176ee4685dd1a592a',
  'p/stud2.dat':'e1362f01b81ca9e2526383bee12942ce54cc09a6889e7966f9c846984759b824',
  'p/stud2a.dat':'0782cd30cbba47361e2adcae6d699a53d3ce8e9c2c953ed1219b550b779f6991',
});
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(a,s)=>a.map(v=>v*s);
const clean=v=>Object.is(v,-0)?0:v;
const flip=v=>[clean(v[0]),clean(-v[1]),clean(v[2])];
const transform=(p,m,o=[0,0,0])=>[0,1,2].map(i=>clean(dot(m.slice(i*3,i*3+3),p)+o[i]));
function reject(code,message){throw new ProofError(code,message);}
function bounded(p){if(p.some(v=>!Number.isFinite(v)||Math.abs(v)>LIMITS.coordinates))reject('coordinate_limit','Transformed geometry exceeds the coordinate bound.');return p;}
function isQuarterTurn(m){return m.every(v=>Math.abs(v-Math.round(v))<1e-10&&Math.abs(v)<=1+1e-10)&&[0,1,2].every(i=>Math.abs(dot(m.slice(i*3,i*3+3),m.slice(i*3,i*3+3))-1)<1e-10)&&Math.abs(dot(m.slice(0,3),m.slice(3,6)))<1e-10&&Math.abs(dot(m.slice(0,3),m.slice(6,9)))<1e-10&&Math.abs(dot(m.slice(3,6),m.slice(6,9)))<1e-10;}
export function geometryBounds(points){if(!points.length)reject('empty_geometry','No physical face vertices.');const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}return {min,max};}
function directions(vectors){const map=new Map();for(const vector of vectors){const length=Math.hypot(...vector);if(length<1e-10)continue;let v=vector.map(n=>n/length);const first=v.find(n=>Math.abs(n)>1e-10);if(first<0)v=v.map(n=>-n);const key=v.map(n=>Math.round(n*1e9)).join(',');if(!map.has(key))map.set(key,v.map(clean));}return [...map.values()].sort((a,b)=>a.join(',').localeCompare(b.join(','),'en'));}
export function boxSolid(bounds){
  const {min:a,max:b}=bounds,vertices=[];for(const x of [a[0],b[0]])for(const y of [a[1],b[1]])for(const z of [a[2],b[2]])vertices.push([x,y,z]);
  const axes=[[1,0,0],[0,1,0],[0,0,1]],planes=[];for(let i=0;i<3;i++){planes.push({normal:axes[i],constant:b[i]},{normal:scale(axes[i],-1),constant:-a[i]});}
  return {vertices,normals:axes,edges:axes,planes};
}
export function pointInEnvelope(point,solid,tolerance=ENVELOPE_EPSILON){return solid.planes.every(p=>dot(p.normal,point)<=p.constant+tolerance);}
export function conservativeHull(sourcePoints){
  const unique=new Map();for(const point of sourcePoints){bounded(point);unique.set(point.map(clean).join(','),point.map(clean));}
  const points=[...unique.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
  const bounds=geometryBounds(points);
  if(points.length<4||bounds.min.some((v,i)=>bounds.max[i]-v<ENVELOPE_EPSILON))reject('degenerate_body','The remaining body has no three-dimensional envelope.');
  const fallback=()=>({solid:boxSolid({min:bounds.min.map(n=>n-ENVELOPE_EPSILON),max:bounds.max.map(n=>n+ENVELOPE_EPSILON)}),approximation:'aabb-fallback'});
  const hull=new ConvexHull().setFromPoints(points.map(p=>new Vector3(...p)));
  if(hull.faces.length<4)return fallback();
  const hullPoints=new Map(),faceNormals=[],edgeVectors=[],planes=[];
  for(const face of hull.faces){planes.push({normal:face.normal.toArray(),constant:face.constant});faceNormals.push(face.normal.toArray());let edge=face.edge;do{const a=edge.head().point.toArray(),b=edge.tail().point.toArray();hullPoints.set(a.join(','),a);edgeVectors.push(sub(a,b));edge=edge.next;}while(edge!==face.edge);}
  const vertices=[...hullPoints.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]),normals=directions(faceNormals),edges=directions(edgeVectors);
  if(vertices.length>LIMITS.hullVertices||normals.length>LIMITS.directions||edges.length>LIMITS.directions)return fallback();
  const center=vertices.reduce((sum,v)=>plus(sum,scale(v,1/vertices.length)),[0,0,0]);
  const clearance=Math.min(...planes.map(p=>p.constant-dot(p.normal,center)));
  if(clearance<ENVELOPE_EPSILON)return fallback();
  // Tiny outward enlargement makes floating point hull construction conservative.
  const factor=1+ENVELOPE_EPSILON/clearance;
  const solid={vertices:vertices.map(v=>plus(center,scale(sub(v,center),factor))),normals,edges,planes:planes.map(p=>({normal:p.normal,constant:dot(p.normal,center)+(p.constant-dot(p.normal,center))*factor}))};
  if(!points.every(p=>pointInEnvelope(p,solid,1e-8)))return fallback();
  return {solid,approximation:'convex-hull'};
}

export function createPackedGeometryRepository(root){
  const index=JSON.parse(fs.readFileSync(path.join(root,'lib/geometry-index.json'),'utf8')),packs=new Map();
  return {
    resolve(name){name=normalizeReference(name);return ['parts/'+name,'p/'+name,'models/'+name,name].find(key=>Object.hasOwn(index,key));},
    read(key){const id=index[key];if(!Number.isInteger(id))reject('missing_geometry','Geometry is absent from the index.');if(!packs.has(id)){const bytes=fs.readFileSync(path.join(root,`public/catalog/geometry/${id}.bin`));packs.set(id,JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024})));while(packs.size>6)packs.delete(packs.keys().next().value);}const pack=packs.get(id);packs.delete(id);packs.set(id,pack);if(!Object.hasOwn(pack,key)||typeof pack[key]!=='string')reject('missing_geometry','Geometry is absent from its archive.');return pack[key];},
  };
}
function physicalMeta(text,key){
  for(const line of text.split(/\r?\n/)){
    if(/^\s*0\s+!(?!LDRAW_ORG\b|LICENSE\b|HISTORY\b|CATEGORY\b|KEYWORDS\b|HELP\b|CMDLINE\b|COLOUR\b)/i.test(line))reject('unsupported_meta',`Uninterpreted geometry metadata in ${key}`);
  }
}
function featureBounds(pos,normal){const axis=normal.findIndex(v=>Math.abs(v)>0.999);if(axis<0)reject('feature_transform','Stud normal is not orthogonal.');return {min:pos.map((n,i)=>i===axis?n+Math.min(0,normal[i]*4):n-6),max:pos.map((n,i)=>i===axis?n+Math.max(0,normal[i]*4):n+6)};}
function transformedFaces(faces,matrix,offset){return faces.map(face=>face.map(p=>bounded(transform(p,matrix,offset))));}
function faceTriangles(faces){return faces.flatMap(f=>f.length===3?[f]:[[f[0],f[1],f[2]],[f[0],f[2],f[3]]]);}

export function createEnvelopeCompiler(repository){
  const cache=new Map();let cacheFaces=0,currentGeometry=null,currentSocketData=null;
  function expand(key,stack=[]){
    if(stack.includes(key))reject('cyclic_reference','Geometry has a reference cycle.');
    if(stack.length>LIMITS.depth)reject('depth_limit','Geometry nesting exceeds the limit.');
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    const text=repository.read(key);physicalMeta(text,key);const records=parseLDraw(text,key),body=[],studs=[],dependencies=[];let instanceCount=1,faceCount=0;
    for(const record of records){
      if(record.type===1){
        const childKey=repository.resolve(record.reference);if(!childKey)reject('missing_geometry',`Missing dependency ${record.reference}`);
        const child=expand(childKey,[...stack,key]);dependencies.push(child.sourceHash);instanceCount+=child.instanceCount;
        if(instanceCount>LIMITS.instances)reject('instance_limit','Expanded references exceed the limit.');
        body.push(...transformedFaces(child.body,record.matrix,record.offset));
        for(const feature of child.studs){
          const faces=transformedFaces(feature.faces,record.matrix,record.offset);
          if(isQuarterTurn(record.matrix))studs.push({...feature,pos:bounded(transform(feature.pos,record.matrix,record.offset)),normal:transform(feature.normal,record.matrix),faces});
          else body.push(...faces); // Nonstandard scale/shear stays in the body.
        }
        faceCount+=child.faceCount;
      }else if(record.type===3||record.type===4){body.push(record.vertices);faceCount++;}
      if(faceCount>LIMITS.faces)reject('face_limit','Expanded face count exceeds the compiler limit.');
    }
    const sourceHash=sha256(JSON.stringify([key,sha256(text),dependencies]));
    if(Object.hasOwn(REVIEWED_STUDS,key)&&sha256(text)===REVIEWED_STUDS[key]){
      const allFaces=[...body,...studs.flatMap(s=>s.faces)],solid=boxSolid({min:[-6,-4,-6],max:[6,0,6]});
      if(!allFaces.length||!allFaces.flat().every(p=>pointInEnvelope(p,solid,1e-8)))reject('stud_proof_failed','Reviewed stud descendants escape the standard envelope.');
      body.length=0;studs.length=0;studs.push({pos:[0,0,0],normal:[0,-1,0],faces:allFaces,sourceKey:key,sourceHash,proof:'reviewed-standard-stud-bounds-v1'});
    }
    const value={body,studs,sourceHash,faceCount,instanceCount};cache.set(key,value);cacheFaces+=faceCount;
    while(cacheFaces>LIMITS.cacheFaces&&cache.size>1){const first=cache.keys().next().value;cacheFaces-=cache.get(first).faceCount;cache.delete(first);}
    return value;
  }
  function geometry(partId){
    if(currentGeometry?.partId===partId)return currentGeometry.value;
    const key=repository.resolve(partId.endsWith('.dat')?partId:partId+'.dat');if(!key)reject('missing_geometry','Part geometry is missing.');
    const expanded=expand(key),body=expanded.body.map(f=>f.map(flip)),studs=expanded.studs.map(s=>({...s,pos:flip(s.pos),normal:flip(s.normal),faces:s.faces.map(f=>f.map(flip))}));
    const value={key,body,studs,sourceHash:expanded.sourceHash,triangleCount:body.reduce((n,f)=>n+f.length-2,0)+studs.reduce((n,s)=>n+s.faces.reduce((m,f)=>m+f.length-2,0),0)};
    currentGeometry={partId,value};currentSocketData=null;return value;
  }
  function compile(partId){
    const source=geometry(partId),bodyPoints=source.body.flat(),{solid:bodyHull,approximation}=conservativeHull(bodyPoints);
    const removedStuds=source.studs.map((feature,index)=>{
      const solid=boxSolid(featureBounds(feature.pos,feature.normal));
      if(!feature.faces.flat().every(point=>pointInEnvelope(point,solid,1e-8)))reject('stud_proof_failed','Transformed stud escapes its emitted envelope.');
      return {id:`stud-${index}`,pos:feature.pos,normal:feature.normal,solid,sourceKey:feature.sourceKey,sourceHash:feature.sourceHash,proof:feature.proof};
    });
    const bounds=geometryBounds([...bodyPoints,...source.studs.flatMap(s=>s.faces.flat())]);
    return {asset:{version:1,kind:'convex-body-separated-studs',bodyHull,removedStuds,bounds},sourceHash:source.sourceHash,triangleCount:source.triangleCount,approximation};
  }
  function socketClearance(partId,request){
    try{
      const source=geometry(partId);
      if(!currentSocketData){const triangles=faceTriangles([...source.body,...source.studs.flatMap(s=>s.faces)]);currentSocketData={triangles,triangleBounds:triangles.map(geometryBounds),bounds:geometryBounds(triangles.flat()),results:new Map()};}
      const key=JSON.stringify(request);
      if(!currentSocketData.results.has(key))currentSocketData.results.set(key,{...certifySocketClearance(currentSocketData.triangles,request,currentSocketData),sourceHash:source.sourceHash});
      return currentSocketData.results.get(key);
    }catch(error){if(error instanceof ProofError)return {status:'indeterminate',reason:error.code};throw error;}
  }
  return {compile,geometry,socketClearance};
}

// Clip a surface triangle against an open, convex insertion corridor. The
// corridor starts beyond the part bounds, so an enclosed hollow is not mistaken
// for an accessible socket. This checks source surfaces, not physical strength.
export function certifySocketClearance(triangles,{pos,normal,radius=6,depth=4,tolerance=.01},prepared=null){
  if(!Array.isArray(pos)||!Array.isArray(normal)||pos.length!==3||normal.length!==3||[...pos,...normal,radius,depth,tolerance].some(n=>!Number.isFinite(n))||radius<=0||depth<=0||tolerance<0)return {status:'indeterminate',reason:'invalid_socket'};
  if(Math.abs(Math.hypot(...normal)-1)>1e-8||normal.filter(n=>Math.abs(n)>1e-8).length!==1)return {status:'indeterminate',reason:'nonorthogonal_socket'};
  if(!triangles.length)return {status:'indeterminate',reason:'empty_geometry'};
  const bounds=prepared?.bounds??geometryBounds(triangles.flat()),axis=normal.findIndex(n=>Math.abs(n)>.9);
  const outward=Math.max(0,(normal[axis]>0?bounds.max[axis]-pos[axis]:pos[axis]-bounds.min[axis]))+1;
  const corridor={min:pos.map((v,i)=>i===axis?v+Math.min(normal[i]*outward,-normal[i]*depth):v-radius-tolerance),max:pos.map((v,i)=>i===axis?v+Math.max(normal[i]*outward,-normal[i]*depth):v+radius+tolerance)};
  const seed=Math.abs(normal[0])<.5?[1,0,0]:[0,1,0],u=cross(normal,seed),v=cross(normal,u),planes=[];
  // Circumscribed 16-gon covers the radius, including a safety margin.
  for(let i=0;i<16;i++){const angle=i*Math.PI/8,n=plus(scale(u,Math.cos(angle)),scale(v,Math.sin(angle)));planes.push({normal:n,constant:dot(n,pos)+radius+tolerance});}
  planes.push({normal,constant:dot(normal,pos)+outward},{normal:scale(normal,-1),constant:-dot(normal,pos)+depth-tolerance});
  let tested=0;
  for(let triangleIndex=0;triangleIndex<triangles.length;triangleIndex++){const triangle=triangles[triangleIndex];tested++;
    const triangleBounds=prepared?.triangleBounds[triangleIndex]??geometryBounds(triangle);
    if([0,1,2].some(i=>triangleBounds.max[i]<corridor.min[i]||triangleBounds.min[i]>corridor.max[i]))continue;
    let polygon=triangle;
    for(const plane of planes){const result=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=dot(plane.normal,a)-plane.constant,db=dot(plane.normal,b)-plane.constant;if(da<-1e-8)result.push(a);if((da<-1e-8)!==(db<-1e-8)){const t=da/(da-db);result.push(plus(a,scale(sub(b,a),t)));}}polygon=result;if(!polygon.length)break;}
    if(polygon.length)return {status:'blocked',reason:'surface_in_insertion_corridor',triangle:tested-1};
  }
  const support=certifySocketSupport(triangles,{pos,normal,radius,depth},prepared);
  if(support.status!=='supported')return {status:'indeterminate',reason:support.reason,support};
  return {status:'clear',proof:'source-surface-clear-supported-socket-v2',radius,depth,tolerance,testedTriangles:tested,support};
}

// An empty corridor is not evidence that there is a receiver: for example, an
// obsolete metadata point can float below the entire part. Require real lateral
// surfaces around it throughout a common axial interval. Triangle/plane cuts
// produce continuous contact intervals; this is not sampling two heights or
// counting nearby vertices. Face normals, not ray directions, provide closure:
// two parallel walls cannot masquerade as four contacts through oblique rays.
export function certifySocketSupport(triangles,{pos,normal,radius=6,depth=4},prepared=null){
  const epsilon=1e-8,loDepth=.5,hiDepth=depth-.5,outerRadius=radius+.25;
  if(hiDepth<=loDepth)return {status:'indeterminate',reason:'socket_support_depth_too_short'};
  const inward=scale(normal,-1),axis=normal.findIndex(n=>Math.abs(n)>.9);
  if(axis<0)return {status:'indeterminate',reason:'nonorthogonal_socket'};
  const seed=Math.abs(normal[0])<.5?[1,0,0]:[0,1,0],u=cross(normal,seed),v=cross(normal,u);
  const supportBounds={min:pos.map((n,i)=>i===axis?n+Math.min(inward[i]*loDepth,inward[i]*hiDepth):n-outerRadius),max:pos.map((n,i)=>i===axis?n+Math.max(inward[i]*loDepth,inward[i]*hiDepth):n+outerRadius)};
  const candidates=[];
  for(let i=0;i<triangles.length;i++){
    const triangle=triangles[i],bounds=prepared?.triangleBounds[i]??geometryBounds(triangle);
    if([0,1,2].some(k=>bounds.max[k]<supportBounds.min[k]-epsilon||bounds.min[k]>supportBounds.max[k]+epsilon))continue;
    let faceNormal=cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0]));
    faceNormal=sub(faceNormal,scale(inward,dot(faceNormal,inward)));
    const length=Math.hypot(...faceNormal);if(length<epsilon)continue; // No support from floors/rims alone.
    candidates.push({local:triangle.map(p=>sub(p,pos)),faceNormal:scale(faceNormal,1/length)});
  }
  const intervals=[];
  for(let ray=0;ray<32;ray++){
    const angle=ray*Math.PI/16,direction=plus(scale(u,Math.cos(angle)),scale(v,Math.sin(angle))),planeNormal=cross(direction,inward);
    for(const {local,faceNormal} of candidates){
      const distances=local.map(p=>dot(p,planeNormal));
      if(distances.every(n=>n>epsilon)||distances.every(n=>n<-epsilon))continue;
      const facing=dot(faceNormal,direction);if(Math.abs(facing)<1e-6)continue;
      const points=[];
      for(let k=0;k<3;k++){
        const a=local[k],b=local[(k+1)%3],da=distances[k],db=distances[(k+1)%3];
        if(Math.abs(da)<=epsilon)points.push([dot(a,direction),dot(a,inward)]);
        if(da*db<0){const point=plus(a,scale(sub(b,a),da/(da-db)));points.push([dot(point,direction),dot(point,inward)]);}
      }
      // Clip the line segment (or coplanar triangle) to the radial/axial band.
      let polygon=points;
      for(const [coordinate,sign,bound] of [[0,-1,-radius],[0,1,outerRadius],[1,-1,-loDepth],[1,1,hiDepth]]){
        const clipped=[];
        for(let k=0;k<polygon.length;k++){
          const a=polygon[k],b=polygon[(k+1)%polygon.length],da=sign*a[coordinate]-bound,db=sign*b[coordinate]-bound;
          const insideA=da<=epsilon,insideB=db<=epsilon;
          if(insideA)clipped.push(a);
          if(insideA!==insideB){const t=Math.max(0,Math.min(1,da/(da-db)));clipped.push(a.map((n,j)=>n+(b[j]-n)*t));}
        }
        polygon=clipped;if(!polygon.length)break;
      }
      if(!polygon.length)continue;
      const lo=Math.max(loDepth,Math.min(...polygon.map(p=>p[1]))),hi=Math.min(hiDepth,Math.max(...polygon.map(p=>p[1])));
      if(hi-lo<=epsilon)continue;
      const facingNormal=facing>0?faceNormal:scale(faceNormal,-1);
      intervals.push({lo,hi,angle:Math.atan2(dot(facingNormal,v),dot(facingNormal,u))});
    }
  }
  const boundaries=[loDepth,hiDepth,...intervals.flatMap(i=>[i.lo,i.hi])].sort((a,b)=>a-b).filter((value,i,all)=>!i||value-all[i-1]>epsilon);
  let maxAngularGap=0;
  for(let i=1;i<boundaries.length;i++){
    const midpoint=(boundaries[i-1]+boundaries[i])/2;
    const angles=intervals.filter(interval=>interval.lo<midpoint&&interval.hi>midpoint).map(interval=>interval.angle).sort((a,b)=>a-b).filter((angle,j,all)=>!j||angle-all[j-1]>epsilon);
    if(angles.length<3)return {status:'indeterminate',reason:'insufficient_socket_support',depth:midpoint,supportDirections:angles.length};
    let gap=angles[0]+Math.PI*2-angles[angles.length-1];
    for(let j=1;j<angles.length;j++)gap=Math.max(gap,angles[j]-angles[j-1]);
    if(gap>=Math.PI-1e-6)return {status:'indeterminate',reason:'socket_support_does_not_surround',depth:midpoint};
    maxAngularGap=Math.max(maxAngularGap,gap);
  }
  return {status:'supported',proof:'continuous-triangle-surface-support-v1',axialInterval:[loDepth,hiDepth],radialBand:[radius,outerRadius],rayPlanes:32,supportIntervals:intervals.length,maxAngularGap};
}
