import {geometryLocation} from './geometry';
import {database} from '../server/database';
import {parts,partMap,colors,validatePieces,robot,snapAbove,analyze,exportLdr,type Model,type Piece} from './model';
import {profile,partConnectionInfo,supportedPartCount,inspectAssembly,assertAssembly,worldConnections,placementOptions,resolveConnection,groundPlacement} from './assembly';
export class ServiceError extends Error{constructor(message:string,public status=400){super(message);}}
function db(){return database;}
async function get(id:string,user:string){const r=await db().prepare('SELECT * FROM models WHERE id=? AND owner=?').bind(id,user).first<any>();if(!r)throw new ServiceError('Modelo no encontrado.',404);return {id:r.id,name:r.name,revision:r.revision,pieces:JSON.parse(r.pieces),updatedAt:r.updated_at} as Model;}
export async function operation(name:string,args:any,user:string|null):Promise<any>{
 if(!args||typeof args!=='object'||Array.isArray(args))throw new ServiceError('Argumentos inválidos.');
 if(name==='search_parts'){const q=String(args.query||'').toLowerCase().trim().slice(0,120),cat=String(args.category||''),offset=Math.max(0,Math.floor(Number(args.offset)||0)),limit=Math.min(60,Math.max(1,Math.floor(Number(args.limit)||24)));const found=parts.filter(p=>(!cat||p.category===cat)&&(!args.connectableOnly||profile(p.id))&&(!q||`${p.id} ${p.name}`.toLowerCase().includes(q)));found.sort((a,b)=>Number(b.id===q)-Number(a.id===q));return {total:found.length,offset,parts:found.slice(offset,offset+limit).map(p=>({...p,connectable:!!profile(p.id)}))};}
 if(name==='catalog_info')return {count:parts.length,connectableCount:supportedPartCount,categories:[...new Set(parts.map(p=>p.category))].sort(),units:'LDraw units: 20 = 1 stud, brick height 24, plate 8. X right, Y up, Z forward. Origin at top surface. Rotation: XYZ Euler degrees.',source:'https://www.ldraw.org/',limits:{maxPieces:2000,maxBatch:500},capabilities:{connectionEngine:true,serverEnforced:true,studSocket:true,sideStud:true,quarterTurnRotations:true,compoundCollisions:true,arbitraryPartConnectivity:false,physics:false},workflow:'search_parts(connectableOnly=true), get_connections, find_connections, connect_piece. Placements are computed and validated by the server. Unprofiled parts are refused, not assumed valid. Existing models remain readable; invalid legacy geometry must be repaired before structural edits.'};
 if(name==='list_colors')return colors;
 if(name==='get_part'){const p=partMap.get(args.part);if(!p)throw new ServiceError('Pieza desconocida.',404);return {...p,geometry:{...geometryLocation(p.id+'.dat'),format:'gzip-json'},connectivity:partConnectionInfo(p.id)};}
 if(!user)throw new ServiceError('Inicia sesión para acceder a los modelos.',401);
 if(name==='list_models')return (await db().prepare('SELECT id,name,revision,updated_at AS updatedAt FROM models WHERE owner=? ORDER BY updated_at DESC').bind(user).all()).results;
 if(name==='create_model'){const model:Model={id:crypto.randomUUID(),name:String(args.name||'Mi construcción').trim().slice(0,100)||'Mi construcción',revision:1,pieces:args.template==='robot'?robot():[],updatedAt:new Date().toISOString()};assertAssembly(model.pieces);await db().prepare('INSERT INTO models (id,owner,name,revision,pieces,updated_at) VALUES (?,?,?,?,?,?)').bind(model.id,user,model.name,1,JSON.stringify(model.pieces),model.updatedAt).run();return model;}
 if(typeof args.modelId!=='string')throw new ServiceError('Falta modelId.');const model=await get(args.modelId,user);
 if(name==='get_model')return model;if(name==='analyze_model')return {...analyze(model.pieces),assembly:inspectAssembly(model.pieces)};if(name==='export_model')return {filename:model.id+'.ldr',format:'ldraw',text:exportLdr(model)};
 if(name==='get_connections')return {revision:model.revision,pieceId:args.pieceId,connectors:worldConnections(model.pieces,args.pieceId)};
 if(name==='find_connections'){const offset=Number(args.offset??0),limit=Number(args.limit??12);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw new ServiceError('Paginación inválida.');assertAssembly(model.pieces);return {revision:model.revision,...placementOptions(model.pieces,args.part,args.anchorId,args.anchorConnector,offset,limit)};}
 if(args.expectedRevision!==model.revision)throw new ServiceError('El modelo ha cambiado. Vuelve a leerlo antes de editar.',409);
 let next:Piece[]=[...model.pieces];if(name==='replace_model')next=validatePieces(args.pieces);
 else if(name==='connect_piece'){
  const p=validatePieces([{...args.piece,position:[0,0,0],rotation:[0,0,0]}])[0];
  if(!args.connection||!Array.isArray(args.connection.rotation)||args.connection.rotation.length!==3||args.connection.rotation.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)))throw new ServiceError('Conexión inválida.');
  next=validatePieces([...next,resolveConnection(next,p,args.connection)]);
 }
 else if(name==='place_on_ground'){
  const p=validatePieces([{...args.piece,position:[0,0,0],rotation:[0,0,0]}])[0];p.position=groundPlacement(next,p.part);next=validatePieces([...next,p]);
 }
 else if(name==='edit_model'){if(!Array.isArray(args.operations)||!args.operations.length||args.operations.length>500)throw new ServiceError('Envía entre 1 y 500 operaciones.');for(const op of args.operations){if(op.action==='add'){const p={...op.piece};if(op.above){const anchor=next.find(v=>v.id===op.above);if(!anchor)throw new ServiceError('Pieza de apoyo desconocida.');p.position=snapAbove(anchor,p.part,op.offsetX||0,op.offsetZ||0);p.rotation=[0,0,0];}next.push(p);}else if(op.action==='update'){const i=next.findIndex(p=>p.id===op.id);if(i<0)throw new ServiceError('Pieza desconocida: '+op.id);next[i]={...next[i],...op.patch,id:op.id};}else if(op.action==='remove'){if(!next.some(p=>p.id===op.id))throw new ServiceError('Pieza desconocida: '+op.id);next=next.filter(p=>p.id!==op.id);}else throw new ServiceError('Operación desconocida.');}next=validatePieces(next);}else throw new ServiceError('Herramienta desconocida.',404);
 // Read/export and cosmetic edits preserve legacy models. Every structural mutation,
 // including JSON import, raw coordinates, removal and undo, passes the same gate.
 const shape=(p:Piece)=>JSON.stringify([p.id,p.part,p.position,p.rotation]);
 const oldShapes=new Map(model.pieces.map(p=>[p.id,shape(p)]));
 if(next.length!==model.pieces.length||next.some(p=>oldShapes.get(p.id)!==shape(p)))assertAssembly(next);
 const title=args.name===undefined?model.name:String(args.name).trim().slice(0,100);if(!title)throw new ServiceError('El nombre no puede estar vacío.');const serialized=JSON.stringify(next);if(serialized.length>900000)throw new ServiceError('Modelo demasiado grande.');const updatedAt=new Date().toISOString();const result=await db().prepare('UPDATE models SET name=?,pieces=?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND revision=?').bind(title,serialized,updatedAt,model.id,user,model.revision).run();if(result.meta.changes!==1)throw new ServiceError('Edición simultánea. Vuelve a leer el modelo.',409);return {...model,name:title,pieces:next,revision:model.revision+1,updatedAt};
}
