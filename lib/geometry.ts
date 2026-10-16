import index from './geometry-index.json';
const entries:Record<string,number>=index;
const packs=new Map<number,Record<string,string>>();
const inFlight=new Map<number,Promise<Record<string,string>>>();
let active=0;
const waiting:Array<()=>void>=[];
async function acquire(){if(active<4){active++;return;}await new Promise<void>(resolve=>waiting.push(resolve));}
function release(){const next=waiting.shift();if(next)next();else active--;}
export function geometryLocation(file:string){
 const name=file.replaceAll('\\','/').toLowerCase();
 const key=['parts/'+name,'p/'+name,'models/'+name,name].find(k=>Object.hasOwn(entries,k));
 if(!key)throw new Error('Geometría desconocida: '+name);
 return {url:`/catalog/geometry/${entries[key]}.bin`,key};
}
export async function loadGeometry(file:string){
 const {url,key}=geometryLocation(file),id=entries[key];
 let pack=packs.get(id);
 if(pack){packs.delete(id);packs.set(id,pack);}
 else {
  if(!inFlight.has(id)){
   const promise=(async()=>{await acquire();try{
    const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok||!response.body)throw new Error('No se pudo cargar la biblioteca.');
    const data=JSON.parse(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text()) as Record<string,string>;
    packs.set(id,data);while(packs.size>4)packs.delete(packs.keys().next().value!);return data;
   }finally{release();inFlight.delete(id);}})();
   inFlight.set(id,promise);
  }
  pack=await inFlight.get(id)!;
 }
 if(typeof pack[key]!=='string')throw new Error('Archivo de geometría ausente.');
 return pack[key];
}
