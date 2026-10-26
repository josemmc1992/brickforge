import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertLargeModel(actual,expected,message){
 assert.equal(actual.id,expected.id,message);
 assert.equal(actual.revision,expected.revision,message);
 assert.equal(actual.pieces.length,expected.pieces.length,message);
 assert.equal(digest(actual),digest(expected),message);
}

// Synthetic models only: no installed application profile or personal database.
// Spacing leaves every brick independently supported on the floor, with no
// overlapping body/stud envelopes, and stays inside the coordinate bounds.
const piece=(i,part='3005')=>({
 id:`large-${String(i).padStart(5,'0')}`,part,color:i%2?4:14,
 position:[(i%150)*120,24,Math.floor(i/150)*80],rotation:[0,0,0],
 step:1,group:'Large model transport, persistence and mechanical validation'
});

export async function testLargeModels({http,stdio,post,cookie}){
 const call=async(client,name,args={})=>{
  const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});
  assert.ok(!result.isError,JSON.stringify(result));
  return JSON.parse(result.content.find(item=>item.type==='text').text);
 };
 const limits=(await call(http,'catalog_info')).limits;
 assert.equal(limits.maxPieces,15000,'The advertised model capacity must match the requested 15,000 pieces');
 assert.equal(limits.maxBatch,500,'A larger model does not remove the independent per-edit batch limit');
 const max=limits.maxPieces,models=[];
 const routes=[...[[http,'HTTP'],[stdio,'stdio']].map(([client,label])=>({
  label,
  call:(name,args)=>call(client,name,args),
  reject:async(name,args)=>{
   const result=await client.callTool({name,arguments:args},undefined,{timeout:120000});
   assert.equal(result.isError,true,`${label}: invalid mutation must fail`);
   return result.content.find(item=>item.type==='text').text;
  }
 })),{
  label:'/api/action',
  call:async(name,args)=>{
   const response=await post('/api/action',{name,args},{Cookie:cookie});
   const data=await response.json();
   assert.equal(response.status,200,JSON.stringify(data));
   return data;
  },
  reject:async(name,args)=>{
   const response=await post('/api/action',{name,args},{Cookie:cookie});
   const data=await response.json();
   assert.equal(response.status,400,JSON.stringify(data));
   return data.error;
  }
 }];
 for(const client of [http,stdio]){
  const tools=(await client.listTools()).tools;
  assert.equal(tools.find(tool=>tool.name==='replace_model').inputSchema.properties.pieces.maxItems,max);
  assert.equal(tools.find(tool=>tool.name==='edit_model').inputSchema.properties.operations.maxItems,limits.maxBatch);
 }
 for(const route of routes){
  const began=performance.now();
  let model=await route.call('create_model',{name:`15,000 pieces via ${route.label}`});
  const pieces=Array.from({length:max-1},(_,i)=>piece(i));
  const replace={modelId:model.id,expectedRevision:model.revision,pieces};
  assert.ok(Buffer.byteLength(JSON.stringify({name:'replace_model',args:replace}))>1_000_000,'Exercise the previous HTTP size limit with a real JSON model');
  model=await route.call('replace_model',replace);
  assert.equal(model.pieces.length,max-1);
  if(route.label==='HTTP'){
   const info=await call(http,'get_part',{part:'3005'});
   const bottom=info.connectivity.connectors.find(port=>port.kind==='socket'&&port.normal[1]<0);
   const top=info.connectivity.connectors.find(port=>port.kind==='stud'&&port.normal[1]>0);
   assert.ok(bottom&&top,'The fixture must expose a lower socket and upper stud');
   const query={modelId:model.id,part:'3005',anchorId:model.pieces[0].id};
   let offset=0;
   for(let page=0;page<2;page++){
    const result=await call(http,'find_connections',{...query,anchorConnector:bottom.id,offset});
    assert.equal(result.maxExamined,1,'Large-model search must examine only one candidate per page');
    assert.equal(result.examined,1);
    assert.equal(result.options.length,0,'Attaching below a grounded brick must fail the ground gate');
    assert.ok(Number.isInteger(result.nextOffset)&&result.nextOffset>offset,'An empty page must still advance its continuation cursor');
    offset=result.nextOffset;
   }
   const legal=await call(http,'find_connections',{...query,anchorConnector:top.id});
   assert.equal(legal.maxExamined,1);
   assert.equal(legal.examined,1);
   assert.equal(legal.options.length,1,'The upper stud must still return a legal attachment');
   assert.equal(legal.options[0].connection.anchorConnector,top.id);
   assertLargeModel(await call(http,'get_model',{modelId:model.id}),model,'Paginated placement search must not mutate the model');
  }
  model=await route.call('edit_model',{modelId:model.id,expectedRevision:model.revision,operations:[{action:'add',piece:piece(max-1)}]});
  assert.equal(model.pieces.length,max,`${route.label}: adding piece 15,000 must succeed`);
  model=await route.call('replace_model',{modelId:model.id,expectedRevision:model.revision,pieces:model.pieces});
  assert.equal(model.pieces.length,max,`${route.label}: importing exactly 15,000 pieces must succeed`);
  assertLargeModel(await call(http,'get_model',{modelId:model.id}),model,`${route.label}: HTTP reads the complete stored model`);
  assertLargeModel(await call(stdio,'get_model',{modelId:model.id}),model,`${route.label}: stdio reads the complete stored model`);
  for(const [name,args] of [
   ['replace_model',{modelId:model.id,expectedRevision:model.revision,name:'Must not persist',pieces:[...model.pieces,piece(max)]}],
   ['edit_model',{modelId:model.id,expectedRevision:model.revision,operations:[{action:'add',piece:piece(max)}]}]
  ]){
   const error=await route.reject(name,args);
   assert.match(error,/15000|15[.,]000/,`${route.label}: rejection must name the piece limit`);
   assertLargeModel(await route.call('get_model',{modelId:model.id}),model,`${route.label}: rejected piece 15,001 cannot change any data or revision`);
  }
  const exported=await route.call('export_model',{modelId:model.id});
  const lines=exported.text.split('\n').filter(line=>line.startsWith('1 '));
  assert.equal(lines.length,max,`${route.label}: LDraw must retain all 15,000 pieces`);
  assert.ok(lines.every(line=>line.endsWith(' 3005.dat')));
  models.push(model);
  console.log(`PASS: ${route.label} accepts >1 MB JSON, adds piece 15000, rejects 15001 atomically, reads and exports all pieces (${Math.round(performance.now()-began)} ms).`);
 }

 // A 1x1 model alone would miss the former 40,000-connector ceiling.
 const started=performance.now(),part=await call(http,'get_part',{part:'3001'});
 const connectorCount=part.connectivity.connectors.length*max;
 assert.equal(connectorCount,240000);
 let brickModel=await call(http,'create_model',{name:'15,000 2x4 bricks with 240,000 connectors'});
 brickModel=await call(http,'replace_model',{modelId:brickModel.id,expectedRevision:brickModel.revision,pieces:Array.from({length:max},(_,i)=>piece(i,'3001'))});
 assert.equal(brickModel.pieces.length,max);
 const report=await call(stdio,'analyze_model',{modelId:brickModel.id});
 assert.equal(report.pieceCount,max);
 assert.equal(report.overlapCount,0);
 assert.equal(report.assembly.valid,true,JSON.stringify(report.assembly.issues));
 assert.equal(report.assembly.checked,max);
 assert.equal(report.assembly.unsupported,0);
 assertLargeModel(await call(stdio,'get_model',{modelId:brickModel.id}),brickModel,'The full 2x4 model must cross the stdio transport');
 const exported=await call(stdio,'export_model',{modelId:brickModel.id});
 assert.equal(exported.text.split('\n').filter(line=>line.startsWith('1 ')&&line.endsWith(' 3001.dat')).length,max);

 // Increasing capacity must preserve the structural gate at the upper bound.
 const badPieces=brickModel.pieces.map(p=>({...p}));
 badPieces.at(-1).position=[...badPieces[0].position];
 const collision=await http.callTool({name:'replace_model',arguments:{modelId:brickModel.id,expectedRevision:brickModel.revision,pieces:badPieces}},undefined,{timeout:120000});
 assert.equal(collision.isError,true,'A full-size model with a real overlap must still be refused');
 assert.match(collision.content.find(item=>item.type==='text').text,/atraviesan|colisi[oó]n|collision|solap/i);
 assertLargeModel(await call(http,'get_model',{modelId:brickModel.id}),brickModel,'Rejected collision must preserve the full model and revision');
 models.push(brickModel);
 console.log(`PASS: 15000 real 3001 bricks / ${connectorCount} connectors validate, analyze and export; collision remains rejected (${Math.round(performance.now()-started)} ms).`);
 return models;
}
