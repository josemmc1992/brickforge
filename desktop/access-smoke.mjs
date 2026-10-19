import assert from 'node:assert/strict';

export async function testStandardAccessAssembly(client,model,label='test'){
 async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text);}
 assert.equal((await call('catalog_info')).capabilities.sourceCertifiedStandardAccess,true);
 const prefix='access-'+label.replace(/[^\w-]/g,'-');
 for(const [i,anchorPart,attachedPart,generatedPart] of [[0,'6120','3070b','6120'],[1,'3005','3573','3573']]){
  const anchorId=prefix+'-anchor-'+i,attachedId=prefix+'-attached-'+i;
  const info=await call('get_part',{part:generatedPart});assert.equal(info.connectivity.profile,'ldraw-standard-access-envelope-v1');assert.equal(info.connectivity.fitLimits.accessColumnWidthLdu,20);
  model=await call('place_on_ground',{modelId:model.id,expectedRevision:model.revision,piece:{id:anchorId,part:anchorPart,color:14,step:20+i,group:'Conector accesible en una concavidad'}});
  const found=await call('find_connections',{modelId:model.id,anchorId,part:attachedPart,limit:24});assert.ok(found.options.length,'A certified access profile must provide a legal full-body placement');
  model=await call('connect_piece',{modelId:model.id,expectedRevision:model.revision,piece:{id:attachedId,part:attachedPart,color:4,step:20+i,group:'Conector accesible en una concavidad'},connection:found.options[0].connection});
  const report=(await call('analyze_model',{modelId:model.id})).assembly;assert.equal(report.valid,true);assert.ok(report.connections.some(c=>[c.a,c.b].includes(anchorId)&&[c.a,c.b].includes(attachedId)));
  const generated=model.pieces.find(p=>p.part===generatedPart&&[anchorId,attachedId].includes(p.id)),attached=model.pieces.find(p=>p.id===attachedId),position=[...attached.position];position[1]+=1;
  for(const operations of [[{action:'add',piece:{...generated,id:prefix+'-duplicate-'+i}}],[{action:'update',id:attachedId,patch:{position}}]]){
   const rejected=await client.callTool({name:'edit_model',arguments:{modelId:model.id,expectedRevision:model.revision,operations}});assert.equal(rejected.isError,true);assert.deepEqual(await call('get_model',{modelId:model.id}),model,'Rejected access-profile geometry must preserve the full model and revision');
  }
 }
 const exported=await call('export_model',{modelId:model.id});assert.ok(exported.text.includes('6120.dat')&&exported.text.includes('3573.dat'));
 return model;
}
