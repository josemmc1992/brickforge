import assert from 'node:assert/strict';

// Runs only against an isolated smoke-test workspace. Both transport tests and
// the packaged desktop use this same public MCP workflow, including rejections.
export async function testSlidingAssembly(client,model,label='test'){
 async function call(name,args={}){
  const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));
  return JSON.parse(result.content[0].text);
 }
 const prefix='sliding-'+label.replace(/[^\w-]/g,'-'),barId=prefix+'-bar';
 const coverage=await call('catalog_info');assert.equal(coverage.capabilities.axialSliding,true);
 model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:barId,part:'30374',color:14,step:18,group:'Tres receptores sobre una varilla'}});
 const choices=await call('find_connections',{modelId:model.id,part:'4274',anchorId:barId});
 assert.ok(choices.options.length,'The server must sample a legal socket placement on a certified sliding bar');
 const connection=choices.options[0].connection;
 for(const [i,axialOffset] of [-28,0,28].entries()){
  model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:prefix+'-socket-'+i,part:'4274',color:[1,4,2][i],step:18,group:'Tres receptores sobre una varilla'},connection:{...connection,axialOffset}});
 }
 const report=(await call('analyze_model',{modelId:model.id})).assembly;
 assert.equal(report.valid,true);
 const joins=report.connections.filter(c=>c.axial?.barPieceId===barId);
 assert.equal(joins.length,3);
 assert.deepEqual(joins.map(c=>c.axial.interval).sort((a,b)=>a[0]-b[0]),[[-40,-16],[-12,12],[16,40]]);
 const ports=(await call('get_connections',{modelId:model.id,pieceId:barId})).connectors;
 assert.ok(ports.some(p=>p.kind==='bar'&&p.shareable&&!p.occupied&&p.reservations.length===3));
 // Sharing is not an assurance that another receiver still fits. Every explicit
 // insertion must reserve a disjoint interval and pass full-body collision SAT.
 for(const axialOffset of [0,28.0001,null,'12']){
  const result=await client.callTool({name:'connect_piece',arguments:{modelId:model.id,expectedRevision:model.revision,piece:{id:prefix+'-rejected',part:'4274',color:1,step:18,group:''},connection:{...connection,axialOffset}}});
  assert.equal(result.isError,true,'Occupied, out-of-bounds and malformed offsets must be refused');
  assert.deepEqual(await call('get_model',{modelId:model.id}),model,'A rejected connection must not mutate the model or revision');
 }
 const exports=await call('export_model',{modelId:model.id});assert.ok(exports.text.includes('4274.dat'));
 return model;
}
