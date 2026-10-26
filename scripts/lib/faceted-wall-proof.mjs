// Whole surface coverage, not just projected axial intervals.
import {clipSurfacePolygon} from './axial-envelope.mjs';
const EPS=1e-8,sub=(a,b)=>a.map((n,i)=>n-b[i]),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),mul=(a,k)=>a.map(n=>n*k);
function area(p){return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;}
function significant(p){if(p.length<3||area(p)<=EPS*EPS)return false;for(let i=0;i<p.length;i++){const d=sub(p[(i+1)%p.length],p[i]),l=Math.hypot(d[0],d[1]);if(l<=EPS)continue;const n=[-d[1]/l,d[0]/l,0],v=p.map(q=>dot(q,n));if(Math.max(...v)-Math.min(...v)<=EPS)return false;}return true;}
function subtract(polygon,triangle){
 const center=[0,1,2].map(i=>triangle.reduce((s,p)=>s+p[i]/3,0)),planes=triangle.map((p,i)=>{const q=triangle[(i+1)%3],d=sub(q,p),l=Math.hypot(d[0],d[1]);if(l<=EPS)return null;let normal=[d[1]/l,-d[0]/l,0],constant=dot(normal,p);if(dot(normal,center)>constant){normal=mul(normal,-1);constant=-constant;}return {normal,constant};}).filter(Boolean);
 if(planes.length<3)return [polygon];const out=[];let pending=polygon;
 for(const h of planes){const outside=clipSurfacePolygon(pending,{normal:mul(h.normal,-1),constant:-h.constant});if(significant(outside))out.push(outside);pending=clipSurfacePolygon(pending,h);if(!significant(pending))break;}return out;
}
export function certifyFacetBand(triangles,{polygon,lo,hi}){
 const patches=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],d=[b[0]-a[0],0,b[1]-a[1]],length=Math.hypot(...d),u=mul(d,1/length),normal=[u[2],0,-u[0]],origin=[a[0],0,a[1]],constant=dot(normal,origin);
  let remaining=[[[0,lo,0],[length,lo,0],[length,hi,0],[0,hi,0]]];const sources=[];
  for(let j=0;j<triangles.length&&remaining.length;j++){
   const points=triangles[j];if(points.some(p=>Math.abs(dot(p,normal)-constant)>EPS))continue;
   const triangle=points.map(p=>[dot(sub(p,origin),u),p[1],0]);if(!significant(triangle))continue;
   const before=remaining.reduce((s,p)=>s+area(p),0);remaining=remaining.flatMap(p=>subtract(p,triangle));if(remaining.length>4096)return {status:'indeterminate',reason:'pin_wall_fragment_limit'};
   if(remaining.reduce((s,p)=>s+area(p),0)<before-EPS*EPS)sources.push(j);
  }
  if(remaining.length)return {status:'indeterminate',reason:'pin_wall_surface_gap',facet:i,interval:[lo,hi],uncoveredArea:remaining.reduce((s,p)=>s+area(p),0)};
  patches.push({facet:i,interval:[lo,hi],width:length,sourceTriangles:sources});
 }
 return {status:'certified',proof:'complete-source-cover-of-all-faceted-band-rectangles',patches};
}
