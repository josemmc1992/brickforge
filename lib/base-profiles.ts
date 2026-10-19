// Hand-reviewed mechanical families. Coordinates are LDraw LDU with Y inverted.
// Only the listed references are enabled: a description is not evidence of sockets.
import catalog from './catalog-data.json';
import type {MechanicalConnector} from './mechanical-fit';
import type {MinifigHipConnector} from './minifig-hips-fit';
import type {MinifigNeckConnector} from './minifig-neck-fit';
import type {TechnicPinConnector} from './technic-pin-fit';

export type Vec=[number,number,number];
export type Connector={id:string;kind:'stud'|'socket';point:Vec;normal:Vec}|MechanicalConnector|TechnicPinConnector|MinifigNeckConnector|MinifigHipConnector;
export type Solid={vertices:Vec[];normals:Vec[];edges:Vec[]};
export type Profile={source:string;solids:Solid[];connectors:Connector[];family?:string;basePart?:string};

const minus=(a:Vec,b:Vec):Vec=>a.map((v,i)=>v-b[i]) as Vec;
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function prism(poly:[number,number][],lo:number,hi:number,axis:0|2=2):Solid{
 const vertex=(a:number,b:number,c:number):Vec=>axis===2?[a,b,c]:[c,b,a];
 const vertices=[...poly.map(([a,b])=>vertex(a,b,lo)),...poly.map(([a,b])=>vertex(a,b,hi))];
 const edges=poly.map(([a,b],i)=>{const q=poly[(i+1)%poly.length];return vertex(q[0]-a,q[1]-b,0)});
 const depth=vertex(0,0,1);return {vertices,normals:[depth,...edges.map(e=>cross(e,depth))],edges:[depth,...edges]};
}
export function box(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number){return prism([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],z0,z1);}
function grid(w:number,d:number,y:number,kind:'stud'|'socket',zOffset=0):Connector[]{
 const out:Connector[]=[];for(let x=-w/2+10;x<w/2;x+=20)for(let z=-d/2+10;z<d/2;z+=20)out.push({id:`${kind}:${x}:${z+zOffset}:${y}`,kind,point:[x,y,z+zOffset],normal:[0,kind==='stud'?1:-1,0]});return out;
}
function rectangular(w:number,d:number,h:number,studs=true):Profile{return {source:'rectangular-v1',family:studs?'rectangular':'tile',solids:[box(-w/2,w/2,-h,0,-d/2,d/2)],connectors:[...(studs?grid(w,d,0,'stud'):[]),...grid(w,d,-h,'socket')]};}
function round(radius:number,height:number,topRadius=radius):Solid{
 // Circumscribed polygon: conservative at the curved boundary, never fits inside it.
 const n=16,f=1/Math.cos(Math.PI/n),vertices:Vec[]=[];
 for(const [r,y] of [[radius,-height],[topRadius,0]])for(let i=0;i<n;i++){const a=(i+.5)*2*Math.PI/n;vertices.push([r*f*Math.cos(a),y,r*f*Math.sin(a)]);}
 const edges:Vec[]=[[0,1,0]],normals:Vec[]=[[0,1,0]];
 for(let i=0;i<n;i++){const j=(i+1)%n,e=minus(vertices[j],vertices[i]),v=minus(vertices[i+n],vertices[i]);edges.push(e,v);normals.push(cross(e,v));}
 return {vertices,normals,edges};
}

