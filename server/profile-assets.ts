import {open} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {generatedEntry,cacheGeneratedAsset,evictGeneratedAsset,type GeneratedEntry} from '../lib/generated-profiles';
import type {Profile,Vec,Solid,Connector} from '../lib/base-profiles';
import {validAxialConnector} from '../lib/axial-fit';
import {validKeyedAxialConnector} from '../lib/keyed-axial-fit';
import {validTechnicPinConnector} from '../lib/technic-pin-fit';

import {validMinifigNeckConnector} from '../lib/minifig-neck-fit';
import {validMinifigHipConnector,validMinifigHipPair} from '../lib/minifig-hips-fit';
const MAX_ASSET=2*1024*1024,MAX_CACHE=128*1024*1024;
const cached=new Map<string,{bytes:number;pins:number}>();
const loading=new Map<string,Promise<void>>();
let cacheBytes=0;
const finiteVec=(value:unknown):value is Vec=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000);
function checkedProfile(value:any):Profile {
 if(!value||!((value.version===1&&value.source==='ldraw-shadow-envelope-v1')||(value.version===2&&value.source==='ldraw-axial-envelope-v1')||(value.version===3&&value.source==='ldraw-keyed-axial-envelope-v1')||(value.version===4&&value.source==='ldraw-standard-access-envelope-v1')||(value.version===5&&value.source==='ldraw-technic-pin-envelope-v1')||(value.version===6&&value.source==='ldraw-minifig-neck-envelope-v1')||(value.version===7&&value.source==='ldraw-minifig-hips-envelope-v1'))||!Array.isArray(value.solids)||!value.solids.length||value.solids.length>129||!Array.isArray(value.connectors)||!value.connectors.length||value.connectors.length>2000)throw new Error('Formato de perfil generado inválido.');
 for(const solid of value.solids as Solid[]){
  if(!solid||!Array.isArray(solid.vertices)||solid.vertices.length<4||solid.vertices.length>128||!Array.isArray(solid.normals)||!solid.normals.length||solid.normals.length>128||!Array.isArray(solid.edges)||!solid.edges.length||solid.edges.length>128||![...solid.vertices,...solid.normals,...solid.edges].every(finiteVec))throw new Error('Envolvente de colisión inválida.');
 }
 const ids=new Set<string>();
 for(const c of value.connectors as Connector[]){
  if(!c||typeof c.id!=='string'||c.id.length>160||ids.has(c.id)||!finiteVec(c.point)||!finiteVec(c.normal)||c.normal.filter(n=>Math.abs(n)===1).length!==1||c.normal.filter(n=>n!==0).length!==1)throw new Error('Conector generado inválido.');
  const valid=value.version===1||value.version===4?['stud','socket'].includes(c.kind):value.version===2?validAxialConnector(c):value.version===3?validKeyedAxialConnector(c):['stud','socket'].includes(c.kind)||validAxialConnector(c)||validKeyedAxialConnector(c)||validTechnicPinConnector(c)||(value.version>=6&&validMinifigNeckConnector(c))||(value.version===7&&validMinifigHipConnector(c));
  if(!valid)throw new Error('Familia de conector generado inválida.');
  ids.add(c.id);
 }
 if(value.version===5&&!value.connectors.some(validTechnicPinConnector))throw new Error('El perfil Technic no contiene una conexión de pin validada.');
 if(value.version===6&&!value.connectors.some(validMinifigNeckConnector))throw new Error('El perfil de minifigura no contiene un cuello validado.');
 if(value.version===7&&!validMinifigHipPair(value.connectors))throw new Error('El perfil de minifigura no contiene una cintura validada.');
 return {source:value.source,family:value.version===7?'generated-minifig-hips':value.version===6?'generated-minifig-neck':value.version===5?'generated-technic-pin':value.version===4?'generated-standard-access':value.version===3?'generated-axial-a6':value.version===2?'generated-axial-r4':'generated-conservative',solids:value.solids,connectors:value.connectors};
}
function reserve(bytes:number){
 if(bytes>MAX_CACHE)throw new Error('El perfil supera el límite de memoria.');
 for(const [hash,item] of cached){
  if(cacheBytes+bytes<=MAX_CACHE)break;
  if(item.pins)continue;
  cached.delete(hash);evictGeneratedAsset(hash);cacheBytes-=item.bytes;
 }
 if(cacheBytes+bytes>MAX_CACHE)throw new Error('El conjunto de perfiles supera el presupuesto de memoria. Reduce la variedad de piezas de la operación.');
}
async function load(assetRoot:string,entry:GeneratedEntry){
 if(!/^[a-f0-9]{64}$/.test(entry.asset)||!Number.isInteger(entry.bytes)||entry.bytes<1||entry.bytes>MAX_ASSET||!Number.isInteger(entry.expandedBytes)||entry.expandedBytes<1||entry.expandedBytes>MAX_ASSET)throw new Error('Índice de perfiles inválido.');
 const file=await open(resolve(assetRoot,entry.asset+'.bin'),'r');
 let bytes:Buffer;
 try{
  if((await file.stat()).size!==entry.bytes)throw new Error('Tamaño del archivo de colisión inesperado.');
  bytes=Buffer.alloc(entry.bytes);let offset=0;
  while(offset<bytes.length){const result=await file.read(bytes,offset,bytes.length-offset,offset);if(!result.bytesRead)throw new Error('Archivo de colisión incompleto.');offset+=result.bytesRead;}
 }finally{await file.close();}
 if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.asset)throw new Error('El archivo de colisión está dañado. Reinstala el catálogo.');
 const expanded=gunzipSync(bytes,{maxOutputLength:MAX_ASSET});
 if(expanded.length!==entry.expandedBytes)throw new Error('Tamaño del perfil inesperado.');
 const profile=checkedProfile(JSON.parse(expanded.toString('utf8')));
 if(profile.connectors.length!==entry.connectorCount)throw new Error('El índice de conexiones no coincide con el perfil.');
 // Account for JS arrays and object overhead, not only compressed storage.
 const charged=expanded.length*4;
 reserve(charged);cacheGeneratedAsset(entry.asset,profile);
 cached.set(entry.asset,{bytes:charged,pins:0});cacheBytes+=charged;
}
// The lease spans all awaits in one service operation. Concurrent requests may
// share assets, but neither can evict geometry still used by another request.
export async function prepareProfileAssets(parts:Iterable<string>,assetRoot:string):Promise<()=>void>{
 const pinned:string[]=[];
 const release=()=>{for(const hash of pinned){const item=cached.get(hash);if(item)item.pins--;}pinned.length=0;};
 try{
  const entries=new Map<string,GeneratedEntry>();
  for(const part of parts){const e=generatedEntry(part);if(e)entries.set(e.asset,e);}
  for(const [hash,entry] of entries){
   if(!cached.has(hash)){
    if(!loading.has(hash)){const pending=load(assetRoot,entry).finally(()=>loading.delete(hash));loading.set(hash,pending);}
    await loading.get(hash);
   }
   const item=cached.get(hash);
   if(!item)throw new Error('No se pudo conservar el perfil durante la validación.');
   item.pins++;pinned.push(hash);cached.delete(hash);cached.set(hash,item);
  }
  return release;
 }catch(error){release();throw error;}
}
