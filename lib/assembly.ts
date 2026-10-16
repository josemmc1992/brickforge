// Shared, deterministic connection and collision engine. No browser/DB dependencies.
import catalog from './catalog-data.json';
import type {Piece} from './model';
export type Vec=[number,number,number];
type Connector={id:string;kind:'stud'|'socket';point:Vec;normal:Vec};
type Solid={vertices:Vec[];normals:Vec[];edges:Vec[]};
export type Profile={source:string;solids:Solid[];connectors:Connector[]};
const EPS=.01;
const plus=(a:Vec,b:Vec):Vec=>a.map((v,i)=>v+b[i]) as Vec;
const minus=(a:Vec,b:Vec):Vec=>a.map((v,i)=>v-b[i]) as Vec;
const dot=(a:Vec,b:Vec)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const near=(a:Vec,b:Vec)=>Math.hypot(...minus(a,b))<EPS;
function prism(poly:[number,number][],lo:number,hi:number,axis:0|2=2):Solid{
 const vertex=(a:number,b:number,c:number):Vec=>axis===2?[a,b,c]:[c,b,a];
 const vertices=[...poly.map(([a,b])=>vertex(a,b,lo)),...poly.map(([a,b])=>vertex(a,b,hi))];
 const edges=poly.map(([a,b],i)=>{const q=poly[(i+1)%poly.length];return vertex(q[0]-a,q[1]-b,0)});
 const depth=vertex(0,0,1);return {vertices,normals:[depth,...edges.map(e=>cross(e,depth))],edges:[depth,...edges]};
}
function box(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number){return prism([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],z0,z1);}
function grid(w:number,d:number,y:number,kind:'stud'|'socket',zOffset=0):Connector[]{
 const out:Connector[]=[];for(let x=-w/2+10;x<w/2;x+=20)for(let z=-d/2+10;z<d/2;z+=20)out.push({id:`${kind}:${x}:${z+zOffset}:${y}`,kind,point:[x,y,z+zOffset],normal:[0,kind==='stud'?1:-1,0]});return out;
}
function rectangular(w:number,d:number,h:number,studs=true):Profile{return {source:'rectangular-v1',solids:[box(-w/2,w/2,-h,0,-d/2,d/2)],connectors:[...(studs?grid(w,d,0,'stud'):[]),...grid(w,d,-h,'socket')]};}
function round(radius:number,height:number,topRadius=radius):Solid{
 // Circumscribed polygon: conservative at the curved boundary, never fits inside it.
 const n=16,f=1/Math.cos(Math.PI/n),vertices:Vec[]=[];
 for(const [r,y] of [[radius,-height],[topRadius,0]])for(let i=0;i<n;i++){const a=(i+.5)*2*Math.PI/n;vertices.push([r*f*Math.cos(a),y,r*f*Math.sin(a)]);}
 const edges:Vec[]=[[0,1,0]],normals:Vec[]=[[0,1,0]];
 for(let i=0;i<n;i++){const j=(i+1)%n,e=minus(vertices[j],vertices[i]),v=minus(vertices[i+n],vertices[i]);edges.push(e,v);normals.push(cross(e,v));}
 return {vertices,normals,edges};
}
const profiles=new Map<string,Profile|null>();
const sourceParts=new Map(catalog.map(p=>[p.id,p]));
export function profile(part:string):Profile|null{
 if(profiles.has(part))return profiles.get(part)!;
 const p=sourceParts.get(part);let result:Profile|null=null;
 if(p?.basic){const {width:w,depth:d,height:h}=p.basic;result=rectangular(w,d,h);}
 const tile=p?.name.match(/^Tile\s+(\d+)\s+x\s+(\d+)(?: with Groove| without Groove)?$/);
 if(tile)result=rectangular(+tile[2]*20,+tile[1]*20,8,false);
 if(['3039','3037'].includes(part)){
  const w=part==='3039'?40:80;
  result={source:'ldraw-reviewed-slope-v1',solids:[prism([[-30,-24],[10,-24],[10,0],[-10,0],[-30,-20]],-w/2,w/2,0)],connectors:[...grid(w,20,0,'stud'),...grid(w,40,-24,'socket',-10)]};
 }
 if(['3659','3307'].includes(part)){
  const small=part==='3659',w=small?80:120,h=small?24:48,r=small?20:40,cy=small?28:48,ry=small?20:36;
  const solids=[box(-w/2,-r,-h,0,-10,10),box(r,w/2,-h,0,-10,10)];
  const n=small?8:24;
  for(let i=0;i<n;i++){const a=-Math.PI/2+i*Math.PI/n,b=-Math.PI/2+(i+1)*Math.PI/n,x0=r*Math.sin(a),x1=r*Math.sin(b),y0=Math.max(-h,-cy+ry*Math.cos(a)),y1=Math.max(-h,-cy+ry*Math.cos(b));solids.push(prism([[x0,y0],[x1,y1],[x1,0],[x0,0]],-10,10));}
  result={source:'ldraw-reviewed-arch-v1',solids,connectors:[...grid(w,20,0,'stud'),...grid(w,20,-h,'socket').filter(c=>Math.abs(c.point[0])>r)]};
 }
 const rounds:Record<string,[number,number,number,number,boolean]>={
  '6141':[10,8,10,20,true],'3062b':[10,24,10,20,true],'98138':[10,8,10,20,false],
  '3941':[20,24,20,40,true],'6143':[20,24,20,40,true],
  '4589':[10,24,5,20,true],'3942c':[20,48,10,40,true],'98100':[20,24,10,40,true],
 };
 if(rounds[part]){const [r,h,top,w,studs]=rounds[part],isCone=top!==r;result={source:'reviewed-round-envelope-v1',solids:[round(r,h,top)],connectors:[...(studs?grid(isCone?20:w,isCone?20:w,0,'stud'):[]),...grid(w,w,-h,'socket')]};}
 if(part==='4070'){
  result={source:'ldraw-reviewed-headlight-v1',solids:[box(-10,10,-24,-20,-10,10),box(-10,10,-20,0,-6,10)],connectors:[...grid(20,20,0,'stud'),...grid(20,20,-24,'socket'),{id:'stud:front',kind:'stud',point:[0,-10,-6],normal:[0,0,-1]}]};
 }
 profiles.set(part,result);return result;
}
export const supportedPartCount=catalog.filter(p=>profile(p.id)).length;
export function partConnectionInfo(part:string){const p=profile(part);return p?{supported:true,profile:p.source,connectors:p.connectors,rotations:'quarter-turns XYZ',collision:'convex compound envelopes; curved surfaces conservative'}:{supported:false,reason:'Esta pieza aún no tiene un perfil de encaje. Se puede visualizar, pero no añadir al ensamblaje.'};}
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
function world(p:Piece){const def=profile(p.part)!;const solids=def.solids.map(s=>transform(s,p));const connectors=def.connectors.map(c=>({...c,point:plus(rotate(c.point,p.rotation),p.position),normal:rotate(c.normal,p.rotation)}));return {piece:p,solids,connectors,bounds:bounds(solids.flatMap(s=>s.vertices))};}
type World=ReturnType<typeof world>;
function matched(a:Connector,b:Connector){return a.kind!==b.kind&&near(a.point,b.point)&&dot(a.normal,b.normal)<-.999;}
function studSolid(c:Connector):Solid{
 // Stud intrusion is tested separately; the matching socket reserves this space.
 const n=c.normal,k=n.findIndex(v=>Math.abs(v)>.9);const min=c.point.map((v,i)=>i===k?v+Math.min(0,n[i]*4):v-6) as Vec,max=c.point.map((v,i)=>i===k?v+Math.max(0,n[i]*4):v+6) as Vec;
 return box(min[0],max[0],min[1],max[1],min[2],max[2]);
}
export type AssemblyIssue={code:string;pieces:string[];message:string};
export function inspectAssembly(pieces:Piece[]){
 const issues:AssemblyIssue[]=[],worlds:World[]=[],connections:{a:string;b:string;connectorA:string;connectorB:string}[]=[];
 let issueCount=0;const issue=(code:string,ids:string[],message:string)=>{issueCount++;if(issues.length<80)issues.push({code,pieces:ids,message});};
 let portCount=0;
 for(const p of pieces){const def=profile(p.part);if(!def){issue('unsupported_part',[p.id],`Pieza ${p.part} sin perfil de encaje.`);continue;}portCount+=def.connectors.length;if(portCount>40000){issue('complexity_limit',[p.id],'El ensamblaje supera el límite de 40.000 puntos de conexión.');return {valid:false,issueCount,issues,truncated:false,connections,checked:worlds.length,unsupported:pieces.length-worlds.length,limitation:'Límite de complejidad excedido.'};}if(!validRotation(p)){issue('unsupported_rotation',[p.id],'Solo se admiten giros de 90° en los perfiles actuales.');continue;}worlds.push(world(p));}
 const graph=new Map(worlds.map(w=>[w.piece.id,new Set<string>()])),ground=new Set<string>();
 const ports=new Map<string,{w:World;c:Connector}[]>(),occupied=new Map<string,number>();
 const key=(v:Vec)=>v.map(n=>Math.round(n*100)).join(',');
 portLoop:for(const w of worlds){const minY=Math.min(w.bounds.min[1],...w.connectors.filter(c=>c.kind==='stud').map(c=>bounds(studSolid(c).vertices).min[1]));if(minY<-EPS)issue('below_ground',[w.piece.id],'La pieza atraviesa el suelo.');if(Math.abs(minY)<=EPS)ground.add(w.piece.id);
  for(const c of w.connectors){const k=key(c.point),list=ports.get(k)||[];for(const q of list){if(q.w===w||!matched(c,q.c))continue;const ids=[w.piece.id+'/'+c.id,q.w.piece.id+'/'+q.c.id];if(ids.some(id=>occupied.has(id))){issue('occupied_connector',[w.piece.id,q.w.piece.id],'Un punto de conexión está ocupado por más de una pieza.');if(issueCount>=80)break portLoop;continue;}connections.push({a:w.piece.id,b:q.w.piece.id,connectorA:c.id,connectorB:q.c.id});graph.get(w.piece.id)!.add(q.w.piece.id);graph.get(q.w.piece.id)!.add(w.piece.id);for(const id of ids)occupied.set(id,1);}list.push({w,c});ports.set(k,list);}
 }
 for(const [id,n] of occupied)if(n>1)issue('occupied_connector',[id.split('/')[0]],'Un punto de conexión está ocupado por más de una pieza.');
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
 return {valid:issueCount===0,issueCount,issues,truncated:issueCount>=80,connections,checked:worlds.length,unsupported:pieces.length-worlds.length,limitation:'Encaje geométrico de los perfiles admitidos. No simula resistencia, fricción ni articulaciones; superficies curvas con envolvente conservadora. El informe se acota a 80 incidencias.'};
}
export function assertAssembly(pieces:Piece[]){const report=inspectAssembly(pieces);if(!report.valid){const e=report.issues[0];throw new Error(`Colocación rechazada: ${e.message} [${e.pieces.join(', ')}] (${report.issueCount} incidencias).`);}return report;}
export function worldConnections(pieces:Piece[],pieceId:string){const p=pieces.find(p=>p.id===pieceId);if(!p)throw new Error('Pieza de referencia desconocida.');if(!profile(p.part)||!validRotation(p))throw new Error('La pieza no tiene un perfil de encaje compatible.');const report=inspectAssembly(pieces),used=new Set(report.connections.flatMap(c=>[c.a+'/'+c.connectorA,c.b+'/'+c.connectorB]));return world(p).connectors.map(c=>({...c,occupied:used.has(p.id+'/'+c.id)}));}
export type ConnectionRequest={anchorId:string;anchorConnector:string;partConnector:string;rotation:Vec};
export function resolveConnection(pieces:Piece[],piece:Piece,request:ConnectionRequest):Piece{
 const anchor=pieces.find(p=>p.id===request.anchorId);if(!anchor||anchor.id===piece.id)throw new Error('Pieza de referencia inválida.');
 if(!profile(anchor.part)||!profile(piece.part)||!validRotation(anchor)||!validRotation({...piece,rotation:request.rotation}))throw new Error('Pieza o giro sin perfil de encaje.');
 const a=world(anchor).connectors.find(c=>c.id===request.anchorConnector),b=profile(piece.part)!.connectors.find(c=>c.id===request.partConnector);if(!a||!b||a.kind===b.kind)throw new Error('Conectores incompatibles.');if(dot(a.normal,rotate(b.normal,request.rotation))>-.999)throw new Error('Los conectores no están enfrentados con este giro.');
 return {...piece,rotation:request.rotation,position:minus(a.point,rotate(b.point,request.rotation))};
}
const rotations:Vec[]=[];const matrices=new Set<string>();for(const x of [0,90,180,270])for(const y of [0,90,180,270])for(const z of [0,90,180,270]){const r:Vec=[x,y,z],k=[[1,0,0],[0,1,0],[0,0,1]].flatMap(v=>rotate(v as Vec,r)).join(',');if(!matrices.has(k)){matrices.add(k);rotations.push(r);}}
export function placementOptions(pieces:Piece[],part:string,anchorId:string,anchorConnector?:string,offset=0,limit=12){
 if(!profile(part))throw new Error('Esta referencia aún no tiene perfil de encaje.');
 const ports=worldConnections(pieces,anchorId).filter(c=>!c.occupied&&(!anchorConnector||c.id===anchorConnector));
 if(!ports.length)return {options:[],nextOffset:null,examined:0};
 const def=profile(part)!,prototype:Piece={id:'placement-preview',part,color:4,position:[0,0,0],rotation:[0,0,0],step:1,group:''};
 while(pieces.some(p=>p.id===prototype.id))prototype.id+='x';
 // Paginate compatible alignments, never thousands of stud/stud or reversed pairs.
 const entryCache=new Map<string,{b:Connector;r:Vec}[]>();
 const choices=ports.map(a=>{const key=a.kind+':'+a.normal.join(',');let entries=entryCache.get(key);if(!entries){entries=def.connectors.flatMap(b=>a.kind===b.kind?[]:rotations.filter(r=>dot(a.normal,rotate(b.normal,r))<-.999).map(r=>({b,r})));entryCache.set(key,entries);}return {a,entries};});
 const total=choices.reduce((n,c)=>n+c.entries.length,0),options:any[]=[],seen=new Set<string>();let cursor=0,examined=0;
 outer:for(const {a,entries} of choices){if(cursor+entries.length<=offset){cursor+=entries.length;continue;}for(const {b,r} of entries){
  if(cursor++<offset)continue;
  const connection={anchorId,anchorConnector:a.id,partConnector:b.id,rotation:r},p=resolveConnection(pieces,prototype,connection),key=p.position.join(',')+'/'+r.join(',');
  if(!seen.has(key)){seen.add(key);examined++;if(inspectAssembly([...pieces,p]).valid)options.push({connection,position:p.position,rotation:p.rotation});}
  if(examined>=128||options.length>=Math.min(24,limit))break outer;
 }}
 return {options,nextOffset:cursor<total?cursor:null,examined};
}
export function groundPlacement(pieces:Piece[],part:string):Vec{
 const def=profile(part);if(!def)throw new Error('Esta referencia aún no tiene perfil de encaje.');
 const b=bounds(def.solids.flatMap(s=>s.vertices));const occupied=pieces.filter(p=>profile(p.part)&&validRotation(p)).map(p=>world(p).bounds);
 const edge=Math.max(0,...occupied.map(b=>b.max[0]));return [pieces.length?Math.ceil((edge-b.min[0]+20)/20)*20:0,-b.min[1],0];
}
