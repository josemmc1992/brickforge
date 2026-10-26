import assert from 'node:assert/strict';
import {spatialSweep,type SpatialBounds} from '../lib/spatial';
import {analyze,partMap,type Piece} from '../lib/model';
import {inspectAssembly} from '../lib/assembly';

const sorted=(pairs:Iterable<[number,number]>)=>Array.from(pairs,([a,b])=>`${a}:${b}`).sort();
function brutePairs(bounds:SpatialBounds[],padding=0){
 const pairs:[number,number][]=[];
 for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
  if([0,1,2].every(k=>bounds[i].min[k]<=bounds[j].max[k]+padding&&bounds[j].min[k]<=bounds[i].max[k]+padding))pairs.push([i,j]);
 }
 return pairs;
}
let seed=19840715;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const box=(min:number[],size:number[]):SpatialBounds=>({min:min as [number,number,number],max:min.map((v,i)=>v+size[i]) as [number,number,number]});

assert.deepEqual([...spatialSweep([]).pairs()],[]);
assert.throws(()=>spatialSweep([],-1));
for(let sample=0;sample<12;sample++){
 const bounds=Array.from({length:80},()=>box(Array.from({length:3},()=>random()*120-60),Array.from({length:3},()=>random()*30)));
 for(const padding of [0,.01,8.01]){
  const result=spatialSweep(bounds,padding),pairs=[...result.pairs()];
  assert.deepEqual(sorted(pairs),sorted(brutePairs(bounds,padding)),'Broad phase must keep every possible exact pair');
  assert.equal(new Set(sorted(pairs)).size,pairs.length,'Pairs must be unique');
  assert.ok(pairs.every(([a,b])=>a<b),'Pair members retain input ordering');
  assert.deepEqual([...spatialSweep(bounds,padding).pairs()],pairs,'Result must be deterministic');
 }
}
for(const padding of [0,.01,8.01]){
 const bounds=[box([-2,-2,-2],[4,4,4]),box([2+padding,-1,-1],[2,2,2]),box([2+padding+1e-7,-1,-1],[2,2,2])];
 assert.deepEqual(sorted(spatialSweep(bounds,padding).pairs()),sorted(brutePairs(bounds,padding)),'Touching/tolerance boundaries remain candidates');
}
for(const axis of [0,1,2]){
 const bounds=Array.from({length:15000},(_,i)=>box([0,1,2].map(k=>k===axis?i*40:0),[20,20,20]));
 const result=spatialSweep(bounds,8.01);
 assert.equal(result.axis,axis,'Sweep must adapt to X, Y and Z columns');
 assert.equal(result.projectedPairs,0,'Separated 15,000-part columns must not inspect all pairs');
 assert.equal([...result.pairs()].length,0);
}

const piece=(id:string,part:string,position:Piece['position'],rotation:Piece['rotation']=[0,0,0]):Piece=>({id,part,position,rotation,color:4,step:1,group:'spatial-test'});
function bruteAnalyze(pieces:Piece[]){
 const checks=pieces.filter(p=>partMap.get(p.part)?.basic&&p.rotation.every(v=>Math.abs(v%360)<.001)),overlaps:string[][]=[];let overlapCount=0;
 for(let i=0;i<checks.length;i++)for(let j=i+1;j<checks.length;j++){
  const a=checks[i],b=checks[j],da=partMap.get(a.part)!.basic!,db=partMap.get(b.part)!.basic!;
  if(Math.abs(a.position[0]-b.position[0])<(da.width+db.width)/2-.01&&Math.abs(a.position[2]-b.position[2])<(da.depth+db.depth)/2-.01&&Math.max(a.position[1]-da.height,b.position[1]-db.height)<Math.min(a.position[1],b.position[1])-.01){
   overlapCount++;if(overlaps.length<100)overlaps.push([a.id,b.id]);
  }
 }
 return {overlapCount,overlaps};
}
for(let sample=0;sample<10;sample++){
 const pieces=Array.from({length:120},(_,i)=>piece(String(i),['3001','3003','3005','3024'][i%4],[random()*120-60,random()*60,random()*120-60],i%7===0?[0,90,0]:i%9===0?[360,0,0]:[0,0,0]));
 const actual=analyze(pieces),expected=bruteAnalyze(pieces);
 assert.equal(actual.overlapCount,expected.overlapCount);
 assert.deepEqual(actual.overlaps,expected.overlaps,'Analysis preserves the first 100 input-ordered pairs');
}
const boundaryPieces=[piece('a','3005',[0,24,0]),piece('touch','3005',[20,24,0]),piece('epsilon','3005',[19.99,24,40]),piece('near','3005',[19.989999,24,0])];
const boundaryResult=analyze(boundaryPieces),boundaryExpected=bruteAnalyze(boundaryPieces);
assert.equal(boundaryResult.overlapCount,boundaryExpected.overlapCount);
assert.deepEqual(boundaryResult.overlaps,boundaryExpected.overlaps);

// Existing mechanical tests cover the broad family's exact predicates. Exercise
// both adaptive directions here, including a side-facing stud collision.
for(const axis of [0,2]){
 const stacks=Array.from({length:60},(_,i)=>piece(String(i),'3005',axis===0?[Math.floor(i/3)*40,(i%3+1)*24,0]:[0,(i%3+1)*24,Math.floor(i/3)*40]));
 assert.equal(inspectAssembly(stacks).valid,true);
 const overlap={...stacks[1],id:'collision',position:[...stacks[1].position] as Piece['position']};overlap.position[1]-=1;
 assert.equal(inspectAssembly([...stacks,overlap]).valid,false);
}
assert.equal(inspectAssembly([piece('left','3005',[0,10,0],[0,0,90]),piece('right','3005',[-6,10,0],[0,0,-90])]).valid,false,'Opposing studs still collide');
assert.equal(inspectAssembly([piece('base','3003',[0,24,0]),piece('turned','3004',[-10,48,0],[0,90,0])]).valid,true,'Quarter-turn fits remain valid');
assert.equal(inspectAssembly([piece('base','3003',[0,24,0]),piece('bad','3004',[0,48,0],[0,90,0])]).valid,false,'Half-stud displacement still fails');

const many=Array.from({length:15000},(_,i)=>piece(String(i),'3001',[(i%125)*100,24,Math.floor(i/125)*60]));
let started=performance.now();const largeAnalysis=analyze(many),analysisMs=Math.round(performance.now()-started);
assert.equal(largeAnalysis.overlapCount,0);assert.equal(largeAnalysis.pieceCount,15000);
started=performance.now();const largeAssembly=inspectAssembly(many),assemblyMs=Math.round(performance.now()-started);
assert.equal(largeAssembly.valid,true,JSON.stringify(largeAssembly.issues));assert.equal(largeAssembly.checked,15000);
console.log(`PASS: conservative adaptive sweep, exact overlap counts/order, rotations and 15,000 2x4 bricks (analysis ${analysisMs} ms; assembly ${assemblyMs} ms).`);
