import assert from 'node:assert/strict';
import {profile,isSupportedPart,inspectAssembly,assertAssembly,resolveConnection,placementOptions,groundPlacement,supportedPartCount,connectionCoverage,partConnectionInfo} from '../lib/assembly';
import {basePartIds,baseProfile} from '../lib/base-profiles';
import catalog from '../lib/catalog-data.json';
import variants from '../lib/assembly-variants.json';
import {robot,type Piece} from '../lib/model';
const p=(id:string,part:string,position:Piece['position'],rotation:Piece['rotation']=[0,0,0]):Piece=>({id,part,position,rotation,color:4,step:1,group:'test'});
const base=p('base','3003',[0,24,0]);
assertAssembly([base,p('top','3003',[0,48,0])]);
assertAssembly([base,p('top','3004',[-10,48,0],[0,90,0])]);
assert.throws(()=>assertAssembly([base,p('bad','3004',[0,48,0],[0,90,0])]),/rechazada/,'old half-stud foot must fail');
assert.throws(()=>assertAssembly([base,p('bad','3003',[0,40,0])]),/atraviesan/);
assert.throws(()=>assertAssembly([base,p('bad','3003',[0,50,0])]),/tetón|conectada/);
assert.throws(()=>assertAssembly([p('bad','3003',[0,0,0])]),/suelo/);
assert.throws(()=>assertAssembly([p('floating','3003',[0,48,0])]),/conectada/);
assert.throws(()=>assertAssembly([p('bad','3003',[0,24,0],[0,45,0])]),/90/);
assert.throws(()=>assertAssembly([p('unknown','3470',[0,8,0])]),/perfil/);
assert.throws(()=>assertAssembly([p('tile','3068b',[0,8,0]),p('top','3003',[0,32,0])]),/conectada/,'smooth tiles have no studs');
assertAssembly(robot());
assert.throws(()=>assertAssembly([p('left','3005',[0,10,0],[0,0,90]),p('right','3005',[-6,10,0],[0,0,-90])]),/tetón/,'opposing studs must not intersect');
assert.throws(()=>assertAssembly([p('upside','3005',[0,0,0],[180,0,0])]),/suelo/,'studs cannot penetrate the floor');
assertAssembly([p('upside','3003',[0,4,0],[180,0,0])]);
const arch=p('arch','3659',[0,24,0]),under=p('under','3024',[0,8,0]);
assertAssembly([arch,under]); // An actual arch opening, not a solid bounding box.
assert.throws(()=>assertAssembly([arch,p('inside','3005',[0,24,0])]),/atraviesan/);
const headlight=p('snot','4070',[0,24,0]);
const side=resolveConnection([headlight],p('side','3024',[0,0,0]),{anchorId:'snot',anchorConnector:'stud:front',partConnector:'socket:0:0:-8',rotation:[-90,0,0]});
assert.deepEqual(side.position,[0,14,-14]);assertAssembly([headlight,side]);
assert.throws(()=>resolveConnection([headlight],side,{anchorId:'snot',anchorConnector:'stud:front',partConnector:'socket:0:0:-8',rotation:[0,0,0]}),/enfrentados/);
const dup={...side,id:'duplicate'};assert.throws(()=>assertAssembly([headlight,side,dup]),/ocupado/);
let offset=0,option:any;do{const page=placementOptions([base],'3004','base',undefined,offset,12);option=page.options[0];if(option||page.nextOffset===null)break;offset=page.nextOffset;}while(offset<3000);
assert.ok(option);assertAssembly([base,resolveConnection([base],p('candidate','3004',[0,0,0]),option.connection)]);
assert.ok(placementOptions([base],'92438','base').options.length,'first page must include compatible alignments for large parts');
assertAssembly([base,p('new','3001',groundPlacement([base],'3001'))]);
assert.equal(profile('3068b')!.connectors.filter(c=>c.kind==='stud').length,0);
assert.ok(inspectAssembly([base,p('tile','3068b',[0,32,0])]).connections.length===4);

