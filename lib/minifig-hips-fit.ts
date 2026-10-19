// Fixed waist seating. Heading points toward the outside bevel of each post.
export type HipVector=[number,number,number];
export type MinifigHipConnector={
 id:string;kind:'hip-stud'|'hip-socket';point:HipVector;normal:HipVector;heading:HipVector;
 hip:{contract:'minifig-hipstud-11-fixed-v1';length:11;nominalRadius:6};
};
const vector=(v:unknown):v is HipVector=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
const axis=(v:unknown):v is HipVector=>vector(v)&&v.every(n=>n===0||n===1||n===-1)&&v.filter(n=>n!==0).length===1;
const dot=(a:HipVector,b:HipVector)=>a.reduce((s,n,i)=>s+n*b[i],0);
export function validMinifigHipConnector(value:unknown):value is MinifigHipConnector{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const c=value as Partial<MinifigHipConnector>,h=c.hip;
 return typeof c.id==='string'&&c.id.length>0&&c.id.length<=160&&(c.kind==='hip-stud'||c.kind==='hip-socket')&&vector(c.point)&&axis(c.normal)&&axis(c.heading)&&dot(c.normal,c.heading)===0&&!!h&&typeof h==='object'&&!Array.isArray(h)&&h.contract==='minifig-hipstud-11-fixed-v1'&&h.length===11&&h.nominalRadius===6;
}
export function minifigHipKindsCompatible(a:MinifigHipConnector,b:MinifigHipConnector){
 return a.kind==='hip-stud'&&b.kind==='hip-socket'||a.kind==='hip-socket'&&b.kind==='hip-stud';
}
export function minifigHipConnectorsMatch(a:MinifigHipConnector,b:MinifigHipConnector){
 return validMinifigHipConnector(a)&&validMinifigHipConnector(b)&&minifigHipKindsCompatible(a,b)&&a.point.every((n,i)=>Math.abs(n-b.point[i])<=1e-8)&&dot(a.normal,b.normal)===-1&&dot(a.heading,b.heading)===1;
}
export function validMinifigHipPair(connectors:unknown[]):boolean{
 const ports=connectors.filter(c=>!!c&&typeof c==='object'&&['hip-stud','hip-socket'].includes((c as MinifigHipConnector).kind));
 if(ports.length!==2||!ports.every(validMinifigHipConnector))return false;
 const [a,b]=ports as MinifigHipConnector[];
 return a.id!==b.id&&a.kind===b.kind&&dot(a.normal,b.normal)===1&&dot(a.heading,b.heading)===-1&&a.point.every((n,i)=>b.point[i]-n===20*b.heading[i]);
}
