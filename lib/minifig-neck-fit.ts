// Fixed head seating. Geometry is always checked by the full-body engine.
export type NeckVector=[number,number,number];
export type MinifigNeckConnector={id:string;kind:'neck'|'neck-socket';point:NeckVector;normal:NeckVector;neck:{contract:'minifig-neck-12-fixed-v1';radius:6;length:12;socketDepth:20}};
const vector=(v:unknown):v is NeckVector=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
const axis=(v:unknown):v is NeckVector=>vector(v)&&v.every(n=>n===0||n===1||n===-1)&&v.filter(n=>n!==0).length===1;
export function validMinifigNeckConnector(value:unknown):value is MinifigNeckConnector{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const c=value as Partial<MinifigNeckConnector>,n=c.neck;
 return typeof c.id==='string'&&c.id.length>0&&c.id.length<=160&&(c.kind==='neck'||c.kind==='neck-socket')&&vector(c.point)&&axis(c.normal)&&!!n&&typeof n==='object'&&!Array.isArray(n)&&n.contract==='minifig-neck-12-fixed-v1'&&n.radius===6&&n.length===12&&n.socketDepth===20;
}
export function minifigNeckKindsCompatible(a:MinifigNeckConnector,b:MinifigNeckConnector){return a.kind==='neck'&&b.kind==='neck-socket'||a.kind==='neck-socket'&&b.kind==='neck';}
export function minifigNeckConnectorsMatch(a:MinifigNeckConnector,b:MinifigNeckConnector){
 return validMinifigNeckConnector(a)&&validMinifigNeckConnector(b)&&minifigNeckKindsCompatible(a,b)&&a.point.every((n,i)=>Math.abs(n-b.point[i])<=1e-8)&&a.normal.reduce((s,n,i)=>s+n*b.normal[i],0)===-1;
}
