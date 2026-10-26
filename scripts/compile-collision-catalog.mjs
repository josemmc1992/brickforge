import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {ProofError} from './lib/variant-proof.mjs';
import {createPackedGeometryRepository,createEnvelopeCompiler,ENVELOPE_VERSION,sha256} from './lib/ldraw-envelope.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const manifestPath=path.join(root,'lib/collision-manifest.json');
const assetDir=path.join(root,'public/catalog/collision');
const check=process.argv.includes('--check'),verify=process.argv.includes('--verify');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'lib/catalog-data.json'),'utf8'));
const index=JSON.parse(fs.readFileSync(path.join(root,'lib/geometry-index.json'),'utf8'));
const repository=createPackedGeometryRepository(root),compiler=createEnvelopeCompiler(repository);

function inputDigest(){
  const digest=createHash('sha256');
  const sources=['lib/catalog-data.json','lib/geometry-index.json','scripts/compile-collision-catalog.mjs','scripts/lib/ldraw-envelope.mjs','scripts/lib/variant-proof.mjs','node_modules/three/package.json','node_modules/three/examples/jsm/math/ConvexHull.js',...[...new Set(Object.values(index))].sort((a,b)=>a-b).map(id=>`public/catalog/geometry/${id}.bin`)];
  for(const file of sources)digest.update(file+'\0').update(fs.readFileSync(path.join(root,file))).update('\0');
  return digest.digest('hex');
}
const fingerprint=inputDigest();
function readAsset(id){if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid collision asset identifier.');const bytes=gunzipSync(fs.readFileSync(path.join(assetDir,id+'.bin')),{maxOutputLength:8*1024*1024});if(sha256(bytes)!==id)throw new Error('Collision asset content hash differs: '+id);const asset=JSON.parse(bytes);if(asset.version!==1||asset.kind!=='convex-body-separated-studs'||!Array.isArray(asset.bodyHull?.vertices)||!Array.isArray(asset.removedStuds))throw new Error('Invalid collision asset schema.');return asset;}
function classify(part){
  if(/^Sticker\b/i.test(part.name)||part.category==='Sticker')return 'sticker_not_rigid_part';
  if(/\b(?:Hose|String|Cloth|Fabric|Rubber Band|Flexible|Flex System)\b/i.test(part.name))return 'flexible_geometry_not_supported';
  const key=repository.resolve(part.id+'.dat');if(!key)return 'missing_geometry';
  const header=repository.read(key).match(/^0\s+!LDRAW_ORG\s+([^\r\n]+)/mi)?.[1]||'';
  if(/\bShortcut\b/.test(header))return 'shortcut_assembly_not_supported';
  if(!/^(?:Unofficial_)?Part\b/.test(header))return 'not_ordinary_part';
  return null;
}
const sample=process.argv.find(a=>a.startsWith('--sample='));
if(sample){for(const id of sample.slice('--sample='.length).split(',')){try{const result=compiler.compile(id);console.log(JSON.stringify({part:id,sourceHash:result.sourceHash,triangleCount:result.triangleCount,approximation:result.approximation,hullVertices:result.asset.bodyHull.vertices.length,studCount:result.asset.removedStuds.length,bounds:result.asset.bounds,socket:compiler.socketClearance(id,{pos:[0,-24,0],normal:[0,-1,0],radius:6,depth:4,tolerance:0})}));}catch(error){if(!(error instanceof ProofError))throw error;console.log(JSON.stringify({part:id,reason:error.code}));}}process.exit(0);}

if(check&&!verify){
  if(!fs.existsSync(manifestPath))throw new Error('Collision manifest absent. Run node scripts/compile-collision-catalog.mjs.');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(manifest.version!==1||manifest.compiler!==ENVELOPE_VERSION||manifest.inputDigest!==fingerprint)throw new Error('Collision catalogue is stale. Regenerate and review its coverage.');
  if(Object.keys(manifest.parts).length!==catalog.length||catalog.some(p=>!Object.hasOwn(manifest.parts,p.id)))throw new Error('Collision manifest does not cover the catalogue.');
  const assets=new Set(Object.values(manifest.parts).filter(p=>p.status==='compiled').map(p=>p.asset));for(const id of assets)readAsset(id);
  console.log(`Collision source fingerprint and ${assets.size} asset hashes verified; ${manifest.counts.compiled} conservative envelopes.`);
  process.exit(0);
}

if(!verify)fs.mkdirSync(assetDir,{recursive:true});
const parts={},assets=new Set(),reasons={};let compiled=0,rejected=0;
for(const part of [...catalog].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  try{
    const reason=classify(part);if(reason)throw new ProofError(reason,'Part is outside the rigid ordinary-part policy.');
    const result=compiler.compile(part.id),serialized=JSON.stringify(result.asset)+'\n',asset=sha256(serialized);
    if(!assets.has(asset)){
      if(verify){if(JSON.stringify(readAsset(asset))+'\n'!==serialized)throw new Error('Collision recompilation differs: '+part.id);}
      else fs.writeFileSync(path.join(assetDir,asset+'.bin'),gzipSync(serialized,{level:9}));
      assets.add(asset);
    }
    parts[part.id]={status:'compiled',asset,sourceHash:result.sourceHash,triangleCount:result.triangleCount,studCount:result.asset.removedStuds.length,bounds:result.asset.bounds,approximation:result.approximation};compiled++;
  }catch(error){if(!(error instanceof ProofError))throw new Error(`Collision compiler failed for ${part.id}`,{cause:error});parts[part.id]={status:'unsupported',reason:error.code};reasons[error.code]=(reasons[error.code]||0)+1;rejected++;}
  if((compiled+rejected)%1000===0)console.error(`Collision catalogue: ${compiled+rejected}/${catalog.length}; ${compiled} envelopes.`);
}
const manifest={version:1,compiler:ENVELOPE_VERSION,inputDigest:fingerprint,coordinateSystem:'brickforge',limitation:'Conservative outer hulls fill holes and concavities; false placement rejections are expected. No watertightness or physical stability certification. Only exact reviewed standard stud primitives may be separated.',counts:{total:catalog.length,compiled,rejected,uniqueAssets:assets.size,reasons:Object.fromEntries(Object.entries(reasons).sort())},parts};
const output=JSON.stringify(manifest)+'\n';
if(verify){if(!fs.existsSync(manifestPath)||fs.readFileSync(manifestPath,'utf8').replaceAll('\r\n','\n')!==output)throw new Error('Collision manifest differs from deterministic recompilation.');console.log('Full collision catalogue recompilation agrees.');}
else{
  fs.writeFileSync(manifestPath,output);
  // Only remove obsolete hash-named files inside this compiler's owned directory.
  for(const file of fs.readdirSync(assetDir))if(/^[a-f0-9]{64}\.bin$/.test(file)&&!assets.has(file.slice(0,-4)))fs.unlinkSync(path.join(assetDir,file));
  console.log(JSON.stringify(manifest.counts));
}
