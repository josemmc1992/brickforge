import assert from 'node:assert/strict';

export async function testMinifigHipAssembly(client,model,label='test'){
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 assert.equal((await call('catalog_info')).capabilities.minifigHipstud11Fixed,true);
 const prefix='hips-'+label.replace(/[^\w-]/g,'-'),baseId=prefix+'-base',legsId=prefix+'-legs',torsoId=prefix+'-torso',headId=prefix+'-head',group='Minifigura: pies, cintura y cuello';
 for(const part of ['41879a','973']){const info=await call('get_part',{part});assert.equal(info.connectivity.profile,'ldraw-minifig-hips-envelope-v1');assert.equal(info.connectivity.fitLimits.contract,'minifig-hipstud-11-fixed-v1');}
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:baseId,part:'3020',color:71,step:24,group}});
 async function add(id,part,color,anchorId,anchorConnector){
  const choices=await call('find_connections',{modelId:model.id,anchorId,anchorConnector,part,limit:24});assert.ok(choices.options.length,part+' fits');
  const piece={id,part,color,step:24,group},connection=choices.options[0].connection;
  if(id===torsoId){
   const turned=connection.rotation.map((n,i)=>i===1?(n+90)%360:n);
   for(const changed of [{...connection,axialOffset:1},{...connection,rotation:turned}]){
    const rejected=await client.callTool({name:'connect_piece',arguments:{modelId:model.id,expectedRevision:model.revision,piece,connection:changed}});assert.equal(rejected.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model);
   }
  }
  model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece,connection});
 }
 await add(legsId,'41879a',0,baseId);
 await add(torsoId,'973',4,legsId,'hip-stud:10:0:0');
 for(const id of [legsId,torsoId]){const ports=(await call('get_connections',{modelId:model.id,pieceId:id})).connectors;assert.equal(ports.filter(c=>(c.kind==='hip-stud'||c.kind==='hip-socket')&&c.occupied).length,2);}
 await add(headId,'3626c',14,torsoId,'neck:0:0:0');
 await add(prefix+'-cap','3070b',1,headId,'stud:0:0:0:0:1:0');
 const torso=model.pieces.find(p=>p.id===torsoId);
 for(const operations of [[{action:'add',piece:{...torso,id:prefix+'-duplicate'}}],[{action:'update',id:torsoId,patch:{position:torso.position.map((n,i)=>n+(i===1?-1:0))}}]]){
  const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations}});assert.equal(rejected.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model,'Invalid waist placement must preserve data and revision');
 }
 const report=(await call('analyze_model',{modelId:model.id})).assembly;assert.equal(report.valid,true);assert.equal(report.connections.filter(c=>c.a===torsoId&&c.b===legsId||c.b===torsoId&&c.a===legsId).length,2);
 // Exercise the rounding-boundary regression through the real API: this
 // ground-safe fractional lift puts seated waist ports in adjacent cells.
 const fractionalHipsId=prefix+'-fractional-hips',fractionalTorsoId=prefix+'-fractional-torso';
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:fractionalHipsId,part:'3815b',color:0,step:24,group}});
 const fractionalHips=model.pieces.find(p=>p.id===fractionalHipsId),fractionalPosition=fractionalHips.position.map((n,i)=>i===1?20.755:n);
 assert.ok(fractionalPosition[1]>=fractionalHips.position[1]&&fractionalPosition[1]-fractionalHips.position[1]<.01,'Fractional lift must remain within ground tolerance');
 model=await call('edit_model',{modelId:model.id,expectedRevision:model.revision,operations:[{action:'update',id:fractionalHipsId,patch:{position:fractionalPosition}}]});
 const fractionalChoices=await call('find_connections',{modelId:model.id,anchorId:fractionalHipsId,anchorConnector:'hip-stud:10:0:0',part:'973',limit:24});
 const fractionalChoice=fractionalChoices.options.find(option=>option.connection.partConnector==='hip-socket:10:-32:0'&&option.connection.rotation.every(n=>n===0));
 assert.ok(fractionalChoice,'Fractional waist must remain discoverable');assert.equal(fractionalChoice.position[1],52.754999999999995);
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:fractionalTorsoId,part:'973',color:4,step:24,group},connection:fractionalChoice.connection});
 const fractionalReport=(await call('analyze_model',{modelId:model.id})).assembly;
 assert.equal(fractionalReport.valid,true);assert.equal(fractionalReport.connections.filter(c=>c.a===fractionalTorsoId&&c.b===fractionalHipsId||c.b===fractionalTorsoId&&c.a===fractionalHipsId).length,2);
 assert.equal((await call('get_connections',{modelId:model.id,pieceId:fractionalHipsId})).connectors.filter(c=>c.kind==='hip-stud'&&c.occupied).length,2);
 const exported=await call('export_model',{modelId:model.id});assert.ok(exported.text.includes('41879a.dat')&&exported.text.includes('973.dat')&&exported.text.includes('3626c.dat'));return model;
}
