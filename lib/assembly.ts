// Shared, deterministic connection and collision engine. No browser/DB dependencies.
import catalog from './catalog-data.json';
import variants from './assembly-variants.json';
import type {Piece} from './model';
import {baseProfile,basePartIds,box,type Profile,type Vec,type Connector,type Solid} from './base-profiles';
import {generatedEntry,unavailableReason,preparedGeneratedProfile,generatedFitLimits,generatedAxialFitLimits,generatedKeyedAxialFitLimits,generatedAccessFitLimits,generatedTechnicPinFitLimits,generatedMinifigNeckFitLimits,generatedMinifigHipFitLimits} from './generated-profiles';
import {mechanicalConnectorsMatch as axialConnectorsMatch,mechanicalEngagement as axialEngagement,mechanicalOffsetRange as axialOffsetRange,transformMechanicalConnector as transformAxialConnector,isMechanicalConnector,isShaft,isLegacyAxial,mechanicalKindsCompatible,type MechanicalConnector as AxialConnector} from './mechanical-fit';
import {collectAxialConnections,type AssemblyConnection} from './axial-connections';
import {technicPinConnectorsMatch,technicPinKindsCompatible,type TechnicPinConnector} from './technic-pin-fit';
import {minifigNeckConnectorsMatch,minifigNeckKindsCompatible,type MinifigNeckConnector} from './minifig-neck-fit';
import {minifigHipConnectorsMatch,minifigHipKindsCompatible,type MinifigHipConnector} from './minifig-hips-fit';
export type {Profile,Vec} from './base-profiles';
export type {AssemblyConnection} from './axial-connections';
const EPS=.01;
const plus=(a:Vec,b:Vec):Vec=>a.map((v,i)=>v+b[i]) as Vec;
const minus=(a:Vec,b:Vec):Vec=>a.map((v,i)=>v-b[i]) as Vec;
const dot=(a:Vec,b:Vec)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a:Vec,b:Vec)=>Math.hypot(...minus(a,b))<EPS;
const profiles=new Map<string,Profile|null>();
const catalogIds=new Set(catalog.map(p=>p.id));
const aliases=variants.aliases as Record<string,{base:string;evidence:string}>;
export function profile(part:string):Profile|null{
 if(profiles.has(part))return profiles.get(part)??preparedGeneratedProfile(part);
 let result=baseProfile(part);
 const alias=Object.hasOwn(aliases,part)?aliases[part]:undefined;
 // One verified hop only: aliases can never make an unreviewed shape buildable.
 if(!result&&catalogIds.has(part)&&alias&&alias.evidence){
  const base=baseProfile(alias.base);
  if(base)result={...base,source:'ldraw-verified-decoration-v1',basePart:alias.base};
 }
 profiles.set(part,result);return result??preparedGeneratedProfile(part);
}
const curatedIds=new Set([...basePartIds,...Object.keys(aliases).filter(id=>catalogIds.has(id)&&baseProfile(aliases[id].base))]);
export function isSupportedPart(part:string){return curatedIds.has(part)||!!generatedEntry(part);}
export const supportedPartCount=catalog.filter(p=>isSupportedPart(p.id)).length;
export const connectionCoverage={basePartCount:basePartIds.length,variantCount:curatedIds.size-basePartIds.length,generatedPartCount:supportedPartCount-curatedIds.size,supportedPartCount};
export function partConnectionInfo(part:string){const p=profile(part);return p?{supported:true,profile:p.source,family:p.family,basePart:p.basePart??part,connectors:p.connectors,rotations:'quarter-turns XYZ',fitLimits:p.source==='ldraw-minifig-hips-envelope-v1'?generatedMinifigHipFitLimits:p.source==='ldraw-minifig-neck-envelope-v1'?generatedMinifigNeckFitLimits:p.source==='ldraw-technic-pin-envelope-v1'?generatedTechnicPinFitLimits:p.source==='ldraw-standard-access-envelope-v1'?generatedAccessFitLimits:p.source==='ldraw-keyed-axial-envelope-v1'?generatedKeyedAxialFitLimits:p.source==='ldraw-axial-envelope-v1'?generatedAxialFitLimits:p.source==='ldraw-shadow-envelope-v1'?generatedFitLimits:undefined,collision:p.source==='ldraw-minifig-hips-envelope-v1'?'source-preserving paired waist posts and torso sockets; fixed keyed seating and full-body collision validation':p.source==='ldraw-minifig-neck-envelope-v1'?'source-preserving torso and head socket; fixed seating and full-body collision validation':p.source==='ldraw-technic-pin-envelope-v1'?'source-preserving stepped through holes and reviewed complete pin; fixed seating and full-body collision validation':p.source==='ldraw-standard-access-envelope-v1'?'source-preserving body with a verified empty outward access column; inactive studs remain obstacles':p.source==='ldraw-keyed-axial-envelope-v1'?'source-preserving cross solids or certified keyed through channel; engagement excludes shaft bevels':p.source==='ldraw-axial-envelope-v1'?'source-preserving convex bodies with a certified through channel; R4 fixed or sliding poses according to each connector contract':p.source==='ldraw-shadow-envelope-v1'?'conservative convex body; only verified exterior stud/socket connections; concave interior fits may be rejected':'convex compound envelopes; curved surfaces conservative'}:{supported:false,...unavailableReason(part)};}
export function rotate(v:Vec,rotation:Vec):Vec{
 const [x,y,z]=rotation.map(a=>a*Math.PI/180),a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);
 return [c*e*v[0]-c*f*v[1]+d*v[2],(a*f+b*e*d)*v[0]+(a*e-b*f*d)*v[1]-b*c*v[2],(b*f-a*e*d)*v[0]+(b*e+a*f*d)*v[1]+a*c*v[2]].map(n=>Math.round(n*1e6)/1e6) as Vec;
}
const validRotation=(p:Piece)=>p.rotation.every(a=>Math.abs(a/90-Math.round(a/90))<1e-8);
type Bound={min:Vec;max:Vec};
function bounds(vertices:Vec[]):Bound{return {min:[0,1,2].map(i=>Math.min(...vertices.map(v=>v[i]))) as Vec,max:[0,1,2].map(i=>Math.max(...vertices.map(v=>v[i]))) as Vec};}
function intersectBounds(a:Bound,b:Bound){return [0,1,2].every(i=>Math.min(a.max[i],b.max[i])-Math.max(a.min[i],b.min[i])>EPS);}
function transform(s:Solid,p:Piece):Solid{return {vertices:s.vertices.map(v=>plus(rotate(v,p.rotation),p.position)),normals:s.normals.map(v=>rotate(v,p.rotation)),edges:s.edges.map(v=>rotate(v,p.rotation))};}
function intersects(a:Solid,b:Solid){
 if(!intersectBounds(bounds(a.vertices),bounds(b.vertices)))return false;
 const axes=[...a.normals,...b.normals];for(const x of a.edges)for(const y of b.edges)axes.push(cross(x,y));
 for(const axis of axes){const len=Math.hypot(...axis);if(len<1e-8)continue;const aa=a.vertices.map(v=>dot(v,axis)/len),bb=b.vertices.map(v=>dot(v,axis)/len);if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=EPS)return false;}
 return true;
}
const isAxial=(c:Connector):c is AxialConnector=>isMechanicalConnector(c);
const isHip=(c:Connector):c is MinifigHipConnector=>c.kind==='hip-stud'||c.kind==='hip-socket';
const isNeck=(c:Connector):c is MinifigNeckConnector=>c.kind==='neck'||c.kind==='neck-socket';
const isPin=(c:Connector):c is TechnicPinConnector=>c.kind==='pin'||c.kind==='pin-hole';
function transformConnector(c:Connector,p:Piece):Connector{return isAxial(c)?transformAxialConnector(c,v=>rotate(v,p.rotation),p.position):isHip(c)?{...c,point:plus(rotate(c.point,p.rotation),p.position),normal:rotate(c.normal,p.rotation),heading:rotate(c.heading,p.rotation)}:{...c,point:plus(rotate(c.point,p.rotation),p.position),normal:rotate(c.normal,p.rotation)};}
function world(p:Piece){const def=profile(p.part)!;const solids=def.solids.map(s=>transform(s,p));const connectors=def.connectors.map(c=>transformConnector(c,p));return {piece:p,solids,connectors,bounds:bounds([...solids.flatMap(s=>s.vertices),...connectors.filter(c=>c.kind==='stud').flatMap(c=>studSolid(c).vertices)])};}
type World=ReturnType<typeof world>;
function compatibleKinds(a:Connector,b:Connector){return a.kind==='stud'&&b.kind==='socket'||a.kind==='socket'&&b.kind==='stud'||isAxial(a)&&isAxial(b)&&mechanicalKindsCompatible(a,b)||isPin(a)&&isPin(b)&&technicPinKindsCompatible(a,b)||isNeck(a)&&isNeck(b)&&minifigNeckKindsCompatible(a,b)||isHip(a)&&isHip(b)&&minifigHipKindsCompatible(a,b);}
function matched(a:Connector,b:Connector){if(!compatibleKinds(a,b))return false;if(isHip(a)&&isHip(b))return minifigHipConnectorsMatch(a,b);if(isNeck(a)&&isNeck(b))return minifigNeckConnectorsMatch(a,b);if(isPin(a)&&isPin(b))return technicPinConnectorsMatch(a,b);return isAxial(a)&&isAxial(b)?axialConnectorsMatch(a,b):near(a.point,b.point)&&dot(a.normal,b.normal)<-.999;}
function orientationFits(a:Connector,b:Connector,r:Vec){
 if(!compatibleKinds(a,b))return false;
 if(isAxial(a)&&isAxial(b))return axialConnectorsMatch(a,transformAxialConnector(b,v=>rotate(v,r),minus(a.point,rotate(b.point,r))));
 if(isHip(a)&&isHip(b))return minifigHipConnectorsMatch(a,{...b,point:a.point,normal:rotate(b.normal,r),heading:rotate(b.heading,r)});
 if(isNeck(a)&&isNeck(b))return minifigNeckConnectorsMatch(a,{...b,point:a.point,normal:rotate(b.normal,r)});
 if(isPin(a)&&isPin(b))return technicPinConnectorsMatch(a,{...b,point:a.point,normal:rotate(b.normal,r)});
 return dot(a.normal,rotate(b.normal,r))<-.999;
}
function studSolid(c:Connector):Solid{
 // Stud intrusion is tested separately; the matching socket reserves this space.
 const n=c.normal,k=n.findIndex(v=>Math.abs(v)>.9);const min=c.point.map((v,i)=>i===k?v+Math.min(0,n[i]*4):v-6) as Vec,max=c.point.map((v,i)=>i===k?v+Math.max(0,n[i]*4):v+6) as Vec;
 return box(min[0],max[0],min[1],max[1],min[2],max[2]);
}
export type AssemblyIssue={code:string;pieces:string[];message:string};
export function inspectAssembly(pieces:Piece[]){
 const issues:AssemblyIssue[]=[],worlds:World[]=[],connections:AssemblyConnection[]=[];
 let issueCount=0;const issue=(code:string,ids:string[],message:string)=>{issueCount++;if(issues.length<80)issues.push({code,pieces:ids,message});};
 let portCount=0;
 for(const p of pieces){const def=profile(p.part);if(!def){issue('unsupported_part',[p.id],`Pieza ${p.part} sin perfil de encaje.`);continue;}portCount+=def.connectors.length;if(portCount>40000){issue('complexity_limit',[p.id],'El ensamblaje supera el límite de 40.000 puntos de conexión.');return {valid:false,issueCount,issues,truncated:false,connections,checked:worlds.length,unsupported:pieces.length-worlds.length,limitation:'Límite de complejidad excedido.'};}if(!validRotation(p)){issue('unsupported_rotation',[p.id],'Solo se admiten giros de 90° en los perfiles actuales.');continue;}worlds.push(world(p));}
 const graph=new Map(worlds.map(w=>[w.piece.id,new Set<string>()])),ground=new Set<string>();
 const ports=new Map<string,{w:World;c:Connector;order:number}[]>(),occupied=new Map<string,number>();let portOrder=0;
 const key=(v:Vec)=>v.map(n=>Math.round(n*100)).join(',');
 portLoop:for(const w of worlds){const minY=Math.min(w.bounds.min[1],...w.connectors.filter(c=>c.kind==='stud').map(c=>bounds(studSolid(c).vertices).min[1]));if(minY<-EPS)issue('below_ground',[w.piece.id],'La pieza atraviesa el suelo.');if(Math.abs(minY)<=EPS)ground.add(w.piece.id);
  for(const c of w.connectors){
   if(isAxial(c))continue;
   // Rounding cells are only a broad phase: matching points can straddle a
   // boundary. Fixed families usually need one cell, or two at a boundary;
   // studs need the full .01-LDU neighborhood. Keep matched as the exact gate.
   const radius=isHip(c)||isNeck(c)||isPin(c)?1e-8:EPS;
   const lo=c.point.map(n=>Math.round((n-radius)*100)),hi=c.point.map(n=>Math.round((n+radius)*100));
   const candidates:{w:World;c:Connector;order:number}[]=[];
   // Input positions are bounded by the model validator. Guard direct calls
   // too, so a non-finite cell cannot turn the numeric loops into an endless scan.
   if([...lo,...hi].every(Number.isSafeInteger))for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
    const list=ports.get(x+','+y+','+z);if(list)candidates.push(...list);
   }
   // Preserve first-insertion occupancy precedence across neighboring cells.
   candidates.sort((a,b)=>a.order-b.order);
   for(const q of candidates){if(q.w===w||!matched(c,q.c))continue;const ids=[w.piece.id+'/'+c.id,q.w.piece.id+'/'+q.c.id];if(ids.some(id=>occupied.has(id))){issue('occupied_connector',[w.piece.id,q.w.piece.id],'Un punto de conexión está ocupado por más de una pieza.');if(issueCount>=80)break portLoop;continue;}connections.push({a:w.piece.id,b:q.w.piece.id,connectorA:c.id,connectorB:q.c.id});graph.get(w.piece.id)!.add(q.w.piece.id);graph.get(q.w.piece.id)!.add(w.piece.id);for(const id of ids)occupied.set(id,1);}
   // Only prior ports were queried, and each cell once, so pairs stay unique.
   const k=key(c.point),list=ports.get(k)||[];list.push({w,c,order:portOrder++});ports.set(k,list);
  }
 }
 for(const [id,n] of occupied)if(n>1)issue('occupied_connector',[id.split('/')[0]],'Un punto de conexión está ocupado por más de una pieza.');
 const axial=collectAxialConnections(worlds.flatMap(w=>w.connectors.filter(isAxial).map(connector=>({pieceId:w.piece.id,connector}))));
 for(const connection of axial.connections){connections.push(connection);graph.get(connection.a)!.add(connection.b);graph.get(connection.b)!.add(connection.a);}
 for(const problem of axial.issues)issue(problem.code,problem.pieces,problem.message);
 if(axial.truncated&&axial.issues.length===0)issue('complexity_limit',[],'La comprobación de conexiones axiales supera el límite de complejidad.');
 // Sweep broad phase includes the 4 LDU stud extension in every direction.
 const sorted=[...worlds].sort((a,b)=>a.bounds.min[0]-b.bounds.min[0]);
 collisionLoop:for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
  if(issueCount>=80)break collisionLoop;
  const a=sorted[i],b=sorted[j];if(b.bounds.min[0]>a.bounds.max[0]+8+EPS)break;
  if([1,2].some(k=>a.bounds.min[k]>b.bounds.max[k]+8+EPS||b.bounds.min[k]>a.bounds.max[k]+8+EPS))continue;
  if(a.solids.some(x=>b.solids.some(y=>intersects(x,y)))){issue('collision',[a.piece.id,b.piece.id],'Los cuerpos de las piezas se atraviesan.');continue;}
  let blocked=false;
  for(const [u,v] of [[a,b],[b,a]])for(const c of u.connectors){if(c.kind!=='stud'||v.connectors.some(d=>matched(c,d)))continue;if(v.solids.some(s=>intersects(studSolid(c),s)))blocked=true;}
  if(!blocked)for(const c of a.connectors.filter(c=>c.kind==='stud'))for(const d of b.connectors.filter(c=>c.kind==='stud'))if(intersects(studSolid(c),studSolid(d)))blocked=true;
  if(blocked)issue('stud_collision',[a.piece.id,b.piece.id],'Un tetón entra en una superficie sin hueco compatible.');
 }
 const reached=new Set(ground),queue=[...ground];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i])||[])if(!reached.has(id)){reached.add(id);queue.push(id);}
 for(const w of worlds)if(!reached.has(w.piece.id))issue('disconnected',[w.piece.id],'La pieza no está conectada a una construcción apoyada en el suelo.');
 return {valid:issueCount===0,issueCount,issues,truncated:issueCount>=80||axial.truncated,connections,checked:worlds.length,unsupported:pieces.length-worlds.length,limitation:'Encaje geométrico de los perfiles admitidos. No simula resistencia, fricción ni articulaciones; superficies curvas con envolvente conservadora. El informe se acota a 80 incidencias.'};
}
export function assertAssembly(pieces:Piece[]){const report=inspectAssembly(pieces);if(!report.valid){const e=report.issues[0];throw new Error(`Colocación rechazada: ${e.message} [${e.pieces.join(', ')}] (${report.issueCount} incidencias).`);}return report;}
export function worldConnections(pieces:Piece[],pieceId:string){
 const p=pieces.find(p=>p.id===pieceId);if(!p)throw new Error('Pieza de referencia desconocida.');if(!profile(p.part)||!validRotation(p))throw new Error('La pieza no tiene un perfil de encaje compatible.');
 const report=inspectAssembly(pieces),used=new Set(report.connections.flatMap(c=>[c.a+'/'+c.connectorA,c.b+'/'+c.connectorB]));
 return world(p).connectors.map(c=>{
  const reservations=report.connections.flatMap(connection=>{const a=connection.axial;return a&&((a.barPieceId===p.id&&a.barConnectorId===c.id)||(a.receiverPieceId===p.id&&a.receiverConnectorId===c.id))?[a]:[];});
  const shareable=isAxial(c)&&isShaft(c)&&!isLegacyAxial(c)&&!reservations.some(r=>r.exclusive);
  return {...c,shareable,reservations,occupied:used.has(p.id+'/'+c.id)&&!shareable};
 });
}
export type ConnectionRequest={anchorId:string;anchorConnector:string;partConnector:string;rotation:Vec;axialOffset?:number};
export function resolveConnection(pieces:Piece[],piece:Piece,request:ConnectionRequest):Piece{
 const axialOffset=Object.hasOwn(request,'axialOffset')?request.axialOffset:0;
 if(typeof axialOffset!=='number'||!Number.isFinite(axialOffset))throw new Error('El desplazamiento axial debe ser un número finito.');
 const anchor=pieces.find(p=>p.id===request.anchorId);if(!anchor||anchor.id===piece.id)throw new Error('Pieza de referencia inválida.');
 if(!profile(anchor.part)||!profile(piece.part)||!validRotation(anchor)||!validRotation({...piece,rotation:request.rotation}))throw new Error('Pieza o giro sin perfil de encaje.');
 const a=world(anchor).connectors.find(c=>c.id===request.anchorConnector),b=profile(piece.part)!.connectors.find(c=>c.id===request.partConnector);if(!a||!b||!compatibleKinds(a,b))throw new Error('Conectores incompatibles.');if(!orientationFits(a,b,request.rotation))throw new Error('Los conectores no están enfrentados o sus secciones no son compatibles con este giro.');
 if(axialOffset!==0&&(!isAxial(a)||!isAxial(b)))throw new Error('Esta conexión no admite desplazamiento axial.');
 const target=plus(a.point,a.normal.map(n=>n*axialOffset) as Vec);
 const result={...piece,rotation:request.rotation,position:minus(target,rotate(b.point,request.rotation))};
 const transformed=transformConnector(b,result);
 if(!matched(a,transformed)||(isAxial(a)&&isAxial(transformed)&&axialOffset!==0&&axialEngagement(a,transformed)?.mode==='fixed'))throw new Error('El desplazamiento no respeta el contrato de la conexión axial.');
 return result;
}
const rotations:Vec[]=[];const matrices=new Set<string>();for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){const r:Vec=[x,y,z],k=[[1,0,0],[0,1,0],[0,0,1]].flatMap(v=>rotate(v as Vec,r)).join(',');if(!matrices.has(k)){matrices.add(k);rotations.push(r);}}
const placementSampling={axialStepLdu:4,includesGapBoundaries:true,continuousOffsetsAccepted:true,exhaustive:false};
type WorldPort=ReturnType<typeof worldConnections>[number];
function offsetSamples(anchor:WorldPort,other:Connector,rotation:Vec){
 const rotated=isAxial(other)?transformAxialConnector(other,v=>rotate(v,rotation),[0,0,0]):null;
 const range=isAxial(anchor)&&rotated?axialOffsetRange(anchor,rotated):[0,0];
 if(!range)return {count:0,at:(_index:number)=>0,allowed:(_offset:number)=>false};
 let gaps:[number,number][]=[[range[0],range[1]]];
 if(isAxial(anchor)&&isShaft(anchor)&&rotated&&!isShaft(rotated)){
  const half=rotated.axial.length/2;
  for(const reservation of anchor.reservations){
   if(reservation.exclusive)return {count:0,at:(_index:number)=>0,allowed:(_offset:number)=>false};
   const lo=reservation.interval[0]-half,hi=reservation.interval[1]+half;
   gaps=gaps.flatMap(([a,b]):[number,number][]=>{
    if(lo>=b||hi<=a)return [[a,b]];
    const result:[number,number][]=[];
    if(lo>=a)result.push([a,Math.min(b,lo)]);
    if(hi<=b)result.push([Math.max(a,hi),b]);
    return result;
   });
  }
 }
 const allowed=(value:number)=>gaps.some(([a,b])=>value>=a&&value<=b);
 const steps=Math.floor(Math.max(Math.abs(range[0]),Math.abs(range[1]))/4);
 const boundary=[...new Set(gaps.flat())].filter(value=>value!==0&&value%4!==0);
 // Arithmetic indexing avoids allocating every 4-LDU position on a long bar.
 // Try zero and the first +/-4 pair, then non-grid gap/end boundaries, followed
 // by the remaining grid. A page can jump over earlier alignments in O(1).
 const prefix=steps>0?3:1,count=1+2*steps+boundary.length;
 const grid=(index:number)=>index===0?0:Math.ceil(index/2)*4*(index%2?1:-1);
 const at=(index:number)=>index<prefix?grid(index):index<prefix+boundary.length?boundary[index-prefix]:grid(index-boundary.length);
 return {count,at,allowed};
}
export function placementOptions(pieces:Piece[],part:string,anchorId:string,anchorConnector?:string,offset=0,limit=12){
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw new Error('Paginación inválida.');
 if(!profile(part))throw new Error('Esta referencia aún no tiene perfil de encaje.');
 const ports=worldConnections(pieces,anchorId).filter(c=>!c.occupied&&(!anchorConnector||c.id===anchorConnector));
 if(!ports.length)return {options:[],nextOffset:null,examined:0,sampling:placementSampling};
 const def=profile(part)!,prototype:Piece={id:'placement-preview',part,color:4,position:[0,0,0],rotation:[0,0,0],step:1,group:''};
 while(pieces.some(p=>p.id===prototype.id))prototype.id+='x';
 // Paginate compatible alignments, never thousands of stud/stud or reversed pairs.
 const entryCache=new Map<string,{b:Connector;r:Vec}[]>();
 const choices=ports.map(a=>{const key=JSON.stringify([a.kind,a.normal,isAxial(a)?a.axial:null,isHip(a)?a.heading:null]);let entries=entryCache.get(key);if(!entries){entries=def.connectors.flatMap(b=>!compatibleKinds(a,b)?[]:rotations.filter(r=>orientationFits(a,b,r)).map(r=>({b,r})));entryCache.set(key,entries);}return {a,entries};});
 const sampled=choices.map(({a,entries})=>({a,entries:entries.map(entry=>({...entry,samples:offsetSamples(a,entry.b,entry.r)}))}));
 const total=sampled.reduce((n,c)=>n+c.entries.reduce((sum,e)=>sum+e.samples.count,0),0),options:any[]=[],seen=new Set<string>();let cursor=0,examined=0;
 outer:for(const {a,entries} of sampled)for(const {b,r,samples} of entries){
  if(cursor+samples.count<=offset){cursor+=samples.count;continue;}
  const start=Math.max(0,offset-cursor);cursor+=start;
  for(let index=start;index<samples.count;index++){
   cursor++;examined++;
   const axialOffset=samples.at(index);
   if(samples.allowed(axialOffset)){
    const connection:ConnectionRequest={anchorId,anchorConnector:a.id,partConnector:b.id,rotation:r,...isAxial(a)?{axialOffset}:{}};
    let p:Piece;
    try{p=resolveConnection(pieces,prototype,connection);}catch{if(examined>=128)break outer;continue;}
    const key=p.position.join(',')+'/'+r.join(',');
    if(!seen.has(key)){seen.add(key);if(inspectAssembly([...pieces,p]).valid)options.push({connection,position:p.position,rotation:p.rotation});}
   }
   if(examined>=128||options.length>=limit)break outer;
  }
 }
 return {options,nextOffset:cursor<total?cursor:null,examined,sampling:placementSampling};
}
export function groundPlacement(pieces:Piece[],part:string):Vec{
 const def=profile(part);if(!def)throw new Error('Esta referencia aún no tiene perfil de encaje.');
 const b=world({id:'ground-preview',part,color:4,position:[0,0,0],rotation:[0,0,0],step:1,group:''}).bounds;const occupied=pieces.filter(p=>profile(p.part)&&validRotation(p)).map(p=>world(p).bounds);
 const edge=Math.max(0,...occupied.map(b=>b.max[0]));return [pieces.length?Math.ceil((edge-b.min[0]+20)/20)*20:0,-b.min[1],0];
}
