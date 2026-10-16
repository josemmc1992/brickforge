import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');process.chdir(root);
const temp=await mkdtemp(join(tmpdir(),'brickforge-test-'));
const db=join(temp,'models.sqlite'),token=randomBytes(32).toString('hex');
const port=Number(process.env.TEST_PORT||3197),base=`http://127.0.0.1:${port}`;
const env={...process.env,BRICKFORGE_DB:db,BRICKFORGE_TOKEN:token,PORT:String(port),HOST:'127.0.0.1',PUBLIC_ORIGIN:base};
let child,http,stdio,logs='';
async function start(){child=spawn(process.execPath,['dist-server/http.mjs'],{cwd:root,env,stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>logs+=b.toString());for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error(logs);try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Server did not start');}
async function stop(){const running=child;child=undefined;if(running&&running.exitCode===null&&running.signalCode===null){const exit=new Promise(r=>running.once('exit',r));running.kill();await exit;}}
async function connect(){http=new Client({name:'generic-http-client',version:'1'});await http.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));}
async function call(client,name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
async function post(path,data,headers={}){return fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});}
try{
 for(const name of ['test-assembly','test-model','test-robot-feet']){
  const out=join(temp,name+'.mjs');await build({entryPoints:[`scripts/${name}.ts`],outfile:out,bundle:true,platform:'node',format:'esm'});
  const test=spawnSync(process.execPath,[out],{encoding:'utf8'});assert.equal(test.status,0,test.stderr+test.stdout);
 }
 await start();await connect();
 assert.equal((await http.listTools()).tools.length,15);
 assert.equal((await call(http,'catalog_info')).connectableCount,87);
 const a=await call(http,'create_model',{name:'Portable test'});
 let m=await call(http,'place_on_ground',{modelId:a.id,expectedRevision:1,piece:{id:'base',part:'4070',color:4,step:1,group:'test'}});
 const options=await call(http,'find_connections',{modelId:m.id,part:'3024',anchorId:'base',anchorConnector:'stud:front'});
 assert.ok(options.options.length);
 m=await call(http,'connect_piece',{modelId:m.id,expectedRevision:2,piece:{id:'side',part:'3024',color:1,step:2,group:'test'},connection:options.options[0].connection});
 assert.equal((await call(http,'analyze_model',{modelId:m.id})).assembly.valid,true);
 // Independent stdio process, arbitrary cwd, same persistent workspace.
 stdio=new Client({name:'generic-stdio-client',version:'1'});
 await stdio.connect(new StdioClientTransport({command:process.execPath,args:[resolve('dist-server/stdio.mjs')],cwd:temp,env:{...env},stderr:'pipe'}));
 assert.equal((await stdio.listTools()).tools.length,15);
 assert.equal((await call(stdio,'get_model',{modelId:m.id})).revision,3);
 const raced=await Promise.all([http,stdio].map(client=>client.callTool({name:'edit_model',arguments:{modelId:m.id,expectedRevision:3,operations:[{action:'update',id:'side',patch:{color:14}}]}})));
 assert.equal(raced.filter(r=>r.isError).length,1);
 const bad=await stdio.callTool({name:'edit_model',arguments:{modelId:m.id,expectedRevision:4,operations:[{action:'remove',id:'base'}]}});assert.equal(bad.isError,true);
 assert.equal((await call(http,'get_model',{modelId:m.id})).revision,4);
 const anonymous=await post('/api/action',{name:'list_models',args:{}},{'oai-authenticated-user-id':'spoof'});assert.equal(anonymous.status,401);
 const unauthorizedMcp=await post('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'});assert.equal(unauthorizedMcp.status,401);
 assert.equal((await post('/api/login',{token:'wrong'})).status,401);
 const login=await post('/api/login',{token});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const browser=await post('/api/action',{name:'get_model',args:{modelId:m.id}},{Cookie:cookie});assert.equal((await browser.json()).revision,4);
 const badEdit=await post('/api/action',{name:'edit_model',args:{modelId:m.id,expectedRevision:4,operations:[{action:'remove',id:'base'}]}},{Cookie:cookie});assert.equal(badEdit.status,400);
 assert.equal((await post('/api/action',{name:'list_models'},{Cookie:cookie,Origin:'https://evil.invalid'})).status,403);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:'brickforge_session=9999999999999.forged'}})).status,200);
 assert.equal((await(await fetch(base+'/api/session',{headers:{Cookie:'brickforge_session=9999999999999.forged'}})).json()).authenticated,false);
 assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/data/brickforge.sqlite')).status,404);
 assert.equal((await fetch(base+'/')).status,200);
 const part=await call(http,'get_part',{part:'4070'});assert.equal((await fetch(base+part.geometry.url)).status,200);
 assert.ok((await call(stdio,'export_model',{modelId:m.id})).text.includes('4070.dat'));
 await http.close();await stdio.close();await stop();await start();await connect();
 assert.equal((await call(http,'get_model',{modelId:m.id})).revision,4);
 await http.close();await stop();
 const exported=join(temp,'backup.json');
 let result=spawnSync(process.execPath,['dist-server/backup.mjs','export',exported],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const restoreEnv={...env,BRICKFORGE_DB:join(temp,'restore.sqlite')};
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',exported],{env:restoreEnv,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',exported],{env:restoreEnv,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const restored=join(temp,'restored.json');spawnSync(process.execPath,['dist-server/backup.mjs','export',restored],{env:restoreEnv});
 assert.deepEqual(JSON.parse(await readFile(exported,'utf8')),JSON.parse(await readFile(restored,'utf8')));
 const badBackup=JSON.parse(await readFile(exported,'utf8'));badBackup.models[0].name='Conflicting';await writeFile(join(temp,'conflict.json'),JSON.stringify(badBackup));
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',join(temp,'conflict.json')],{env:restoreEnv,encoding:'utf8'});assert.notEqual(result.status,0);
 result=spawnSync(process.execPath,['dist-server/http.mjs'],{env:{...env,HOST:'0.0.0.0',BRICKFORGE_TOKEN:''},encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/requires BRICKFORGE_TOKEN/);
 console.log('PASS: geometry, SDK HTTP + stdio, shared SQLite, cross-process CAS, assembly gate, auth, CSRF, static isolation, persistence, backup and restore.');
}finally{await http?.close().catch(()=>{});await stdio?.close().catch(()=>{});await stop();await rm(temp,{recursive:true,force:true});}