// Reviewed against these official DAT files and their s/*s01 subfiles in the
// bundled LDraw complete library. Outer box dimensions and underside walls/tubes
// determine the envelope and standard 20-LDU socket grid. Hollow studs remain
// ordinary studs here; axle/bar insertion and the hollow interior are not enabled.
const tallRectangles:Record<string,[number,number,number]>={
 '14716':[20,20,72], '2453a':[20,20,120], '2453b':[20,20,120],
 '2454a':[40,20,120], '2454b':[40,20,120],
 '3245a':[40,20,48], '3245b':[40,20,48], '3245c':[40,20,48],
 '22886':[40,20,72], '3754':[120,20,120],
 '3755a':[60,20,120], '3755b':[60,20,120],
 '30144':[80,40,72], '30145':[40,40,72], '6213':[120,40,72],
 '49311':[80,20,72], '86996':[20,20,16],
};
// Each DAT has a slope quad from (x,20,zFront) to (x,0,-10), a rear
// wall at z=10, bottom y=24 and a rear stud row at z=0. Width
// and zFront are explicit from those vertices, not the angle in the name.
// This retains the original 3037/3039 connector identifiers and origins.
const slopes:Record<string,[number,number]>={
 '3037':[80,-30], '3038':[60,-30], '3039':[40,-30], '3040b':[20,-30],
 '4445':[160,-30], '23949':[120,-30],
 '3297':[80,-50], '3298':[40,-50], '3939':[120,-50], '4161':[60,-50], '4286':[20,-50],
 '30363':[40,-70], '60477':[20,-70],
};
// DAT outlines preserve their asymmetric origins. 2357/2420/14719:
// x,z=-10..30 with the +X,+Z cell absent; 77844 extends the arms to 50.
// 2639: x,z=-20..60, two-stud-wide arms. The concavity must remain empty.
const corners:Record<string,[number,number,number,boolean]>={
 '2357':[1,2,24,true], '2420':[1,2,8,true], '14719':[1,2,8,false],
 '77844':[1,3,8,true], '2639':[2,4,8,true],
};
function corner(arm:number,length:number,h:number,studs:boolean):Profile{
 const lo=-arm*10,elbow=arm*10,hi=length*20-arm*10;
 const points:[number,number][]=[];
 for(let x=lo+10;x<hi;x+=20)for(let z=lo+10;z<hi;z+=20)if(x<elbow||z<elbow)points.push([x,z]);
 const connectors=(kind:'stud'|'socket',y:number):Connector[]=>points.map(([x,z])=>({id:`${kind}:${x}:${z}:${y}`,kind,point:[x,y,z],normal:[0,kind==='stud'?1:-1,0]}));
 return {source:'ldraw-reviewed-corner-v1',family:studs?'corner':'corner-tile',solids:[box(lo,hi,-h,0,lo,elbow),box(lo,elbow,-h,0,elbow,hi)],connectors:[...(studs?connectors('stud',0):[]),...connectors('socket',-h)]};
}
// 3794a/b and 15573 DAT: stud2 at origin, body ±20 x ±10, bottom y=8.
// 87580 DAT is 3068b + stud2 at origin. Only normal grid sockets are
// offered; the extra centred underside fit of newer moulds is not inferred.
const jumpers:Record<string,[number,number]>={'3794a':[40,20],'3794b':[40,20],'15573':[40,20],'87580':[40,40]};
// DAT stud2a transforms identify the face centres/normals. These studs are
// on the outer wall (±10), unlike the recessed front of headlight 4070 (-6).
const sideStuds:Record<string,('front'|'back'|'left'|'right')[]>={
 '87087':['front'], '47905':['front','back'],
 '26604':['front','right'], '4733':['front','back','left','right'],
};
const sidePorts:Record<string,{point:Vec;normal:Vec}>={front:{point:[0,-10,-10],normal:[0,0,-1]},back:{point:[0,-10,10],normal:[0,0,1]},left:{point:[-10,-10,0],normal:[-1,0,0]},right:{point:[10,-10,0],normal:[1,0,0]}};

