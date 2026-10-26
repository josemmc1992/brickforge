import {centeredTechnicPinHoleRequest} from './technic-pin-channel.mjs';
import {certifyReviewedTechnicPin,REVIEWED_TECHNIC_PIN} from './technic-pin-shaft.mjs';
import {subtractConvexPrism} from './axial-envelope.mjs';
import {validTechnicPinConnector} from '../../lib/technic-pin-fit.ts';
import {axialSectionsFit} from '../../lib/axial-fit.ts';
import {R4_SECTION} from './axial-shaft.mjs';
const EPS=1e-8,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),same=(a,b)=>a.every((n,i)=>Math.abs(n-b[i])<=EPS),plain=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
const family=p=>p?.primaryConnectionFamily??(p?.version===1?'stud-socket':p?.version===2?'axial-r4':p?.version===3?'axial-a6':p?.version===4?'stud-socket-access':'technic-pin');
function withPlanes(s){
 if(s.planes)return s;
 const planes=[],seen=new Set();
 for(const n of s.normals){const length=Math.hypot(...n);if(length<=EPS)continue;for(const sign of [-1,1]){const normal=n.map(v=>v*sign/length),key=normal.join(':');if(seen.has(key))continue;seen.add(key);planes.push({normal,constant:Math.max(...s.vertices.map(p=>dot(p,normal)))});}}
 if(planes.length<4||planes.length>128)throw Object.assign(Error('pin_base_plane_limit'),{code:'pin_base_plane_limit'});
 return {...s,planes};
}
function subtract(solids,prisms){
 for(const planes of prisms){const next=[];for(const solid of solids){
  if(planes.some(h=>solid.vertices.every(p=>dot(p,h.normal)-h.constant>=-EPS))){next.push(solid);continue;}
  if(planes.every(h=>solid.planes.some(p=>p.normal.every((n,i)=>n===h.normal[i])&&p.constant<=h.constant)||solid.vertices.every(p=>dot(p,h.normal)<=h.constant)))continue;
  const result=subtractConvexPrism(solid,planes);if(result.status!=='subtracted')return {ok:false,reason:result.reason};next.push(...result.solids);
 }solids=next;if(!solids.length||solids.length>129)return {ok:false,reason:'pin_profile_solid_limit'};}
 if(solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128))return {ok:false,reason:'pin_profile_complexity'};
 return {ok:true,solids};
}
// Enhance an existing generated profile without dropping its connector IDs.
// All removals are backed by a full-source void proof. When a new hole cannot
// fit the complexity budget, keep the previously verified profile unchanged.
export function buildGeneratedTechnicPinProfile({metadata,geometry,expectedSourceHash,baseProfile=null,channelCompiler,repository}){
 if(metadata?.coverage!=='complete'||!Array.isArray(metadata.connectors))return {supported:false,reason:'pin_metadata_incomplete'};
 if(!geometry||geometry.sourceHash!==expectedSourceHash||!/^[a-f0-9]{64}$/.test(expectedSourceHash||''))return {supported:false,reason:'pin_source_hash_mismatch'};
 const rejected={},reject=r=>{rejected[r]=(rejected[r]||0)+1;},evidence=[];let solids,connectors=baseProfile?[...baseProfile.connectors]:[];
 if(geometry.sourceHash===REVIEWED_TECHNIC_PIN.sourceHash){
  let proof;for(const c of metadata.connectors){const result=certifyReviewedTechnicPin(geometry,c,repository);if(result.status==='certified'){proof=result;break;}}
  if(!proof)return {supported:false,reason:'whole_technic_pin_unproven'};
  // This reviewed whole pin currently inherits one R4 socket. Do not silently
  // copy a future, unproved connector into the changed body representation.
  if(connectors.some(c=>c.kind!=='bar-socket'||c.axial.radius!==4||c.axial.length!==40||!same(c.point,[0,0,0])||Math.abs(c.normal[0])!==1))return {supported:false,reason:'unexpected_whole_pin_inherited_connector'};
  connectors=connectors.map(c=>({...c,axial:{...c.axial,section:proof.innerSection}}));
  for(const c of connectors){const shaft={...c,kind:'bar',axial:{...c.axial,section:R4_SECTION.map(p=>[...p])}};if(!axialSectionsFit(shaft,c))return {supported:false,reason:'pin_inner_r4_fit_regression'};}
  solids=proof.asset.solids;connectors.push(...proof.connectors);evidence.push({proof:proof.version,sourceHash:proof.sourceHash,geometryHash:proof.geometryHash,certificate:proof.certificate});
 }else{
  try{solids=baseProfile?baseProfile.solids.map(withPlanes):null;}catch(e){if(e.code)return {supported:false,reason:e.code};throw e;}
  const seen=[];
  for(const c of metadata.connectors){
   const request=centeredTechnicPinHoleRequest(c);if(!request)continue;
   if(seen.some(p=>same(p.point,request.port.point)&&same(p.normal,request.port.normal)))continue;seen.push(request.port);
   const proof=channelCompiler.compile(metadata.part,c);
   if(proof.status!=='certified'||proof.sourceHash!==geometry.sourceHash){reject(proof.reason||'pin_channel_source_mismatch');continue;}
   const result=solids?subtract(solids,proof.certificate.prisms):{ok:true,solids:proof.asset.solids};
   if(!result.ok){reject(result.reason);continue;}
   solids=result.solids;connectors.push(proof.port);evidence.push({proof:proof.version,sourceHash:proof.sourceHash,geometryHash:proof.geometryHash,certificate:proof.certificate});
  }
 }
 if(!evidence.length||!solids?.length||!connectors.some(validTechnicPinConnector))return {supported:false,reason:'no_verified_technic_pin_connection',rejected};
 if(connectors.length>2000||new Set(connectors.map(c=>c.id)).size!==connectors.length)return {supported:false,reason:'pin_connector_limit_or_duplicate'};
 const primary=family(baseProfile);
 return {supported:true,rejected,profile:{version:5,source:'ldraw-technic-pin-envelope-v1',primaryConnectionFamily:primary,connectionFamilies:[...new Set([primary,'technic-pin'])],solids:solids.map(plain),connectors,pinEvidence:evidence,inheritedProfile:baseProfile?{version:baseProfile.version,source:baseProfile.source,connectorIds:baseProfile.connectors.map(c=>c.id)}:undefined}};
}
