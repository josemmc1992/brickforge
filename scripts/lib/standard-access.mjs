// Source-preserving geometry proof. This does not establish a connector or register a
// part. Stud/source and socket/support proofs must be supplied independently.
import {conservativeHull,sha256} from './ldraw-envelope.mjs';
import {clipSurfacePolygon,subtractConvexPrism} from './axial-envelope.mjs';
const EPS=1e-8,MAX=100000;
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),neg=v=>v.map(n=>-n),distance=(p,h)=>dot(p,h.normal)-h.constant;
const point=p=>Array.isArray(p)&&p.length===3&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX);
const axis=n=>point(n)&&n.every(v=>v===0||Math.abs(v)===1)&&n.filter(v=>v!==0).length===1;
const fail=(reason,details={})=>({status:'indeterminate',reason,...details});
export function sourceAccessPlanes(pos,normal){
 if(!point(pos)||!axis(normal))return null;
 const k=normal.findIndex(n=>n!==0),planes=[];
 for(const i of [0,1,2].filter(i=>i!==k))for(const sign of [-1,1]){const n=[0,0,0];n[i]=sign;planes.push({normal:n,constant:dot(n,pos)+10});}
 planes.push({normal:neg(normal),constant:-dot(normal,pos)});return planes;
}
export function accessInteriorWitness(triangle,planes){
 let polygon=triangle;for(const h of planes){polygon=clipSurfacePolygon(polygon,h);if(!polygon.length)return null;}
 if(polygon.length<3)return null;
 const center=[0,1,2].map(i=>polygon.reduce((sum,p)=>sum+p[i],0)/polygon.length),margin=Math.min(...planes.map(h=>-distance(center,h)));
 return margin>EPS?{point:center,margin}:null;
}
export function certifySourceAccess(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return fail('invalid_access_request');
 const {body,sourceHash,pos,normal}=input;
 const planes=sourceAccessPlanes(pos,normal);if(!planes)return fail('invalid_access_frame');
 if(typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(sourceHash))return fail('invalid_source_hash');
 if(!Array.isArray(body)||!body.length||body.length>32000||body.some(f=>!Array.isArray(f)||![3,4].includes(f.length)||!f.every(point)))return fail('invalid_source_body');
 const triangles=body.flatMap((f,face)=>f.length===3?[{face,points:f}]:[{face,points:[f[0],f[1],f[2]]},{face,points:[f[0],f[2],f[3]]}]);
 for(let index=0;index<triangles.length;index++){const witness=accessInteriorWitness(triangles[index].points,planes);if(witness)return fail('source_in_access_column',{triangle:index,face:triangles[index].face,witness});}
 let hull;
 try{hull=conservativeHull(body.flat()).solid;}catch(e){if(e.code)return fail(e.code);throw e;}
 if(hull.planes.some(h=>distance(pos,h)>EPS))return fail('connection_outside_body_hull');
 if(body.some(f=>f.some(p=>hull.planes.some(h=>distance(p,h)>EPS))))return fail('source_outside_body_hull');
 const result=subtractConvexPrism(hull,planes);if(result.status!=='subtracted')return fail(result.reason);
 for(const s of result.solids){
  if(s.vertices.length>128||s.normals.length>128||s.edges.length>128||s.planes.length>128)return fail('access_complexity');
  if(s.vertices.some(p=>!point(p)||hull.planes.some(h=>distance(p,h)>EPS)||s.planes.some(h=>distance(p,h)>EPS)))return fail('invalid_access_cell');
  if(!planes.some(h=>s.vertices.every(p=>distance(p,h)>=-EPS)))return fail('cell_inside_access_column');
 }
 return {status:'certified',version:'source-outward-standard-access-v1',sourceHash,geometryHash:sha256(JSON.stringify(body)),solids:result.solids,
  certificate:{pos:[...pos],normal:[...normal],width:20,planes,numericEpsilon:EPS,sourceFaces:body.length,sourceTriangles:triangles.length,coverage:'source body inside hull and outside open outward column; convex difference preserves all body faces',reach:'unbounded outward from connector plane to exterior',otherGeometry:'Excluded studs must remain separately as validated active connectors or collision obstacles',connectorCertified:false}};
}