// Mechanical invariants cover every enabled reference, including generated variants.
assert.ok(connectionCoverage.basePartCount>=128);
assert.equal(connectionCoverage.basePartCount,basePartIds.length);
assert.equal(connectionCoverage.supportedPartCount,connectionCoverage.basePartCount+connectionCoverage.variantCount+connectionCoverage.generatedPartCount);
assert.equal(supportedPartCount,catalog.filter(part=>isSupportedPart(part.id)).length);
const curated=new Set([...basePartIds,...Object.keys(variants.aliases)]);
for(const part of catalog){
 if(!curated.has(part.id))continue; // Generated assets have their own full loading/connection suite.
 const def=profile(part.id);if(!def)continue;
 assert.ok(def.solids.length,part.id+' has a body');
 assert.equal(new Set(def.connectors.map(c=>c.id)).size,def.connectors.length,part.id+' connector IDs are unique');
 for(const solid of def.solids)for(const v of [...solid.vertices,...solid.edges,...solid.normals])assert.ok(v.length===3&&v.every(Number.isFinite),part.id+' finite geometry');
 for(const c of def.connectors){assert.ok(c.point.every(Number.isFinite),part.id+' finite connector');assert.equal(c.normal.filter(n=>Math.abs(n)===1).length,1,part.id+' axial connector');assert.equal(c.normal.filter(n=>n!==0).length,1,part.id+' normal is unit length');}
}
for(const id of basePartIds)assertAssembly([p('part',id,groundPlacement([],id))]);
for(const [id,alias] of Object.entries(variants.aliases) as [string,{base:string;evidence:string}][]){
 assert.ok(baseProfile(alias.base),id+' directly references a reviewed base');
 assert.ok(alias.evidence,id+' has verification evidence');
 if(baseProfile(id))continue;
 assert.equal(profile(id)?.basePart,alias.base);
 assert.deepEqual(profile(id)?.solids,baseProfile(alias.base)?.solids);
 assert.deepEqual(profile(id)?.connectors,baseProfile(alias.base)?.connectors);
 assert.equal(partConnectionInfo(id).profile,'ldraw-verified-decoration-v1');
}

// Tall and two-plate-high bodies use their real bottom planes, not brick height.
assertAssembly([p('column','14716',[0,72,0]),p('cap','3024',[0,80,0])]);
assertAssembly([p('base','3004',[0,24,0]),p('column','3245b',[0,72,0])]);
assertAssembly([p('short','86996',[0,16,0]),p('cap','3024',[0,24,0])]);
assert.throws(()=>assertAssembly([p('column','14716',[0,72,0]),p('inside','3005',[0,48,0])]),/atraviesan/);

// A jumper intentionally changes the grid by half a stud. Ordinary plates don't.
const jumper=p('jumper','3794b',[0,16,0]);
assertAssembly([p('plate','3023b',[0,8,0]),jumper,p('centred','3005',[0,40,0])]);
assert.throws(()=>assertAssembly([p('plate','3023b',[0,8,0]),p('centred','3005',[0,32,0])]),/tetón|conectada/);
for(const id of ['3794a','3794b','15573','87580']){
 const j=p('jumper',id,[0,8,0]);
 assertAssembly([j,p('cap','3070b',[0,16,0])]);
 assert.throws(()=>assertAssembly([j,p('off-grid','3070b',[10,16,0])]),/tetón|conectada/);
 assert.deepEqual(profile(id)!.connectors.filter(c=>c.kind==='stud').map(c=>c.point),[[0,0,0]]);
}

