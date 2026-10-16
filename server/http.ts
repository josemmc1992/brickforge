import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpServer} from './mcp';
import {operation,ServiceError} from '../lib/service';
import {owner,root} from './database';
import {VERSION} from '../lib/version';

const port=Number(process.env.PORT||3100),host=process.env.HOST||'127.0.0.1';
const token=process.env.BRICKFORGE_TOKEN||'';
const loopback=['127.0.0.1','localhost','::1'].includes(host);
if(!loopback&&token.length<32)throw new Error('Remote binding requires BRICKFORGE_TOKEN (at least 32 characters).');
if(token&&token.length<32)throw new Error('BRICKFORGE_TOKEN must contain at least 32 characters.');
const publicOrigin=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:undefined;
if(!loopback&&!publicOrigin)throw new Error('Remote binding requires PUBLIC_ORIGIN. Use HTTPS behind your reverse proxy.');
const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,`http://[::1]:${port}`,...publicOrigin?[publicOrigin]:[]]);
const hosts=new Set([...origins].map(value=>new URL(value).host));
const webRoot=resolve(root,'dist');
const equal=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
function sessionCookie(){const expiry=Date.now()+12*60*60*1000;return `${expiry}.${createHmac('sha256',token).update(String(expiry)).digest('hex')}`;}
function validSession(value:string){const [expiry,signature]=value.split('.');return Number(expiry)>Date.now()&&Number(expiry)<Date.now()+13*60*60*1000&&!!signature&&equal(signature,createHmac('sha256',token).update(expiry).digest('hex'));}
function authorized(req:IncomingMessage){
 if(!token)return loopback;
 if(typeof req.headers.authorization==='string'&&equal(req.headers.authorization,`Bearer ${token}`))return true;
 const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('brickforge_session='));
 return !!cookie&&validSession(cookie.slice('brickforge_session='.length));
}
function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req:IncomingMessage){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new ServiceError('Content-Type application/json required',415);
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>1000000)throw new ServiceError('Payload too large',413);chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ServiceError('Invalid JSON',400);}
}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.bin':'application/octet-stream','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(!hosts.has(req.headers.host||'')||(req.headers.origin&&!origins.has(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Origin or Host not permitted'});return;}
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(pathname==='/healthz'){json(res,200,{ok:true,version:VERSION,release:'beta',storage:'sqlite',mcp:['stdio','streamable-http']});return;}
  if(pathname==='/api/session'&&req.method==='GET'){json(res,200,{authenticated:authorized(req),mode:token?'token':'local'});return;}
  if(pathname==='/api/login'&&req.method==='POST'){
   const data=await body(req);
   if(!token||typeof data.token!=='string'||!equal(data.token,token)){json(res,401,{error:'Clave incorrecta'});return;}
   res.setHeader('Set-Cookie',`brickforge_session=${sessionCookie()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${publicOrigin?.startsWith('https:')?'; Secure':''}`);
   json(res,200,{ok:true});return;
  }
  if(pathname==='/mcp'||pathname==='/api/action'){
   if(!authorized(req)){res.setHeader('WWW-Authenticate','Bearer realm="Brickforge"');json(res,401,{error:'Authentication required'});return;}
   if(pathname==='/mcp'){
    if(req.method!=='POST'){res.setHeader('Allow','POST');res.writeHead(405);res.end();return;}
    const data=await body(req);const mcp=createMcpServer();
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void mcp.close();});await mcp.connect(transport);await transport.handleRequest(req,res,data);return;
   }
   if(req.method!=='POST'){res.setHeader('Allow','POST');res.writeHead(405);res.end();return;}
   const data=await body(req);json(res,200,await operation(data.name,data.args??{},owner));return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let file=resolve(webRoot,'.'+decodeURIComponent(pathname));
  if(file!==webRoot&&!file.startsWith(webRoot+sep)){res.writeHead(403);res.end();return;}
  if(pathname==='/')file=resolve(webRoot,'index.html');
  let info;try{info=await stat(file);}catch{res.writeHead(404);res.end();return;}
  if(!info.isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Content-Length',info.size);
  res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache');
  if(req.method==='HEAD'){res.end();return;}createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch(error){if(!res.headersSent)json(res,error instanceof ServiceError?error.status:400,{error:error instanceof Error?error.message:'Request failed'});else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,()=>console.error(`Brickforge ready: ${publicOrigin||`http://${host}:${port}`} (${token?'authenticated':'local only'})`));
