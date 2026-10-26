import {standardPort} from './generated-profile.mjs';
import {certifySourceAccess} from './standard-access.mjs';
import {boxSolid,pointInEnvelope,REVIEWED_STUDS} from './ldraw-envelope.mjs';

const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const near=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===3&&b.length===3&&a.every((n,i)=>Number.isFinite(n)&&Math.abs(n-b[i])<EPS);
const solid=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
const vec=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);

// Fallback only: source-backed standard ports whose access lies inside the
// convex hull. The column removes phantom fill, never original body faces.
// A verified stud remains explicit; every other separated stud is an obstacle.
export function buildGeneratedAccessProfile({metadata,envelope,geometry,expectedSourceHash,socketClearance}){
 if(metadata?.coverage!=='complete'||!Array.isArray(metadata.connectors))return {supported:false,reason:'access_metadata_incomplete'};
 if(!geometry||geometry.sourceHash!==expectedSourceHash||!/^[a-f0-9]{64}$/.test(expectedSourceHash||''))return {supported:false,reason:'access_source_hash_mismatch'};
 if(!envelope?.bodyHull||!Array.isArray(envelope.removedStuds)||!Array.isArray(geometry.studs)||envelope.removedStuds.length!==geometry.studs.length)return {supported:false,reason:'access_features_mismatch'};
 // Bind the already certified envelope features to this expanded source. The
 // production caller also verifies the immutable collision asset's hash.
 const features=[];
 for(let i=0;i<geometry.studs.length;i++){
  const a=geometry.studs[i],b=envelope.removedStuds[i];
  if(!a||!b||!Object.hasOwn(REVIEWED_STUDS,a.sourceKey)||a.proof!=='reviewed-standard-stud-bounds-v1'||a.proof!==b.proof||a.sourceKey!==b.sourceKey||a.sourceHash!==b.sourceHash||!vec(a.pos)||!vec(a.normal)||a.normal.some(n=>n!==0&&n!==1&&n!==-1)||a.normal.filter(n=>n!==0).length!==1||!near(a.pos,b.pos)||!near(a.normal,b.normal)||!Array.isArray(a.faces)||!a.faces.length||a.faces.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(vec)))return {supported:false,reason:'access_features_mismatch'};
  const axis=a.normal.findIndex(n=>n!==0),bounds={min:a.pos.map((n,k)=>k===axis?n+Math.min(0,a.normal[k]*4):n-6),max:a.pos.map((n,k)=>k===axis?n+Math.max(0,a.normal[k]*4):n+6)},shape=boxSolid(bounds);
  if(a.faces.some(f=>f.some(p=>!pointInEnvelope(p,shape,EPS))))return {supported:false,reason:'access_feature_source_outside_solid'};
  features.push({...a,solid:shape});
 }
 const rejected={},reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;},seen=new Set();
 for(const c of metadata.connectors){
  let port;try{port=standardPort(c);}catch{reject('access_invalid_metadata');continue;}if(!port)continue;
  if(port.normal.some(n=>n!==0&&n!==1&&n!==-1)||port.normal.filter(n=>n!==0).length!==1){reject('access_nonquarter_port');continue;}
  const id=port.kind+':'+port.point.join(':')+':'+port.normal.join(':');if(seen.has(id))continue;seen.add(id);
  const extent=dot(port.point,port.normal),surface=Math.max(...envelope.bodyHull.vertices.map(p=>dot(p,port.normal)));
  if(Math.abs(surface-extent)<=.001)continue; // Ordinary exterior profiles retain priority.
  const matches=port.kind==='stud'?features.map((s,i)=>near(s.pos,port.point)&&near(s.normal,port.normal)?i:-1).filter(i=>i>=0):[];
  if(port.kind==='stud'&&!matches.length){reject('access_unproven_stud');continue;}
  const active=new Set(matches),inactive=features.filter((_,i)=>!active.has(i));
  // At least one body cell must remain. Reject impossible complexity before
  // doing expensive surface work for every port of a very large part.
  if(inactive.length>128){reject('access_solid_complexity');continue;}
  const proof=certifySourceAccess({body:geometry.body,sourceHash:geometry.sourceHash,pos:port.point,normal:port.normal});
  if(proof.status!=='certified'){reject(proof.reason);continue;}
  let socketEvidence;
  if(port.kind==='socket'){
   const result=socketClearance({pos:port.point,normal:port.normal,radius:6,depth:4,tolerance:0});
   if(result.status!=='clear'||result.sourceHash!==geometry.sourceHash){reject(result.reason||'access_socket_unproven');continue;}
   socketEvidence=result;
  }
  const solids=[...proof.solids,...inactive.map(s=>s.solid)];
  if(solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128)){reject('access_solid_complexity');continue;}
  return {supported:true,rejected,profile:{version:4,source:'ldraw-standard-access-envelope-v1',solids:solids.map(solid),connectors:[{id,...port}],accessEvidence:{proof:proof.version,sourceHash:proof.sourceHash,bodyGeometryHash:proof.geometryHash,certificate:proof.certificate,activeStuds:matches.map(i=>({sourceKey:geometry.studs[i].sourceKey,sourceHash:geometry.studs[i].sourceHash})),socketEvidence}}};
 }
 return {supported:false,reason:'no_verified_standard_access_connection',rejected};
}
