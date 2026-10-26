import {centeredR4Port,certifyWholeR4Shaft,R4_SECTION} from './axial-shaft.mjs';
import {axialSectionsFit} from '../../lib/axial-fit.ts';
const solid=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
const area=poly=>poly.reduce((sum,[x,y],i)=>{const q=poly[(i+1)%poly.length];return sum+x*q[1]-y*q[0];},0)/2;

// Initially used only as a fallback for references without a standard profile.
// One certified axial port is exposed per part. Other geometry remains solid;
// no additional channels, pin catches or ordinary studs are silently enabled.
// Pose semantics are opt-in: old callers retain the fixed-centre contract.
// The sliding contract copies a verified boolean from source metadata; it never
// changes source geometry, the certified void, or its geometric evidence.
export function buildGeneratedAxialProfile({partId,metadata,envelope,geometry,axialCompiler,poseContract='r4-through-centered-fixed-v1'}){
 if(!['r4-through-centered-fixed-v1','r4-through-sliding-v2'].includes(poseContract))return {supported:false,reason:'axial_pose_contract_unsupported'};
 if(metadata.coverage!=='complete')return {supported:false,reason:'axial_metadata_incomplete'};
 const rejected={};
 const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 for(const c of metadata.connectors){
  const port=centeredR4Port(c);if(!port)continue;
  if(poseContract==='r4-through-sliding-v2'){
   if(typeof c.shape.slide!=='boolean'){reject('axial_slide_metadata_invalid');continue;}
   port.axial={...port.axial,contract:poseContract,slide:c.shape.slide};
  }
  let solids,evidence;
  if(port.kind==='bar'){
   const check=certifyWholeR4Shaft(geometry,c);
   if(check.status!=='certified'){reject(check.reason);continue;}
   if(!envelope?.bodyHull||envelope.removedStuds.length){reject('whole_shaft_envelope_invalid');continue;}
   solids=[solid(envelope.bodyHull)];evidence={proof:check.proof,sourceHash:check.sourceHash};
  }else{
   const {radialU:u,radialV:v,length}=port.axial,n=port.normal;
   const frame=[u[0],n[0],v[0],u[1],n[1],v[1],u[2],n[2],v[2]];
   const check=axialCompiler.compile(partId,{pos:port.point,frame,length,sectionPolicy:'source-intersection'});
   if(check.status!=='certified'){reject(check.reason||'axial_channel_unproven');continue;}
   let section=check.certificate.section.polygon.map(p=>[...p]);
   if(area(section)<0)section.reverse();
   if(section.length>64){reject('axial_section_complexity');continue;}
   port.axial.section=section;
   // An empty channel can still be too narrow to accept any supported shaft.
   // Use the runtime contract itself, including its existing SAT allowance;
   // never enlarge the certified void just to advertise another reference.
   const socket={id:'socket-probe',...port};
   const shaft={...socket,id:'shaft-probe',kind:'bar',axial:{...port.axial,section:R4_SECTION.map(p=>[...p])}};
   if(!axialSectionsFit(shaft,socket)){reject('axial_channel_does_not_fit_supported_shaft');continue;}
   solids=check.asset.solids.map(solid);evidence={proof:check.version,sourceHash:check.sourceHash,certificate:check.certificate};
  }
  if(!solids.length||solids.length>129){reject('axial_solid_complexity');continue;}
  return {supported:true,profile:{version:2,source:'ldraw-axial-envelope-v1',solids,connectors:[{id:port.kind+':'+port.point.join(':')+':'+port.normal.join(':'),...port}],axialEvidence:evidence},rejected};
 }
 return {supported:false,reason:'no_verified_axial_connection',rejected};
}
