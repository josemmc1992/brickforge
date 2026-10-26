import {testMinifigNeckAssembly} from '../desktop/neck-smoke.mjs';
import {testMinifigHipAssembly} from '../desktop/hips-smoke.mjs';
import {testCaptureIntegration} from './test-capture-integration.mjs';
import {testLargeModels,assertLargeModel} from './test-large-models.mjs';
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
import {testSlidingAssembly} from '../desktop/axial-smoke.mjs';
import {testKeyedAssembly} from '../desktop/keyed-smoke.mjs';
import {testStandardAccessAssembly} from '../desktop/access-smoke.mjs';
import {testTechnicPinAssembly} from '../desktop/pin-smoke.mjs';
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
async function testGeneratedAssembly(client,transport){
 const info=await call(client,'get_part',{part:'43712'});
 assert.equal(info.connectivity.supported,true);
 assert.equal(info.connectivity.profile,'ldraw-shadow-envelope-v1','This fixture must exercise a generated asset rather than a curated profile');
 assert.ok(info.connectivity.connectors.some(port=>port.kind==='stud'));
 let model=await call(client,'create_model',{name:`Generated catalogue via ${transport}`});
 model=await call(client,'place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:'generated',part:'43712',color:4,step:1,group:'Geometry-derived profile'}});
 let choice,capPart;
 for(const part of ['3070b','98138']){
  const placements=await call(client,'find_connections',{modelId:model.id,part,anchorId:'generated'});
  if(placements.options.length){choice=placements.options[0];capPart=part;break;}
 }
 assert.ok(choice,`${transport}: generated part must offer a real legal connection`);
 model=await call(client,'connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:'generated-cap',part:capPart,color:14,step:2,group:'Geometry-derived profile'},connection:choice.connection});
 const report=(await call(client,'analyze_model',{modelId:model.id})).assembly;
 assert.equal(report.valid,true);
 assert.ok(report.connections.some(connection=>[connection.a,connection.b].includes('generated')&&[connection.a,connection.b].includes('generated-cap')));
 const duplicate={...model.pieces.find(piece=>piece.id==='generated'),id:'overlapping-generated'};
 const displaced=[...model.pieces.find(piece=>piece.id==='generated-cap').position];displaced[1]+=1;
 for(const operations of [[{action:'add',piece:duplicate}],[{action:'update',id:'generated-cap',patch:{position:displaced}}]]){
  const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations}});
  assert.equal(rejected.isError,true,`${transport}: overlapping bodies and detached pieces must be rejected`);
  assert.deepEqual(await call(client,'get_model',{modelId:model.id}),model,`${transport}: rejected geometry must leave the revision and model unchanged`);
 }
 return model;
}
async function testAxialAssembly(client,transport){
 for(const [part,kind] of [['3673','bar-socket'],['30374','bar']]){
  const info=await call(client,'get_part',{part});
  assert.equal(info.connectivity.supported,true);
  assert.equal(info.connectivity.profile,part==='3673'?'ldraw-technic-pin-envelope-v1':'ldraw-axial-envelope-v1');
  assert.ok(info.connectivity.connectors.some(port=>port.kind===kind));
  assert.ok((await call(client,'search_parts',{query:part,connectableOnly:true})).parts.some(found=>found.id===part));
 }
 let model=await call(client,'create_model',{name:`Axial R4 catalogue via ${transport}`});
 model=await call(client,'place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:'r4-socket',part:'3673',color:1,step:1,group:'Axial R4'}});
 const placements=await call(client,'find_connections',{modelId:model.id,part:'30374',anchorId:'r4-socket'});
 assert.ok(placements.options.length,`${transport}: a real R4 through channel must offer a valid bar placement`);
 model=await call(client,'connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:'r4-bar',part:'30374',color:14,step:2,group:'Axial R4'},connection:placements.options[0].connection});
 const report=(await call(client,'analyze_model',{modelId:model.id})).assembly;
 assert.equal(report.valid,true);assert.equal(report.connections.length,1);
 const socketPorts=(await call(client,'get_connections',{modelId:model.id,pieceId:'r4-socket'})).connectors;
 assert.ok(socketPorts.some(port=>port.kind==='bar-socket'&&port.occupied));
 const displaced=[...model.pieces.find(piece=>piece.id==='r4-bar').position];displaced[1]+=.009;
 const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations:[{action:'update',id:'r4-bar',patch:{position:displaced}}]}});
 assert.equal(rejected.isError,true,`${transport}: a radial offset smaller than collision tolerance still violates axial alignment`);
 assert.deepEqual(await call(client,'get_model',{modelId:model.id}),model,`${transport}: rejected axial displacement must preserve the complete model and revision`);
 model=await testSlidingAssembly(client,model,transport);
 model=await testKeyedAssembly(client,model,transport);
 model=await testStandardAccessAssembly(client,model,transport);
 model=await testTechnicPinAssembly(client,model,transport);
 model=await testMinifigNeckAssembly(client,model,transport);
 return testMinifigHipAssembly(client,model,transport);
}
try{
 const variantTests=spawnSync(process.execPath,['scripts/test-assembly-variants.mjs'],{encoding:'utf8'});assert.equal(variantTests.status,0,variantTests.stderr+variantTests.stdout);
 for(const name of ['test-assembly','test-model','test-spatial','test-robot-feet','test-connection-boundaries','test-capture-broker']){
  const out=join(temp,name+'.mjs');await build({entryPoints:[`scripts/${name}.ts`],outfile:out,bundle:true,platform:'node',format:'esm'});
  const test=spawnSync(process.execPath,[out],{encoding:'utf8'});assert.equal(test.status,0,test.stderr+test.stdout);
 }
 await start();await connect();
 assert.equal((await http.listTools()).tools.length,16);
 const coverage=await call(http,'catalog_info');
 const variants=JSON.parse(await readFile('lib/assembly-variants.json','utf8'));
 assert.ok(coverage.connectionCoverage.basePartCount>100,'New mechanical base profiles must be available');
 assert.equal(coverage.connectionCoverage.variantCount,Object.keys(variants.aliases).length);
 assert.equal(coverage.connectableCount,coverage.connectionCoverage.basePartCount+coverage.connectionCoverage.variantCount+coverage.connectionCoverage.generatedPartCount);
 assert.equal((await call(http,'search_parts',{connectableOnly:true,limit:1})).total,coverage.connectableCount);
 assert.ok(coverage.connectionCoverage.generatedPartCount>0);
 const generatedHttp=await testGeneratedAssembly(http,'HTTP');
 const axialHttp=await testAxialAssembly(http,'HTTP');
 const decorated=Object.entries(variants.aliases).find(([,entry])=>entry.base==='3070b')?.[0];assert.ok(decorated);
 const decoratedInfo=await call(http,'get_part',{part:decorated});assert.equal(decoratedInfo.connectivity.supported,true);assert.equal(decoratedInfo.connectivity.basePart,'3070b');
 const expansion=await call(http,'create_model',{name:'Expanded catalogue test'});
 let expanded=await call(http,'place_on_ground',{modelId:expansion.id,expectedRevision:1,piece:{id:'jumper',part:'87580',color:4,step:1,group:'new shape'}});
 const expandedOptions=await call(http,'find_connections',{modelId:expanded.id,part:decorated,anchorId:'jumper'});assert.ok(expandedOptions.options.length,'Decorated tile must snap onto the new centre stud');
 expanded=await call(http,'connect_piece',{modelId:expanded.id,expectedRevision:2,piece:{id:'decorated',part:decorated,color:14,step:2,group:'verified pattern'},connection:expandedOptions.options[0].connection});
 assert.equal((await call(http,'analyze_model',{modelId:expanded.id})).assembly.valid,true);
 const displaced=[...expanded.pieces.find(p=>p.id==='decorated').position];displaced[0]+=10;
 const invalidExpanded=await http.callTool({name:'edit_model',arguments:{modelId:expanded.id,expectedRevision:3,operations:[{action:'update',id:'decorated',patch:{position:displaced}}]}});
 assert.equal(invalidExpanded.isError,true);assert.equal((await call(http,'get_model',{modelId:expanded.id})).revision,3);
 const a=await call(http,'create_model',{name:'Portable test'});
 let m=await call(http,'place_on_ground',{modelId:a.id,expectedRevision:1,piece:{id:'base',part:'4070',color:4,step:1,group:'test'}});
 const options=await call(http,'find_connections',{modelId:m.id,part:'3024',anchorId:'base',anchorConnector:'stud:front'});
 assert.ok(options.options.length);
 m=await call(http,'connect_piece',{modelId:m.id,expectedRevision:2,piece:{id:'side',part:'3024',color:1,step:2,group:'test'},connection:options.options[0].connection});
 assert.equal((await call(http,'analyze_model',{modelId:m.id})).assembly.valid,true);
 // Independent stdio process, arbitrary cwd, same persistent workspace.
 stdio=new Client({name:'generic-stdio-client',version:'1'});
 await stdio.connect(new StdioClientTransport({command:process.execPath,args:[resolve('dist-server/stdio.mjs')],cwd:temp,env:{...env},stderr:'pipe'}));
 assert.equal((await stdio.listTools()).tools.length,16);
 assert.equal((await call(stdio,'catalog_info')).connectableCount,coverage.connectableCount);
 const generatedStdio=await testGeneratedAssembly(stdio,'stdio');
 const axialStdio=await testAxialAssembly(stdio,'stdio');
 assert.deepEqual(await call(http,'get_model',{modelId:generatedStdio.id}),generatedStdio);
 assert.deepEqual(await call(http,'get_model',{modelId:axialStdio.id}),axialStdio);
 assert.equal((await call(stdio,'analyze_model',{modelId:axialHttp.id})).assembly.valid,true);
 assert.equal((await call(stdio,'analyze_model',{modelId:generatedHttp.id})).assembly.valid,true);
 assert.equal((await call(stdio,'get_model',{modelId:expanded.id})).pieces[1].part,decorated);
 assert.equal((await call(stdio,'get_model',{modelId:m.id})).revision,3);
 const raced=await Promise.all([http,stdio].map(client=>client.callTool({name:'edit_model',arguments:{modelId:m.id,expectedRevision:3,operations:[{action:'update',id:'side',patch:{color:14}}]}})));
 assert.equal(raced.filter(r=>r.isError).length,1);
 const bad=await stdio.callTool({name:'edit_model',arguments:{modelId:m.id,expectedRevision:4,operations:[{action:'remove',id:'base'}]}});assert.equal(bad.isError,true);
 assert.equal((await call(http,'get_model',{modelId:m.id})).revision,4);
 const anonymous=await post('/api/action',{name:'list_models',args:{}},{'oai-authenticated-user-id':'spoof'});assert.equal(anonymous.status,401);
 const unauthorizedMcp=await post('/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'});assert.equal(unauthorizedMcp.status,401);
 assert.equal((await post('/api/login',{token:'wrong'})).status,401);
 const login=await post('/api/login',{token});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 await testCaptureIntegration({http,stdio,post,token,cookie});
 const largeModels=await testLargeModels({http,stdio,post,cookie});
 const browser=await post('/api/action',{name:'get_model',args:{modelId:m.id}},{Cookie:cookie});assert.equal((await browser.json()).revision,4);
 const badEdit=await post('/api/action',{name:'edit_model',args:{modelId:m.id,expectedRevision:4,operations:[{action:'remove',id:'base'}]}},{Cookie:cookie});assert.equal(badEdit.status,400);
 assert.equal((await post('/api/action',{name:'list_models'},{Cookie:cookie,Origin:'https://evil.invalid'})).status,403);
 assert.equal((await fetch(base+'/api/session',{headers:{Cookie:'brickforge_session=9999999999999.forged'}})).status,200);
 assert.equal((await(await fetch(base+'/api/session',{headers:{Cookie:'brickforge_session=9999999999999.forged'}})).json()).authenticated,false);
 assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/data/brickforge.sqlite')).status,404);
 assert.equal((await fetch(base+'/')).status,200);
 const part=await call(http,'get_part',{part:'4070'});assert.equal((await fetch(base+part.geometry.url)).status,200);
 assert.ok((await call(stdio,'export_model',{modelId:m.id})).text.includes('4070.dat'));
 assert.ok((await call(stdio,'export_model',{modelId:generatedStdio.id})).text.includes('43712.dat'));
 const axialExport=(await call(stdio,'export_model',{modelId:axialStdio.id})).text;
 assert.ok(axialExport.includes('30374.dat')&&axialExport.includes('3673.dat'));
 await http.close();await stdio.close();await stop();await start();await connect();
 for(const model of largeModels)assertLargeModel(await call(http,'get_model',{modelId:model.id}),model,'Restart must retain every piece and revision of a 15,000-piece model');
 assert.equal((await call(http,'get_model',{modelId:m.id})).revision,4);
 assert.deepEqual(await call(http,'get_model',{modelId:generatedHttp.id}),generatedHttp);
 assert.equal((await call(http,'analyze_model',{modelId:generatedStdio.id})).assembly.valid,true,'Restarted service must lazily load profiles from a persisted model');
 assert.deepEqual(await call(http,'get_model',{modelId:axialHttp.id}),axialHttp);
 assert.equal((await call(http,'analyze_model',{modelId:axialStdio.id})).assembly.valid,true,'Restarted service must lazily load source-v2 axial assets');
 await http.close();await stop();
 const exported=join(temp,'backup.json');
 let result=spawnSync(process.execPath,['dist-server/backup.mjs','export',exported],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const backup=JSON.parse(await readFile(exported,'utf8'));
 for(const model of largeModels)assertLargeModel(backup.models.find(saved=>saved.id===model.id),model,'Offline backup must preserve full 15,000-piece models');
 for(const axial of [axialHttp,axialStdio])assert.deepEqual(backup.models.find(model=>model.id===axial.id),axial);
 const restoreEnv={...env,BRICKFORGE_DB:join(temp,'restore.sqlite')};
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',exported],{env:restoreEnv,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',exported],{env:restoreEnv,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const restored=join(temp,'restored.json');spawnSync(process.execPath,['dist-server/backup.mjs','export',restored],{env:restoreEnv});
 assert.deepEqual(JSON.parse(await readFile(exported,'utf8')),JSON.parse(await readFile(restored,'utf8')));
 const badBackup=JSON.parse(await readFile(exported,'utf8'));badBackup.models[0].name='Conflicting';await writeFile(join(temp,'conflict.json'),JSON.stringify(badBackup));
 result=spawnSync(process.execPath,['dist-server/backup.mjs','import',join(temp,'conflict.json')],{env:restoreEnv,encoding:'utf8'});assert.notEqual(result.status,0);
 result=spawnSync(process.execPath,['dist-server/http.mjs'],{env:{...env,HOST:'0.0.0.0',BRICKFORGE_TOKEN:''},encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/requires BRICKFORGE_TOKEN/);
 console.log('PASS: geometry, generated standard, R4, A6, Technic pin and minifig neck/waist assets over SDK HTTP + stdio, rejected overlap/displacement without mutations, shared SQLite, cross-process CAS, assembly gate, auth, CSRF, static isolation, persistence, backup and restore.');
}finally{await http?.close().catch(()=>{});await stdio?.close().catch(()=>{});await stop();await rm(temp,{recursive:true,force:true});}
