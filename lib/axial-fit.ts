// Contract for the next, separately certified joint family. A valid metadata
// record is not enough: the compiler must first prove the shaft/cavity geometry.
// Both ends are open. The fixed v1 contract stays centred; v2 permits sliding
// only when explicitly requested by either connector's certified metadata.
export type AxialVec=[number,number,number];
export type SectionPoint=[number,number];
type AxialContract={contract:'r4-through-centered-fixed-v1'}|{contract:'r4-through-sliding-v2';slide:boolean};
export type AxialConnector={
 id:string;
 kind:'bar'|'bar-socket';
 point:AxialVec;
 normal:AxialVec;
 axial:AxialContract&{
  radius:4;
  length:number;
  radialU:AxialVec;
  radialV:AxialVec;
  section:SectionPoint[];
 };
};
const dot=(a:AxialVec,b:AxialVec)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross=(a:AxialVec,b:AxialVec):AxialVec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const difference=(a:AxialVec,b:AxialVec):AxialVec=>a.map((n,i)=>n-b[i]) as AxialVec;
const finiteVec=(v:unknown):v is AxialVec=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
// This first contract uses signed coordinate axes and quarter turns only. An
// angular epsilon would turn into unbounded tip displacement on a long shaft.
const axialUnit=(v:AxialVec)=>v.filter(n=>Math.abs(n)===1).length===1&&v.filter(n=>n!==0).length===1;
const near=(a:AxialVec,b:AxialVec,tolerance:number)=>Math.hypot(...difference(a,b))<tolerance;
const cross2=(a:SectionPoint,b:SectionPoint,p:SectionPoint)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const POSITION_EPSILON=1e-8;

export function validAxialConnector(value:unknown):value is AxialConnector {
 const c=value as AxialConnector;
 if(!c||!['bar','bar-socket'].includes(c.kind)||typeof c.id!=='string'||!c.id.length||c.id.length>160||!finiteVec(c.point)||!finiteVec(c.normal)||!axialUnit(c.normal))return false;
 const a=c.axial;
 if(!a||(a.contract!=='r4-through-centered-fixed-v1'&&(a.contract!=='r4-through-sliding-v2'||typeof a.slide!=='boolean'))||a.radius!==4||!Number.isFinite(a.length)||a.length<4||a.length>100000||!finiteVec(a.radialU)||!finiteVec(a.radialV)||!axialUnit(a.radialU)||!axialUnit(a.radialV))return false;
 if(Math.abs(dot(c.normal,a.radialU))>1e-8||Math.abs(dot(c.normal,a.radialV))>1e-8||!near(cross(a.radialU,c.normal),a.radialV,1e-8))return false;
 const poly=a.section;
 if(!Array.isArray(poly)||poly.length<3||poly.length>64||poly.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n))||Math.hypot(...p)>4.01))return false;
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length];
  if(Math.hypot(q[0]-p[0],q[1]-p[1])<1e-8||poly.some(r=>cross2(p,q,r)<-1e-8)||cross2(p,q,[0,0])<=1e-8)return false;
 }
 return true;
}

export function transformAxialConnector(c:AxialConnector,rotation:(v:AxialVec)=>AxialVec,translation:AxialVec):AxialConnector {
 const p=rotation(c.point);
 return {...c,point:p.map((n,i)=>n+translation[i]) as AxialVec,normal:rotation(c.normal),axial:{...c.axial,radialU:rotation(c.axial.radialU),radialV:rotation(c.axial.radialV)}};
}

// This is the same positional/penetration allowance as the existing SAT gate.
// It does not enlarge the compiler's certified empty volume, and the complete
// bodies must still pass collision checking after the centred pose is selected.
export function axialSectionsFit(a:AxialConnector,b:AxialConnector,tolerance=0.01):boolean {
 if(!validAxialConnector(a)||!validAxialConnector(b)||a.kind===b.kind||!Number.isFinite(tolerance)||tolerance<0||tolerance>0.01||Math.abs(dot(a.normal,b.normal))!==1)return false;
 const male=a.kind==='bar'?a:b,female=a.kind==='bar-socket'?a:b;
 const offset=difference(male.point,female.point);
 for(const [x,z] of male.axial.section){
  const world=male.axial.radialU.map((u,i)=>offset[i]+u*x+male.axial.radialV[i]*z) as AxialVec;
  const point:SectionPoint=[dot(world,female.axial.radialU),dot(world,female.axial.radialV)];
  const poly=female.axial.section;
  for(let i=0;i<poly.length;i++){
   const p=poly[i],q=poly[(i+1)%poly.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(cross2(p,q,point)<-tolerance*length)return false;
  }
 }
 return true;
}

function slidingEnabled(a:AxialConnector,b:AxialConnector):boolean {
 // LDCad SNAP_CYL combines slide with OR. Do not upgrade an existing v1 port
 // merely because the other port has a new, less restrictive contract.
 // https://www.melkert.net/LDCad/tech/meta
 return a.axial.contract==='r4-through-sliding-v2'&&b.axial.contract==='r4-through-sliding-v2'&&(a.axial.slide||b.axial.slide);
}

// Offset is the socket centre measured along the male's signed local axis.
// Relative positions are ignored: this is a placement range for already
// oriented connectors, not a test of their current pose. Both records must
// nevertheless be valid, including finite positions, and their sections must
// fit when moved to a common centre. Legacy/mixed contracts keep v1 semantics.
export function axialOffsetRange(a:AxialConnector,b:AxialConnector):[number,number]|null {
 if(!validAxialConnector(a)||!validAxialConnector(b))return null;
 const male=a.kind==='bar'?a:b,female=a.kind==='bar-socket'?a:b;
 if(!axialSectionsFit(male,{...female,point:male.point}))return null;
 if(a.axial.contract==='r4-through-centered-fixed-v1'||b.axial.contract==='r4-through-centered-fixed-v1')return [0,0];
 const halfRange=(male.axial.length-female.axial.length)/2;
 if(halfRange<-POSITION_EPSILON)return null;
 const limit=Math.max(0,halfRange);
 return slidingEnabled(a,b)&&limit>0?[-limit,limit]:[0,0];
}

export type AxialEngagement={mode:'fixed'|'sliding';interval:[number,number];exclusive:boolean};

export function axialEngagement(a:AxialConnector,b:AxialConnector):AxialEngagement|null {
 if(!axialSectionsFit(a,b))return null;
 const male=a.kind==='bar'?a:b,female=a.kind==='bar-socket'?a:b;
 const offset=difference(female.point,male.point);
 const centre=dot(offset,male.normal);
 const interval:[number,number]=[centre-female.axial.length/2,centre+female.axial.length/2];
 if(a.axial.contract==='r4-through-centered-fixed-v1'||b.axial.contract==='r4-through-centered-fixed-v1')return near(a.point,b.point,POSITION_EPSILON)?{mode:'fixed',interval,exclusive:true}:null;
 const radial=offset.map((n,i)=>n-centre*male.normal[i]) as AxialVec;
 if(Math.hypot(...radial)>=POSITION_EPSILON||interval[0]<-male.axial.length/2-POSITION_EPSILON||interval[1]>male.axial.length/2+POSITION_EPSILON)return null;
 const sliding=slidingEnabled(a,b);
 if(!sliding&&!near(a.point,b.point,POSITION_EPSILON))return null;
 return {mode:sliding?'sliding':'fixed',interval,exclusive:!sliding};
}

export function axialConnectorsMatch(a:AxialConnector,b:AxialConnector):boolean {
 return axialEngagement(a,b)!==null;
}
