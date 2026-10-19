import assert from 'node:assert/strict';

export async function testMinifigNeckAssembly(client,model,label='test'){
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 assert.equal((await call('catalog_info')).capabilities.minifigNeck12Fixed,true);
 const prefix='neck-'+label.replace(/[^\w-]/g,'-'),torsoId=prefix+'-torso',headId=prefix+'-head',group='Cabeza encajada en torso de minifigura';
 for(const part of ['973','3626c']){const info=await call('get_part',{part});assert.ok(info.connectivity.connectors.some(c=>c.neck?.contract==='minifig-neck-12-fixed-v1'));}
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:torsoId,part:'973',color:1,step:23,group}});
 const choices=await call('find_connections',{modelId:model.id,anchorId:torsoId,anchorConnector:'neck:0:0:0',part:'3626c',limit:24});assert.ok(choices.options.length);
 const connection=choices.options[0].connection,headPiece={id:headId,part:'3626c',color:14,step:23,group};
 const invalid=await client.callTool({name:'connect_piece',arguments:{modelId:model.id,expectedRevision:model.revision,piece:headPiece,connection:{...connection,axialOffset:1}}});assert.equal(invalid.isError,true);assert.match(invalid.content[0].text,/desplazamiento axial/);assert.deepEqual(await call('get_model',{modelId:model.id}),model);
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:headPiece,connection});
 const ports=(await call('get_connections',{modelId:model.id,pieceId:headId})).connectors;assert.equal(ports.find(c=>c.kind==='neck-socket').occupied,true);assert.equal(ports.find(c=>c.kind==='stud').occupied,false);
 const cap=await call('find_connections',{modelId:model.id,anchorId:headId,anchorConnector:'stud:0:0:0:0:1:0',part:'3070b',limit:24});assert.ok(cap.options.length);
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:prefix+'-cap',part:'3070b',color:4,step:23,group},connection:cap.options[0].connection});
 const head=model.pieces.find(p=>p.id===headId),shifted=head.position.map((n,i)=>n+(i===1?-1:0));
 for(const operations of [[{action:'add',piece:{...head,id:prefix+'-duplicate'}}],[{action:'update',id:headId,patch:{position:shifted}}]]){
  const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations}});assert.equal(rejected.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model,'Invalid neck placement must not change saved data or revision');
 }
 const report=(await call('analyze_model',{modelId:model.id})).assembly;assert.equal(report.valid,true);assert.equal(report.connections.filter(c=>c.a===headId||c.b===headId).length,2);
 const exported=await call('export_model',{modelId:model.id});assert.ok(exported.text.includes('973.dat')&&exported.text.includes('3626c.dat'));return model;
}