const profiles=new Map<string,Profile|null>();
const sourceParts=new Map(catalog.map(p=>[p.id,p]));
export function baseProfile(part:string):Profile|null{
 if(profiles.has(part))return profiles.get(part)!;
 const p=sourceParts.get(part);let result:Profile|null=null;
 // Original, restricted metadata whitelist retained for backward compatibility.
 if(p?.basic){const {width:w,depth:d,height:h}=p.basic;result=rectangular(w,d,h);}
 const tile=p?.name.match(/^Tile\s+(\d+)\s+x\s+(\d+)(?: with Groove| without Groove)?$/);
 if(tile)result=rectangular(+tile[2]*20,+tile[1]*20,8,false);
 if(tallRectangles[part])result={...rectangular(...tallRectangles[part]),source:'ldraw-reviewed-tall-rectangle-v1',family:'tall-rectangle'};
 if(slopes[part]){
  const [w,front]=slopes[part],depth=10-front;
  result={source:'ldraw-reviewed-slope-v1',family:'slope',solids:[prism([[front,-24],[10,-24],[10,0],[-10,0],[front,-20]],-w/2,w/2,0)],connectors:[...grid(w,20,0,'stud'),...grid(w,depth,-24,'socket',(10+front)/2)]};
  // 3939 is not a wider 3298: s/3939s01 has just two end studs and
  // two one-stud-wide underside channels. Its middle has no clutch grid.
  if(part==='3939')result.connectors=result.connectors.filter(c=>Math.abs(c.point[0])===50);
 }
 if(corners[part]){
  result=corner(...corners[part]);
  // 2639's inner diagonal rib reaches (13,15)/(15,13), slightly inside
  // the ideal rigid 6-LDU stud radius at (10,10). Keep that bottom socket
  // disabled until clutch/tolerance support exists; the top stud is real.
  if(part==='2639')result.connectors=result.connectors.filter(c=>c.id!=='socket:10:10:-8');
 }
 if(jumpers[part]){
  const [w,d]=jumpers[part];result={...rectangular(w,d,8,false),source:'ldraw-reviewed-jumper-v1',family:'jumper'};
  result.connectors.unshift(...grid(20,20,0,'stud'));
 }
 if(sideStuds[part]){
  result={...rectangular(20,20,24),source:'ldraw-reviewed-side-stud-v1',family:'side-stud'};
  for(const side of sideStuds[part])result.connectors.push({id:`stud:${side}`,kind:'stud',...sidePorts[side]});
 }
 if(['3659','3307'].includes(part)){
  const small=part==='3659',w=small?80:120,h=small?24:48,r=small?20:40,cy=small?28:48,ry=small?20:36;
  const solids=[box(-w/2,-r,-h,0,-10,10),box(r,w/2,-h,0,-10,10)];
  const n=small?8:24;
  for(let i=0;i<n;i++){const a=-Math.PI/2+i*Math.PI/n,b=-Math.PI/2+(i+1)*Math.PI/n,x0=r*Math.sin(a),x1=r*Math.sin(b),y0=Math.max(-h,-cy+ry*Math.cos(a)),y1=Math.max(-h,-cy+ry*Math.cos(b));solids.push(prism([[x0,y0],[x1,y1],[x1,0],[x0,0]],-10,10));}
  result={source:'ldraw-reviewed-arch-v1',family:'arch',solids,connectors:[...grid(w,20,0,'stud'),...grid(w,20,-h,'socket').filter(c=>Math.abs(c.point[0])>r)]};
 }
 const rounds:Record<string,[number,number,number,number,boolean]>={
  '6141':[10,8,10,20,true],'3062b':[10,24,10,20,true],'98138':[10,8,10,20,false],
  '3941':[20,24,20,40,true],'6143':[20,24,20,40,true],
  '4589':[10,24,5,20,true],'3942c':[20,48,10,40,true],'98100':[20,24,10,40,true],
 };
 if(rounds[part]){const [r,h,top,w,studs]=rounds[part],isCone=top!==r;result={source:'reviewed-round-envelope-v1',family:isCone?'cone':'round',solids:[round(r,h,top)],connectors:[...(studs?grid(isCone?20:w,isCone?20:w,0,'stud'):[]),...grid(w,w,-h,'socket')]};}
 if(part==='4070'){
  result={source:'ldraw-reviewed-headlight-v1',family:'side-stud',solids:[box(-10,10,-24,-20,-10,10),box(-10,10,-20,0,-6,10)],connectors:[...grid(20,20,0,'stud'),...grid(20,20,-24,'socket'),{id:'stud:front',kind:'stud',point:[0,-10,-6],normal:[0,0,-1]}]};
 }
 profiles.set(part,result);return result;
}
export const basePartIds=catalog.filter(p=>baseProfile(p.id)).map(p=>p.id);
