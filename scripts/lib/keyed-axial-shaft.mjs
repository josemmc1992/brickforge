// Offline proof for a whole, straight A6 Technic axle with reviewed bevels.
// A part ID, A6 metadata or its bounding box never constitutes the proof.
// The accepted source family has ONE complete axlehol8 perimeter and TWO
// axleend2 ends. All three primitive files, including the perimeter's child,
// are content-pinned. Their placement, complete expanded source faces and the
// actual continuous keyed flank interval are verified independently.
//
// The collision shape is a UNION OF TWO HEXAGONAL PRISMS, never the convex
// hull of the cross. Every rendered triangle must lie wholly inside one prism.
// This is a conservative geometric envelope, not a friction/strength model.
// Nominal length L, occupied body L-1, and full-profile engagement L-5 differ.
// This module does not change a manifest, the runtime matcher or the R4 proof.
import {createHash} from 'node:crypto';
import {parseLDraw,normalizeReference,ProofError} from './variant-proof.mjs';

export const A6_SHAFT_PROOF_VERSION='reviewed-whole-a6-beveled-cross-shaft-v1';
export const A6_NUMERIC_EPSILON=1e-8;
export const REVIEWED_A6_SOURCES=Object.freeze({
  'p/axlehol8.dat':'c604c807b4318f09266c311b3162a263998e596ecc9dda22d957ea1ddf86b1dc',
  'p/axleend2.dat':'4524f8c478788423b47913831d5105d9640740a2e66b496a25ccc673d71ac251',
  'p/box2-9p.dat':'b6d838366d0246e06ae26dcebb5f1d8e856a3f2bfdf6dd033172b497802994c3',
});
const H=[[-6,0],[-5.6023,-2],[5.6023,-2],[6,0],[5.6023,2],[-5.6023,2]];
export const A6_SECTION_COMPONENTS=Object.freeze([H,H.map(([x,z])=>[-z,x])].map(p=>Object.freeze(p.map(v=>Object.freeze(v)))));
const quadrant=[[6,0],[5.6023,2],[2,2],[2,5.6023]];
export const A6_CROSS_OUTLINE=Object.freeze(Array.from({length:4},(_,r)=>quadrant.map(([x,z])=>Object.freeze(r===0?[x,z]:r===1?[-z,x]:r===2?[-x,-z]:[z,-x]))).flat());
const EPS=A6_NUMERIC_EPSILON,MAX_COORD=100_000,MAX_FACES=32_000;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(v,k)=>v.map(x=>x*k);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>mul(v,1/Math.hypot(...v));
const clean=x=>Object.is(x,-0)?0:x;
const flip=p=>[p[0],-p[1],p[2]].map(clean);
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=MAX_COORD);
const near=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=EPS);
const hash=value=>createHash('sha256').update(value).digest('hex');
const unsupported=(reason,details={})=>({status:'unsupported',reason,...details});
function reject(reason){throw new ProofError(reason,reason);}
function transformed(p,m,o=[0,0,0]){const result=[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),p)+o[i]);if(!finite(result))reject('a6_coordinate_limit');return result.map(clean);}
function strictPhysicalMeta(text){
  if(typeof text!=='string'||text.length>8_000_000)reject('a6_invalid_source_text');
  if(text.split(/\r?\n/).some(line=>/^\s*0\s+!(?!LDRAW_ORG\b|LICENSE\b|HISTORY\b|CATEGORY\b|KEYWORDS\b|HELP\b|CMDLINE\b|COLOUR\b)/i.test(line)))reject('a6_unsupported_geometry_meta');
}
function signedAxis(vector){
  if(!finite(vector))return null;
  const rounded=vector.map(n=>Math.round(n));
  return near(vector,rounded)&&rounded.filter(n=>Math.abs(n)===1).length===1&&rounded.every(n=>Math.abs(n)<=1)?rounded.map(clean):null;
}
function rigidFrame(frame){
  if(!Array.isArray(frame)||frame.length!==9||!frame.every(Number.isFinite))return null;
  const columns=[0,1,2].map(i=>signedAxis([frame[i],frame[i+3],frame[i+6]]));
  if(columns.some(c=>!c)||dot(columns[0],columns[1])||dot(columns[0],columns[2])||dot(columns[1],columns[2]))return null;
  return columns;
}

