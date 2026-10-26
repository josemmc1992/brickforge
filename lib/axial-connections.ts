import {mechanicalEngagement as axialEngagement,validMechanicalConnector as validAxialConnector,mechanicalInterval,mechanicalKindsCompatible,isShaft,isLegacyAxial,type MechanicalConnector as AxialConnector} from './mechanical-fit';

export type AxialReservation={
 barPieceId:string;barConnectorId:string;receiverPieceId:string;receiverConnectorId:string;
 interval:[number,number];exclusive:boolean;
};
export type AssemblyConnection={a:string;b:string;connectorA:string;connectorB:string;axial?:AxialReservation};
export type AxialEndpoint={pieceId:string;connector:AxialConnector};
type Issue={code:string;pieces:string[];message:string};
const EPS=1e-8,CELL=.01,MAX_COMPARISONS=1000000;
const endpointKey=(p:AxialEndpoint)=>JSON.stringify([p.pieceId,p.connector.id]);
const ordered=(a:string,b:string)=>a<b?-1:a>b?1:0;

// The axis sweep and radial grid find collinear ports without requiring their
// centres to coincide. Reject by intervals before expensive polygon matching.
// Reservations always use the bar's signed axis, never the receiver's axis.
export function collectAxialConnections(endpoints:AxialEndpoint[]){
 const connections:AssemblyConnection[]=[],issues:Issue[]=[];
 let comparisons=0,truncated=false;
 const issue=(code:string,pieces:string[],message:string)=>{
  if(issues.length<80)issues.push({code,pieces,message});
  if(issues.length>=80)truncated=true;
 };
 const entries=endpoints.flatMap(p=>{
  if(!validAxialConnector(p.connector)){
   issue('invalid_axial_connector',[p.pieceId],'El conector axial no cumple su contrato geométrico.');return [];
  }
  const c=p.connector,axis=c.normal.findIndex(n=>n!==0),radial=[0,1,2].filter(k=>k!==axis),interval=mechanicalInterval(c),ends=interval.map(t=>c.point[axis]+t*c.normal[axis]);
  return [{...p,key:endpointKey(p),axis,radial,lo:Math.min(...ends),hi:Math.max(...ends)}];
 }).sort((a,b)=>a.axis-b.axis||a.lo-b.lo||ordered(a.key,b.key));
 type Entry=typeof entries[number];
 const buckets=new Map<string,{shaft:Entry[];receiver:Entry[]}>();
 const receivers=new Map<string,AxialReservation>(),bars=new Map<string,AxialReservation[]>();
 loop:for(const p of entries){
  if(truncated)break;
  const c=p.connector,[u,v]=p.radial,ix=Math.floor(c.point[u]/CELL),iz=Math.floor(c.point[v]/CELL),side=isShaft(c)?'shaft':'receiver',other=side==='shaft'?'receiver':'shaft';
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   const key=[c.axial.radius,p.axis,ix+dx,iz+dz].join(','),bucket=buckets.get(key);if(!bucket)continue;
   // Each bucket is pruned only when queried. A scene with many ports of just
   // one kind therefore does not repeatedly scan an ever-growing own-kind list.
   bucket[other]=bucket[other].filter(q=>q.hi>=p.lo-EPS);
   for(const q of bucket[other]){
    if(p.pieceId===q.pieceId)continue;
    if(++comparisons>MAX_COMPARISONS){issue('complexity_limit',[p.pieceId,q.pieceId],'Demasiados posibles encajes axiales superpuestos; separa la construcción.');truncated=true;break loop;}
    const d=q.connector;if(!mechanicalKindsCompatible(c,d))continue;
    if(Math.hypot(c.point[u]-d.point[u],c.point[v]-d.point[v])>=EPS)continue;
    const male=isShaft(c)?p:q,female=isShaft(c)?q:p;
    if(!isLegacyAxial(c)&&!isLegacyAxial(d)&&(female.lo<male.lo-EPS||female.hi>male.hi+EPS))continue;
    const engagement=axialEngagement(c,d);if(!engagement)continue;
    const reservation:AxialReservation={barPieceId:male.pieceId,barConnectorId:male.connector.id,receiverPieceId:female.pieceId,receiverConnectorId:female.connector.id,interval:engagement.interval,exclusive:engagement.exclusive};
    const reserved=bars.get(male.key)||[],receiver=receivers.get(female.key);
    const conflict=reserved.find(r=>r.exclusive||reservation.exclusive||Math.min(r.interval[1],reservation.interval[1])-Math.max(r.interval[0],reservation.interval[0])>EPS);
    if(receiver||conflict){
     const ids=[male.pieceId,female.pieceId,...(receiver?[receiver.barPieceId]:[]),...(conflict?[conflict.receiverPieceId]:[])];
     issue('occupied_connector',[...new Set(ids)],'El receptor ya está ocupado, la unión es exclusiva o sus tramos sobre la varilla o el eje se solapan.');
     if(truncated)break loop;
     continue;
    }
    reserved.push(reservation);bars.set(male.key,reserved);receivers.set(female.key,reservation);
    connections.push({a:male.pieceId,b:female.pieceId,connectorA:male.connector.id,connectorB:female.connector.id,axial:reservation});
   }
  }
  const key=[c.axial.radius,p.axis,ix,iz].join(',');let own=buckets.get(key);
  if(!own){own={shaft:[],receiver:[]};buckets.set(key,own);}
  own[side].push(p);
 }
 return {connections,issues,comparisons,truncated};
}
