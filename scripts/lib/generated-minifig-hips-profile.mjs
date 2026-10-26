import {sha256} from './ldraw-envelope.mjs';
import {clipConvexSolid} from './axial-envelope.mjs';
import {subtractHipPrism} from './minifig-hips.mjs';
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),plain=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
function withPlanes(s){
 if(s.planes)return s;
 return {...s,planes:s.normals.flatMap(n=>[-1,1].map(sign=>{const normal=n.map(v=>v*sign/Math.hypot(...n));return {normal,constant:Math.max(...s.vertices.map(p=>dot(p,normal)))};}))};
}
export function buildGeneratedMinifigHipProfile({metadata,geometry,expectedSourceHash,baseProfile=null,hipCompiler}){
 const reject=reason=>({supported:false,reason:'no_verified_minifig_hip_connection',rejected:{[reason]:1}});
 if(metadata?.coverage!=='complete'||!Array.isArray(metadata.connectors))return reject('hip_metadata_incomplete');
 if(!geometry||geometry.sourceHash!==expectedSourceHash||!/^[a-f0-9]{64}$/.test(expectedSourceHash||''))return reject('hip_source_hash_mismatch');
 const faces=[...geometry.body,...geometry.studs.flatMap(s=>s.faces)],geometryHash=sha256(JSON.stringify(faces));
 const proof=hipCompiler.compile(metadata.part,metadata.connectors);
 if(proof.status!=='certified'||proof.sourceHash!==expectedSourceHash||proof.geometryHash!==geometryHash)return reject(proof.reason||'hip_source_geometry_mismatch');
 try{
  let solids=proof.asset.solids;
  if(baseProfile){
   if(proof.male){
    // Keep existing foot cavities and active studs below the waist. Replace
    // only the false hull bridge between the two reviewed upper posts.
    if(![1,4].includes(baseProfile.version)||baseProfile.connectors.some(c=>!['stud','socket'].includes(c.kind)||c.point[1]>0))return reject('existing_hip_body_not_adapted');
    solids=[...baseProfile.solids.map(s=>clipConvexSolid(withPlanes(s),{normal:[0,1,0],constant:0})).filter(Boolean),...proof.asset.solids.slice(1)];
   }else{
    solids=baseProfile.solids.map(withPlanes);
    for(const planes of proof.certificate.prisms){const cut=subtractHipPrism(solids,planes);if(cut.status!=='subtracted')return reject(cut.reason);solids=cut.solids;}
   }
  }
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128))return reject('hip_combined_profile_complexity');
  const connectors=[...(baseProfile?.connectors??[]),...proof.ports];
  if(connectors.length>2000||new Set(connectors.map(c=>c.id)).size!==connectors.length)return reject('hip_connector_limit_or_duplicate');
  const primary=baseProfile?.primaryConnectionFamily??(baseProfile?.version===1?'stud-socket':baseProfile?.version===2?'axial-r4':baseProfile?.version===3?'axial-a6':baseProfile?.version===4?'stud-socket-access':'minifig-hips');
  return {supported:true,rejected:{},profile:{version:7,source:'ldraw-minifig-hips-envelope-v1',primaryConnectionFamily:primary,connectionFamilies:[...new Set([...(baseProfile?.connectionFamilies??[primary]),'minifig-hips'])],solids:solids.map(plain),connectors,
   ...(baseProfile?.neckEvidence?{neckEvidence:baseProfile.neckEvidence}:{}),
   hipEvidence:[{proof:proof.version,sourceHash:proof.sourceHash,geometryHash:proof.geometryHash,certificate:proof.certificate}],
   inheritedProfile:baseProfile?{version:baseProfile.version,source:baseProfile.source,connectorIds:baseProfile.connectors.map(c=>c.id)}:undefined}};
 }catch(e){if(e.code)return reject(e.code);throw e;}
}