export function centeredA6ShaftPort(connector){
  const c=connector,s=c?.shape,frame=rigidFrame(c?.frame),normal=signedAxis(c?.normal);
  if(c?.type!=='cylinder'||c.gender!=='M'||!Array.isArray(c.unsupportedFeatures)||c.unsupportedFeatures.length||!finite(c.pos)||!frame||!normal||!near(normal,mul(frame[1],-1)))return null;
  if(c.scale!=='none'||!['cor','none'].includes(c.mirror)||!s||s.group!==''||s.center!==true||s.slide!==true||s.caps!=='none'||!Array.isArray(s.sections)||s.sections.length!==1)return null;
  const section=s.sections[0],length=section?.length;
  if(section?.shape!=='A'||section.radius!==6||!Number.isFinite(length)||length<=5||length>MAX_COORD)return null;
  const index=normal.findIndex(n=>n!==0),axis=[0,0,0];axis[index]=1;
  const radialU=frame[0],radialV=cross(radialU,axis);
  return {kind:'axle',point:c.pos.map(clean),normal:axis,
    axial:{contract:'a6-through-keyed-v1',radius:6,length,nominalLength:length,
      bodyInterval:[-length/2+.5,length/2-.5],engagementIntervals:[[-length/2+2.5,length/2-2.5]],
      radialU,radialV,sectionComponents:A6_SECTION_COMPONENTS.map(p=>p.map(v=>[...v]))}};
}
function frameFor(port){
  return {local:p=>{const d=sub(p,port.point);return [dot(d,port.axial.radialU),dot(d,port.normal),dot(d,port.axial.radialV)];},
    localVector:p=>[dot(p,port.axial.radialU),dot(p,port.normal),dot(p,port.axial.radialV)],
    world:([x,y,z])=>add(port.point,add(mul(port.axial.radialU,x),add(mul(port.normal,y),mul(port.axial.radialV,z))))};
}
function readReviewed(repository){
  if(!repository||typeof repository.read!=='function'||typeof repository.resolve!=='function')reject('a6_missing_source_repository');
  const files=new Map();
  for(const [key,expected] of Object.entries(REVIEWED_A6_SOURCES)){
    const text=repository.read(key);
    if(typeof text!=='string'||hash(text)!==expected)reject('a6_reviewed_source_hash_changed');
    strictPhysicalMeta(text);files.set(key,{text,records:parseLDraw(text,key)});
  }
  return files;
}
function sourceFamily(repository,geometry,port,files){
  if(typeof geometry.key!=='string'||normalizeReference(geometry.key)!==geometry.key)reject('a6_missing_source_key');
  const text=repository.read(geometry.key);strictPhysicalMeta(text);
  const records=parseLDraw(text,geometry.key),refs=records.filter(r=>r.type===1);
  if(records.some(r=>r.type===3||r.type===4)||refs.length!==3)reject('a6_not_whole_reviewed_source_family');
  const members=refs.map(record=>({record,key:repository.resolve(record.reference)}));
  if(members.filter(m=>m.key==='p/axlehol8.dat').length!==1||members.filter(m=>m.key==='p/axleend2.dat').length!==2)reject('a6_not_whole_reviewed_source_family');
  const frame=frameFor(port),half=port.axial.nominalLength/2,coreHalf=half-2.5,endSigns=[];
  for(const {record,key} of members){
    const origin=frame.local(flip(record.offset)),columns=[0,1,2].map(i=>frame.localVector(flip([record.matrix[i],record.matrix[i+3],record.matrix[i+6]])));
    if(Math.abs(origin[0])>EPS||Math.abs(origin[2])>EPS)reject('a6_noncoaxial_source_member');
    const radial=[signedAxis(columns[0]),signedAxis(columns[2])];
    if(radial.some(v=>!v||v[1]!==0)||dot(radial[0],radial[1])!==0)reject('a6_nonrigid_radial_source_transform');
    if(Math.abs(columns[1][0])>EPS||Math.abs(columns[1][2])>EPS)reject('a6_sheared_source_transform');
    if(key==='p/axlehol8.dat'){
      const ends=[origin[1],origin[1]+columns[1][1]].sort((a,b)=>a-b);
      if(!near(ends,[-coreHalf,coreHalf]))reject('a6_incomplete_continuous_core');
    }else{
      const sign=Math.sign(origin[1]);
      if(!sign||Math.abs(Math.abs(origin[1])-half)>EPS||Math.abs(columns[1][1]+sign)>EPS)reject('a6_invalid_reviewed_end_placement');
      endSigns.push(sign);
    }
  }
  if(endSigns[0]===endSigns[1])reject('a6_duplicate_end_placement');
  // Expand the entire reviewed graph. The hash includes every dependency, not
  // merely a primitive filename or a top-level declaration.
  const cache=new Map();
  function expand(key,root=false,stack=[]){
    if(stack.includes(key))reject('a6_source_cycle');
    if(cache.has(key))return cache.get(key);
    const file=root?{text,records}:files.get(key);if(!file)reject('a6_unreviewed_source_dependency');
    const faces=[],dependencies=[];
    for(const record of file.records){
      if(record.type===1){
        const childKey=repository.resolve(record.reference);if(!files.has(childKey))reject('a6_unreviewed_source_dependency');
        const child=expand(childKey,false,[...stack,key]);dependencies.push(child.sourceHash);
        faces.push(...child.faces.map(f=>f.map(p=>transformed(p,record.matrix,record.offset))));
      }else if(record.type===3||record.type===4)faces.push(record.vertices);
      if(faces.length>MAX_FACES)reject('a6_source_face_limit');
    }
    const result={faces,sourceHash:hash(JSON.stringify([key,hash(file.text),dependencies]))};cache.set(key,result);return result;
  }
  const expanded=expand(geometry.key,true);
  return {faces:expanded.faces.map(f=>f.map(flip)),sourceHash:expanded.sourceHash,rootFileHash:hash(text)};
}
function triangleInsideComponent(triangle,polygon,bodyInterval){
  return triangle.every(([x,y,z])=>y>=bodyInterval[0]-EPS&&y<=bodyInterval[1]+EPS&&polygon.every((a,i)=>{
    const b=polygon[(i+1)%polygon.length],edge=[b[0]-a[0],b[1]-a[1]];
    return edge[0]*(z-a[1])-edge[1]*(x-a[0])>=-EPS*Math.hypot(...edge);
  }));
}
function faceKey(face){
  // Preserve the ordered polygon boundary. In particular a bow-tie quad with
  // the same four vertices must not match a reviewed source face.
  const points=face.map(p=>p.map(v=>Math.round(v/EPS)).join(',')),keys=[];
  for(let start=0;start<points.length;start++)for(const direction of [1,-1])keys.push(Array.from({length:points.length},(_,i)=>points[(start+direction*i+points.length)%points.length]).join(';'));
  return face.length+':'+keys.sort()[0];
}
function matchingFaces(actual,expected){
  if(actual.length!==expected.length)return false;
  const counts=new Map();for(const f of expected){const key=faceKey(f);counts.set(key,(counts.get(key)??0)+1);}
  for(const f of actual){const key=faceKey(f),count=counts.get(key)??0;if(!count)return false;counts.set(key,count-1);}
  return [...counts.values()].every(n=>n===0);
}
function continuousCoreFaces(faces,interval){
  const keys=new Set(faces.map(faceKey));
  for(let i=0;i<A6_CROSS_OUTLINE.length;i++){
    const [x,z]=A6_CROSS_OUTLINE[i],[nx,nz]=A6_CROSS_OUTLINE[(i+1)%A6_CROSS_OUTLINE.length];
    const expected=[[x,interval[0],z],[nx,interval[0],nz],[nx,interval[1],nz],[x,interval[1],z]];
    if(!keys.has(faceKey(expected)))return false;
  }
  return true;
}
function uniqueDirections(vectors){
  const result=[];
  for(const raw of vectors){let n=unit(raw);if(n.find(v=>Math.abs(v)>EPS)<0)n=mul(n,-1);if(!result.some(v=>near(v,n)))result.push(n.map(clean));}
  return result;
}
function prismSolid(polygon,interval,frame,port){
  const vertices=interval.flatMap(y=>polygon.map(([x,z])=>frame.world([x,y,z]))),planes=[],edges=[port.normal];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const normal=unit(add(mul(port.axial.radialU,dz),mul(port.axial.radialV,-dx)));
    planes.push({normal,constant:dot(normal,frame.world([a[0],0,a[1]]))});
    edges.push(add(mul(port.axial.radialU,dx),mul(port.axial.radialV,dz)));
  }
  planes.push({normal:port.normal,constant:dot(port.normal,frame.world([0,interval[1],0]))},{normal:mul(port.normal,-1),constant:dot(mul(port.normal,-1),frame.world([0,interval[0],0]))});
  return {vertices,normals:uniqueDirections(planes.map(p=>p.normal)),edges:uniqueDirections(edges),planes};
}

