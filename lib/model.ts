import catalog from './catalog-data.json';
import {spatialSweep} from './spatial';
import {MAX_MODEL_PIECES} from './limits';
export type Piece={id:string;part:string;color:number;position:[number,number,number];rotation:[number,number,number];step:number;group:string};
export type Model={id:string;name:string;revision:number;pieces:Piece[];updatedAt:string};
export const parts=catalog;
export const partMap=new Map(parts.map(p=>[p.id,p]));
export const colors=[{id:4,name:'Rojo',hex:'#C91A09'},{id:14,name:'Amarillo',hex:'#F2CD37'},{id:1,name:'Azul',hex:'#0055BF'},{id:2,name:'Verde',hex:'#237841'},{id:0,name:'Negro',hex:'#05131D'},{id:15,name:'Blanco',hex:'#FFFFFF'},{id:71,name:'Gris claro',hex:'#A0A5A9'},{id:72,name:'Gris oscuro',hex:'#6C6E68'},{id:19,name:'Arena',hex:'#E4CD9E'},{id:25,name:'Naranja',hex:'#FE8A18'},{id:322,name:'Azur',hex:'#68BCC5'},{id:13,name:'Rosa',hex:'#FC97AC'}];
export function validatePieces(input:unknown):Piece[]{
 if(!Array.isArray(input)||input.length>MAX_MODEL_PIECES)throw new Error(`El modelo admite hasta ${MAX_MODEL_PIECES.toLocaleString('es')} piezas.`);const ids=new Set<string>();
 return input.map((p:any)=>{if(!p||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id)||ids.has(p.id))throw new Error('Cada pieza necesita un ID único.');ids.add(p.id);
 if(!partMap.has(p.part))throw new Error('Referencia desconocida: '+p.part);if(!colors.some(c=>c.id===p.color))throw new Error('Color no disponible. Consulta list_colors.');
 for(const key of ['position','rotation'])if(!Array.isArray(p[key])||p[key].length!==3||p[key].some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000))throw new Error('position y rotation necesitan tres números finitos.');
 if(!Number.isInteger(p.step)||p.step<1||p.step>10000)throw new Error('Paso inválido.');if(typeof p.group!=='string'||p.group.length>80)throw new Error('Grupo inválido.');
 return {id:p.id,part:p.part,color:p.color,position:p.position,rotation:p.rotation,step:p.step,group:p.group};});
}
export function robot():Piece[]{const out:Piece[]=[];let n=0;const add=(part:string,color:number,x:number,y:number,z:number,step:number,group:string,ry=0)=>out.push({id:'robot-'+(++n),part,color,position:[x,y,z],rotation:[0,ry,0],step,group});
 for(const x of [-30,30]){add('3003',0,x+Math.sign(x)*10,24,0,1,'Pies');add('3004',71,x,48,0,2,'Piernas',90);add('3004',71,x,72,0,3,'Piernas',90);}add('3001',1,0,96,0,4,'Torso');add('3001',1,0,120,0,5,'Torso');add('3007',1,0,144,0,6,'Hombros');
 for(const x of [-60,60]){add('3003',71,x,120,0,7,'Brazos');add('3003',71,x,96,0,7,'Brazos');add('3003',0,x,72,0,8,'Manos');}add('3003',71,0,168,0,9,'Cuello');add('3001',14,0,192,0,10,'Cabeza');add('3010',14,0,216,-10,11,'Cabeza');add('3004',14,0,216,10,11,'Cabeza');for(const x of [-30,30])add('3005',0,x,216,10,11,'Ojos');add('3001',14,0,240,0,12,'Cabeza');add('3005',71,-10,264,-10,13,'Antena');add('3005',4,-10,288,-10,14,'Antena');return out;}
