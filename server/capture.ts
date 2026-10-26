import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {inflateSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {CAPTURE_VIEWS,CAPTURE_DEFAULT_WIDTH,CAPTURE_DEFAULT_HEIGHT,CAPTURE_MIN_SIZE,CAPTURE_MAX_SIZE,CAPTURE_MAX_PNG_BYTES,CAPTURE_DEADLINE_MS,type CaptureOptions,type CaptureJob} from '../lib/capture';
import type {Model} from '../lib/model';

export class CaptureError extends Error{constructor(message:string,public status=400){super(message);}}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function captureOptions(input:unknown):CaptureOptions{
 if(!record(input)||Object.keys(input).some(key=>!['modelId','view','width','height','expectedRevision'].includes(key)))throw new CaptureError('Argumentos de captura inválidos.');
 if(typeof input.modelId!=='string'||!input.modelId.length||input.modelId.length>128)throw new CaptureError('Falta un modelId válido.');
 const view=input.view===undefined?'isometric':input.view,width=input.width===undefined?CAPTURE_DEFAULT_WIDTH:input.width,height=input.height===undefined?CAPTURE_DEFAULT_HEIGHT:input.height;
 if(typeof view!=='string'||!CAPTURE_VIEWS.includes(view as CaptureOptions['view']))throw new CaptureError('Vista de captura inválida. Usa isometric, front, back, left, right o top.');
 for(const size of [width,height])if(typeof size!=='number'||!Number.isInteger(size)||size<CAPTURE_MIN_SIZE||size>CAPTURE_MAX_SIZE)throw new CaptureError('Las dimensiones de captura deben ser enteros entre 256 y 1024.');
 if(input.expectedRevision!==undefined&&(typeof input.expectedRevision!=='number'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1))throw new CaptureError('expectedRevision debe ser un entero positivo.');
 return {modelId:input.modelId,view:view as CaptureOptions['view'],width:width as number,height:height as number,...input.expectedRevision===undefined?{}:{expectedRevision:input.expectedRevision as number}};
}

const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
/** Accept only bounded, complete browser PNGs, not an arbitrary base64 payload. */
export function validateCapturePng(data:unknown,width:number,height:number):string{
 if(typeof data!=='string'||!data.length||data.length>4*Math.ceil(CAPTURE_MAX_PNG_BYTES/3)||data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw new CaptureError('La captura debe contener un PNG base64 válido de hasta 1 MiB.');
 const png=Buffer.from(data,'base64');
 if(png.length>CAPTURE_MAX_PNG_BYTES||png.toString('base64')!==data||png.length<57||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new CaptureError('La captura no es un PNG válido de hasta 1 MiB.');
 let offset=8,channels=0,ended=false,seenData=false,dataEnded=false;
 const compressed:Buffer[]=[];
 while(offset<png.length){
  if(offset+12>png.length)throw new CaptureError('PNG incompleto.');
  const length=png.readUInt32BE(offset),end=offset+12+length;
  if(end>png.length)throw new CaptureError('PNG incompleto.');
  const kind=png.toString('ascii',offset+4,offset+8),chunk=png.subarray(offset+8,end-4);
  if(crc32(png.subarray(offset+4,end-4))!==png.readUInt32BE(end-4))throw new CaptureError('PNG dañado.');
  if(offset===8){
   if(kind!=='IHDR'||length!==13||chunk.readUInt32BE(0)!==width||chunk.readUInt32BE(4)!==height)throw new CaptureError('Las dimensiones del PNG no coinciden con la captura solicitada.');
   if(chunk[8]!==8||![2,6].includes(chunk[9])||chunk[10]!==0||chunk[11]!==0||chunk[12]!==0)throw new CaptureError('Se requiere PNG RGB/RGBA de 8 bits sin entrelazado.');
   channels=chunk[9]===6?4:3;
  }else if(kind==='IHDR')throw new CaptureError('PNG con cabecera duplicada.');
  else if(kind==='IDAT'){
   if(dataEnded)throw new CaptureError('PNG con datos desordenados.');
   compressed.push(chunk);seenData=true;
  }else if(kind==='IEND'){
   if(length||!seenData||end!==png.length)throw new CaptureError('PNG incompleto o con datos adicionales.');
   ended=true;
  }else{
   if(!/^[A-Za-z]{4}$/.test(kind)||(!(kind.charCodeAt(0)&32)&&kind!=='PLTE'))throw new CaptureError('PNG con bloque no permitido.');
   if(seenData)dataEnded=true;
  }
  offset=end;
 }
 if(!ended||!channels)throw new CaptureError('PNG incompleto.');
 const row=width*channels+1,expected=row*height;
 let pixels:Buffer;
 try{pixels=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected});}catch{throw new CaptureError('PNG con datos de imagen inválidos.');}
 if(pixels.length!==expected)throw new CaptureError('PNG con tamaño de imagen inválido.');
 for(let y=0;y<height;y++)if(pixels[y*row]>4)throw new CaptureError('PNG con filtro inválido.');
 return data;
}

type CaptureRow={id:string;owner:string;model:string;view:CaptureOptions['view'];width:number;height:number;expires_at:number;state:string;lease_token:string|null;data:string|null;error:string|null};
export class CaptureBroker{
 private readonly sqlite:DatabaseSync;
 private readonly sweep:ReturnType<typeof setInterval>;
 private closed=false;
 constructor(path:string,private readonly options:{deadlineMs?:number;pollMs?:number;now?:()=>number}={}){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
  this.sqlite=new DatabaseSync(path);
  // A separate transient DB is shared by HTTP and stdio, never included in model backups.
  // DELETE journalling and secure_delete avoid retaining consumed image payloads in a WAL.
  this.sqlite.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,owner TEXT NOT NULL,model TEXT NOT NULL,view TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL,lease_token TEXT,data TEXT,error TEXT);
   CREATE INDEX IF NOT EXISTS captures_owner ON captures(owner,created_at);`);
  this.sweep=setInterval(()=>{try{this.expire();}catch{/* Another process may briefly hold the SQLite lock. */}},5000);this.sweep.unref();
 }
 private now(){return this.options.now?.()??Date.now();}
 private expire(){this.sqlite.prepare('DELETE FROM captures WHERE expires_at<=?').run(this.now());}
 private transaction<T>(work:()=>T):T{
  this.sqlite.exec('BEGIN IMMEDIATE');
  try{const result=work();this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}
 }
 enqueue(user:string,model:Model,options:CaptureOptions){
  if(!user)throw new CaptureError('Inicia sesión para capturar modelos.',401);
  if(model.id!==options.modelId)throw new CaptureError('Modelo de captura incorrecto.');
  if(options.expectedRevision!==undefined&&options.expectedRevision!==model.revision)throw new CaptureError('El modelo ha cambiado. Vuelve a leerlo antes de capturar.',409);
  if(!model.pieces.length)throw new CaptureError('El modelo no contiene piezas que capturar.');
  return this.transaction(()=>{
   this.expire();
   const count=this.sqlite.prepare('SELECT COUNT(*) AS count FROM captures WHERE owner=?').get(user) as {count:number};
   if(count.count>=4)throw new CaptureError('Hay cuatro capturas pendientes. Espera a que terminen antes de solicitar otra.',429);
   const id=randomUUID(),createdAt=this.now(),expiresAt=createdAt+(this.options.deadlineMs??CAPTURE_DEADLINE_MS);
   this.sqlite.prepare('INSERT INTO captures(id,owner,model,view,width,height,created_at,expires_at,state) VALUES(?,?,?,?,?,?,?,?,?)').run(id,user,JSON.stringify(model),options.view,options.width,options.height,createdAt,expiresAt,'queued');
   return {id,expiresAt};
  });
 }
 claim(user:string):CaptureJob|null{
  return this.transaction(()=>{
   this.expire();
   const row=this.sqlite.prepare("SELECT * FROM captures WHERE owner=? AND state='queued' ORDER BY created_at,id LIMIT 1").get(user) as CaptureRow|undefined;
   if(!row)return null;
   const leaseToken=randomBytes(32).toString('hex');
   this.sqlite.prepare("UPDATE captures SET state='leased',lease_token=? WHERE id=? AND owner=? AND state='queued'").run(leaseToken,row.id,user);
   return {id:row.id,leaseToken,model:JSON.parse(row.model) as Model,view:row.view,width:row.width,height:row.height,expiresAt:row.expires_at};
  });
 }
 complete(user:string,input:unknown){
  if(!record(input)||Object.keys(input).some(key=>!['id','leaseToken','data','error'].includes(key))||typeof input.id!=='string'||input.id.length>128||typeof input.leaseToken!=='string'||!/^[a-f0-9]{64}$/.test(input.leaseToken)||(typeof input.data==='string')===(typeof input.error==='string')||input.data!==undefined&&typeof input.data!=='string'||input.error!==undefined&&typeof input.error!=='string')throw new CaptureError('Resultado de captura inválido.');
  this.expire();
  const row=this.sqlite.prepare("SELECT * FROM captures WHERE id=? AND owner=? AND lease_token=? AND state='leased'").get(input.id,user,input.leaseToken) as CaptureRow|undefined;
  if(!row)throw new CaptureError('La captura no existe, ha caducado o ya se ha entregado.',409);
  let data:string|null=null,error:string|null=null;
  if(typeof input.data==='string')data=validateCapturePng(input.data,row.width,row.height);
  else{
   if(typeof input.error!=='string'||!input.error.trim()||input.error.length>300)throw new CaptureError('El error de captura debe contener entre 1 y 300 caracteres.');
   error=input.error.trim().replace(/[\x00-\x1f\x7f]/g,' ');
  }
  const result=this.sqlite.prepare("UPDATE captures SET state=?,data=?,error=? WHERE id=? AND owner=? AND lease_token=? AND state='leased' AND expires_at>?").run(error?'failed':'complete',data,error,input.id,user,input.leaseToken,this.now());
  if(!result.changes)throw new CaptureError('La captura ha caducado o ya se ha entregado.',409);
 }
 async waitForResult(id:string,user:string,signal?:AbortSignal):Promise<string>{
  let claimed=false;
  try{
   for(;;){
    if(signal?.aborted)throw new CaptureError('Captura cancelada.',499);
    if(this.closed)throw new CaptureError('El servicio de capturas se ha cerrado.',503);
    const row=this.sqlite.prepare('SELECT * FROM captures WHERE id=? AND owner=?').get(id,user) as CaptureRow|undefined;
    if(!row||row.expires_at<=this.now())throw new CaptureError(claimed?'La captura ha agotado el plazo de 30 segundos. Comprueba que Brickforge siga abierto y vuelve a intentarlo.':'No se ha recibido una imagen. Abre Brickforge en el mismo espacio de trabajo y mantén la aplicación o el editor web abierto para renderizar la captura.',504);
    if(row.state!=='queued')claimed=true;
    if(row.state==='complete'||row.state==='failed'){
     const consumed=this.sqlite.prepare("DELETE FROM captures WHERE id=? AND owner=? AND state IN ('complete','failed') RETURNING data,error").get(id,user) as {data:string|null;error:string|null}|undefined;
     if(!consumed)throw new CaptureError('La captura ya ha sido consumida.',409);
     if(consumed.error)throw new CaptureError('No se ha podido renderizar el modelo: '+consumed.error,422);
     return consumed.data!;
    }
    try{await delay(this.options.pollMs??150,undefined,{signal});}catch{throw new CaptureError('Captura cancelada.',499);}
   }
  }finally{if(!this.closed)this.sqlite.prepare('DELETE FROM captures WHERE id=? AND owner=?').run(id,user);}
 }
 close(){if(!this.closed){this.closed=true;clearInterval(this.sweep);this.sqlite.close();}}
}

let sharedBroker:CaptureBroker|undefined;
export function captureBroker(databasePath:string){return sharedBroker??=new CaptureBroker(databasePath+'.captures.sqlite');}
export function closeCaptureBroker(){sharedBroker?.close();sharedBroker=undefined;}
