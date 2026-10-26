import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {operation} from '../lib/service';
import {toolDefinitions} from '../lib/mcp-tools';
import {owner,databasePath} from './database';
import {VERSION} from '../lib/version';
import {captureBroker,captureOptions} from './capture';
import type {Model} from '../lib/model';
import type {CaptureMetadata} from '../lib/capture';
export function createMcpServer(){
 const server=new Server({name:'brickforge',version:VERSION},{capabilities:{tools:{}},instructions:'Brickforge beta: design LEGO creations with AI. Read catalog_info. Use search_parts(connectableOnly=true), place_on_ground, get_connections, find_connections and connect_piece. The engine computes attachments and rejects invalid geometry. Read current revision before writing. Use capture_model to inspect a PNG render of an exact model revision; keep Brickforge or its web editor open in the same workspace. Capture renders only the requested model, never the desktop. Existing legacy models remain readable; unsupported geometry must be repaired before structural edits.'});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions as any}));
 server.setRequestHandler(CallToolRequestSchema,async (request,extra)=>{
  try{
   if(!toolDefinitions.some(t=>t.name===request.params.name))throw new Error('Unknown tool');
   if(request.params.name==='capture_model'){
    const options=captureOptions(request.params.arguments??{});
    const model=await operation('get_model',{modelId:options.modelId},owner) as Model;
    const broker=captureBroker(databasePath),job=broker.enqueue(owner,model,options);
    const data=await broker.waitForResult(job.id,owner,extra.signal);
    const metadata:CaptureMetadata={modelId:model.id,revision:model.revision,pieceCount:model.pieces.length,view:options.view,width:options.width,height:options.height,mimeType:'image/png'};
    return {content:[{type:'text',text:JSON.stringify(metadata)},{type:'image',data,mimeType:'image/png'}],structuredContent:metadata};
   }
   const result=await operation(request.params.name,request.params.arguments??{},owner);
   return {content:[{type:'text',text:JSON.stringify(result)}]};
  }catch(error){return {isError:true,content:[{type:'text',text:error instanceof Error?error.message:'Operation failed'}]};}
 });
 return server;
}
