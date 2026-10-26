// A deliberately narrow source proof for a complete, straight R4 bar. Every
// side quad and both cap fans must exist in the original expanded geometry.
// Metadata, names, bounding boxes or an empty centre line cannot supply proof.
const EPS=1e-8;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a,b)=>a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<EPS);
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const q=[[4,0],[3.6956,1.5308],[2.8284,2.8284],[1.5308,3.6956]];
export const R4_SECTION=Object.freeze(Array.from({length:4},(_,r)=>q.map(([x,z])=>Object.freeze(r===0?[x,z]:r===1?[-z,x]:r===2?[-x,-z]:[z,-x]))).flat());

export function centeredR4Port(connector){
 const c=connector,s=c?.shape;
 if(c?.type!=='cylinder'||!['M','F'].includes(c.gender)||c.unsupportedFeatures?.length||!finite(c.pos)||!finite(c.normal)||!s||s.group||s.center!==true||s.caps!=='none'||!Array.isArray(s.sections)||s.sections.length!==1)return null;
 const [section]=s.sections;
 if(!section||section.shape!=='R'||!Number.isFinite(section.radius)||Math.abs(section.radius-4)>EPS||!Number.isFinite(section.length)||section.length<4||section.length>100000)return null;
 const index=c.normal.findIndex(n=>Math.abs(n)>1-EPS);
 if(index<0||c.normal.some((n,i)=>i!==index&&Math.abs(n)>EPS)||Math.abs(Math.abs(c.normal[index])-1)>EPS)return null;
 const axis=[0,0,0];axis[index]=1;
 const radialU=index===0?[0,-1,0]:[1,0,0],radialV=cross(radialU,axis);
 return {kind:c.gender==='M'?'bar':'bar-socket',point:[...c.pos],normal:axis,axial:{contract:'r4-through-centered-fixed-v1',radius:4,length:section.length,radialU,radialV,section:R4_SECTION.map(p=>[...p])}};
}

export function certifyWholeR4Shaft(geometry,connector){
 const port=centeredR4Port(connector);
 if(!port||port.kind!=='bar')return {status:'unsupported',reason:'not_centered_through_r4_male'};
 if(geometry.studs?.length)return {status:'unsupported',reason:'whole_shaft_has_separate_features'};
 const sourceFaces=geometry.body;
 if(!Array.isArray(sourceFaces)||!sourceFaces.length||sourceFaces.length>32000)return {status:'unsupported',reason:'shaft_face_limit'};
 const {radialU,radialV,length}=port.axial,half=length/2;
 const local=point=>{const d=sub(point,port.point);return [dot(d,radialU),dot(d,port.normal),dot(d,radialV)];};
 const faces=[];
 for(const face of sourceFaces){
  if(!Array.isArray(face)||![3,4].includes(face.length)||!face.every(finite))return {status:'unsupported',reason:'invalid_shaft_face'};
  const transformed=face.map(local);
  for(const [x,y,z] of transformed){
   if(Math.abs(y)>half+EPS)return {status:'unsupported',reason:'geometry_outside_shaft'};
   for(let i=0;i<R4_SECTION.length;i++){
    const a=R4_SECTION[i],b=R4_SECTION[(i+1)%R4_SECTION.length];
    if((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])<-EPS)return {status:'unsupported',reason:'geometry_outside_shaft'};
   }
  }
  faces.push(transformed);
 }
 // Vertex sets are insufficient: a crossed quad uses the same four points but
 // its rendered triangles do not cover the rectangular wall. Preserve edges.
 const matches=(actual,expected)=>actual.length===expected.length&&actual.some((_,start)=>[1,-1].some(direction=>expected.every((v,i)=>near(v,actual[(start+direction*i+actual.length)%actual.length]))));
 for(let i=0;i<R4_SECTION.length;i++){
  const [x,z]=R4_SECTION[i],[nx,nz]=R4_SECTION[(i+1)%R4_SECTION.length];
  const side=[[x,-half,z],[nx,-half,nz],[nx,half,nz],[x,half,z]];
  if(!faces.some(f=>matches(f,side)))return {status:'unsupported',reason:'shaft_side_not_source_proven'};
  for(const y of [-half,half])if(!faces.some(f=>matches(f,[[0,y,0],[x,y,z],[nx,y,nz]])))return {status:'unsupported',reason:'shaft_cap_not_source_proven'};
 }
 return {status:'certified',proof:'complete-source-r4-prism-v1',sourceHash:geometry.sourceHash,port:{id:'bar:'+port.point.join(':')+':'+port.normal.join(':'),...port}};
}
