import {sha256} from './ldraw-envelope.mjs';
import {minifigNeckRequest} from './minifig-neck.mjs';
import {subtractConvexPrism} from './axial-envelope.mjs';
const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),plain=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
function withPlanes(s){
 if(s.planes)return s;const planes=[];
 for(const n of s.normals){const length=Math.hypot(...n);if(length<=EPS)continue;for(const sign of [-1,1]){const normal=n.map(v=>v*sign/length);planes.push({normal,constant:Math.max(...s.vertices.map(p=>dot(p,normal)))});}}
 return {...s,planes};
}
export function buildGeneratedMinifigNeckProfile({metadata,geometry,expectedSourceHash,baseProfile=null,neckCompiler}){
 if(metadata?.coverage!=='complete'||!Array.isArray(metadata.connectors))return {supported:false,reason:'neck_metadata_incomplete'};
 if(!geometry||geometry.sourceHash!==expectedSourceHash||!/^[a-f0-9]{64}$/.test(expectedSourceHash||''))return {supported:false,reason:'neck_source_hash_mismatch'};
 const faces=[...geometry.body,...geometry.studs.flatMap(s=>s.faces)],geometryHash=sha256(JSON.stringify(faces)),rejected={},reject=r=>{rejected[r]=(rejected[r]||0)+1;};
 for(const c of metadata.connectors){
  const request=minifigNeckRequest(c);if(!request)continue;
  if(request.male&&baseProfile){reject('existing_neck_body_not_adapted');continue;}
  const proof=neckCompiler.compile(metadata.part,c);
  if(proof.status!=='certified'||proof.sourceHash!==expectedSourceHash||proof.geometryHash!==geometryHash){reject(proof.reason||'neck_source_geometry_mismatch');continue;}
  let solids=proof.asset.solids;
  if(baseProfile){
   solids=[];let failed=false;const planes=proof.certificate.prism;
   for(const original of baseProfile.solids){
    const s=withPlanes(original);
    if(planes.some(h=>s.vertices.every(p=>dot(p,h.normal)-h.constant>=-EPS))){solids.push(s);continue;}
    if(planes.every(h=>s.vertices.every(p=>dot(p,h.normal)<=h.constant)))continue;
    const cut=subtractConvexPrism(s,planes);if(cut.status!=='subtracted'){reject(cut.reason);failed=true;break;}solids.push(...cut.solids);
   }
   if(failed)continue;
  }
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128)){reject('neck_combined_profile_complexity');continue;}
  const connectors=[...(baseProfile?.connectors??[]),proof.port];
  if(connectors.length>2000||new Set(connectors.map(c=>c.id)).size!==connectors.length){reject('neck_connector_limit_or_duplicate');continue;}
  const primary=baseProfile?.primaryConnectionFamily??(baseProfile?.version===1?'stud-socket':baseProfile?.version===2?'axial-r4':baseProfile?.version===3?'axial-a6':baseProfile?.version===4?'stud-socket-access':'minifig-neck');
  return {supported:true,rejected,profile:{version:6,source:'ldraw-minifig-neck-envelope-v1',primaryConnectionFamily:primary,connectionFamilies:[...new Set([...(baseProfile?.connectionFamilies??[primary]),'minifig-neck'])],solids:solids.map(plain),connectors,neckEvidence:[{proof:proof.version,sourceHash:proof.sourceHash,geometryHash:proof.geometryHash,certificate:proof.certificate}],inheritedProfile:baseProfile?{version:baseProfile.version,source:baseProfile.source,connectorIds:baseProfile.connectors.map(c=>c.id)}:undefined}};
 }
 return {supported:false,reason:'no_verified_minifig_neck_connection',rejected};
}