export function certifyWholeA6Shaft({geometry,connector,repository}={}){
  try{
    const port=centeredA6ShaftPort(connector);if(!port)return unsupported('not_centered_reviewed_a6_male');
    if(!geometry||!Array.isArray(geometry.body)||!geometry.body.length||geometry.body.length>MAX_FACES)return unsupported('a6_invalid_source_geometry');
    if(!Array.isArray(geometry.studs)||geometry.studs.length)return unsupported('a6_whole_shaft_has_separate_features');
    if(geometry.body.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(finite)))return unsupported('a6_invalid_source_face');
    const files=readReviewed(repository),expected=sourceFamily(repository,geometry,port,files);
    if(geometry.sourceHash!==expected.sourceHash)return unsupported('a6_expanded_source_hash_mismatch');
    const frame=frameFor(port),localFaces=geometry.body.map(f=>f.map(frame.local)),interval=port.axial.bodyInterval;
    let min=Infinity,max=-Infinity,triangles=0;
    for(const face of localFaces){
      for(const p of face){min=Math.min(min,p[1]);max=Math.max(max,p[1]);}
      const tessellation=face.length===3?[face]:[[face[0],face[1],face[2]],[face[0],face[2],face[3]]];
      for(const triangle of tessellation){
        triangles++;
        // Convexity makes vertex inclusion prove the WHOLE triangle, but only
        // if the SAME component contains all three vertices. Choosing one
        // component per vertex would incorrectly bridge a concave corner.
        if(!A6_SECTION_COMPONENTS.some(p=>triangleInsideComponent(triangle,p,interval)))return unsupported('a6_source_triangle_outside_cross_union');
      }
    }
    if(!near([min,max],interval))return unsupported('a6_body_interval_mismatch');
    if(!continuousCoreFaces(localFaces,port.axial.engagementIntervals[0]))return unsupported('a6_continuous_keyed_flanks_not_proven');
    if(!matchingFaces(geometry.body,expected.faces))return unsupported('a6_source_faces_differ_from_reviewed_family');
    const solids=A6_SECTION_COMPONENTS.map(p=>prismSolid(p,interval,frame,port));
    const id='axle:'+port.point.join(':')+':'+port.normal.join(':');
    return {status:'certified',proof:A6_SHAFT_PROOF_VERSION,sourceHash:expected.sourceHash,
      nominalLength:port.axial.nominalLength,bodyInterval:[...interval],engagementIntervals:port.axial.engagementIntervals.map(v=>[...v]),
      port:{id,...port},asset:{version:1,kind:'a6-cross-shaft-union-v1',solids},
      certificate:{numericEpsilon:EPS,sourceKey:geometry.key,sourceFileHash:expected.rootFileHash,reviewedSources:{...REVIEWED_A6_SOURCES},sourceFaces:geometry.body.length,sourceTriangles:triangles,
        coverage:'each-complete-source-triangle-in-one-convex-component',engagement:'sixteen-complete-source-keyed-flanks',ends:'two-reviewed-complete-beveled-ends'}};
  }catch(e){if(e instanceof ProofError)return unsupported(e.code);throw e;}
}
