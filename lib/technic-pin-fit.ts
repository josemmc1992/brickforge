// Fixed seating of a source-certified 20-LDU Technic pin end. This contract
// never grants a collision exemption; complete source-preserving bodies still
// pass through SAT. It does not describe friction, insertion animation or flex.
export type PinVector=[number,number,number];
export type TechnicPinConnector={
 id:string;
 kind:'pin'|'pin-hole';
 point:PinVector;
 normal:PinVector;
 pin:{contract:'technic-pin-20-fixed-v1';length:20;shaftRadius:6;collarRadius:8;shaftSpan:16};
};
const vector=(v:unknown):v is PinVector=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100_000);
const axis=(v:unknown):v is PinVector=>vector(v)&&v.every(n=>n===0||n===1||n===-1)&&v.filter(n=>n!==0).length===1;
export function validTechnicPinConnector(value:unknown):value is TechnicPinConnector{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const c=value as Partial<TechnicPinConnector>,p=c.pin;
 return typeof c.id==='string'&&c.id.length>0&&c.id.length<=160&&(c.kind==='pin'||c.kind==='pin-hole')&&vector(c.point)&&axis(c.normal)&&!!p&&typeof p==='object'&&!Array.isArray(p)&&p.contract==='technic-pin-20-fixed-v1'&&p.length===20&&p.shaftRadius===6&&p.collarRadius===8&&p.shaftSpan===16;
}
export function technicPinKindsCompatible(a:TechnicPinConnector,b:TechnicPinConnector){return a.kind==='pin'&&b.kind==='pin-hole'||a.kind==='pin-hole'&&b.kind==='pin';}
export function technicPinConnectorsMatch(a:TechnicPinConnector,b:TechnicPinConnector){
 if(!validTechnicPinConnector(a)||!validTechnicPinConnector(b)||!technicPinKindsCompatible(a,b))return false;
 // A through hole is accessible from either side. A male end has its own
 // fixed seating centre; the opposite end is a separate exclusive connector.
 return a.point.every((n,i)=>Math.abs(n-b.point[i])<=1e-8)&&Math.abs(a.normal.reduce((s,n,i)=>s+n*b.normal[i],0))===1;
}
