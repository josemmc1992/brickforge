import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {operation} from '../lib/service';
import {toolDefinitions} from '../lib/mcp-tools';
import {owner} from './database';
import {VERSION} from '../lib/version';
export function createMcpServer(){
 const server=new Server({name:'brickforge',version:VERSION},{capabilities:{tools:{}},instructions:'Brickforge beta: design LEGO creations with AI. Read catalog_info. Use search_parts(connectableOnly=true), place_on_ground, get_connections, find_connections and connect_piece. The engine computes attachments and rejects invalid geometry. Read current revision before writing. Existing legacy models remain readable; unsupported geometry must be repaired before structural edits.'});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions as any}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  try{
   if(!toolDefinitions.some(t=>t.name===request.params.name))throw new Error('Unknown tool');
   const result=await operation(request.params.name,request.params.arguments??{},owner);
   return {content:[{type:'text',text:JSON.stringify(result)}]};
  }catch(error){return {isError:true,content:[{type:'text',text:error instanceof Error?error.message:'Operation failed'}]};}
 });
 return server;
}
