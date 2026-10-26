import assert from 'node:assert/strict';

// Same source-v3 asset loading and public tools in HTTP, stdio and Electron.
export async function testKeyedAssembly(client,model,label='test'){
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 const prefix='keyed-'+label.replace(/[^\w-]/g,'-'),shaftId=prefix+'-shaft',socketId=prefix+'-middle';
 assert.equal((await call('catalog_info')).capabilities.keyedAxleThroughA6,true);
 for(const part of ['3705','3713']){const info=await call('get_part',{part});assert.equal(info.connectivity.profile,'ldraw-keyed-axial-envelope-v1');assert.equal(info.connectivity.supported,true);}
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:socketId,part:'3713',color:4,step:19,group:'Eje Technic con tres casquillos'}});
 const choices=await call('find_connections',{modelId:model.id,part:'3705',anchorId:socketId,limit:24});
 const initial=choices.options.find(o=>o.connection.axialOffset===0);assert.ok(initial,'A source-certified axle must attach to the grounded receiver');
 model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:shaftId,part:'3705',color:14,step:19,group:'Eje Technic con tres casquillos'},connection:initial.connection});
 const shaft=(await call('get_connections',{modelId:model.id,pieceId:shaftId})).connectors.find(c=>c.kind==='axle');
 const receiver=(await call('get_connections',{modelId:model.id,pieceId:socketId})).connectors.find(c=>c.kind==='axle-socket');
 const base={anchorId:shaftId,anchorConnector:shaft.id,partConnector:receiver.id,rotation:model.pieces.find(p=>p.id===socketId).rotation};
 for(const [i,offset] of [-25,25].entries())model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:prefix+'-socket-'+i,part:'3713',color:[1,2][i],step:19,group:'Eje Technic con tres casquillos'},connection:{...base,axialOffset:offset}});
 const report=(await call('analyze_model',{modelId:model.id})).assembly;assert.equal(report.valid,true);
 const joins=report.connections.filter(c=>c.axial?.barPieceId===shaftId);assert.equal(joins.length,3);
 assert.deepEqual(joins.map(c=>c.axial.interval).sort((a,b)=>a[0]-b[0]),[[-35,-15],[-10,10],[15,35]]);
 const ports=(await call('get_connections',{modelId:model.id,pieceId:shaftId})).connectors;assert.ok(ports.some(c=>c.kind==='axle'&&c.shareable&&!c.occupied&&c.reservations.length===3));
 for(const axialOffset of [0,27.5001,29,null,'25']){
  const response=await client.callTool({name:'connect_piece',arguments:{modelId:model.id,expectedRevision:model.revision,piece:{id:prefix+'-invalid',part:'3713',color:1,step:19,group:''},connection:{...base,axialOffset}}});
  assert.equal(response.isError,true,'Overlap, bevel-only engagement and malformed offsets must fail');assert.deepEqual(await call('get_model',{modelId:model.id}),model);
 }
 const displaced=[...model.pieces.find(p=>p.id===shaftId).position],radial=shaft.normal.findIndex(n=>n===0);displaced[radial]+=.009;
 const response=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations:[{action:'update',id:shaftId,patch:{position:displaced}}]}});
 assert.equal(response.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model);
 assert.ok((await call('export_model',{modelId:model.id})).text.includes('3705.dat'));
 return model;
}
