import assert from 'node:assert/strict';

export async function testTechnicPinAssembly(client,model,label='test'){
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 assert.equal((await call('catalog_info')).capabilities.technicPin20Fixed,true);
 const prefix='pin-'+label.replace(/[^\w-]/g,'-'),anchorId=prefix+'-beam',pinId=prefix+'-pin',secondId=prefix+'-second-beam';
 for(const part of ['3673','32523']){const info=await call('get_part',{part});assert.equal(info.connectivity.profile,'ldraw-technic-pin-envelope-v1');assert.equal(info.connectivity.fitLimits.contract,'technic-pin-20-fixed-v1');}
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:anchorId,part:'32523',color:4,step:22,group:'Dos vigas unidas por un pin Technic'}});
 const choices=await call('find_connections',{modelId:model.id,anchorId,part:'3673',limit:24});assert.ok(choices.options.length);
 const connection=choices.options[0].connection;
 const invalid=await client.callTool({name:'connect_piece',arguments:{modelId:model.id,expectedRevision:model.revision,piece:{id:pinId,part:'3673',color:71,step:22,group:'Dos vigas unidas por un pin Technic'},connection:{...connection,axialOffset:1}}});assert.equal(invalid.isError,true);assert.match(invalid.content[0].text,/desplazamiento axial/);assert.deepEqual(await call('get_model',{modelId:model.id}),model);
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:pinId,part:'3673',color:71,step:22,group:'Dos vigas unidas por un pin Technic'},connection});
 const ends=(await call('get_connections',{modelId:model.id,pieceId:pinId})).connectors.filter(c=>c.kind==='pin');assert.equal(ends.filter(c=>c.occupied).length,1);assert.equal(ends.filter(c=>!c.occupied).length,1);
 const more=await call('find_connections',{modelId:model.id,anchorId:pinId,anchorConnector:ends.find(c=>!c.occupied).id,part:'32523',limit:24});assert.ok(more.options.length);
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:secondId,part:'32523',color:1,step:22,group:'Dos vigas unidas por un pin Technic'},connection:more.options[0].connection});
 const report=(await call('analyze_model',{modelId:model.id})).assembly;assert.equal(report.valid,true);assert.equal(report.connections.filter(c=>c.a===pinId||c.b===pinId).length,2);
 assert.equal((await call('get_connections',{modelId:model.id,pieceId:pinId})).connectors.filter(c=>c.kind==='pin'&&c.occupied).length,2);
 const pin=model.pieces.find(p=>p.id===pinId),normal=ends[0].normal,position=pin.position.map((n,i)=>n+normal[i]);
 for(const operations of [[{action:'add',piece:{...pin,id:prefix+'-duplicate'}}],[{action:'update',id:pinId,patch:{position}}]]){
  const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations}});assert.equal(rejected.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model,'Rejected pin placements must preserve the model and revision');
 }
 const exported=await call('export_model',{modelId:model.id});assert.ok(exported.text.includes('32523.dat')&&exported.text.includes('3673.dat'));
 return model;
}
