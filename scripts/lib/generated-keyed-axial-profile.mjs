import {certifyWholeA6Shaft,A6_SECTION_COMPONENTS,centeredA6ShaftPort} from './keyed-axial-shaft.mjs';
import {a6ReceiverRequest} from './keyed-axial-channel.mjs';
import {validKeyedAxialConnector,keyedSectionsFit} from '../../lib/keyed-axial-fit.ts';

const solid=s=>({vertices:s.vertices,normals:s.normals,edges:s.edges});
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const area=poly=>poly.reduce((sum,[x,y],i)=>{const q=poly[(i+1)%poly.length];return sum+x*q[1]-y*q[0];},0)/2;
const contract='a6-through-keyed-sliding-v1';

// Enable only the source-certified connection. Inactive features stay in the
// conservative solid; a familiar part name never substitutes for a proof.
export function buildGeneratedKeyedAxialProfile({partId,metadata,geometry,repository,keyedCompiler}){
 if(metadata?.coverage!=='complete')return {supported:false,reason:'keyed_metadata_incomplete'};
 const rejected={},reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
 for(const c of metadata.connectors){
  let check,port;
  if(centeredA6ShaftPort(c)){
   check=certifyWholeA6Shaft({geometry,connector:c,repository});
   if(check.status!=='certified'){reject(check.reason);continue;}
   const p=check.port;
   port={id:p.id,kind:'axle',point:p.point,normal:p.normal,axial:{contract,radius:6,length:check.nominalLength,slide:c.shape.slide,radialU:p.axial.radialU,radialV:p.axial.radialV,sectionComponents:p.axial.sectionComponents,engagementInterval:check.engagementIntervals[0]}};
  }else if(a6ReceiverRequest(c)){
   check=keyedCompiler.compile(partId,c);
   if(check.status!=='certified'){reject(check.reason||'keyed_channel_unproven');continue;}
   if(!check.nominalSectionFit.compatible){reject('keyed_channel_does_not_fit_supported_shaft');continue;}
   const cert=check.certificate,[u,n,v]=[0,1,2].map(i=>[cert.frame[i],cert.frame[i+3],cert.frame[i+6]]),radialV=cross(u,n),sign=dot(radialV,v);
   if(sign!==1&&sign!==-1){reject('keyed_channel_frame_invalid');continue;}
   const sectionComponents=cert.components.map(component=>{const p=component.polygon.map(([x,z])=>[x,z*sign]);if(area(p)<0)p.reverse();return p;});
   port={id:'axle-socket:'+cert.pos.join(':')+':'+n.join(':'),kind:'axle-socket',point:cert.pos,normal:n,axial:{contract,radius:6,length:cert.receiverInterval[1]-cert.receiverInterval[0],slide:c.shape.slide,radialU:u,radialV,sectionComponents}};
   const nominalLength=Math.max(40,port.axial.length+5);
   const shaft={...port,id:'nominal-shaft-probe',kind:'axle',axial:{...port.axial,length:nominalLength,engagementInterval:[-nominalLength/2+2.5,nominalLength/2-2.5],sectionComponents:A6_SECTION_COMPONENTS.map(p=>p.map(v=>[...v]))}};
   if(!keyedSectionsFit(shaft,port)){reject('keyed_runtime_section_incompatible');continue;}
  }else continue;
  if(!validKeyedAxialConnector(port)){reject('keyed_runtime_connector_invalid');continue;}
  const solids=check.asset.solids.map(solid);
  if(!solids.length||solids.length>129||solids.some(s=>s.vertices.length>128||s.normals.length>128||s.edges.length>128)){reject('keyed_solid_complexity');continue;}
  return {supported:true,rejected,profile:{version:3,source:'ldraw-keyed-axial-envelope-v1',solids,connectors:[port],axialEvidence:{proof:check.proof||check.version,sourceHash:check.sourceHash,certificate:check.certificate}}};
 }
 return {supported:false,reason:'no_verified_keyed_axial_connection',rejected};
}
