// Deliberately narrow bridge between the full shadow schema and today's
// rigid stud/socket solver. Parsed metadata alone never enables a connection.
const EPS=1e-5;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const near=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<EPS);
const axial=n=>Array.isArray(n)&&n.length===3&&n.filter(v=>Math.abs(Math.abs(v)-1)<EPS).length===1&&n.filter(v=>Math.abs(v)>EPS).length===1;
const tidy=v=>v.map(n=>Math.abs(n)<EPS?0:Math.round(n*1e6)/1e6);
export function standardPort(c){
 if(c.type!=='cylinder'||c.unsupportedFeatures?.length||!axial(c.normal)||!Array.isArray(c.pos)||c.pos.length!==3||!c.pos.every(Number.isFinite))return null;
 const s=c.shape;
 if(!s||s.group||s.center||s.slide||s.sections.length!==1)return null;
 const section=s.sections[0];
 if(Math.abs(section.radius-6)>EPS)return null;
 if(c.gender==='M'&&s.caps==='A'&&section.shape==='R'&&Math.abs(section.length-4)<EPS)return {kind:'stud',point:tidy(c.pos),normal:tidy(c.normal)};
 // A square 6-LDU receiver contains the same standard round stud. The
 // source must explicitly identify it and the geometry clearance still passes.
 if(c.gender==='F'&&s.caps==='B'&&['R','S'].includes(section.shape)&&section.length>=4-EPS)return {kind:'socket',point:tidy(c.pos),normal:tidy(c.normal)};
 return null;
}
export function buildGeneratedProfile({metadata,envelope,socketClearance}){
 if(metadata.coverage!=='complete')return {supported:false,reason:metadata.coverage==='absent'?'missing_connection_metadata':'partial_connection_metadata'};
 if(!envelope?.bodyHull||!Array.isArray(envelope.removedStuds))return {supported:false,reason:'missing_collision_envelope'};
 const ports=[],rejected={},seen=new Set(),usedStuds=new Set();
 const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 const candidates=metadata.connectors.map(c=>({source:c,port:standardPort(c)}));
 for(const {source,port} of candidates){
  if(!port){reject('unsupported_connection_shape');continue;}
  const extent=dot(port.point,port.normal);
  const surface=Math.max(...envelope.bodyHull.vertices.map(p=>dot(p,port.normal)));
  if(Math.abs(surface-extent)>.001){reject('connection_not_on_exterior_surface');continue;}
  if(envelope.bodyHull.normals.some(axis=>{
   const projected=envelope.bodyHull.vertices.map(p=>dot(p,axis)),point=dot(port.point,axis);
   return point<Math.min(...projected)-.001||point>Math.max(...projected)+.001;
  })){reject('connection_outside_body');continue;}
  const key=port.kind+':'+port.point.join(':')+':'+port.normal.join(':');
  if(seen.has(key))continue;
  if(port.kind==='stud'){
   const indices=envelope.removedStuds.map((s,i)=>near(s.pos,port.point)&&near(s.normal,port.normal)?i:-1).filter(i=>i>=0);
   if(!indices.length){reject('unverified_stud_geometry');continue;}
   // Decorative subfiles may repeat the same exact primitive. They describe one
   // physical stud, not a second obstacle superimposed on its own connection.
   for(const index of indices)usedStuds.add(index);
  }else{
   // The insertion prism already circumscribes the stud. Do not inflate its
   // radius: exact clutch-wall contact at R6 is legal, material inside is not.
   const check=socketClearance({pos:port.point,normal:port.normal,radius:6,depth:4,tolerance:0});
   if(check.status!=='clear'){reject(check.reason||'socket_geometry_obstructed');continue;}
  }
  seen.add(key);ports.push({id:key,...port});
 }
 if(!ports.length)return {supported:false,reason:'no_verified_standard_connections',rejected};
 // CLEAR or an unsupported port must not make geometry disappear. An inactive
 // feature needs its own obstacle unless the runtime body already contains its
 // entire convex solid. Derive strict bounds from the actual runtime vertices;
 // compiler proof planes may be inflated and are not used by runtime collision.
 let inactive=envelope.removedStuds.filter((_,i)=>!usedStuds.has(i));
 // Keep existing accepted profiles byte-for-byte stable. Only remove proven
 // redundant obstacles when they would otherwise exceed the existing limit.
 if(inactive.length>128){
  const spans=envelope.bodyHull.normals.map(axis=>{
   const projected=envelope.bodyHull.vertices.map(v=>dot(v,axis));
   return {axis,min:Math.min(...projected),max:Math.max(...projected)};
  });
  const bodyContains=solid=>spans.length>0&&solid.vertices.length>0&&solid.vertices.every(v=>spans.every(({axis,min,max})=>{
   const value=dot(v,axis);return value>=min&&value<=max;
  }));
  inactive=inactive.filter(s=>!bodyContains(s.solid));
 }
 if(inactive.length>128)return {supported:false,reason:'too_many_inactive_features',rejected};
 const solid=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
 return {supported:true,profile:{version:1,source:'ldraw-shadow-envelope-v1',solids:[solid(envelope.bodyHull),...inactive.map(s=>solid(s.solid))],connectors:ports.sort((a,b)=>a.id.localeCompare(b.id,'en'))},rejected};
}