export function snapAbove(anchor:Piece,partId:string,offsetX=0,offsetZ=0){const a=partMap.get(anchor.part)?.basic,b=partMap.get(partId)?.basic;if(!a||!b||anchor.rotation.some(v=>Math.abs(v%360)>.001))throw new Error('Encaje disponible para ladrillos/placas rectangulares sin rotación.');const onGrid=(v:number)=>Math.abs(v/20-Math.round(v/20))<.001;if(!onGrid(offsetX+(a.width-b.width)/2)||!onGrid(offsetZ+(a.depth-b.depth)/2))throw new Error('El desplazamiento no alinea los studs.');if(Math.abs(offsetX)>=(a.width+b.width)/2||Math.abs(offsetZ)>=(a.depth+b.depth)/2)throw new Error('No hay apoyo sobre la pieza de referencia.');return [anchor.position[0]+offsetX,anchor.position[1]+b.height,anchor.position[2]+offsetZ] as [number,number,number];}
export function analyze(pieces:Piece[]){
 const checks=pieces.filter(p=>partMap.get(p.part)?.basic&&p.rotation.every(v=>Math.abs(v%360)<.001));
 const dimensions=checks.map(p=>partMap.get(p.part)!.basic!);
 const bounds=checks.map((p,i)=>{const d=dimensions[i],[x,y,z]=p.position;return {min:[x-d.width/2,y-d.height,z-d.depth/2] as [number,number,number],max:[x+d.width/2,y,z+d.depth/2] as [number,number,number]};});
 const firstPairs:[number,number][]=[];let overlapCount=0;
 const order=(a:[number,number],b:[number,number])=>a[0]-b[0]||a[1]-b[1];
 for(const [i,j] of spatialSweep(bounds).pairs()){
  const a=checks[i],b=checks[j],da=dimensions[i],db=dimensions[j];
  if(Math.abs(a.position[0]-b.position[0])<(da.width+db.width)/2-.01&&Math.abs(a.position[2]-b.position[2])<(da.depth+db.depth)/2-.01&&Math.max(a.position[1]-da.height,b.position[1]-db.height)<Math.min(a.position[1],b.position[1])-.01){
   overlapCount++;
   // Keep the previous API's first 100 input-ordered pairs without retaining
   // every overlap or depending on which axis the broad phase selected.
   const pair:[number,number]=[i,j];
   if(firstPairs.length<100||order(pair,firstPairs[firstPairs.length-1])<0){
    let at=firstPairs.length;while(at>0&&order(pair,firstPairs[at-1])<0)at--;
    firstPairs.splice(at,0,pair);if(firstPairs.length>100)firstPairs.pop();
   }
  }
 }
 const overlaps=firstPairs.map(([i,j])=>[checks[i].id,checks[j].id]),bom=new Map<string,any>();
 for(const p of pieces){const k=p.part+':'+p.color,r=bom.get(k)||{part:p.part,name:partMap.get(p.part)!.name,color:p.color,quantity:0};r.quantity++;bom.set(k,r);}
 return {pieceCount:pieces.length,checkedForOverlap:checks.length,unchecked:pieces.length-checks.length,overlapCount,overlaps,truncated:overlapCount>overlaps.length,billOfMaterials:[...bom.values()],limitation:'Comprueba volúmenes de ladrillos/placas sin rotación. No certifica estabilidad, encaje de piezas especiales ni disponibilidad de colores.'};
}
export function exportLdr(model:Model){const lines=['0 '+model.name.replace(/[\r\n]/g,' '),'0 Name: '+model.id+'.ldr','0 Author: Brickforge user'];let step=1;for(const p of [...model.pieces].sort((a,b)=>a.step-b.step)){while(step<p.step){lines.push('0 STEP');step++;}const [x,y,z]=p.rotation.map(v=>v*Math.PI/180),a=Math.cos(x),b=Math.sin(x),c=Math.cos(y),d=Math.sin(y),e=Math.cos(z),f=Math.sin(z);const m=[c*e,-c*f,d,a*f+b*e*d,a*e-b*f*d,-b*c,b*f-a*e*d,b*e+a*f*d,a*c],flip=[1,-1,1];const values=m.map((v,i)=>Math.round(v*flip[Math.floor(i/3)]*flip[i%3]*1e6)/1e6);lines.push(`1 ${p.color} ${p.position[0]} ${-p.position[1]} ${p.position[2]} ${values.join(' ')} ${p.part}.dat`);}return lines.join('\n')+'\n';}
