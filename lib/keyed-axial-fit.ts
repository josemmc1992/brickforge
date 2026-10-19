// Separate A6 contract. This module alone never registers a catalogue part.
// Production profiles must first prove the occupied cross and the open keyed
// receiver against their source geometry. Length is NOMINAL for an axle; only
// engagementInterval may be used for connection reservations.
export type KeyedVec=[number,number,number];
export type KeyedPoint=[number,number];
type KeyedShape={
 contract:'a6-through-keyed-sliding-v1';radius:6;length:number;slide:boolean;
 radialU:KeyedVec;radialV:KeyedVec;sectionComponents:[KeyedPoint[],KeyedPoint[]];
};
export type KeyedAxialConnector={id:string;point:KeyedVec;normal:KeyedVec}&(
 {kind:'axle';axial:KeyedShape&{engagementInterval:[number,number]}}|
 {kind:'axle-socket';axial:KeyedShape}
);
const EPS=1e-8;
const dot=(a:KeyedVec,b:KeyedVec)=>a.reduce((s,n,i)=>s+n*b[i],0);
const sub=(a:KeyedVec,b:KeyedVec)=>a.map((n,i)=>n-b[i]) as KeyedVec;
const cross=(a:KeyedVec,b:KeyedVec):KeyedVec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finite=(p:unknown):p is KeyedVec=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
const axis=(p:KeyedVec)=>p.every(n=>n===0||Math.abs(n)===1)&&p.filter(n=>n!==0).length===1;
const turn=(a:KeyedPoint,b:KeyedPoint,p:KeyedPoint)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function convex(poly:unknown):poly is KeyedPoint[]{
 if(!Array.isArray(poly)||poly.length<3||poly.length>64||poly.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.hypot(...p)>6.01))return false;
 return poly.every((p,i)=>{const q=poly[(i+1)%poly.length];return Math.hypot(q[0]-p[0],q[1]-p[1])>EPS&&turn(p,q,[0,0])>EPS&&poly.every(r=>turn(p,q,r)>=-EPS);});
}
export function validKeyedAxialConnector(value:unknown):value is KeyedAxialConnector{
 const c=value as KeyedAxialConnector;
 if(!c||!['axle','axle-socket'].includes(c.kind)||typeof c.id!=='string'||!c.id.length||c.id.length>160||!finite(c.point)||!finite(c.normal)||!axis(c.normal))return false;
 const a=c.axial;
 if(!a||a.contract!=='a6-through-keyed-sliding-v1'||a.radius!==6||typeof a.slide!=='boolean'||!Number.isFinite(a.length)||a.length<4||a.length>100000||!finite(a.radialU)||!finite(a.radialV)||!axis(a.radialU)||!axis(a.radialV))return false;
 if(dot(c.normal,a.radialU)!==0||dot(c.normal,a.radialV)!==0||cross(a.radialU,c.normal).some((n,i)=>n!==a.radialV[i]))return false;
 if(!Array.isArray(a.sectionComponents)||a.sectionComponents.length!==2||!a.sectionComponents.every(convex))return false;
 if(c.kind==='axle'){
  const interval=c.axial.engagementInterval;
  // This first reviewed family has two 2.5-LDU bevels. Other engagement
  // intervals (notches, stops, multiple sections) require their own proof.
  if(a.length<=5||!Array.isArray(interval)||interval.length!==2||interval[0]!==-a.length/2+2.5||interval[1]!==a.length/2-2.5)return false;
 }
 return true;
}
export function transformKeyedAxialConnector(c:KeyedAxialConnector,rotation:(p:KeyedVec)=>KeyedVec,translation:KeyedVec):KeyedAxialConnector{
 const p=rotation(c.point);
 return {...c,point:p.map((n,i)=>n+translation[i]) as KeyedVec,normal:rotation(c.normal),axial:{...c.axial,radialU:rotation(c.axial.radialU),radialV:rotation(c.axial.radialV)}} as KeyedAxialConnector;
}
export function keyedSectionsFit(a:KeyedAxialConnector,b:KeyedAxialConnector,tolerance=.01):boolean{
 if(!validKeyedAxialConnector(a)||!validKeyedAxialConnector(b)||a.kind===b.kind||!Number.isFinite(tolerance)||tolerance<0||tolerance>.01||Math.abs(dot(a.normal,b.normal))!==1)return false;
 const male=a.kind==='axle'?a:b,female=a.kind==='axle-socket'?a:b,offset=sub(male.point,female.point);
 // An entire convex male component must lie in one convex female component.
 // Checking only membership of vertices in the UNION would fill its concave
 // corners. Quarter-turn keyed frames make this conservative test sufficient.
 return male.axial.sectionComponents.every(component=>{
  const projected=component.map(([x,z])=>{
   const world=male.axial.radialU.map((u,i)=>offset[i]+u*x+male.axial.radialV[i]*z) as KeyedVec;
   return [dot(world,female.axial.radialU),dot(world,female.axial.radialV)] as KeyedPoint;
  });
  return female.axial.sectionComponents.some(poly=>projected.every(p=>poly.every((v,i)=>{const q=poly[(i+1)%poly.length];return turn(v,q,p)>=-tolerance*Math.hypot(q[0]-v[0],q[1]-v[1]);})));
 });
}
export type KeyedEngagement={mode:'fixed'|'sliding';interval:[number,number];exclusive:boolean};
export function keyedEngagement(a:KeyedAxialConnector,b:KeyedAxialConnector):KeyedEngagement|null{
 if(!keyedSectionsFit(a,b))return null;
 const male=(a.kind==='axle'?a:b) as KeyedAxialConnector&{kind:'axle'},female=a.kind==='axle-socket'?a:b;
 const delta=sub(female.point,male.point),centre=dot(delta,male.normal);
 if(Math.hypot(...delta.map((n,i)=>n-centre*male.normal[i]))>=EPS)return null;
 const interval:[number,number]=[centre-female.axial.length/2,centre+female.axial.length/2],range=male.axial.engagementInterval;
 if(interval[0]<range[0]-EPS||interval[1]>range[1]+EPS)return null;
 const sliding=male.axial.slide||female.axial.slide;
 if(!sliding&&Math.hypot(...delta)>=EPS)return null;
 return {mode:sliding?'sliding':'fixed',interval,exclusive:!sliding};
}
export function keyedOffsetRange(a:KeyedAxialConnector,b:KeyedAxialConnector):[number,number]|null{
 if(!validKeyedAxialConnector(a)||!validKeyedAxialConnector(b)||!keyedSectionsFit(a,{...b,point:a.point}))return null;
 const male=(a.kind==='axle'?a:b) as KeyedAxialConnector&{kind:'axle'},female=a.kind==='axle-socket'?a:b;
 const range=male.axial.engagementInterval,lo=range[0]+female.axial.length/2,hi=range[1]-female.axial.length/2;
 if(lo>hi+EPS*2)return null;
 if(!(male.axial.slide||female.axial.slide))return lo<=EPS&&hi>=-EPS?[0,0]:null;
 // The reviewed two-bevel family is symmetric. Keep the range symmetric so
 // an offset along either anchor's signed axis has the same bounds.
 const limit=Math.max(0,Math.min(-lo,hi));return limit>0?[-limit,limit]:[0,0];
}