// The absent L-corner is genuinely empty and has no invented stud or socket.
for(const [id,h] of [['2420',8],['2357',24],['14719',8]] as const){
 const corner=p('corner',id,[0,h,0]);
 assertAssembly([corner,p('inside-gap','3005',[20,24,20])]);
 assert.throws(()=>assertAssembly([corner,p('in-arm','3005',[20,24,0])]),/atraviesan/);
 assert.ok(!profile(id)!.connectors.some(c=>c.point[0]===20&&c.point[2]===20));
}
assertAssembly([p('corner','2420',[0,8,0]),p('bridge','3022',[10,16,10])]);
assertAssembly([p('corner','2639',[0,8,0]),p('inside-gap','3003',[40,24,40])]);
assert.ok(!profile('2639')!.connectors.some(c=>c.id==='socket:10:10:-8'),'uncertain diagonal-rib socket stays disabled');
assert.throws(()=>assertAssembly([p('under-rib','3024',[10,8,10]),p('corner','2639',[0,16,0])]),/tetón|conectada/);
assertAssembly([p('corner','77844',[0,8,0]),p('inside-gap','3022',[30,8,30])]);
assert.throws(()=>assertAssembly([p('tile','14719',[0,8,0]),p('above','3024',[0,16,0])]),/conectada/);

// Slopes have only the rear top row. A real stud-free sloped region cannot anchor.
for(const id of ['3040b','3038','3297','3298','4161','4286','4445','23949','30363','60477']){
 const s=p('slope',id,[0,24,0]),def=profile(id)!;
 const stud=def.connectors.find(c=>c.kind==='stud')!;
 const cap=resolveConnection([s],p('cap','3024',[0,0,0]),{anchorId:'slope',anchorConnector:stud.id,partConnector:'socket:0:0:-8',rotation:[0,0,0]});
 assertAssembly([s,cap]);
 assert.ok(def.connectors.filter(c=>c.kind==='stud').every(c=>c.point[2]===0));
}
const slope=p('slope','3298',[0,24,0]);
// At z=-40 the real face is at world y=9. The plate at y=24 is clear of
// the slope although their axis-aligned bounding boxes overlap; y=16 cuts it.
assert.ok(!inspectAssembly([slope,p('above-face','3024',[10,24,-40])]).issues.some(i=>i.code==='collision'));
assert.ok(inspectAssembly([slope,p('inside-face','3024',[10,16,-40])]).issues.some(i=>i.code==='collision'));
assert.throws(()=>assertAssembly([slope,p('false-slope-stud','3024',[10,32,-20])]),/conectada/);
// DAT 3939 is a special mould: two end studs, not six, and no middle sockets.
assert.deepEqual(profile('3939')!.connectors.filter(c=>c.kind==='stud').map(c=>c.point),[[-50,0,0],[50,0,0]]);
assert.ok(profile('3939')!.connectors.every(c=>Math.abs(c.point[0])===50));
assert.throws(()=>assertAssembly([p('slope','3939',[0,24,0]),p('false-centre','3024',[10,32,0])]),/conectada/);

// The side studs on these moulds are at outer wall ±10, not headlight recess -6.
for(const id of ['87087','47905','26604','4733']){
 const anchor=p('snot',id,[0,24,0]);
 for(const c of profile(id)!.connectors.filter(c=>c.kind==='stud'&&c.normal[1]===0)){
  const rotation:Piece['rotation']=c.normal[2]===-1?[-90,0,0]:c.normal[2]===1?[90,0,0]:c.normal[0]===1?[0,0,-90]:[0,0,90];
  const tile=resolveConnection([anchor],p('side','3070b',[0,0,0]),{anchorId:'snot',anchorConnector:c.id,partConnector:'socket:0:0:-8',rotation});
  assertAssembly([anchor,tile]);
  assert.equal(Math.max(Math.abs(tile.position[0]),Math.abs(tile.position[2])),18);
  const intruding={...tile,position:tile.position.map((v,i)=>v-c.normal[i]*4) as Piece['position']};
  assert.throws(()=>assertAssembly([anchor,intruding]),/atraviesan/);
 }
}
console.log(JSON.stringify({ok:true,supportedPartCount,connectionCoverage,checks:['old robot feet regression','rotated studs','interpenetration','partial stud insertion','ground','floating pieces','unsupported shapes/rotations','smooth tile','arch clearance','arch collision','side stud','occupied connector','computed placement','foundation placement','all profile geometry invariants','verified direct variants','tall bricks','centred jumper half-stud grid','L-corner real clearance','slope face clearance and missing studs','3939 end-stud exception','SNOT outer-wall offsets']}));
